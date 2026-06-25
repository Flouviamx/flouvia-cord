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
      o.country_code, o.iva_pct, o.cp_fiscal as org_cp, o.uso_cfdi as org_uso,
      o.facturapi_live_key,
      c.subtotal, c.iva, c.total, c.fiscal_currency,
      cl.empresa as cliente_empresa, cl.rfc as cliente_rfc,
      cl.email as cliente_email, cl.contacto as cliente_contacto,
      cl.regimen_fiscal as cliente_regimen, cl.uso_cfdi as cliente_uso, cl.cp_fiscal as cliente_cp
    from cotizaciones c
    join orgs o on o.id = c.org_id
    left join clientes cl on cl.id = c.cliente_id
    where c.id = ${cotizacionId} and c.org_id = ${orgId}
    limit 1`;

  if (!head) return { emitted: false, status: 'error', error: 'cotización no encontrada' };

  const country: string = (head.country_code as string) || 'MX';
  const allItems = await sql`
    select descripcion, cantidad, precio_unitario, precio_negociado, aprobado
    from cotizacion_items where cotizacion_id = ${cotizacionId} order by orden asc`;

  // Facturar SOLO las líneas aprobadas. Si fue aprobación parcial, recalculamos
  // los totales desde las líneas aceptadas (los totales del head son del original).
  const items = allItems.filter((it: any) => it.aprobado !== false);
  if (items.length === 0) return { emitted: false, status: 'error', error: 'no hay líneas aprobadas para facturar' };

  const isPartial = items.length < allItems.length;
  const ivaPct = head.iva_pct !== null && head.iva_pct !== undefined ? Number(head.iva_pct) / 100 : 0.16;
  let subtotal = Number(head.subtotal) || 0;
  let taxes = Number(head.iva) || 0;
  let total = Number(head.total) || 0;
  if (isPartial) {
    subtotal = items.reduce((s: number, it: any) => s + Number(it.cantidad) * Number(it.precio_negociado ?? it.precio_unitario), 0);
    taxes = subtotal * ivaPct;
    total = subtotal + taxes;
  }

  const docType = documentTypeFor(country);

  let resp: FiscalDocumentResponse;
  try {
    const provider = FiscalFactory.getProvider(country);
    resp = await provider.issueDocument({
      orgId,
      quoteId: cotizacionId,
      countryCode: country,
      // Si la org subió su CSD, timbra bajo SU RFC con su llave LIVE de Facturapi.
      providerApiKey: (head.facturapi_live_key as string) || undefined,
      customerData: {
        legal_name: head.cliente_empresa,
        tax_id: head.cliente_rfc,
        email: head.cliente_email,
        contacto: head.cliente_contacto,
        // Datos fiscales del receptor capturados POR CLIENTE (CFDI nominativo).
        // Si el cliente no los tiene, caemos a los del emisor como placeholder
        // (el provider degrada a "público en general" cuando el RFC es genérico).
        tax_system: head.cliente_regimen || undefined,
        zip: head.cliente_cp || head.org_cp || undefined,
        cfdi_use: head.cliente_uso || head.org_uso || undefined,
      },
      items: items.map((it: any) => ({
        description: it.descripcion,
        quantity: Number(it.cantidad) || 1,
        unit_price: Number(it.precio_negociado ?? it.precio_unitario) || 0,
      })),
      totalAmounts: {
        subtotal,
        taxes,
        total,
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
  // Anotamos en provider_data si se facturó una aprobación parcial (subset de líneas).
  const providerData = { ...(resp.rawProviderData ?? {}), ...(isPartial ? { aprobacion_parcial: true, lineas_facturadas: items.length, lineas_totales: allItems.length } : {}) };
  await sql`
    insert into documentos_fiscales
      (org_id, cotizacion_id, country_code, document_type, fiscal_id, status, provider_data, pdf_url, xml_url)
    values
      (${orgId}, ${cotizacionId}, ${country}, ${docType}, ${resp.fiscalId ?? null}, ${status},
       ${JSON.stringify(providerData)}, ${resp.pdfUrl ?? null}, ${resp.xmlUrl ?? null})`;

  return {
    emitted: resp.success,
    documentId: resp.documentId,
    fiscalId: resp.fiscalId,
    status,
    error: resp.error,
  };
}
