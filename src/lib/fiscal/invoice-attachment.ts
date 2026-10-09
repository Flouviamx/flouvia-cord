// PDF de una factura, listo para adjuntar a un correo.
//
// El comentario de `/api/facturas/[id].ts` prometía mandar la factura "con su
// PDF y su link de pago" desde el día uno. El link sí viajaba; el PDF nunca:
// `createInvoicePdf` solo se llamaba desde la ruta de descarga, así que el
// cliente recibía un correo con un botón y nada que archivar. Para un área de
// cuentas por pagar, el archivo ES el trámite.
//
// Esta función carga el documento con la MISMA consulta y el MISMO armado que la
// ruta de descarga (`loadInvoiceDocumentRow` + `renderInvoicePdf`) —snapshot
// inmutable para importes y partes, marca en vivo para logo, color y
// condiciones— y devuelve el binario. Antes eran dos copias que ya divergían.

import { loadInvoiceDocumentRow, renderInvoicePdf } from './invoice-download';

export interface InvoiceAttachment {
    filename: string;
    content: Uint8Array;
}

/**
 * PDF de la factura, o `null` si no se puede generar.
 *
 * NUNCA lanza: un correo que no sale porque el PDF falló es peor que un correo
 * sin adjunto — el link de pago sigue siendo la vía real de cobro y desde ahí
 * el documento se descarga igual.
 *
 * Para CFDI timbrado devuelve `null` a propósito: ese PDF vive en el PAC y
 * traerlo aquí duplicaría la credencial y el timeout del proveedor dentro del
 * camino de envío. La página de la factura ya lo sirve con la llave correcta.
 */
export async function buildInvoicePdfAttachment(orgId: string, documentoId: string): Promise<InvoiceAttachment | null> {
    try {
        const doc = await loadInvoiceDocumentRow(orgId, documentoId);
        if (!doc || doc.status !== 'issued') return null;
        // CFDI timbrado: el archivo con validez es el del PAC, no uno que Cord
        // vuelva a dibujar. Se deja fuera del adjunto en vez de mandar dos
        // documentos que dicen lo mismo con distinta autoridad.
        if (['cfdi_40', 'cfdi_egreso'].includes(doc.document_type) && doc.provider_data?.facturapi_id) return null;

        const pdf = await renderInvoicePdf(orgId, doc, Boolean(doc.provider_data?.simulado));
        const nombre = String(doc.invoice_number || 'invoice').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'invoice';
        return { filename: `${nombre}.pdf`, content: new Uint8Array(pdf) };
    } catch {
        return null;
    }
}

/**
 * Los adjuntos del correo de una factura: el PDF y, si el negocio lo pidió
 * (Ajustes › Datos fiscales, `fiscal_metadata.einvoice_email`, con default por
 * país), su factura electrónica europea.
 *
 *   - facturx: el PDF adjunto ES el Factur-X (PDF/A-3 con el XML dentro). Es la
 *     misma factura con el mismo nombre de archivo; un lector que no entiende
 *     Factur-X ve el PDF de siempre.
 *   - xrechnung: el PDF más el XML de XRechnung (UBL).
 *   - facturae: el PDF más la Facturae 3.2.2 (`.xsig` si el negocio activó la
 *     firma con su certificado, `.xml` sin firmar si no). Solo emisores en
 *     España: `renderEInvoice` la niega fuera y el correo sale con el PDF.
 *
 * Si el documento no califica (falta un dato que el formato exige) el correo
 * sale con el PDF de siempre: el detalle de la factura dice qué falta. NUNCA
 * lanza, por el mismo motivo que `buildInvoicePdfAttachment`.
 */
export async function buildInvoiceAttachments(orgId: string, documentoId: string): Promise<InvoiceAttachment[]> {
    const soloPdf = async () => {
        const pdf = await buildInvoicePdfAttachment(orgId, documentoId);
        return pdf ? [pdf] : [];
    };
    try {
        const doc = await loadInvoiceDocumentRow(orgId, documentoId);
        if (!doc || doc.status !== 'issued') return [];
        // Colombia: un único .zip con el contenedor de la DIAN (documento
        // firmado + respuesta de validación) y el PDF [Anexo Técnico 9.1].
        if (String(doc.document_type || '').startsWith('dian_')) {
            const pdf = await buildInvoicePdfAttachment(orgId, documentoId);
            const { adjuntoDian } = await import('./latam/dian/contenedor');
            const zip = await adjuntoDian(orgId, documentoId, pdf).catch(() => null);
            return zip ? [zip] : pdf ? [pdf] : [];
        }
        const { einvoiceEmailMode } = await import('./einvoice/codes');
        const mode = einvoiceEmailMode(String(doc.country_code || ''), doc.org_fiscal_metadata?.einvoice_email);
        if (mode === 'off') return soloPdf();
        const { renderEInvoice } = await import('./einvoice/server');
        const result = await renderEInvoice(orgId, doc, mode).catch(() => null);
        if (!result?.ok) return soloPdf();
        const electronica = { filename: result.file.filename, content: new Uint8Array(result.file.content) };
        return mode === 'facturx' ? [electronica] : [...await soloPdf(), electronica];
    } catch {
        return soloPdf();
    }
}
