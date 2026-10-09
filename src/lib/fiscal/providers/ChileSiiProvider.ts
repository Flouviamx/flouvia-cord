import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { railConfig } from '../latam/config';
import { conSecuencia, intentoAutorizado, intentoVivo, type IntentoRail } from '../latam/comprobantes';
import { esErrorSeguro, MSG_INCIERTO, RailDatosError } from '../latam/errores';
import { RIELES } from '../latam/rieles';
import {
    contextoSii, emitirAnteSii, mensajeEnValidacion, resolverPorConsulta,
    type ContextoSii, type RespuestaParcial, type SolicitudSii,
} from '../latam/sii/autorizacion';
import { armarBorrador, numeroDocumento, type BorradorSii, type FacturaOriginal } from '../latam/sii/dte';
import { representacionSii } from '../latam/sii/representacion';
import { fechaChile, rutValido } from '../latam/sii/texto';
import type {
    FiscalCancelRequest, FiscalCancelResponse, FiscalDocumentRequest, FiscalDocumentResponse, FiscalProvider,
} from '../index';

// Proveedor fiscal de Chile: emite cada factura (33), factura exenta (34),
// nota de débito (56) y nota de crédito (61) como Documento Tributario Electrónico ante el SII
// DIRECTAMENTE, sin intermediario —la misma filosofía que Verifactu y ARCA—:
// folio del CAF del negocio, timbre electrónico, firma XMLDSig con su
// certificado, upload al SII y consulta de su veredicto. El folio legal
// reemplaza al folio interno de Cord.
//
// Un solo interruptor decide si hay emisión ante el SII (SII_ENABLED + la
// cuenta lista, latam/sii/estado.ts). Sin él, el documento sale con el
// contrato "commercial_only" de CommercialInvoiceProvider y la app no aparenta
// un DTE que no existe (regla 15). Un documento que YA es `sii_*` nunca degrada
// en silencio: falla cerrado con un mensaje.
//
// El SII valida DESPUÉS del upload: mientras no da su veredicto, el llamador
// (finalizeInvoice) recibe `delivery_uncertain` + `retry_safe`; el cron
// fiscal-latam y cada reintento CONSULTAN (nunca reenvían a ciegas) y
// terminan la emisión cuando el SII la acepta.

const MSG_INACTIVO = 'La factura electrónica con el SII no está activa en este momento. El documento se conserva sin emitir; escríbenos a soporte@flouvia.com si necesitas emitirlo ya.';

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

/** Respuesta de un intento ACEPTADO por el SII: siempre derivada de lo guardado. */
function respuestaAutorizada(request: FiscalDocumentRequest, intento: IntentoRail): FiscalDocumentResponse {
    const sol = intento.solicitud as SolicitudSii;
    const certificacion = intento.entorno === 'homologacion';
    const numero = numeroDocumento(sol.tipo, sol.folio, certificacion);
    const trackId = (intento.respuesta as RespuestaParcial | null)?.trackId ?? null;
    const representacion = representacionSii({
        borrador: sol.borrador,
        folio: sol.folio,
        timbre: sol.timbre,
        unidadSii: sol.unidadSii,
        resolucion: sol.resolucion,
        certificacion,
        trackId,
    });
    return {
        success: true,
        provider: 'sii',
        documentId: intento.id,
        // Identidad legal del DTE: RUT emisor + tipo + folio.
        fiscalId: `${sol.rutEmisor}/T${sol.tipo}/F${sol.folio}`,
        invoiceNumber: numero,
        issuedAt: intento.creadoAt || undefined,
        pdfUrl: `/api/fiscal/documents/${request.documentId}/pdf`,
        rawProviderData: {
            regulatory_status: 'sii',
            authority_submission: true,
            invoice_number: numero,
            idempotency_key: request.idempotencyKey,
            // Un DTE de certificación no tiene validez tributaria: no se cobra
            // medidor, la UI lo presenta como documento de prueba y el link
            // público no ofrece pagarlo.
            livemode: !certificacion,
            ...(certificacion ? { simulado: true, modo_prueba: true } : {}),
            latam: {
                rail: 'sii',
                entorno: intento.entorno,
                intento_id: intento.id,
                documento: {
                    tipo: sol.tipo,
                    folio: sol.folio,
                    fecha: sol.fechaEmision,
                    rut_emisor: sol.rutEmisor,
                    rut_receptor: sol.rutReceptor,
                    monto_total: sol.montoTotal,
                    neto: sol.borrador.neto,
                    exento: sol.borrador.exento,
                    iva: sol.borrador.iva,
                    ...(sol.borrador.descuento > 0 ? { descuento: sol.borrador.descuento } : {}),
                },
                autorizacion: { tipo: 'SII', codigo: intento.autorizacion, ...(trackId ? { track_id: trackId } : {}) },
                observaciones: intento.observaciones,
                representacion,
            },
        },
    };
}

function respuestaFallida(request: FiscalDocumentRequest, error: string, incierto: boolean, extra: Record<string, unknown> = {}): FiscalDocumentResponse {
    return {
        success: false,
        provider: 'sii',
        // `err_`: nada quedó emitido y el borrador se puede descartar
        // (voidInvoice). Un intento en vuelo conserva el id: primero hay que
        // conocer el veredicto del SII.
        documentId: incierto ? request.documentId : `err_cl_${request.documentId}`,
        error,
        rawProviderData: incierto
            ? { delivery_uncertain: true, retry_safe: true, regulatory_status: 'sii', ...extra }
            : { regulatory_status: 'sii', ...extra },
    };
}

export class ChileSiiProvider implements FiscalProvider {
    /** Cuánto se espera en línea el veredicto del SII tras el upload (las pruebas lo acortan). */
    constructor(private readonly opciones: { esperaVeredictoMs?: number } = {}) {}

    supports(countryCode: string): boolean {
        return countryCode.toUpperCase() === RIELES.sii.pais;
    }

    async issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse> {
        const config = railConfig('sii');
        const docs = RIELES.sii.documentos;
        const esSii = request.documentType === docs.factura || request.documentType === docs.notaCredito || request.documentType === docs.notaDebito;

        // Replay primero: lo que el SII ya aceptó se devuelve tal cual, aunque
        // el interruptor haya cambiado desde entonces.
        const yaAutorizado = await intentoAutorizado(request.orgId, request.documentId, 'sii');
        if (yaAutorizado) return respuestaAutorizada(request, yaAutorizado);

        if (!config.habilitado || !esSii) {
            if (esSii) {
                log.error('sii: documento sii_* con el riel apagado', { route: 'fiscal/sii', orgId: request.orgId, motivo: config.motivo });
                throw new Error(MSG_INACTIVO);
            }
            return respuestaComercial(request);
        }

        try {
            const ctx = await contextoSii(request.orgId, config.entorno, request.issuer?.taxId);

            // Un intento previo sin resolver se CONSULTA, nunca se reenvía a ciegas.
            const vivo = await intentoVivo(request.orgId, request.documentId, 'sii', config.entorno);
            if (vivo && vivo.estado !== 'autorizado') {
                const r = await conSecuencia(request.orgId, { rail: 'sii', entorno: config.entorno, serie: vivo.serie, tipo: vivo.tipo },
                    () => resolverPorConsulta(ctx, vivo), { esperaMaxMs: 12_000, leaseS: 90 });
                if (r === 'autorizado') {
                    const autorizado = await intentoAutorizado(request.orgId, request.documentId, 'sii');
                    if (autorizado) return respuestaAutorizada(request, autorizado);
                }
                if (r === 'sin_resolver') {
                    const trackId = (vivo.respuesta as RespuestaParcial | null)?.trackId;
                    return respuestaFallida(request, trackId ? mensajeEnValidacion(trackId) : MSG_INCIERTO, true,
                        { latam: { rail: 'sii', intento_id: vivo.id, ...(trackId ? { track_id: trackId } : {}) } });
                }
                // Descartado o rechazado: el documento quedó libre y se emite con un folio nuevo.
            }

            const borrador = await this.borrador(request, ctx);
            const resultado = await emitirAnteSii(ctx, request.documentId, borrador, new Date(), this.opciones.esperaVeredictoMs);
            if (resultado.tipo === 'autorizado') return respuestaAutorizada(request, resultado.intento);
            if (resultado.tipo === 'en_validacion') {
                return respuestaFallida(request, resultado.mensaje, true, { latam: { rail: 'sii', track_id: resultado.trackId } });
            }
            if (resultado.tipo === 'incierto') return respuestaFallida(request, resultado.mensaje, true);
            return respuestaFallida(request, resultado.mensaje, false, resultado.codigo ? { sii_codigo: resultado.codigo } : {});
        } catch (error) {
            // Errores con mensaje para el usuario (datos, credencial, folios,
            // SII sin responder ANTES del upload): nada se emitió.
            if (esErrorSeguro(error)) return respuestaFallida(request, error.message, false);
            throw error;
        }
    }

    /** Arma el borrador del DTE a partir del documento, el cliente y los ajustes. */
    private async borrador(request: FiscalDocumentRequest, ctx: ContextoSii): Promise<BorradorSii> {
        const [[doc]] = await withOrgTx(request.orgId, sql`
            select d.service_date::text as service_date, d.service_date_end::text as service_date_end,
                   d.due_date::text as due_date, d.credit_note_of, d.nota_debito_de, d.notes, cl.giro, cl.comuna
              from documentos_fiscales d
              left join clientes cl on cl.id = d.cliente_id and cl.org_id = d.org_id
             where d.id = ${request.documentId} and d.org_id = ${request.orgId}
             limit 1`);
        if (!doc) throw new RailDatosError('Documento no encontrado.');

        // El documento que la nota modifica, tal como el SII lo aceptó.
        const originalDe = async (id: string, msg: { sinAceptar: string; otroAmbiente: string }): Promise<FacturaOriginal> => {
            const intento = await intentoAutorizado(request.orgId, id, 'sii');
            if (!intento) throw new RailDatosError(msg.sinAceptar);
            if (intento.entorno !== ctx.entorno) throw new RailDatosError(msg.otroAmbiente);
            const sol = intento.solicitud as SolicitudSii;
            return { tipo: sol.tipo, folio: sol.folio, fechaEmision: sol.fechaEmision, total: sol.montoTotal, receptor: sol.borrador.receptor };
        };
        let original: FacturaOriginal | null = null;
        let originalDebito: FacturaOriginal | null = null;
        if (doc.credit_note_of || request.documentType === RIELES.sii.documentos.notaCredito) {
            if (!doc.credit_note_of) throw new RailDatosError('Esta nota de crédito no indica qué factura ajusta.');
            original = await originalDe(String(doc.credit_note_of), {
                sinAceptar: 'La factura original no fue aceptada por el SII: su nota de crédito no puede emitirse.',
                otroAmbiente: 'La factura original se emitió en otro ambiente del SII: su nota de crédito no puede emitirse aquí.',
            });
        } else if (doc.nota_debito_de || request.documentType === RIELES.sii.documentos.notaDebito) {
            if (!doc.nota_debito_de) throw new RailDatosError('Esta nota de débito no indica qué documento modifica.');
            originalDebito = await originalDe(String(doc.nota_debito_de), {
                sinAceptar: 'El documento que modifica no fue aceptado por el SII: su nota de débito no puede emitirse.',
                otroAmbiente: 'El documento que modifica se emitió en otro ambiente del SII: su nota de débito no puede emitirse aquí.',
            });
        }

        const rec = request.recipient;
        const rutCliente = rutValido(rec?.taxId);
        if (rec?.taxId && !rutCliente && String(rec.address?.countryCode || 'CL').toUpperCase() === 'CL') {
            throw new RailDatosError(`El RUT del cliente (${rec.taxId}) no es válido. Corrígelo en su ficha.`);
        }
        const direccionEmisor = String(ctx.ajustes.direccion || request.issuer?.address?.line1 || '').trim();
        if (!direccionEmisor) throw new RailDatosError('Falta la dirección de tu negocio. Complétala en Ajustes › Datos fiscales.');
        if (!String(request.issuer?.legalName || '').trim()) throw new RailDatosError('Falta la razón social de tu negocio. Complétala en Ajustes › Datos fiscales.');

        return armarBorrador({
            emisor: {
                rut: ctx.rutEmisor,
                razonSocial: request.issuer.legalName,
                giro: ctx.ajustes.giro,
                acteco: ctx.ajustes.acteco,
                direccion: direccionEmisor,
                comuna: ctx.ajustes.comuna,
                ciudad: ctx.ajustes.ciudad || request.issuer?.address?.city || null,
                sucursal: ctx.ajustes.sucursal || null,
                cdgSucursal: ctx.ajustes.cdgSucursal ?? null,
            },
            receptor: {
                rut: rutCliente ?? undefined,
                razonSocial: rec?.legalName,
                giro: doc.giro ?? null,
                direccion: [rec?.address?.line1, rec?.address?.line2].filter(Boolean).join(' ') || null,
                comuna: doc.comuna ?? null,
                ciudad: rec?.address?.city ?? null,
                correo: rec?.email ?? null,
                pais: rec?.address?.countryCode ?? 'CL',
            },
            fechaEmision: fechaChile(new Date()),
            lineas: request.lines || [],
            totales: request.totals,
            vencimiento: doc.due_date ?? null,
            servicio: { desde: doc.service_date ?? null, hasta: doc.service_date_end ?? null },
            notaCreditoDe: original,
            notaDebitoDe: originalDebito,
            motivo: doc.notes ?? null,
        });
    }

    async cancelDocument(_documentId: string, _request?: FiscalCancelRequest): Promise<FiscalCancelResponse> {
        // Un DTE aceptado no se anula ante el SII: se emite una nota de crédito
        // que lo referencia. voidInvoice lo resuelve antes de llegar aquí
        // (RIELES.sii.anulable = false); esto es la segunda línea de defensa.
        return { success: false, status: 'rejected', error: MSG_NO_ANULABLE };
    }
}

export const MSG_NO_ANULABLE = 'En Chile un documento aceptado por el SII no se anula: emite una nota de crédito que lo referencie.';
