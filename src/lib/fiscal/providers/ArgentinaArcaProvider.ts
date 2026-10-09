import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { railConfig } from '../latam/config';
import { conSecuencia, intentoAutorizado, intentoVivo, type IntentoRail } from '../latam/comprobantes';
import { esErrorSeguro, MSG_INCIERTO, RailDatosError } from '../latam/errores';
import { RIELES } from '../latam/rieles';
import { contextoArca, cotizacionArca, emitirAnteArca, resolverPorConsulta, type ContextoArca } from '../latam/arca/autorizacion';
import { armarSolicitud, numeroDocumento, type SolicitudArca } from '../latam/arca/comprobante';
import { MONEDAS_ARCA } from '../latam/arca/constantes';
import { estadoArca } from '../latam/arca/estado';
import { representacionArca } from '../latam/arca/representacion';
import type {
    FiscalCancelRequest, FiscalCancelResponse, FiscalDocumentRequest, FiscalDocumentResponse, FiscalProvider,
} from '../index';

// Proveedor fiscal de Argentina: autoriza cada factura y nota de crédito ante
// ARCA (WSAA + WSFEv1, CAE) DIRECTAMENTE, sin intermediario — la misma
// filosofía que Verifactu. El comprobante y su numeración son de ARCA: el CAE
// es el `fiscal_id` y el número legal (punto de venta + número) reemplaza al
// folio interno de Cord.
//
// Un solo interruptor decide si hay autorización (ARCA_ENABLED + la cuenta
// lista, latam/arca/estado.ts). Sin él, el documento sale con el contrato
// "commercial_only" de CommercialInvoiceProvider y la app no aparenta un CAE
// que no existe (regla 15). Un documento que YA es `arca_*` nunca degrada en
// silencio: falla cerrado con un mensaje.
//
// Nunca reenvía a ciegas: un intento sin respuesta se resuelve CONSULTANDO a
// ARCA (latam/arca/autorizacion.ts). El llamador (finalizeInvoice) recibe
// `delivery_uncertain` + `retry_safe` y el reintento vuelve aquí, que encuentra
// el intento y lo consulta.

const MSG_INACTIVO = 'La factura electrónica con ARCA no está activa en este momento. El documento se conserva sin emitir; escríbenos a soporte@flouvia.com si necesitas emitirlo ya.';

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
function respuestaAutorizada(request: FiscalDocumentRequest, intento: IntentoRail, ctx: Pick<ContextoArca, 'ajustes'>, asociado: SolicitudArca | null): FiscalDocumentResponse {
    const sol = intento.solicitud as SolicitudArca;
    const homologacion = intento.entorno === 'homologacion';
    const numero = numeroDocumento(sol.cbteTipo, sol.ptoVta, sol.detalle.CbteDesde, homologacion);
    const cae = String(intento.autorizacion);
    const representacion = representacionArca({
        solicitud: sol,
        cae,
        caeVence: intento.autorizacionVence,
        condicionEmisor: ctx.ajustes.condicionEmisor,
        homologacion,
        asociado: asociado ? { cbteTipo: asociado.cbteTipo, ptoVta: asociado.ptoVta, numero: asociado.detalle.CbteDesde } : null,
        ingresosBrutos: ctx.ajustes.ingresosBrutos ?? null,
        inicioActividades: ctx.ajustes.inicioActividades ?? null,
    });
    return {
        success: true,
        provider: 'arca',
        documentId: intento.id,
        fiscalId: cae,
        invoiceNumber: numero,
        issuedAt: intento.creadoAt || undefined,
        pdfUrl: `/api/fiscal/documents/${request.documentId}/pdf`,
        rawProviderData: {
            regulatory_status: 'arca',
            authority_submission: true,
            invoice_number: numero,
            idempotency_key: request.idempotencyKey,
            // Un CAE de homologación no tiene validez fiscal: no se cobra
            // medidor, la UI lo presenta como documento de prueba y el link
            // público no ofrece pagarlo.
            livemode: !homologacion,
            ...(homologacion ? { simulado: true, modo_prueba: true } : {}),
            latam: {
                rail: 'arca',
                entorno: intento.entorno,
                intento_id: intento.id,
                comprobante: {
                    cuit_emisor: sol.cuit,
                    tipo: sol.cbteTipo,
                    clase: sol.clase,
                    punto_venta: sol.ptoVta,
                    numero: sol.detalle.CbteDesde,
                    fecha: sol.detalle.CbteFch,
                    doc_tipo: sol.detalle.DocTipo,
                    doc_nro: sol.detalle.DocNro,
                    condicion_iva_receptor: sol.detalle.CondicionIVAReceptorId,
                    moneda: sol.detalle.MonId,
                    cotizacion: sol.detalle.MonCotiz,
                    importe_total: sol.detalle.ImpTotal,
                    ...(sol.bonificacion ? { bonificacion: sol.bonificacion } : {}),
                },
                autorizacion: { tipo: 'CAE', codigo: cae, vence: intento.autorizacionVence },
                observaciones: intento.observaciones,
                representacion,
            },
        },
    };
}

function respuestaFallida(request: FiscalDocumentRequest, error: string, incierto: boolean, extra: Record<string, unknown> = {}): FiscalDocumentResponse {
    return {
        success: false,
        provider: 'arca',
        // `err_`: nada quedó autorizado y el borrador se puede descartar
        // (voidInvoice). Un intento incierto conserva el id: primero hay que
        // confirmar su resultado.
        documentId: incierto ? request.documentId : `err_ar_${request.documentId}`,
        error,
        rawProviderData: incierto
            ? { delivery_uncertain: true, retry_safe: true, regulatory_status: 'arca', ...extra }
            : { regulatory_status: 'arca', ...extra },
    };
}

export class ArgentinaArcaProvider implements FiscalProvider {
    supports(countryCode: string): boolean {
        return countryCode.toUpperCase() === RIELES.arca.pais;
    }

    async issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse> {
        const config = railConfig('arca');
        const esArca = request.documentType === RIELES.arca.documentos.factura || request.documentType === RIELES.arca.documentos.notaCredito;

        // Replay primero: si el documento ya tiene CAE, se devuelve lo
        // autorizado aunque el interruptor haya cambiado desde entonces.
        const yaAutorizado = await intentoAutorizado(request.orgId, request.documentId, 'arca');
        if (yaAutorizado) {
            const ajustes = (await estadoArca(request.orgId)).ajustes;
            return respuestaAutorizada(request, yaAutorizado, { ajustes: ajustes as ContextoArca['ajustes'] },
                await solicitudAsociada(request.orgId, request.documentId));
        }

        if (!config.habilitado || !esArca) {
            if (esArca) {
                log.error('arca: documento arca_* con el riel apagado', { route: 'fiscal/arca', orgId: request.orgId, motivo: config.motivo });
                throw new Error(MSG_INACTIVO);
            }
            return respuestaComercial(request);
        }

        try {
            const ctx = await contextoArca(request.orgId, config.entorno, request.issuer?.taxId);

            // Un intento previo sin resolver se CONSULTA, nunca se reenvía.
            const vivo = await intentoVivo(request.orgId, request.documentId, 'arca', config.entorno);
            if (vivo && vivo.estado !== 'autorizado') {
                const sol = vivo.solicitud as SolicitudArca;
                const r = await conSecuencia(request.orgId, { rail: 'arca', entorno: config.entorno, serie: String(sol.ptoVta), tipo: String(sol.cbteTipo) },
                    () => resolverPorConsulta(ctx, vivo), { esperaMaxMs: 12_000 });
                if (r === 'autorizado') {
                    const autorizado = await intentoAutorizado(request.orgId, request.documentId, 'arca');
                    if (autorizado) return respuestaAutorizada(request, autorizado, ctx, await solicitudAsociada(request.orgId, request.documentId));
                }
                if (r === 'sin_resolver') return respuestaFallida(request, MSG_INCIERTO, true, { latam: { rail: 'arca', intento_id: vivo.id } });
            }

            const base = await this.solicitudBase(request, ctx);
            const resultado = await emitirAnteArca(ctx, request.documentId, base);
            if (resultado.tipo === 'autorizado') {
                return respuestaAutorizada(request, resultado.intento, ctx, await solicitudAsociada(request.orgId, request.documentId));
            }
            if (resultado.tipo === 'incierto') return respuestaFallida(request, resultado.mensaje, true);
            return respuestaFallida(request, resultado.mensaje, false, resultado.codigo ? { arca_codigo: resultado.codigo } : {});
        } catch (error) {
            // Errores con mensaje para el usuario (datos, credencial, ARCA sin
            // responder ANTES de pedir el CAE): nada se autorizó y se puede
            // reintentar después de corregir.
            if (esErrorSeguro(error)) return respuestaFallida(request, error.message, false);
            throw error;
        }
    }

    /** Arma la solicitud sin número a partir del documento, el cliente y los ajustes. */
    private async solicitudBase(request: FiscalDocumentRequest, ctx: ContextoArca): Promise<SolicitudArca> {
        const [[doc]] = await withOrgTx(request.orgId, sql`
            select d.service_date::text as service_date, d.service_date_end::text as service_date_end,
                   d.due_date::text as due_date, d.credit_note_of, cl.condicion_iva
              from documentos_fiscales d
              left join clientes cl on cl.id = d.cliente_id and cl.org_id = d.org_id
             where d.id = ${request.documentId} and d.org_id = ${request.orgId}
             limit 1`);
        if (!doc) throw new RailDatosError('Documento no encontrado.');

        let original: SolicitudArca | null = null;
        if (doc.credit_note_of || request.documentType === RIELES.arca.documentos.notaCredito) {
            if (!doc.credit_note_of) throw new RailDatosError('Esta nota de crédito no indica qué factura ajusta.');
            const intento = await intentoAutorizado(request.orgId, String(doc.credit_note_of), 'arca');
            if (!intento) throw new RailDatosError('La factura original no tiene un CAE de ARCA: su nota de crédito no puede autorizarse.');
            if (intento.entorno !== ctx.entorno) throw new RailDatosError('La factura original se autorizó en otro ambiente de ARCA: su nota de crédito no puede autorizarse aquí.');
            original = intento.solicitud as SolicitudArca;
        }

        const currency = String(request.totals.currency || 'ARS').toUpperCase();
        const monId = MONEDAS_ARCA[currency];
        if (!monId) throw new RailDatosError(`ARCA no admite comprobantes en ${currency} desde Cord. Emite la factura en pesos u otra moneda admitida.`);
        let cotizacion = 1;
        if (monId !== 'PES') {
            if (original && original.detalle.MonId === monId) {
                // La nota de crédito ajusta con la cotización de la factura.
                cotizacion = Number(original.detalle.MonCotiz);
            } else if (String(request.totals.ledgerCurrency || '').toUpperCase() === 'ARS' && Number(request.totals.exchangeRate) > 0) {
                // Regla 22: la tasa congelada del documento tiene consumidor —
                // es la cotización que el comprobante declara.
                cotizacion = Number(request.totals.exchangeRate);
            } else {
                // Sin tasa a pesos en el documento: la cotización oficial de ARCA
                // (dato fechado de la autoridad; si no responde, falla cerrado).
                cotizacion = await cotizacionArca(ctx, monId);
            }
        }

        return armarSolicitud({
            cuitEmisor: ctx.cuit,
            condicionEmisor: ctx.ajustes.condicionEmisor,
            puntoVenta: ctx.ajustes.puntoVenta,
            concepto: ctx.ajustes.concepto,
            fecha: new Date(),
            receptor: {
                taxId: request.recipient?.taxId ?? null,
                pais: request.recipient?.address?.countryCode ?? 'AR',
                condicionIva: doc.condicion_iva === null || doc.condicion_iva === undefined ? null : Number(doc.condicion_iva),
            },
            lineas: request.lines || [],
            totales: request.totals,
            servicio: { desde: doc.service_date ?? null, hasta: doc.service_date_end ?? null },
            vencimientoPago: doc.due_date ?? null,
            moneda: { id: monId, cotizacion },
            notaCreditoDe: original,
        });
    }

    async cancelDocument(_documentId: string, _request?: FiscalCancelRequest): Promise<FiscalCancelResponse> {
        // RG 4291: un comprobante con CAE no se anula ante ARCA; se compensa con
        // una nota de crédito. voidInvoice ya lo resuelve antes de llegar aquí;
        // esto es la segunda línea de defensa.
        return { success: false, status: 'rejected', error: MSG_NO_ANULABLE };
    }
}

export const MSG_NO_ANULABLE = 'En Argentina un comprobante autorizado por ARCA no se anula: emite una nota de crédito por el importe que quieras compensar.';

/** Solicitud autorizada de la factura que ajusta una nota de crédito (para la representación impresa). */
async function solicitudAsociada(orgId: string, documentId: string): Promise<SolicitudArca | null> {
    const [[doc]] = await withOrgTx(orgId, sql`
        select credit_note_of from documentos_fiscales where id = ${documentId} and org_id = ${orgId} limit 1`);
    if (!doc?.credit_note_of) return null;
    const intento = await intentoAutorizado(orgId, String(doc.credit_note_of), 'arca');
    return intento ? intento.solicitud as SolicitudArca : null;
}
