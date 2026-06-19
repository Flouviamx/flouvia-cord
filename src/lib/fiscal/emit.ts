// Puente entre el flujo de cotizaciones y la abstracción fiscal global.
// Junta los datos de la cotización (org, cliente, items, totales, país/divisa),
// enruta al proveedor correcto vía FiscalFactory y registra el resultado en
// documentos_fiscales. Best-effort: nunca lanza — si el proveedor falla, deja
// una fila con status 'error' para que el flujo de facturación no se rompa.

import { sql } from '../db';
import { FiscalFactory } from './FiscalFactory';
import type { FiscalDocumentResponse } from './index';

export interface EmitResult {
  emitted: boolean;
  documentId?: string;
  fiscalId?: string;
  status: 'issued' | 'error';
  error?: string;
}

// MX timbra CFDI 4.0; el resto (US, etc.) emite factura comercial simple.
function documentTypeFor(country: string): string {
  return country.toUpperCase() === 'MX' ? 'cfdi_40' : 'invoice';
}

export async function emitFiscalDocument(orgId: string, cotizacionId: string): Promise<EmitResult> {
  // 1. Datos de la org (país) + cotización (totales, divisa) + cliente.
  const [head] = await sql`
    select
      o.country_code,
      c.subtotal, c.iva, c.total, c.fiscal_currency,
      cl.empresa as cliente_empresa, cl.rfc as cliente_rfc,
      cl.email as cliente_email, cl.contacto as cliente_contacto
    from cotizaciones c
    join orgs o on o.id = c.org_id
    left join clientes cl on cl.id = c.cliente_id
    where c.id = ${cotizacionId} and c.org_id = ${orgId}
    limit 1`;

  if (!head) return { emitted: false, status: 'error', error: 'cotización no encontrada' };

  const country: string = (head.country_code as string) || 'MX';
  const items = await sql`
    select descripcion, cantidad, precio_unitario, precio_negociado
    from cotizacion_items where cotizacion_id = ${cotizacionId} order by orden asc`;

  const docType = documentTypeFor(country);

  let resp: FiscalDocumentResponse;
  try {
    const provider = FiscalFactory.getProvider(country);
    resp = await provider.issueDocument({
      orgId,
      quoteId: cotizacionId,
      countryCode: country,
      customerData: {
        empresa: head.cliente_empresa,
        rfc: head.cliente_rfc,
        email: head.cliente_email,
        contacto: head.cliente_contacto,
      },
      items: items as any[],
      totalAmounts: {
        subtotal: Number(head.subtotal) || 0,
        taxes: Number(head.iva) || 0,
        total: Number(head.total) || 0,
        currency: (head.fiscal_currency as string) || 'MXN',
      },
    });
  } catch (err: any) {
    // País sin proveedor o fallo del PAC → registramos el intento como error.
    await sql`
      insert into documentos_fiscales (org_id, cotizacion_id, country_code, document_type, status, provider_data)
      values (${orgId}, ${cotizacionId}, ${country}, ${docType}, 'error', ${JSON.stringify({ error: err?.message ?? 'fallo del proveedor' })})`;
    return { emitted: false, status: 'error', error: err?.message ?? 'fallo del proveedor' };
  }

  const status: 'issued' | 'error' = resp.success ? 'issued' : 'error';
  await sql`
    insert into documentos_fiscales
      (org_id, cotizacion_id, country_code, document_type, fiscal_id, status, provider_data, pdf_url, xml_url)
    values
      (${orgId}, ${cotizacionId}, ${country}, ${docType}, ${resp.fiscalId ?? null}, ${status},
       ${JSON.stringify(resp.rawProviderData ?? {})}, ${resp.pdfUrl ?? null}, ${resp.xmlUrl ?? null})`;

  return {
    emitted: resp.success,
    documentId: resp.documentId,
    fiscalId: resp.fiscalId,
    status,
    error: resp.error,
  };
}
