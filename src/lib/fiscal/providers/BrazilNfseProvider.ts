import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { railConfig } from '../latam/config';
import { conSecuencia, intentoAutorizado, intentoPorId, intentoVivo, type IntentoRail } from '../latam/comprobantes';
import { esErrorSeguro, MSG_INCIERTO, RailDatosError } from '../latam/errores';
import { RIELES } from '../latam/rieles';
import {
    cancelarNfse, contextoNfse, emitirAnteSefin, MSG_NO_DISPONIBLE, resolverPorConsulta, TIPO_SEQUENCIA, type ContextoNfse,
} from '../latam/nfse/autorizacao';
import { armarDps, numeroDocumento, type SolicitudNfse } from '../latam/nfse/dps';
import type { NfseLida } from '../latam/nfse/nfse';
import { representacionNfse } from '../latam/nfse/representacao';
import type {
    FiscalCancelRequest, FiscalCancelResponse, FiscalDocumentRequest, FiscalDocumentResponse, FiscalProvider,
} from '../index';

// Proveedor fiscal de Brasil: emite cada factura de servicios como NFS-e de
// Padrão Nacional ante la Sefin Nacional (Sistema Nacional NFS-e)
// DIRECTAMENTE, sin agregador — la misma filosofía que Verifactu y ARCA. La
// NFS-e y su número son de la Sefin: la chave de acceso es el `fiscal_id` y el
// número de la NFS-e reemplaza al folio interno de Cord.
//
// Un solo interruptor decide si hay NFS-e (NFSE_ENABLED + la cuenta lista,
// latam/nfse/estado.ts). Sin él, el documento sale con el contrato
// "commercial_only" de CommercialInvoiceProvider y la app no aparenta una
// NFS-e que no existe (regla 15). Un documento que YA es `nfse_*` nunca
// degrada en silencio: falla cerrado con un mensaje.
//
// Nunca reenvía a ciegas: un intento sin respuesta se resuelve CONSULTANDO a
// la Sefin por el Id de la DPS (latam/nfse/autorizacao.ts).
//
// La NFS-e no tiene nota de crédito: una NFS-e se corrige cancelándola (evento
// e101101) y emitiendo otra. Una nota de crédito de una factura `nfse_invoice`
// se rechaza antes de hablar con la Sefin.

const MSG_SIN_NOTA_CREDITO = 'En Brasil la NFS-e no tiene nota de crédito: para corregirla, anula la factura (se cancela la NFS-e ante el Sistema Nacional) y emite una nueva por el importe correcto.';

function respuestaComercial(request: FiscalDocumentRequest): FiscalDocumentResponse {
    return {
        success: true,
        provider: 'cord',
        documentId: request.documentId,
        pdfUrl: `/api/fiscal/documents/${request.documentId}/pdf`,
        rawProviderData: {
            regulatory_status: 'commercial_only',
            authority_submission: false,
            invoice_number: request.invoiceNumber,
            idempotency_key: request.idempotencyKey,
        },
    };
}

/** Respuesta de un intento AUTORIZADO: siempre derivada de lo guardado, nunca del reintento. */
function respuestaAutorizada(request: FiscalDocumentRequest, intento: IntentoRail): FiscalDocumentResponse {
    const sol = intento.solicitud as SolicitudNfse;
    const guardada = (intento.respuesta ?? {}) as { nfse?: NfseLida };
    const nfse = guardada.nfse;
    if (!nfse) throw new Error('nfse: el intento autorizado no tiene la NFS-e guardada');
    const homologacion = intento.entorno === 'homologacion';
    const numero = numeroDocumento(nfse.nNFSe, homologacion);
    const chave = String(intento.autorizacion);
    const representacion = representacionNfse({ nfse, solicitud: sol, homologacion });
    return {
        success: true,
        provider: 'nfse',
        documentId: intento.id,
        fiscalId: chave,
        invoiceNumber: numero,
        issuedAt: nfse.dhProc && Number.isFinite(Date.parse(nfse.dhProc)) ? new Date(nfse.dhProc).toISOString() : intento.creadoAt || undefined,
        pdfUrl: `/api/fiscal/documents/${request.documentId}/pdf`,
        rawProviderData: {
            regulatory_status: 'nfse',
            authority_submission: true,
            invoice_number: numero,
            idempotency_key: request.idempotencyKey,
            // Una NFS-e de producción restringida no tiene validez jurídica: no
            // se cobra medidor, la UI la presenta como documento de prueba y el
            // link público no ofrece pagarla.
            livemode: !homologacion,
            ...(homologacion ? { simulado: true, modo_prueba: true } : {}),
            latam: {
                rail: 'nfse',
                entorno: intento.entorno,
                intento_id: intento.id,
                comprobante: {
                    chave,
                    numero: nfse.nNFSe,
                    dps: { id: sol.id, serie: sol.serie, numero: sol.nDPS },
                    competencia: sol.dCompet,
                    emitida: nfse.dhProc,
                    municipio_emissor: sol.cLocEmi,
                    servico: sol.serv.cTribNac,
                    tomador: sol.toma ? `${sol.toma.tipo} ${sol.toma.numero}` : null,
                    valor_servico: sol.valores.vServ,
                    ...(sol.valores.vDescIncond ? { desconto_incondicionado: sol.valores.vDescIncond } : {}),
                    iss_retido: sol.valores.tpRetISSQN === 2,
                    valor_liquido: nfse.valores.vLiq || sol.esperado.vLiq,
                },
                autorizacion: { tipo: 'chave', codigo: chave, vence: null },
                observaciones: intento.observaciones,
                representacion,
            },
        },
    };
}

function respuestaFallida(request: FiscalDocumentRequest, error: string, incierto: boolean, extra: Record<string, unknown> = {}): FiscalDocumentResponse {
    return {
        success: false,
        provider: 'nfse',
        // `err_`: nada quedó generado y el borrador se puede descartar
        // (voidInvoice). Un intento incierto conserva el id: primero hay que
        // confirmar su resultado.
        documentId: incierto ? request.documentId : `err_br_${request.documentId}`,
        error,
        rawProviderData: incierto
            ? { delivery_uncertain: true, retry_safe: true, regulatory_status: 'nfse', ...extra }
            : { regulatory_status: 'nfse', ...extra },
    };
}

export class BrazilNfseProvider implements FiscalProvider {
    supports(countryCode: string): boolean {
        return countryCode.toUpperCase() === RIELES.nfse.pais;
    }

    async issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse> {
        const config = railConfig('nfse');
        const esNfse = request.documentType === RIELES.nfse.documentos.factura || request.documentType === RIELES.nfse.documentos.notaCredito;

        // Replay primero: si el documento ya tiene NFS-e, se devuelve lo
        // generado aunque el interruptor haya cambiado desde entonces.
        const yaAutorizado = await intentoAutorizado(request.orgId, request.documentId, 'nfse');
        if (yaAutorizado) return respuestaAutorizada(request, yaAutorizado);

        if (!config.habilitado || !esNfse) {
            if (esNfse) {
                log.error('nfse: documento nfse_* con el riel apagado', { route: 'fiscal/nfse', orgId: request.orgId, motivo: config.motivo });
                throw new Error(MSG_NO_DISPONIBLE);
            }
            return respuestaComercial(request);
        }
        if (request.documentType === RIELES.nfse.documentos.notaCredito) return respuestaFallida(request, MSG_SIN_NOTA_CREDITO, false);

        try {
            const ctx = await contextoNfse(request.orgId, config.entorno, request.issuer?.taxId);

            // Un intento previo sin resolver se CONSULTA, nunca se reenvía.
            const vivo = await intentoVivo(request.orgId, request.documentId, 'nfse', config.entorno);
            if (vivo && vivo.estado !== 'autorizado') {
                const r = await conSecuencia(request.orgId, { rail: 'nfse', entorno: config.entorno, serie: vivo.serie, tipo: TIPO_SEQUENCIA },
                    () => resolverPorConsulta(ctx, vivo), { esperaMaxMs: 12_000 });
                if (r === 'autorizado') {
                    const autorizado = await intentoAutorizado(request.orgId, request.documentId, 'nfse');
                    if (autorizado) return respuestaAutorizada(request, autorizado);
                }
                if (r === 'sin_resolver') return respuestaFallida(request, MSG_INCIERTO, true, { latam: { rail: 'nfse', intento_id: vivo.id } });
            }

            const base = await this.dpsBase(request, ctx);
            const resultado = await emitirAnteSefin(ctx, request.documentId, base);
            if (resultado.tipo === 'autorizado') return respuestaAutorizada(request, resultado.intento);
            if (resultado.tipo === 'incierto') return respuestaFallida(request, resultado.mensaje, true);
            return respuestaFallida(request, resultado.mensaje, false, resultado.codigo ? { nfse_codigo: resultado.codigo } : {});
        } catch (error) {
            // Errores con mensaje para el usuario (datos, credencial, Sefin sin
            // responder ANTES de enviar la DPS): nada se generó y se puede
            // reintentar después de corregir.
            if (esErrorSeguro(error)) return respuestaFallida(request, error.message, false);
            throw error;
        }
    }

    /** Arma la DPS sin número a partir del documento, el cliente y los ajustes. */
    private async dpsBase(request: FiscalDocumentRequest, ctx: ContextoNfse) {
        const [[doc]] = await withOrgTx(request.orgId, sql`
            select service_date::text as service_date, service_date_end::text as service_date_end
              from documentos_fiscales
             where id = ${request.documentId} and org_id = ${request.orgId}
             limit 1`);
        if (!doc) throw new RailDatosError('Documento no encontrado.');
        const a = ctx.ajustes;
        return armarDps({
            entorno: ctx.entorno,
            documentoEmisor: ctx.documento.numero,
            inscricaoMunicipal: a.inscricaoMunicipal ?? null,
            municipio: a.municipio,
            serie: a.serie,
            opSimpNac: a.opSimpNac,
            regApTribSN: a.regApTribSN ?? null,
            regEspTrib: a.regEspTrib ?? 0,
            servico: a.servico,
            servicoMunicipal: a.servicoMunicipal ?? null,
            aliquotaSimples: a.aliquotaSimples ?? null,
            retencaoIss: ctx.retencaoIss,
            receptor: {
                taxId: request.recipient?.taxId ?? null,
                nome: request.recipient?.legalName ?? null,
                pais: request.recipient?.address?.countryCode ?? 'BR',
                email: request.recipient?.email ?? null,
            },
            lineas: request.lines || [],
            totales: request.totals,
            // Competência = fecha del hecho generador: el fin del periodo
            // prestado si lo hay, si no su inicio; sin fechas, el día de emisión.
            competencia: doc.service_date_end || doc.service_date || null,
            // Unos segundos antes: la emisión no puede quedar por delante del
            // reloj de la Sefin [ANEXO_I E0008].
            instante: new Date(Date.now() - 10_000),
        });
    }

    async cancelDocument(documentId: string, request?: FiscalCancelRequest): Promise<FiscalCancelResponse> {
        const orgId = request?.orgId;
        if (!orgId) return { success: false, status: 'rejected', error: 'Falta la organización del documento.' };
        if (request?.checkOnly) return { success: false, status: 'none', error: 'La consulta de cancelación solo aplica al CFDI de México.' };
        const intento = await intentoPorId(orgId, documentId);
        if (!intento || intento.rail !== 'nfse') return { success: false, status: 'rejected', error: 'No se encontró la NFS-e de esta factura.' };
        const config = railConfig('nfse');
        if (!config.habilitado) return { success: false, status: 'rejected', error: MSG_NO_DISPONIBLE };
        if (intento.entorno !== config.entorno) {
            return { success: false, status: 'rejected', error: 'Esta NFS-e se generó en otro ambiente del Sistema Nacional: no puede cancelarse desde este.' };
        }
        const r = await cancelarNfse(orgId, intento, request?.reason ?? null);
        if (r.estado === 'aceptada') return { success: true, status: 'accepted', rawProviderData: { nfse: r.datos ?? {} } };
        if (r.estado === 'incierta') return { success: false, status: 'unknown', error: r.mensaje, rawProviderData: { nfse: { incierta: true } } };
        return { success: false, status: 'rejected', error: r.mensaje, rawProviderData: { nfse: r.datos ?? {} } };
    }
}
