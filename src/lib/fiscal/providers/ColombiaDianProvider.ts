import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { railConfig } from '../latam/config';
import { conSecuencia, intentoAutorizado, intentoVivo, type IntentoRail } from '../latam/comprobantes';
import { esErrorSeguro, MSG_INCIERTO, RailDatosError } from '../latam/errores';
import { RIELES } from '../latam/rieles';
import {
    claveSecuencia, contextoDian, documentoDeIntento, emitirAnteDian, identidadDesdeParte, resolverPorConsulta, type ContextoDian,
} from '../latam/dian/autorizacion';
import {
    armarBase, conceptoNotaCredito, momentoColombia, resolverAdquiriente, type BaseDian, type FichaClienteDian, type SolicitudDian,
} from '../latam/dian/comprobante';
import { representacionDian } from '../latam/dian/representacion';
import type {
    FiscalCancelRequest, FiscalCancelResponse, FiscalDocumentRequest, FiscalDocumentResponse, FiscalProvider,
} from '../index';

// Proveedor fiscal de Colombia: valida cada factura electrónica de venta y
// cada nota crédito ante la DIAN (validación previa, Anexo Técnico 1.9)
// DIRECTAMENTE, con software propio del facturador y sin proveedor
// tecnológico — la misma filosofía que Verifactu y ARCA. El documento lo firma
// el certificado del negocio; el CUFE/CUDE es el `fiscal_id` y el número de la
// resolución (prefijo + consecutivo) reemplaza al folio interno de Cord.
//
// Un solo interruptor decide si hay validación (DIAN_ENABLED + la cuenta
// lista, latam/dian/estado.ts). Sin él, el documento sale con el contrato
// "commercial_only" y la app no aparenta un CUFE que no existe (regla 15). Un
// documento que YA es `dian_*` nunca degrada en silencio: falla cerrado.
//
// Nunca reenvía a ciegas: un intento sin respuesta se resuelve CONSULTANDO a
// la DIAN por su CUFE (latam/dian/autorizacion.ts).

const MSG_INACTIVO = 'La factura electrónica con la DIAN no está activa en este momento. El documento se conserva sin emitir; escríbenos a soporte@flouvia.com si necesitas emitirlo ya.';

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

/** Respuesta de un intento VALIDADO: siempre derivada de lo guardado, nunca del reintento. */
export async function respuestaAutorizadaDian(request: Pick<FiscalDocumentRequest, 'orgId' | 'documentId' | 'idempotencyKey'>, intento: IntentoRail): Promise<FiscalDocumentResponse> {
    const sol = intento.solicitud as SolicitudDian;
    const homologacion = intento.entorno === 'homologacion';
    const guardado = await documentoDeIntento(request.orgId, intento.id);
    const representacion = representacionDian({ solicitud: sol, validado: guardado?.validado ?? null, homologacion });
    const tipoCodigo = sol.clase === 'factura' ? 'CUFE' : 'CUDE';
    return {
        success: true,
        provider: 'dian',
        documentId: intento.id,
        fiscalId: sol.cufe,
        invoiceNumber: sol.id,
        issuedAt: intento.creadoAt || undefined,
        pdfUrl: `/api/fiscal/documents/${request.documentId}/pdf`,
        rawProviderData: {
            regulatory_status: 'dian',
            authority_submission: true,
            invoice_number: sol.id,
            idempotency_key: request.idempotencyKey,
            // Un documento de habilitación no tiene validez fiscal: no se
            // cobra medidor, la UI lo presenta como prueba y el link público
            // no ofrece pagarlo.
            livemode: !homologacion,
            ...(homologacion ? { simulado: true, modo_prueba: true } : {}),
            latam: {
                rail: 'dian',
                entorno: intento.entorno,
                intento_id: intento.id,
                comprobante: {
                    nit_emisor: sol.emisor.nit,
                    clase: sol.clase,
                    prefijo: sol.prefijo,
                    numero: sol.numero,
                    id: sol.id,
                    fecha: sol.fecha,
                    hora: sol.hora,
                    adquiriente: { tipo_documento: sol.adquiriente.tipoDocumento, numero: sol.adquiriente.numero, consumidor_final: sol.adquiriente.consumidorFinal },
                    moneda: sol.moneda,
                    ...(sol.tasaCambio ? { tasa_cop: sol.tasaCambio.tasa } : {}),
                    total: sol.totales.pagar,
                    ...(sol.referencia ? { factura_ajustada: { id: sol.referencia.id, cufe: sol.referencia.cufe, concepto: sol.referencia.concepto } } : {}),
                    ...(sol.retencionesNoInformadas.length ? { retenciones_no_informadas: sol.retencionesNoInformadas } : {}),
                },
                autorizacion: { tipo: tipoCodigo, codigo: sol.cufe, vence: null },
                observaciones: intento.observaciones,
                representacion,
            },
        },
    };
}

function respuestaFallida(request: FiscalDocumentRequest, error: string, incierto: boolean, extra: Record<string, unknown> = {}): FiscalDocumentResponse {
    return {
        success: false,
        provider: 'dian',
        // `err_`: nada quedó validado y el borrador se puede descartar
        // (voidInvoice). Un intento incierto conserva el id: primero hay que
        // confirmar su resultado.
        documentId: incierto ? request.documentId : `err_co_${request.documentId}`,
        error,
        rawProviderData: incierto
            ? { delivery_uncertain: true, retry_safe: true, regulatory_status: 'dian', ...extra }
            : { regulatory_status: 'dian', ...extra },
    };
}

const ficha = (v: unknown): FichaClienteDian | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as FichaClienteDian : null);

export class ColombiaDianProvider implements FiscalProvider {
    supports(countryCode: string): boolean {
        return countryCode.toUpperCase() === RIELES.dian.pais;
    }

    async issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse> {
        const config = railConfig('dian');
        const esDian = request.documentType === RIELES.dian.documentos.factura || request.documentType === RIELES.dian.documentos.notaCredito;

        // Replay primero: si el documento ya fue validado, se devuelve lo
        // validado aunque el interruptor haya cambiado desde entonces.
        const yaAutorizado = await intentoAutorizado(request.orgId, request.documentId, 'dian');
        if (yaAutorizado) return respuestaAutorizadaDian(request, yaAutorizado);

        if (!config.habilitado || !esDian) {
            if (esDian) {
                log.error('dian: documento dian_* con el riel apagado', { route: 'fiscal/dian', orgId: request.orgId, motivo: config.motivo });
                throw new Error(MSG_INACTIVO);
            }
            return respuestaComercial(request);
        }

        try {
            const ctx = await contextoDian(request.orgId, config.entorno, identidadDesdeParte(request.issuer));

            // Un intento previo sin resolver se CONSULTA, nunca se reenvía.
            const vivo = await intentoVivo(request.orgId, request.documentId, 'dian', config.entorno);
            if (vivo && vivo.estado !== 'autorizado') {
                const sol = vivo.solicitud as SolicitudDian;
                const r = await conSecuencia(request.orgId, claveSecuencia(config.entorno, sol),
                    () => resolverPorConsulta(ctx, vivo), { esperaMaxMs: 12_000 });
                if (r === 'autorizado') {
                    const autorizado = await intentoAutorizado(request.orgId, request.documentId, 'dian');
                    if (autorizado) return respuestaAutorizadaDian(request, autorizado);
                }
                if (r === 'sin_resolver') return respuestaFallida(request, MSG_INCIERTO, true, { latam: { rail: 'dian', intento_id: vivo.id } });
            }

            const base = await this.solicitudBase(request, ctx);
            const resultado = await emitirAnteDian(ctx, request.documentId, base);
            if (resultado.tipo === 'autorizado') return respuestaAutorizadaDian(request, resultado.intento);
            if (resultado.tipo === 'incierto') return respuestaFallida(request, resultado.mensaje, true);
            return respuestaFallida(request, resultado.mensaje, false, resultado.codigo ? { dian_regla: resultado.codigo } : {});
        } catch (error) {
            // Errores con mensaje para el usuario (datos, credencial, la DIAN
            // sin responder ANTES de enviar): nada se validó y se puede
            // reintentar después de corregir.
            if (esErrorSeguro(error)) return respuestaFallida(request, error.message, false);
            throw error;
        }
    }

    /** Arma la solicitud sin número a partir del documento, el cliente y los ajustes. */
    private async solicitudBase(request: FiscalDocumentRequest, ctx: ContextoDian): Promise<BaseDian> {
        const [[doc]] = await withOrgTx(request.orgId, sql`
            select d.service_date::text as service_date, d.service_date_end::text as service_date_end,
                   d.due_date::text as due_date, d.credit_note_of, d.updated_at, cl.dian as cliente_dian
              from documentos_fiscales d
              left join clientes cl on cl.id = d.cliente_id and cl.org_id = d.org_id
             where d.id = ${request.documentId} and d.org_id = ${request.orgId}
             limit 1`);
        if (!doc) throw new RailDatosError('Documento no encontrado.');

        const esNota = !!doc.credit_note_of || request.documentType === RIELES.dian.documentos.notaCredito;
        if (esNota) {
            if (!doc.credit_note_of) throw new RailDatosError('Esta nota crédito no indica qué factura ajusta.');
            const intento = await intentoAutorizado(request.orgId, String(doc.credit_note_of), 'dian');
            if (!intento) throw new RailDatosError('La factura original no fue validada por la DIAN: su nota crédito no puede emitirse.');
            if (intento.entorno !== ctx.entorno) throw new RailDatosError('La factura original se validó en otro ambiente de la DIAN: su nota crédito no puede emitirse aquí.');
            const original = intento.solicitud as SolicitudDian;
            const totalNota = (Number(request.totals.subtotal) || 0) + (Number(request.totals.taxes) || 0);
            const moneda = String(request.totals.currency || 'COP').toUpperCase();
            if (moneda !== original.moneda) throw new RailDatosError('La nota crédito debe ir en la moneda de la factura que ajusta.');
            return armarBase({
                clase: 'nota_credito',
                entorno: ctx.entorno,
                emisor: ctx.emisor,
                // El adquiriente y la tasa son los de la factura: la nota la ajusta, no la reescribe.
                adquiriente: original.adquiriente,
                lineas: request.lines || [],
                totales: original.tasaCambio
                    ? { ...request.totals, exchangeRate: Number(original.tasaCambio.tasa), ledgerCurrency: 'COP' }
                    : request.totals,
                fechaTasa: original.tasaCambio?.fecha ?? null,
                tratamientoSinIva: ctx.ajustes.tratamientoSinIva ?? null,
                prefijoNotas: ctx.ajustes.prefijoNotas,
                referencia: {
                    id: original.id, cufe: original.cufe, fecha: original.fecha,
                    concepto: conceptoNotaCredito(totalNota, Number(original.totales.pagar)),
                },
                softwareId: ctx.ajustes.softwareId,
            });
        }

        const adquiriente = resolverAdquiriente({
            nombre: request.recipient?.legalName ?? '',
            identificacion: request.recipient?.taxId ?? null,
            pais: request.recipient?.address?.countryCode ?? 'CO',
            correo: request.recipient?.email ?? null,
            ficha: ficha(doc.cliente_dian),
        });
        const actualizado = doc.updated_at ? new Date(doc.updated_at as string) : new Date();
        return armarBase({
            clase: 'factura',
            entorno: ctx.entorno,
            emisor: ctx.emisor,
            adquiriente,
            lineas: request.lines || [],
            totales: request.totals,
            tratamientoSinIva: ctx.ajustes.tratamientoSinIva ?? null,
            vencimiento: doc.due_date ?? null,
            // Regla 22: la tasa a COP es la que Cord congeló al guardar el documento.
            fechaTasa: momentoColombia(actualizado).fecha,
            periodo: { desde: doc.service_date ?? null, hasta: doc.service_date_end ?? null },
            resolucion: ctx.resolucion,
            softwareId: ctx.ajustes.softwareId,
        });
    }

    async cancelDocument(_documentId: string, _request?: FiscalCancelRequest): Promise<FiscalCancelResponse> {
        // Una factura validada por la DIAN no se anula: se ajusta con una nota
        // crédito (concepto 2, anulación). voidInvoice ya lo resuelve antes de
        // llegar aquí; esto es la segunda línea de defensa.
        return { success: false, status: 'rejected', error: MSG_NO_ANULABLE_CO };
    }
}

export const MSG_NO_ANULABLE_CO = 'En Colombia una factura validada por la DIAN no se anula: emite una nota crédito por el importe que quieras ajustar.';
