import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { fechaExpedicionAEAT } from '../verifactu/huella';
import { appendVerifactuAlta, appendVerifactuAnulacion, registroOriginal, sifIdentityForOrg, type ChainedRegistro } from '../verifactu/chain';
import { identidadFacturaOriginal, prepararAnulacionVerifactu, VerifactuCorreccionError } from '../verifactu/correcciones';
import { verifactuQrUrl, VERIFACTU_LEYENDA, VERIFACTU_LEYENDA_CORTA, VERIFACTU_QR_PRESENTACION } from '../verifactu/qr';
import { construirAlta } from '../verifactu/registro';
import { SifNotConfiguredError, verifactuEnvioConfig } from '../verifactu/sif';
import { programarEnvioInmediato } from '../verifactu/submit';
import { VerifactuDatosError } from '../verifactu/validacion';
import type {
    FiscalCancelRequest, FiscalCancelResponse, FiscalDocumentRequest, FiscalDocumentResponse, FiscalProvider,
} from '../index';

// Proveedor fiscal de España: genera y encadena el registro de facturación
// Verifactu (RD 1007/2023 + Orden HAC/1177/2024) de cada factura. Encadenar es
// un hecho local (hashing puro, sin red); el ENVÍO a la AEAT (que necesita el
// certificado para mTLS) es un paso aparte, asíncrono — `verifactu/submit.ts`
// lo intenta justo después de emitir y un cron horario lo reintenta, igual que
// el outbox de Stripe.
//
// UN SOLO interruptor decide si hay registro (`verifactuEnvioConfig()` + el
// modo de la organización): si la remisión a la AEAT no está activa, NO se
// encadena nada y la factura sale con el contrato "commercial_only" de
// CommercialInvoiceProvider — sin QR ni leyenda VERI*FACTU. Antes se
// encadenaba con el envío apagado y se imprimía un QR de VERI*FACTU para un
// registro que nunca iba a llegar a la AEAT: el cliente que lo cotejara vería
// "factura no encontrada".
//
// La comprobación del modo vive en el propio `issueDocument` —lee
// `orgs.verifactu_modo` de la misma org— porque `supports()` solo recibe el
// código de país, sin contexto de organización.

const MSG_ENVIO_INACTIVO = 'El registro de facturas ante la AEAT (Verifactu) no está activo en este momento. La factura se conserva sin emitir; escríbenos a soporte@flouvia.com si necesitas emitirla ya.';
const MSG_MODO_INACTIVO = 'Activa la configuración fiscal de España antes de emitir este documento.';

/** Errores cuyo mensaje se puede mostrar tal cual al dueño del negocio (regla 14). */
function mensajeSeguro(error: unknown): string | null {
    if (error instanceof VerifactuDatosError || error instanceof VerifactuCorreccionError || error instanceof SifNotConfiguredError) {
        return error.message;
    }
    return null;
}

/**
 * Lo que la factura muestra de su registro: SIEMPRE derivado del payload
 * GUARDADO, nunca de la hora actual. En un reintento (el proveedor devuelve el
 * registro que ya existía) la fecha y el importe del QR son los que se
 * firmaron y se enviarán, no los de este segundo intento.
 */
function vistaRegistro(registro: ChainedRegistro) {
    const p = registro.payload as Record<string, any>;
    const entorno = p.entorno === 'pruebas' || p.entorno === 'produccion' ? p.entorno : verifactuEnvioConfig().entorno;
    const qrUrl = verifactuQrUrl({
        nif: String(p.idEmisorFactura), numSerie: String(p.numSerieFactura),
        fecha: String(p.fechaExpedicionFactura), importeTotal: String(p.importeTotal),
    }, { entorno });
    return {
        seq: registro.seq,
        huella: registro.huella,
        huellaAnterior: registro.huellaAnterior,
        qrUrl,
        leyenda: VERIFACTU_LEYENDA,
        leyendaCorta: VERIFACTU_LEYENDA_CORTA,
        etiquetaQr: VERIFACTU_QR_PRESENTACION.etiquetaSuperior,
        generadoAt: registro.fechaHoraHusoGenRegistro,
        fechaExpedicion: String(p.fechaExpedicionFactura),
        /** Instante de expedición del registro: el documento debe fecharse con él en un reintento. */
        emitidaAt: typeof p.emitidaAt === 'string' ? p.emitidaAt : undefined,
        tipoFactura: String(p.tipoFactura),
        /** "Importe total factura" del Reglamento (sin retenciones), en EUR — el del QR. */
        importeTotal: String(p.importeTotal),
        cuotaTotal: String(p.cuotaTotal),
        entorno,
        envioEstado: registro.envioEstado,
    };
}

export class SpainVerifactuProvider implements FiscalProvider {
    supports(countryCode: string): boolean {
        return countryCode.toUpperCase() === 'ES';
    }

    async issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse> {
        // Replay primero: si esta factura ya tiene registro, se devuelve el
        // guardado aunque el interruptor haya cambiado desde entonces — el
        // registro existe en la cadena y se enviará.
        const existente = await registroOriginal(request.orgId, request.documentId, 'alta');
        if (existente) return this.respuesta(request, existente);

        const [orgRows, docRows] = await withOrgTx(request.orgId,
            sql`select verifactu_modo from orgs where id = ${request.orgId} limit 1`,
            sql`select credit_note_of from documentos_fiscales where id = ${request.documentId} and org_id = ${request.orgId} limit 1`,
        );
        const modo = String(orgRows[0]?.verifactu_modo || 'no_verifactu');
        const config = verifactuEnvioConfig();
        if (modo !== 'verifactu' || !config.habilitado) {
            if (request.documentType?.startsWith('verifactu_')) {
                throw new Error(modo !== 'verifactu' ? MSG_MODO_INACTIVO : MSG_ENVIO_INACTIVO);
            }
            // Mismo contrato que CommercialInvoiceProvider: la app no puede
            // aparentar un registro que nunca se generó.
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

        if (!String(request.issuer?.taxId || '').trim()) {
            // Fallo cerrado: sin NIF del emisor no hay IDEmisorFactura que
            // firmar. El llamador (emit.ts/invoices.ts) trata una excepción como
            // fallo del proveedor y NO marca la factura como emitida. Un NIF
            // presente pero inválido lo rechaza construirAlta con su motivo.
            throw new Error('La organización no tiene NIF configurado: no se puede generar el registro Verifactu.');
        }

        try {
            // Fallo cerrado: sin la identidad del SIF, `SistemaInformatico`
            // (obligatorio) no se puede rellenar con datos reales, y la cadena
            // es append-only — mejor no encadenar que encadenar un registro
            // con ese bloque inventado, para siempre.
            const sistemaInformatico = await sifIdentityForOrg(request.orgId);

            // Nota de crédito → rectificativa. La factura original sale del
            // propio documento (`credit_note_of`): el request no la trae, y
            // `relatedFiscalId` es el folio de un PAC, que Verifactu no tiene.
            const rectificaDe = (request as FiscalDocumentRequest & { rectifica?: { documentId?: string } }).rectifica?.documentId
                || (docRows[0]?.credit_note_of ? String(docRows[0].credit_note_of) : '');
            const esNotaCredito = ['credit_note', 'verifactu_credit_note'].includes(request.documentType || '') || !!rectificaDe;
            if (esNotaCredito && !rectificaDe) {
                throw new VerifactuDatosError('Esta nota de crédito no indica qué factura rectifica.');
            }
            const rectificativa = rectificaDe ? await identidadFacturaOriginal(request.orgId, rectificaDe) : undefined;

            const issuedAt = new Date(request.issuedAt);
            const alta = construirAlta({
                emisor: request.issuer,
                receptor: request.recipient,
                numSerie: request.invoiceNumber,
                fechaExpedicion: fechaExpedicionAEAT(issuedAt),
                lines: request.lines,
                totals: request.totals,
                entorno: config.entorno,
                ...(rectificativa ? { rectificativa } : {}),
            });

            // chain.ts persiste `input` tal cual en `payload` (no solo los
            // campos de la huella): el envío reconstruye el XML desde ahí,
            // nunca desde el estado actual del documento.
            const registro = await appendVerifactuAlta(request.orgId, request.documentId, {
                ...alta,
                sistemaInformatico,
                emitidaAt: issuedAt.toISOString(),
            });
            // Remisión inmediata en segundo plano; el cron horario cubre lo que no salga aquí.
            programarEnvioInmediato(request.orgId);
            return this.respuesta(request, registro);
        } catch (error) {
            if (error instanceof SifNotConfiguredError) {
                log.error('verifactu: identidad del SIF no configurada', { route: 'fiscal/verifactu', orgId: request.orgId, detalle: error.detalle });
            }
            const seguro = mensajeSeguro(error);
            if (seguro) throw new Error(seguro);
            throw error;
        }
    }

    private respuesta(request: FiscalDocumentRequest, registro: ChainedRegistro): FiscalDocumentResponse {
        return {
            success: true,
            provider: 'verifactu',
            documentId: request.documentId,
            pdfUrl: `/api/fiscal/documents/${request.documentId}/pdf`,
            rawProviderData: {
                regulatory_status: 'verifactu',
                authority_submission: true,
                invoice_number: request.invoiceNumber,
                idempotency_key: request.idempotencyKey,
                verifactu: vistaRegistro(registro),
            },
        };
    }

    async cancelDocument(documentId: string, request?: FiscalCancelRequest): Promise<FiscalCancelResponse> {
        const orgId = request?.orgId;
        if (!orgId) {
            throw new Error('Falta orgId: no se puede anular un registro Verifactu sin saber de qué organización es.');
        }
        // La anulación sigue al registro de alta de la factura, aunque después
        // cambie el plan o se apague el interruptor: la cadena ya contiene el
        // alta y la AEAT debe recibir también su anulación.
        try {
            const plan = await prepararAnulacionVerifactu(orgId, documentId);
            const registro = plan.existente ?? await appendVerifactuAnulacion(orgId, documentId, plan.input!, plan.correccion ?? null);
            if (!plan.existente) programarEnvioInmediato(orgId);
            return {
                success: true,
                rawProviderData: {
                    verifactu_anulacion: {
                        seq: registro.seq,
                        huella: registro.huella,
                        huellaAnterior: registro.huellaAnterior,
                        generadoAt: registro.fechaHoraHusoGenRegistro,
                        sinRegistroPrevio: (registro.payload as Record<string, unknown>).sinRegistroPrevio === 'S',
                        envioEstado: registro.envioEstado,
                    },
                },
            };
        } catch (error) {
            if (error instanceof SifNotConfiguredError) {
                log.error('verifactu: identidad del SIF no configurada', { route: 'fiscal/verifactu', orgId, detalle: error.detalle });
            }
            const seguro = mensajeSeguro(error);
            if (seguro) return { success: false, error: seguro };
            throw error;
        }
    }
}
