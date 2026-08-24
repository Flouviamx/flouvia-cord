import { sql, withOrgTx } from '../../db';
import { fechaExpedicionAEAT } from '../verifactu/huella';
import { appendVerifactuAlta, appendVerifactuAnulacion } from '../verifactu/chain';
import { verifactuQrUrl, VERIFACTU_LEYENDA, VERIFACTU_LEYENDA_CORTA } from '../verifactu/qr';
import { buildDesglose, buildDestinatario } from '../verifactu/desglose';
import { requireSifIdentity } from '../verifactu/sif';
import type {
    FiscalCancelRequest, FiscalCancelResponse, FiscalDocumentRequest, FiscalDocumentResponse, FiscalProvider,
} from '../index';

// Proveedor fiscal de España: genera y encadena el registro de facturación
// Verifactu (RD 1007/2023 + Orden HAC/1177/2024) de CADA factura, sin importar
// si la org tiene certificado o no. Encadenar es un hecho local (hashing puro,
// sin red) que la ley exige llevar desde el primer momento en que el sistema
// opera en modo VERI*FACTU; el ENVÍO a la AEAT (que sí necesita el certificado
// para mTLS) es un paso aparte, asíncrono, que hace `verifactu/aeat.ts` desde
// un cron — igual que el outbox de Stripe.
//
// Mientras la org no haya activado `verifactu_modo = 'verifactu'` (certificado
// subido, ver Ajustes › Fiscal), NO se registra en FiscalFactory como el
// provider de ES: `FiscalFactory` cae a `CommercialInvoiceProvider`, que ya
// dice honestamente "esto no se transmitió a ninguna autoridad" (regla 15).
// La comprobación de si el modo está activo vive en el propio `issueDocument`
// —lee `orgs.verifactu_modo` de la misma org— porque `supports()` sólo recibe
// el código de país, sin contexto de organización.
export class SpainVerifactuProvider implements FiscalProvider {
    supports(countryCode: string): boolean {
        return countryCode.toUpperCase() === 'ES';
    }

    private async verifactuModo(orgId: string): Promise<string> {
        const [rows] = await withOrgTx(orgId, sql`
            select verifactu_modo from orgs where id = ${orgId} limit 1`);
        return String(rows[0]?.verifactu_modo || 'no_verifactu');
    }

    async issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse> {
        const modo = await this.verifactuModo(request.orgId);
        if (modo !== 'verifactu') {
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

        const nif = String(request.issuer.taxId || '').toUpperCase().trim();
        if (!nif) {
            // Fallo cerrado: sin NIF del emisor no hay IDEmisorFactura que firmar.
            // El llamador (emit.ts/invoices.ts) trata una excepción como fallo del
            // proveedor y NO marca la factura como emitida.
            throw new Error('La organización no tiene NIF configurado: no se puede generar el registro Verifactu.');
        }

        // Fallo cerrado: sin la identidad del SIF, `SistemaInformatico`
        // (obligatorio en el registro) no se puede rellenar con datos reales,
        // y la cadena es append-only — mejor no encadenar que encadenar un
        // registro con ese bloque inventado, para siempre.
        const sistemaInformatico = requireSifIdentity();

        const issuedAt = new Date(request.issuedAt);
        const fechaExpedicionFactura = fechaExpedicionAEAT(issuedAt);
        const isRectificativa = request.documentType === 'credit_note';
        const tipoFactura = isRectificativa ? 'R1' : 'F1';
        const cuotaTotal = Number(request.totals.taxes || 0).toFixed(2);
        const importeTotal = Number(request.totals.total || 0).toFixed(2);
        const nombreRazonEmisor = String(request.issuer.legalName || '').trim().slice(0, 120);
        const descripcionOperacion = (request.lines[0]?.description || 'Venta de bienes y/o prestación de servicios')
            .toString().slice(0, 500);

        // Objeto MÁS ANCHO que el tipo declarado de appendVerifactuAlta a
        // propósito: chain.ts persiste `input` tal cual en `payload` (no solo
        // los campos que entran en la huella), así que estos campos extra —
        // necesarios para el XML del envío, pero NO para el hash — viajan con
        // el registro desde que se genera. aeat.ts los lee de ahí, nunca los
        // recalcula, para que el XML enviado sea el mismo pase lo que pase con
        // el estado actual de la cotización.
        const registro = await appendVerifactuAlta(request.orgId, request.documentId, {
            idEmisorFactura: nif,
            numSerieFactura: request.invoiceNumber,
            fechaExpedicionFactura,
            tipoFactura,
            cuotaTotal,
            importeTotal,
            nombreRazonEmisor,
            descripcionOperacion,
            destinatario: buildDestinatario(request.recipient),
            desglose: buildDesglose(request.lines),
            sistemaInformatico,
        });

        const qrUrl = verifactuQrUrl({
            nif,
            numSerie: request.invoiceNumber,
            fecha: fechaExpedicionFactura,
            importeTotal: Number(request.totals.total || 0),
        });

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
                verifactu: {
                    seq: registro.seq,
                    huella: registro.huella,
                    huellaAnterior: registro.huellaAnterior,
                    qrUrl,
                    leyenda: VERIFACTU_LEYENDA,
                    leyendaCorta: VERIFACTU_LEYENDA_CORTA,
                    generadoAt: registro.fechaHoraHusoGenRegistro,
                    envioEstado: 'pendiente',
                },
            },
        };
    }

    async cancelDocument(documentId: string, request?: FiscalCancelRequest): Promise<FiscalCancelResponse> {
        const orgId = request?.orgId;
        if (!orgId) {
            throw new Error('Falta orgId: no se puede anular un registro Verifactu sin saber de qué organización es.');
        }
        const modo = await this.verifactuModo(orgId);
        if (modo !== 'verifactu') {
            return { success: true, rawProviderData: { regulatory_status: 'commercial_only' } };
        }

        const [rows] = await withOrgTx(orgId, sql`
            select invoice_number, issued_at, issuer_snapshot
              from documentos_fiscales
             where id = ${documentId} and org_id = ${orgId}
             limit 1`);
        const doc = rows[0];
        if (!doc || !doc.invoice_number) {
            return { success: false, error: 'No se encontró la factura original para anular su registro Verifactu.' };
        }

        const nif = String((doc.issuer_snapshot as { taxId?: string } | null)?.taxId || '').toUpperCase().trim();
        if (!nif) {
            return { success: false, error: 'La factura original no tiene NIF del emisor: no se puede anular su registro Verifactu.' };
        }

        const fechaExpedicionFacturaAnulada = fechaExpedicionAEAT(new Date(doc.issued_at as string));
        const registro = await appendVerifactuAnulacion(orgId, documentId, {
            idEmisorFacturaAnulada: nif,
            numSerieFacturaAnulada: String(doc.invoice_number),
            fechaExpedicionFacturaAnulada,
            sistemaInformatico: requireSifIdentity(),
        });

        return {
            success: true,
            rawProviderData: {
                verifactu_anulacion: {
                    seq: registro.seq,
                    huella: registro.huella,
                    huellaAnterior: registro.huellaAnterior,
                    generadoAt: registro.fechaHoraHusoGenRegistro,
                    envioEstado: 'pendiente',
                },
            },
        };
    }
}
