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
