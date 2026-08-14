// Descarga provider-neutral de un documento fiscal. Para CFDI actúa como proxy
// autenticado hacia Facturapi; para facturas comerciales genera el PDF desde el
// snapshot inmutable guardado en Cord.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, sql, withOrgTx } from '../../../../../lib/db';
import { decryptSecret } from '../../../../../lib/crypto-secret';
import { createInvoicePdf } from '../../../../../lib/fiscal/invoice-pdf';

const FACTURAPI_KEY = process.env.FACTURAPI_API_KEY || process.env.FACTURAPI_KEY || '';
const FACTURAPI_BASE = (process.env.FACTURAPI_URL || 'https://www.facturapi.io/v2').replace(/\/$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async ({ params }) => {
  const orgId = await getActiveOrgId();
  const id = String(params.id || '');
  const format = params.format === 'xml' ? 'xml' : params.format === 'pdf' ? 'pdf' : '';
  if (!UUID_RE.test(id) || !format) return new Response('Formato no encontrado', { status: 404 });

  const [[doc]] = await withOrgTx(orgId, sql`
    select d.id, d.document_type, d.country_code, d.invoice_number, d.currency,
           d.subtotal, d.tax_total, d.total, d.issuer_snapshot,
           d.recipient_snapshot, d.line_items_snapshot, d.provider_data,
           d.status, d.issued_at, o.facturapi_live_key, o.facturapi_live_key_enc
      from documentos_fiscales d
      join orgs o on o.id = d.org_id
     where d.id = ${id} and d.org_id = ${orgId}
     limit 1`);
  if (!doc || doc.status !== 'issued') return new Response('Documento no encontrado', { status: 404 });

  if (doc.document_type === 'cfdi_40') {
    const facturapiId = doc.provider_data?.facturapi_id as string | undefined;
    // Un CFDI simulado no tiene archivo en el PAC. El PDF interno deja claro que
    // es prueba; XML no existe porque nunca hubo timbrado.
    if (!facturapiId) {
      if (format === 'xml') return new Response('XML no disponible para un documento de prueba', { status: 404 });
      return invoicePdf(doc, true);
    }
    const orgApiKey = decryptSecret(doc.facturapi_live_key_enc as string)
      || String(doc.facturapi_live_key || '');
    // El documento puede haberse emitido con la llave de plataforma antes de
    // que la org conectara su CSD. Respetar la credencial original evita que
    // una rotación posterior rompa las descargas históricas.
    const apiKey = doc.provider_data?.credential_scope === 'platform'
      ? FACTURAPI_KEY
      : (orgApiKey || FACTURAPI_KEY);
    if (!apiKey) return new Response('Proveedor fiscal no configurado', { status: 503 });
    const authorization = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
    let providerResponse: Response;
    try {
      providerResponse = await fetch(`${FACTURAPI_BASE}/invoices/${facturapiId}/${format}`, {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(25000),
      });
    } catch {
      return new Response('No se pudo obtener el CFDI', { status: 502 });
    }
    if (!providerResponse.ok) return new Response('No se pudo obtener el CFDI', { status: 502 });
    return new Response(await providerResponse.arrayBuffer(), {
      status: 200,
      headers: downloadHeaders(
        format === 'xml' ? 'application/xml' : 'application/pdf',
        `${safeFilename(doc.invoice_number || facturapiId)}.${format}`,
      ),
    });
  }

  if (format !== 'pdf') return new Response('Esta factura no genera XML', { status: 404 });
  return invoicePdf(doc, Boolean(doc.provider_data?.simulado));
};

function invoicePdf(doc: any, simulated: boolean): Response {
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
    simulated,
  });
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: downloadHeaders('application/pdf', `${safeFilename(doc.invoice_number || 'invoice')}.pdf`),
  });
}

function downloadHeaders(contentType: string, filename: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Content-Disposition': `inline; filename="${filename}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}

function safeFilename(value: string): string {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'invoice';
}
