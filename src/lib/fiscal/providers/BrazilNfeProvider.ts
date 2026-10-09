import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { railConfig } from '../latam/config';
import { conSecuencia, intentoAutorizado, intentoPorId, intentoVivo, type IntentoRail } from '../latam/comprobantes';
import { esErrorSeguro, MSG_INCIERTO, RailDatosError } from '../latam/errores';
import { RIELES } from '../latam/rieles';
import {
    claveSecuencia, contextoNfe, emitirAnteSefaz, MSG_NO_DISPONIBLE, resolverPorConsulta, type ContextoNfe,
} from '../latam/nfe/autorizacao';
import { representacaoNfe } from '../latam/nfe/danfe';
import { cancelarNfe } from '../latam/nfe/eventos';
import type { ProtNfe } from '../latam/nfe/mensagens';
import { armarNfe, numeroDocumento, type SolicitudNfe } from '../latam/nfe/nfe';
import { clienteNfeDe } from '../latam/nfe/produto';
import { responsavelTecnico } from '../latam/nfe/resp-tec';
import type {
    FiscalCancelRequest, FiscalCancelResponse, FiscalDocumentRequest, FiscalDocumentResponse, FiscalProvider,
} from '../index';

// Proveedor fiscal de Brasil para la VENTA DE MERCANCÍAS: emite cada factura
// de productos como NF-e modelo 55 ante la SEFAZ autorizadora del estado del
// emisor (o la SVC en contingencia) DIRECTAMENTE, sin intermediario — la
// misma filosofía que la NFS-e, ARCA y Verifactu. La chave de acceso es el
// `fiscal_id` y "NFE-<serie>-<número>" reemplaza al folio interno de Cord.
//
// Convive con BrazilNfseProvider (servicios): FiscalFactory le entrega solo
// los documentos `nfe_*`, que nacen únicamente con NFE_ENABLED y la cuenta
// lista (latam/nfe/enrutamiento.ts). Un documento `nfe_*` con el riel
// apagado nunca degrada en silencio: falla cerrado con un mensaje.
//
// Nunca reenvía a ciegas: un intento sin respuesta se resuelve CONSULTANDO la
// chave (latam/nfe/autorizacao.ts).
//
// Sin nota de crédito: una NF-e se cancela dentro de las 24 horas, se corrige
// con una Carta de Correção o se revierte con una NF-e de devolución
// (finNFe 4), que Cord todavía no emite.

const MSG_SIN_NOTA_CREDITO = 'En Brasil la NF-e no tiene nota de crédito: cancélala dentro de las 24 horas de autorizada (anula la factura), corrígela con una Carta de Correção o emite la NF-e de devolución desde tu emisor.';

/** Respuesta de un intento AUTORIZADO: siempre derivada de lo guardado, nunca del reintento. */
function respuestaAutorizada(request: FiscalDocumentRequest, intento: IntentoRail): FiscalDocumentResponse {
    const sol = intento.solicitud as SolicitudNfe;
    const guardada = (intento.respuesta ?? {}) as { prot?: Pick<ProtNfe, 'nProt' | 'dhRecbto' | 'cStat'>; cancelada_en_sefaz?: boolean };
    const prot = guardada.prot;
    if (!prot || !sol.chave || !sol.nNF) throw new Error('nfe: el intento autorizado no tiene el protocolo guardado');
    const homologacion = intento.entorno === 'homologacion';
    const numero = numeroDocumento(sol.serie, sol.nNF, homologacion);
    const representacion = representacaoNfe(sol, prot, homologacion);
    return {
        success: true,
        provider: 'nfe',
        documentId: intento.id,
        fiscalId: sol.chave,
        invoiceNumber: numero,
        issuedAt: Number.isFinite(Date.parse(prot.dhRecbto)) ? new Date(prot.dhRecbto).toISOString() : intento.creadoAt || undefined,
        pdfUrl: `/api/fiscal/documents/${request.documentId}/pdf`,
        rawProviderData: {
            regulatory_status: 'nfe',
            authority_submission: true,
            invoice_number: numero,
            idempotency_key: request.idempotencyKey,
            // Una NF-e de homologação no tiene valor fiscal: no se cobra
            // medidor, la UI la presenta como documento de prueba.
            livemode: !homologacion,
            ...(homologacion ? { simulado: true, modo_prueba: true } : {}),
            latam: {
                rail: 'nfe',
                entorno: intento.entorno,
                intento_id: intento.id,
                comprobante: {
                    chave: sol.chave,
                    numero: sol.nNF,
                    serie: sol.serie,
                    protocolo: prot.nProt,
                    autorizada: prot.dhRecbto,
                    emitida: sol.dhEmi,
                    tp_emis: sol.tpEmis,
                    uf: sol.uf,
                    destinatario: `${sol.dest.tipo} ${sol.dest.numero}`,
                    valor_total: sol.total.vNF,
                    ...(guardada.cancelada_en_sefaz ? { cancelada_en_sefaz: true } : {}),
                },
                autorizacion: { tipo: 'chave', codigo: sol.chave, vence: null },
                observaciones: intento.observaciones,
                representacion,
            },
        },
    };
}

function respuestaFallida(request: FiscalDocumentRequest, error: string, incierto: boolean, extra: Record<string, unknown> = {}): FiscalDocumentResponse {
    return {
        success: false,
        provider: 'nfe',
        // `err_`: nada quedó autorizado y el borrador se puede descartar
        // (voidInvoice). Un intento incierto conserva el id: primero hay que
        // confirmar su resultado.
        documentId: incierto ? request.documentId : `err_br_${request.documentId}`,
        error,
        rawProviderData: incierto
            ? { delivery_uncertain: true, retry_safe: true, regulatory_status: 'nfe', ...extra }
            : { regulatory_status: 'nfe', ...extra },
    };
}

const esNfe = (t: unknown) => t === RIELES.nfe.documentos.factura || t === RIELES.nfe.documentos.notaCredito;

export class BrazilNfeProvider implements FiscalProvider {
    supports(countryCode: string, documentType?: string): boolean {
        return countryCode.toUpperCase() === RIELES.nfe.pais && esNfe(documentType);
    }

    async issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse> {
        const config = railConfig('nfe');

        // Replay primero: si el documento ya tiene NF-e, se devuelve lo
        // autorizado aunque el interruptor haya cambiado desde entonces.
        const yaAutorizado = await intentoAutorizado(request.orgId, request.documentId, 'nfe');
        if (yaAutorizado) return respuestaAutorizada(request, yaAutorizado);

        if (!config.habilitado) {
            log.error('nfe: documento nfe_* con el riel apagado', { route: 'fiscal/nfe', orgId: request.orgId, motivo: config.motivo });
            throw new Error(MSG_NO_DISPONIBLE);
        }
        if (request.documentType === RIELES.nfe.documentos.notaCredito) return respuestaFallida(request, MSG_SIN_NOTA_CREDITO, false);

        try {
            const ctx = await contextoNfe(request.orgId, config.entorno, request.issuer?.taxId);

            // Un intento previo sin resolver se CONSULTA, nunca se reenvía.
            const vivo = await intentoVivo(request.orgId, request.documentId, 'nfe', config.entorno);
            if (vivo && vivo.estado !== 'autorizado') {
                const r = await conSecuencia(request.orgId, claveSecuencia(config.entorno, vivo.serie),
                    () => resolverPorConsulta(ctx, vivo), { esperaMaxMs: 12_000 });
                if (r === 'autorizado') {
                    const autorizado = await intentoAutorizado(request.orgId, request.documentId, 'nfe');
                    if (autorizado) return respuestaAutorizada(request, autorizado);
                }
                if (r === 'sin_resolver') return respuestaFallida(request, MSG_INCIERTO, true, { latam: { rail: 'nfe', intento_id: vivo.id } });
            }

            const base = await this.nfeBase(request, ctx);
            const resultado = await emitirAnteSefaz(ctx, request.documentId, base);
            if (resultado.tipo === 'autorizado') return respuestaAutorizada(request, resultado.intento);
            if (resultado.tipo === 'incierto') return respuestaFallida(request, resultado.mensaje, true);
            return respuestaFallida(request, resultado.mensaje, false, resultado.codigo ? { nfe_cstat: resultado.codigo } : {});
        } catch (error) {
            // Errores con mensaje para el usuario (datos, credencial, SEFAZ sin
            // responder ANTES de enviar): nada se autorizó y se puede reintentar.
            if (esErrorSeguro(error)) return respuestaFallida(request, error.message, false);
            throw error;
        }
    }

    /** Arma la NF-e sin número a partir del documento, el cliente y los ajustes. */
    private async nfeBase(request: FiscalDocumentRequest, ctx: ContextoNfe): Promise<SolicitudNfe> {
        const [[doc]] = await withOrgTx(request.orgId, sql`
            select cl.rfc, cl.empresa, cl.email, cl.telefono, cl.country_code, cl.direccion_line1, cl.direccion_line2,
                   cl.cp_fiscal, cl.nfe
              from documentos_fiscales d
              left join clientes cl on cl.id = d.cliente_id and cl.org_id = d.org_id
             where d.id = ${request.documentId} and d.org_id = ${request.orgId}
             limit 1`);
        if (!doc) throw new RailDatosError('Documento no encontrado.');
        const nfeCliente = clienteNfeDe(doc.nfe);
        return armarNfe({
            entorno: ctx.entorno,
            cnpjEmissor: ctx.documento.numero,
            razaoSocial: request.issuer?.legalName ?? '',
            ajustes: ctx.ajustes,
            receptor: {
                taxId: doc.rfc ?? request.recipient?.taxId ?? null,
                nome: doc.empresa ?? request.recipient?.legalName ?? null,
                email: doc.email ?? request.recipient?.email ?? null,
                telefone: doc.telefono ?? null,
                pais: doc.country_code ?? request.recipient?.address?.countryCode ?? 'BR',
                logradouro: doc.direccion_line1 ?? request.recipient?.address?.line1 ?? null,
                complemento: doc.direccion_line2 ?? request.recipient?.address?.line2 ?? null,
                cep: doc.cp_fiscal ?? request.recipient?.address?.postalCode ?? null,
                nfe: nfeCliente.ok ? nfeCliente.valor : null,
            },
            lineas: request.lines || [],
            totales: request.totals,
            respTec: responsavelTecnico(),
            // Unos segundos antes: la emisión no puede quedar por delante del
            // reloj de la SEFAZ [AI B09-10, rechazo 703].
            instante: new Date(Date.now() - 10_000),
        });
    }

    async cancelDocument(documentId: string, request?: FiscalCancelRequest): Promise<FiscalCancelResponse> {
        const orgId = request?.orgId;
        if (!orgId) return { success: false, status: 'rejected', error: 'Falta la organización del documento.' };
        if (request?.checkOnly) return { success: false, status: 'none', error: 'La consulta de cancelación solo aplica al CFDI de México.' };
        const intento = await intentoPorId(orgId, documentId);
        if (!intento || intento.rail !== 'nfe') return { success: false, status: 'rejected', error: 'No se encontró la NF-e de esta factura.' };
        const config = railConfig('nfe');
        if (!config.habilitado) return { success: false, status: 'rejected', error: MSG_NO_DISPONIBLE };
        if (intento.entorno !== config.entorno) {
            return { success: false, status: 'rejected', error: 'Esta NF-e se autorizó en otro ambiente de la SEFAZ: no puede cancelarse desde este.' };
        }
        const r = await cancelarNfe(orgId, intento, request?.reason ?? null);
        if (r.estado === 'registrado') return { success: true, status: 'accepted', rawProviderData: { nfe: r.datos ?? {} } };
        if (r.estado === 'incierto') return { success: false, status: 'unknown', error: r.mensaje, rawProviderData: { nfe: { incierta: true } } };
        return { success: false, status: 'rejected', error: r.mensaje, rawProviderData: { nfe: r.datos ?? {} } };
    }
}
