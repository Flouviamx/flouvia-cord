import { resolveBrandProfile } from '../brand-profile';
import { brandImagePng } from '../brand-image';
// Descarga provider-neutral de un documento fiscal. Para CFDI actúa como proxy
// autenticado hacia Facturapi; para facturas comerciales genera el PDF desde el
// snapshot inmutable guardado en Cord.

import { sql, withOrgTx } from '../db';
import { decryptSecret } from '../crypto-secret';
import { createInvoicePdf, type InvoicePdfInput } from './invoice-pdf';
import { isEInvoiceFormat } from './einvoice/model';
import { currentLocale } from '../context';
import { publicDocumentUrl } from '../public-links';
import { isTermCode, termDays } from '../payment-terms';
import { representacionDe } from './latam/representacion';
import { railDeDocumento } from './latam/rieles';

const FACTURAPI_KEY = process.env.FACTURAPI_API_KEY || process.env.FACTURAPI_KEY || '';
const FACTURAPI_BASE = (process.env.FACTURAPI_URL || 'https://www.facturapi.io/v2').replace(/\/$/, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Fila del documento con todo lo que su PDF necesita. La comparten la descarga
 * y el adjunto del correo: antes cada una tenía su propia copia de la consulta
 * y del armado del PDF, y ya habían divergido (el adjunto no acotaba el join de
 * la cotización por organización).
 */
export async function loadInvoiceDocumentRow(orgId: string, id: string, publicToken?: string): Promise<any | null> {
  const [[doc]] = await withOrgTx(orgId, sql`
    select d.id, d.document_type, d.country_code, d.invoice_number, d.currency,
           d.ledger_currency, d.fx_rate, d.ledger_total,
           d.subtotal, d.tax_total, d.total, d.retencion_total, d.retenciones_snapshot,
           d.descuento,
           d.issuer_snapshot,
           d.recipient_snapshot, d.line_items_snapshot, d.provider_data,
           d.status, d.lifecycle, d.issued_at, d.cotizacion_id, d.notes as document_notes,
           d.service_date::text as service_date, d.service_date_end::text as service_date_end,
           d.public_token as invoice_token, d.due_date as invoice_due,
           d.buyer_reference, d.purchase_order, d.payee_account, d.due_date::text as invoice_due_text,
           orig.invoice_number as credit_note_of_number, orig.issued_at as credit_note_of_issued_at,
           o.fiscal_metadata as org_fiscal_metadata,
           o.facturapi_live_key, o.facturapi_live_key_enc,
           -- Marca y condiciones: son PRESENTACIÓN, no datos fiscales, así que se
           -- leen en vivo (el snapshot inmutable sigue mandando en importes y
           -- partes). Un cambio de logo debe reflejarse al re-descargar.
           o.logo_url, o.color_marca, o.color_secundario, o.brand_profile, o.pdf_condiciones, o.moneda,
           o.zona_horaria,
           c.terminos, c.vigencia, c.public_token,
           coalesce(c.approved_at, c.created_at) as base_date
      from documentos_fiscales d
      join orgs o on o.id = d.org_id
      left join cotizaciones c on c.id = d.cotizacion_id and c.org_id = d.org_id
      left join documentos_fiscales orig on orig.id = d.credit_note_of and orig.org_id = d.org_id
     where d.id = ${id} and d.org_id = ${orgId}
       and (${publicToken ?? null}::text is null or
            (d.public_token = ${publicToken ?? null} and d.lifecycle not in ('draft', 'void')))
     limit 1`);
  return doc ?? null;
}

export async function downloadInvoiceDocument(orgId: string, id: string, format: string, publicToken?: string): Promise<Response> {
  const einvoice = isEInvoiceFormat(format);
  if (!UUID_RE.test(id) || (!['pdf', 'xml', 'cedible'].includes(format) && !einvoice)) return new Response('Formato no encontrado', { status: 404 });

  const doc = await loadInvoiceDocumentRow(orgId, id, publicToken);
  if (!doc || doc.status !== 'issued') return new Response('Documento no encontrado', { status: 404 });

  // Factura electrónica (Factur-X, XRechnung, Peppol, Facturae): se genera del
  // mismo snapshot. Si el documento no califica, se dice qué falta (409).
  if (einvoice) {
    const { renderEInvoice } = await import('./einvoice/server');
    const result = await renderEInvoice(orgId, doc, format);
    if (!result.ok) {
      const en = currentLocale() === 'en';
      return new Response(result.problems.map((p) => (en ? p.en : p.es)).join('\n'), {
        status: 409,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
      });
    }
    return new Response(new Uint8Array(result.file.content), {
      status: 200,
      headers: downloadHeaders(result.file.contentType, result.file.filename),
    });
  }

  if (doc.document_type === 'cfdi_40' || doc.document_type === 'cfdi_egreso') {
    const facturapiId = doc.provider_data?.facturapi_id as string | undefined;
    // Un CFDI simulado no tiene archivo en el PAC. El PDF interno deja claro que
    // es prueba; XML no existe porque nunca hubo timbrado.
    if (!facturapiId) {
      if (format === 'xml') return new Response('XML no disponible para un documento de prueba', { status: 404 });
      return invoicePdf(orgId, doc, true);
    }
    const orgApiKey = decryptSecret(doc.facturapi_live_key_enc as string)
      || String(doc.facturapi_live_key || '');
    // El documento puede haberse emitido con la llave de plataforma antes de
    // que la org conectara su CSD. Respetar la credencial original evita que
    // una rotación posterior rompa las descargas históricas.
    const apiKey = doc.provider_data?.credential_scope === 'platform'
      ? FACTURAPI_KEY
      : (orgApiKey || FACTURAPI_KEY);
    if (!apiKey) return new Response('El documento no está disponible por el momento', { status: 503 });
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

  // Perú: el ejemplar electrónico es el XML firmado que SUNAT aceptó.
  if (format === 'xml' && (doc.document_type === 'sunat_invoice' || doc.document_type === 'sunat_credit_note')) {
    const { xmlAceptadoSunat } = await import('./latam/sunat/descarga');
    const aceptado = await xmlAceptadoSunat(orgId, id);
    if (!aceptado) return new Response('XML no disponible', { status: 404 });
    return new Response(aceptado.xml, { status: 200, headers: downloadHeaders('application/xml', `${safeFilename(aceptado.archivo)}.xml`) });
  }
  // Colombia: el XML de un documento validado por la DIAN es su contenedor
  // (AttachedDocument) con el documento firmado y la respuesta de la DIAN.
  if (format === 'xml' && String(doc.document_type || '').startsWith('dian_')) {
    const { contenedorDeDocumento } = await import('./latam/dian/contenedor');
    const contenedor = await contenedorDeDocumento(orgId, String(doc.id)).catch(() => null);
    if (!contenedor) return new Response('XML no disponible para este documento', { status: 404 });
    return new Response(contenedor.xml, { status: 200, headers: downloadHeaders('application/xml', contenedor.nombre) });
  }


  // Chile: el XML legal es el DTE firmado, en un sobre de intercambio
  // dirigido al cliente; la copia cedible es el mismo PDF con el acuse de
  // recibo (Ley 19.983).
  if (format === 'xml' && railDeDocumento(doc.document_type)?.id === 'sii') {
    const { xmlIntercambio } = await import('./latam/sii/intercambio');
    const xml = await xmlIntercambio(orgId, doc);
    if (!xml) return new Response('XML no disponible para este documento', { status: 404 });
    return new Response(new Uint8Array(xml), {
      status: 200,
      headers: downloadHeaders('application/xml; charset=ISO-8859-1', `${safeFilename(doc.invoice_number || 'dte')}.xml`),
    });
  }
  if (format === 'cedible') {
    if (!representacionDe(doc.provider_data)?.cedible) return new Response('Este documento no tiene copia cedible', { status: 404 });
    return invoicePdf(orgId, doc, Boolean(doc.provider_data?.simulado), true);
  }
  if (format !== 'pdf') return new Response('Esta factura no genera XML', { status: 404 });
  return invoicePdf(orgId, doc, Boolean(doc.provider_data?.simulado));
}

/** Vencimiento del pago según los términos de crédito de la cotización. */
export function dueDateFrom(terminos: unknown, baseDate: unknown): Date | null {
  // Un código que no es contado ni net<N> no tiene vencimiento demostrable.
  const term = String(terminos || 'contado');
  if (term !== 'contado' && !termDays(term)) return null;
  if (!baseDate) return null;
  const due = new Date(baseDate as string);
  if (!Number.isFinite(due.getTime())) return null;
  due.setDate(due.getDate() + termDays(term));
  return due;
}

async function invoicePdf(orgId: string, doc: any, simulated: boolean, copiaCedible = false): Promise<Response> {
  const pdf = createInvoicePdf({ ...(await invoicePdfInput(orgId, doc, simulated)), copiaCedible });
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: downloadHeaders('application/pdf', `${safeFilename(doc.invoice_number || 'invoice')}${copiaCedible ? '-cedible' : ''}.pdf`),
  });
}

/** PDF de una factura a partir de la fila de `loadInvoiceDocumentRow`. */
export async function renderInvoicePdf(orgId: string, doc: any, simulated: boolean): Promise<Buffer> {
  return createInvoicePdf(await invoicePdfInput(orgId, doc, simulated));
}

/**
 * La entrada del PDF de una factura, sin dibujarlo. La comparten el PDF de
 * siempre y el Factur-X (que es ese mismo PDF ensamblado como PDF/A-3).
 */
export async function invoicePdfInput(orgId: string, doc: any, simulated: boolean): Promise<InvoicePdfInput> {
  const term = String(doc.terminos || '');
  const appearance = resolveBrandProfile(doc.brand_profile);
  const source = appearance.header === 'contrast' && appearance.logoDark ? appearance.logoDark : doc.logo_url;
  const logoBytes = await brandImagePng(source);
  return {
    brandProfile: appearance,
    brandSecondary: doc.color_secundario as string | null,
    invoiceNumber: String(doc.invoice_number || 'INV'),
    documentType: String(doc.document_type),
    countryCode: String(doc.country_code || 'US'),
    currency: String(doc.currency || 'USD'),
    subtotal: Number(doc.subtotal || 0),
    taxTotal: Number(doc.tax_total || 0),
    total: Number(doc.total || 0),
    retenciones: Array.isArray(doc.retenciones_snapshot) ? doc.retenciones_snapshot : null,
    discountCode: (doc.descuento?.codigo as string) || null,
    issuedAt: doc.issued_at,
    issuer: doc.issuer_snapshot || { legalName: 'Emisor' },
    recipient: doc.recipient_snapshot || { legalName: 'Cliente' },
    lines: Array.isArray(doc.line_items_snapshot) ? doc.line_items_snapshot : [],
    ledgerCurrency: doc.ledger_currency ? String(doc.ledger_currency) : null,
    fxRate: doc.fx_rate !== null && doc.fx_rate !== undefined ? Number(doc.fx_rate) : null,
    ledgerTotal: doc.ledger_total !== null && doc.ledger_total !== undefined ? Number(doc.ledger_total) : null,
    simulated,
    voided: doc.lifecycle === 'void',
    logo: logoBytes ? `data:image/png;base64,${logoBytes.toString('base64')}` : null,
    brandColor: (doc.color_marca as string) || null,
    // El vencimiento propio de la factura manda; derivarlo de los términos de
    // la cotización es solo el respaldo de los documentos anteriores a que la
    // factura tuviera `due_date`, y no existe para una factura standalone.
    dueDate: doc.invoice_due
      ? new Date(doc.invoice_due as string)
      : dueDateFrom(doc.terminos, doc.base_date),
    // El código, no una etiqueta: el PDF lo traduce al idioma del documento.
    paymentTermsCode: isTermCode(term) ? term : null,
    timeZone: (doc.zona_horaria as string) || null,
    serviceDate: (doc.service_date as string) || null,
    serviceDateEnd: (doc.service_date_end as string) || null,
    creditNoteOfNumber: (doc.credit_note_of_number as string) || null,
    verifactu: doc.provider_data?.verifactu || null,
    autoridad: representacionDe(doc.provider_data),
    // El "cómo pagar" es la página de LA FACTURA: ahí está el saldo real de
    // este documento. El link de la cotización queda como respaldo para los
    // documentos emitidos antes de que la factura tuviera token propio; una
    // factura standalone nunca tuvo uno.
    // Ni una factura anulada ni una nota de crédito se pagan: no llevan link.
    paymentInstructions: doc.lifecycle === 'void' || doc.credit_note_of_number ? null
      : doc.invoice_token
      ? await publicDocumentUrl(orgId, 'i', doc.invoice_token)
      : (doc.public_token ? await publicDocumentUrl(orgId, 'q', doc.public_token) : null),
    notes: (doc.pdf_condiciones as string) || null,
    documentNotes: (doc.document_notes as string) || null,
    // Referencia del comprador (Leitweg-ID) y orden de compra: las lleva la
    // factura electrónica (BT-10, BT-13) y el PDF las imprime igual.
    reference: [doc.buyer_reference, doc.purchase_order].map((v) => String(v || '').trim()).filter(Boolean).join(' · ') || null,
  };
}

function downloadHeaders(contentType: string, filename: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Content-Disposition': `inline; filename="${filename}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
  };
}

function safeFilename(value: string): string {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'invoice';
}
