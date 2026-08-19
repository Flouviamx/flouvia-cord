// PDF de una factura, listo para adjuntar a un correo.
//
// El comentario de `/api/facturas/[id].ts` prometía mandar la factura "con su
// PDF y su link de pago" desde el día uno. El link sí viajaba; el PDF nunca:
// `createInvoicePdf` solo se llamaba desde la ruta de descarga, así que el
// cliente recibía un correo con un botón y nada que archivar. Para un área de
// cuentas por pagar, el archivo ES el trámite.
//
// Esta función carga el documento con la MISMA forma que la ruta de descarga —
// snapshot inmutable para importes y partes, marca en vivo para logo, color y
// condiciones— y devuelve el binario.

import { sql, withOrgTx } from '../db';
import { createInvoicePdf } from './invoice-pdf';

const TERM_LABEL: Record<string, string> = {
    contado: 'Contado', net30: 'Net 30', net60: 'Net 60',
};

function dueDateFrom(terminos: unknown, baseDate: unknown): Date | null {
    const days: Record<string, number> = { contado: 0, net30: 30, net60: 60 };
    const offset = days[String(terminos || 'contado')];
    if (offset === undefined || !baseDate) return null;
    const due = new Date(baseDate as string);
    if (!Number.isFinite(due.getTime())) return null;
    due.setDate(due.getDate() + offset);
    return due;
}

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
        const [[doc]] = await withOrgTx(orgId, sql`
            select d.document_type, d.country_code, d.invoice_number, d.currency,
                   d.ledger_currency, d.fx_rate, d.ledger_total,
                   d.subtotal, d.tax_total, d.total, d.issuer_snapshot,
                   d.recipient_snapshot, d.line_items_snapshot, d.provider_data,
                   d.status, d.issued_at,
                   d.public_token as invoice_token, d.due_date as invoice_due,
                   o.logo_url, o.color_marca, o.pdf_condiciones,
                   c.terminos, c.public_token,
                   coalesce(c.approved_at, c.created_at) as base_date
              from documentos_fiscales d
              join orgs o on o.id = d.org_id
              left join cotizaciones c on c.id = d.cotizacion_id
             where d.id = ${documentoId} and d.org_id = ${orgId}
             limit 1`);

        if (!doc || doc.status !== 'issued') return null;
        // CFDI timbrado: el archivo con validez es el del PAC, no uno que Cord
        // vuelva a dibujar. Se deja fuera del adjunto en vez de mandar dos
        // documentos que dicen lo mismo con distinta autoridad.
        if (doc.document_type === 'cfdi_40' && doc.provider_data?.facturapi_id) return null;

        const origin = (process.env.PUBLIC_SITE_URL || 'https://cordhq.app').replace(/\/$/, '');
        const term = String(doc.terminos || '');
        const pdf = createInvoicePdf({
            invoiceNumber: String(doc.invoice_number || 'INV'),
            countryCode: String(doc.country_code || 'US'),
            currency: String(doc.currency || 'USD'),
            subtotal: Number(doc.subtotal || 0),
            taxTotal: Number(doc.tax_total || 0),
            total: Number(doc.total || 0),
            issuedAt: doc.issued_at,
            issuer: doc.issuer_snapshot || { legalName: 'Emisor' },
            recipient: doc.recipient_snapshot || { legalName: 'Cliente' },
            lines: Array.isArray(doc.line_items_snapshot) ? doc.line_items_snapshot : [],
            ledgerCurrency: doc.ledger_currency ? String(doc.ledger_currency) : null,
            fxRate: doc.fx_rate !== null && doc.fx_rate !== undefined ? Number(doc.fx_rate) : null,
            ledgerTotal: doc.ledger_total !== null && doc.ledger_total !== undefined ? Number(doc.ledger_total) : null,
            simulated: Boolean(doc.provider_data?.simulado),
            logo: (doc.logo_url as string) || null,
            brandColor: (doc.color_marca as string) || null,
            dueDate: doc.invoice_due ? new Date(doc.invoice_due as string) : dueDateFrom(doc.terminos, doc.base_date),
            paymentTerms: TERM_LABEL[term] || null,
            paymentInstructions: doc.invoice_token
                ? `${origin}/i/${doc.invoice_token}`
                : (doc.public_token ? `${origin}/q/${doc.public_token}` : null),
            notes: (doc.pdf_condiciones as string) || null,
        });

        const nombre = String(doc.invoice_number || 'invoice').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'invoice';
        return { filename: `${nombre}.pdf`, content: new Uint8Array(pdf) };
    } catch {
        return null;
    }
}
