import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { railConfig } from '../latam/config';
import { conSecuencia, intentoAutorizado, intentoVivo, type IntentoRail } from '../latam/comprobantes';
import { esErrorSeguro, MSG_INCIERTO, RailDatosError } from '../latam/errores';
import { RIELES } from '../latam/rieles';
import { contextoSunat, emitirAnteSunat, resolverPorConsulta, type ContextoSunat, type SolicitudEnviada } from '../latam/sunat/autorizacion';
import { armarSolicitud, idComprobante, numeroDocumento, rucValido, type SolicitudSunat } from '../latam/sunat/comprobante';
import { representacionSunat } from '../latam/sunat/representacion';
import type {
    FiscalCancelRequest, FiscalCancelResponse, FiscalDocumentRequest, FiscalDocumentResponse, FiscalProvider,
} from '../index';

// Proveedor fiscal de Perú: envía cada factura (01) y nota de crédito (07)
// electrónica a SUNAT por el SEE - Del contribuyente, DIRECTAMENTE (sin OSE ni
// PSE), firmada con el certificado del negocio. El comprobante es del
// emisor: su serie y correlativo son el número legal que reemplaza al folio
// interno de Cord, y la CDR de SUNAT (aceptada) es la que le da validez.
//
// Un solo interruptor decide si hay envío (SUNAT_ENABLED + la cuenta lista,
// latam/sunat/estado.ts). Sin él, el documento sale con el contrato
// "commercial_only" y la app no aparenta una aceptación que no existe (regla
// 15). Un documento que YA es `sunat_*` nunca degrada en silencio.
//
// Nunca reenvía a ciegas: un envío sin respuesta se resuelve CONSULTANDO a
// SUNAT (latam/sunat/autorizacion.ts). El llamador (finalizeInvoice) recibe
// `delivery_uncertain` + `retry_safe` y el reintento vuelve aquí, que
// encuentra el intento y lo consulta.

const MSG_INACTIVO = 'La factura electrónica con SUNAT no está activa en este momento. El documento se conserva sin emitir; escríbenos a soporte@flouvia.com si necesitas emitirlo ya.';
export const MSG_NO_ANULABLE = 'En Perú una factura aceptada por SUNAT y entregada al cliente no se da de baja: emite una nota de crédito por el importe que quieras compensar.';

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

/** Instante de emisión de lo enviado (fecha y hora de Lima, UTC-5 sin horario de verano). */
function emitidoEn(s: SolicitudSunat): string | undefined {
    const d = new Date(`${s.fecha}T${s.hora}-05:00`);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Respuesta de un intento ACEPTADO: siempre derivada de lo guardado, nunca del reintento. */
function respuestaAutorizada(request: FiscalDocumentRequest, intento: IntentoRail): FiscalDocumentResponse {
    const s = intento.solicitud as SolicitudEnviada;
    const homologacion = intento.entorno === 'homologacion';
    const numero = numeroDocumento(s, homologacion);
    const constancia = intento.autorizacion && intento.autorizacion !== s.envio.resumen ? intento.autorizacion : null;
    const representacion = representacionSunat({ solicitud: s, resumen: s.envio.resumen, constancia, homologacion });
    return {
        success: true,
        provider: 'sunat',
        documentId: intento.id,
        fiscalId: `${s.ruc}-${s.tipo}-${idComprobante(s)}`,
        invoiceNumber: numero,
        issuedAt: emitidoEn(s),
        pdfUrl: `/api/fiscal/documents/${request.documentId}/pdf`,
        xmlUrl: `/api/fiscal/documents/${request.documentId}/xml`,
        rawProviderData: {
            regulatory_status: 'sunat',
            authority_submission: true,
            invoice_number: numero,
            idempotency_key: request.idempotencyKey,
            // Lo aceptado por el servicio beta no tiene validez fiscal: no se
            // presenta como factura real y el link público no ofrece pagarlo.
            livemode: !homologacion,
            ...(homologacion ? { simulado: true, modo_prueba: true } : {}),
            latam: {
                rail: 'sunat',
                entorno: intento.entorno,
                intento_id: intento.id,
                comprobante: {
                    ruc: s.ruc,
                    tipo: s.tipo,
                    serie: s.serie,
                    numero: s.numero,
                    fecha: s.fecha,
                    hora: s.hora,
                    moneda: s.moneda,
                    tipo_operacion: s.tipoOperacion ?? null,
                    receptor: `${s.receptor.tipoDoc}-${s.receptor.numDoc}`,
                    importe_total: s.totales.importeTotal,
                    igv: s.totales.igv,
                    forma_pago: s.formaPago?.tipo ?? null,
                    archivo: s.envio.archivo,
                    ...(s.notaCredito ? { tipo_nota: s.notaCredito.tipoNota, modifica: `${s.notaCredito.referencia.serie}-${s.notaCredito.referencia.numero}` } : {}),
                },
                autorizacion: { tipo: 'CDR', codigo: constancia, resumen: s.envio.resumen, algoritmo: s.envio.algoritmo },
                observaciones: intento.observaciones,
                representacion,
            },
        },
    };
}

function respuestaFallida(request: FiscalDocumentRequest, error: string, incierto: boolean, extra: Record<string, unknown> = {}): FiscalDocumentResponse {
    return {
        success: false,
        provider: 'sunat',
        // `err_`: nada quedó aceptado y el borrador se puede descartar
        // (voidInvoice). Un intento incierto conserva el id: primero hay que
        // confirmar su resultado.
        documentId: incierto ? request.documentId : `err_pe_${request.documentId}`,
        error,
        rawProviderData: incierto
            ? { delivery_uncertain: true, retry_safe: true, regulatory_status: 'sunat', ...extra }
            : { regulatory_status: 'sunat', ...extra },
    };
}

export class PeruSunatProvider implements FiscalProvider {
    supports(countryCode: string): boolean {
        return countryCode.toUpperCase() === RIELES.sunat.pais;
    }

    async issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse> {
        const config = railConfig('sunat');
        const esSunat = request.documentType === RIELES.sunat.documentos.factura || request.documentType === RIELES.sunat.documentos.notaCredito;

        // Replay primero: si el documento ya está aceptado, se devuelve lo
        // aceptado aunque el interruptor haya cambiado desde entonces.
        const yaAceptado = await intentoAutorizado(request.orgId, request.documentId, 'sunat');
        if (yaAceptado) return respuestaAutorizada(request, yaAceptado);

        if (!config.habilitado || !esSunat) {
            if (esSunat) {
                log.error('sunat: documento sunat_* con el riel apagado', { route: 'fiscal/sunat', orgId: request.orgId, motivo: config.motivo });
                throw new Error(MSG_INACTIVO);
            }
            return respuestaComercial(request);
        }

        try {
            const ctx = await contextoSunat(request.orgId, config.entorno, { ruc: request.issuer?.taxId, razonSocial: request.issuer?.legalName });

            // Un intento previo sin resolver se CONSULTA, nunca se reenvía.
            const vivo = await intentoVivo(request.orgId, request.documentId, 'sunat', config.entorno);
            if (vivo && vivo.estado !== 'autorizado') {
                const r = await conSecuencia(request.orgId, { rail: 'sunat', entorno: config.entorno, serie: vivo.serie, tipo: vivo.tipo },
                    () => resolverPorConsulta(ctx, vivo), { esperaMaxMs: 12_000 });
                if (r === 'autorizado') {
                    const aceptado = await intentoAutorizado(request.orgId, request.documentId, 'sunat');
                    if (aceptado) return respuestaAutorizada(request, aceptado);
                }
                if (r === 'sin_resolver') return respuestaFallida(request, MSG_INCIERTO, true, { latam: { rail: 'sunat', intento_id: vivo.id } });
            }

            const base = await this.solicitudBase(request, ctx);
            const resultado = await emitirAnteSunat(ctx, request.documentId, base);
            if (resultado.tipo === 'autorizado') return respuestaAutorizada(request, resultado.intento);
            if (resultado.tipo === 'incierto') return respuestaFallida(request, resultado.mensaje, true);
            return respuestaFallida(request, resultado.mensaje, false, resultado.codigo ? { sunat_codigo: resultado.codigo } : {});
        } catch (error) {
            // Errores con mensaje para el usuario (datos, credencial, ajustes,
            // SUNAT sin responder ANTES de enviar): nada quedó registrado.
            if (esErrorSeguro(error)) return respuestaFallida(request, error.message, false);
            throw error;
        }
    }

    /** Arma la solicitud sin número a partir del documento, el cliente y los ajustes. */
    private async solicitudBase(request: FiscalDocumentRequest, ctx: ContextoSunat): Promise<SolicitudSunat> {
        const [[doc]] = await withOrgTx(request.orgId, sql`
            select d.due_date::text as due_date, d.credit_note_of, d.notes, d.cotizacion_id,
                   (select coalesce(sum(p.monto), 0) from documento_pagos p where p.documento_id = d.id and p.org_id = d.org_id) as pagado_doc,
                   (select coalesce(sum(cc.monto), 0) from cotizacion_cobros cc
                     where d.cotizacion_id is not null and cc.cotizacion_id = d.cotizacion_id and cc.org_id = d.org_id
                       and cc.status = 'pagado' and d.credit_note_of is null) as pagado_cot
              from documentos_fiscales d
             where d.id = ${request.documentId} and d.org_id = ${request.orgId}
             limit 1`);
        if (!doc) throw new RailDatosError('Documento no encontrado.');

        let original: SolicitudEnviada | null = null;
        if (doc.credit_note_of || request.documentType === RIELES.sunat.documentos.notaCredito) {
            if (!doc.credit_note_of) throw new RailDatosError('Esta nota de crédito no indica qué factura modifica.');
            const intento = await intentoAutorizado(request.orgId, String(doc.credit_note_of), 'sunat');
            if (!intento) throw new RailDatosError('La factura original no fue aceptada por SUNAT: su nota de crédito no puede enviarse.');
            if (intento.entorno !== ctx.entorno) throw new RailDatosError('La factura original se envió en otro ambiente de SUNAT: su nota de crédito no puede enviarse aquí.');
            original = intento.solicitud as SolicitudEnviada;
        }

        const a = ctx.ajustes;
        const rucCliente = rucValido(request.recipient?.taxId);
        const ledger = String(request.totals.ledgerCurrency || '').toUpperCase();
        return armarSolicitud({
            ruc: ctx.ruc,
            razonSocial: ctx.razonSocial,
            nombreComercial: a.nombreComercial ?? null,
            establecimiento: a.establecimiento,
            serie: a.serie,
            concepto: a.concepto,
            afectacionSinIgv: a.afectacionSinIgv ?? null,
            regimenMype: !!a.regimenMype,
            fecha: new Date(),
            receptor: {
                taxId: request.recipient?.taxId ?? null,
                pais: request.recipient?.address?.countryCode ?? 'PE',
                nombre: request.recipient?.legalName ?? null,
            },
            lineas: request.lines || [],
            totales: request.totals,
            pago: { vencimiento: doc.due_date ?? null, pagado: (Number(doc.pagado_doc) || 0) + (Number(doc.pagado_cot) || 0) },
            retencionIgv: {
                // El comprador designado agente de retención retiene el 3 % al
                // pagar; la factura al crédito declara el neto (RS 193-2020).
                aplica: !a.excluidoRetenciones && !!rucCliente && (a.agentesRetencion ?? []).includes(rucCliente),
                tipoCambioPen: ledger === 'PEN' && Number(request.totals.exchangeRate) > 0 ? Number(request.totals.exchangeRate) : null,
            },
            notaCreditoDe: original,
            motivo: doc.notes ? String(doc.notes) : null,
        });
    }

    async cancelDocument(_documentId: string, _request?: FiscalCancelRequest): Promise<FiscalCancelResponse> {
        // La comunicación de baja solo procede si la factura no se entregó al
        // cliente, y Cord la entrega al emitirla: se compensa con una nota de
        // crédito. voidInvoice ya lo resuelve antes de llegar aquí (rieles.ts,
        // `anulable: false`); esto es la segunda línea de defensa.
        return { success: false, status: 'rejected', error: MSG_NO_ANULABLE };
    }
}
