// Puente entre el flujo de cotizaciones y la abstracción fiscal global.
// Junta los datos de la cotización (org, cliente, items, totales, país/divisa),
// enruta al proveedor correcto vía FiscalFactory y registra el resultado en
// documentos_fiscales. Best-effort: nunca lanza — si el proveedor falla, deja
// una fila con status 'error' para que el flujo de facturación no se rompa.

import { sql, withOrgTx, withSystemTx } from '../db';
import { FiscalFactory } from './FiscalFactory';
import type { FiscalDocumentResponse } from './index';
import { decryptSecret } from '../crypto-secret';

export interface EmitResult {
  emitted: boolean;
  documentId?: string;
  fiscalId?: string;
  status: 'issued' | 'error';
  error?: string;
}

/**
 * Timbra la factura de UNA comisión mensual usando exclusivamente el CSD de
 * Cord. Debe invocarse desde un carril Ops/cron después de revisión humana;
 * el cron mensual solo crea el borrador y nunca llama esta función.
 */
export async function emitPlatformInvoice(batchId: string): Promise<EmitResult> {
  const platformKey = process.env.FACTURAPI_CORD_ORG_KEY || '';
  if (!platformKey) return { emitted: false, status: 'error', error: 'Falta FACTURAPI_CORD_ORG_KEY' };

  const [[batch]] = await withSystemTx(sql`
    select id, org_id, periodo, currency, fee_base_cents, fee_iva_cents,
           total_cents, status, facturapi_id
      from comision_invoice_batches
     where id = ${batchId}
     limit 1`);
  if (!batch) return { emitted: false, status: 'error', error: 'borrador no encontrado' };
  if (batch.status === 'issued') {
    return { emitted: true, status: 'issued', documentId: batch.facturapi_id as string };
  }
  const orgId = String(batch.org_id || '');
  if (!orgId) return { emitted: false, status: 'error', error: 'borrador sin organización' };
  const [[receiver]] = await withOrgTx(orgId, sql`
    select nombre, razon_social, rfc, regimen_fiscal, cp_fiscal, uso_cfdi, country_code
      from orgs where id = ${orgId} limit 1`);
  if (!receiver) return { emitted: false, status: 'error', error: 'receptor no encontrado' };
  if (String(receiver.country_code || 'MX').toUpperCase() !== 'MX') {
    return { emitted: false, status: 'error', error: 'la facturación de comisión solo está habilitada para receptores en México' };
  }
  if (!receiver.rfc || !receiver.regimen_fiscal || !receiver.cp_fiscal) {
    return { emitted: false, status: 'error', error: 'el receptor no tiene RFC, régimen y código postal completos' };
  }

  let resp: FiscalDocumentResponse;
  try {
    resp = await FiscalFactory.getProvider('MX').issueDocument({
      orgId: String(batch.org_id),
      quoteId: `cord-fee-${batch.id}`,
      countryCode: 'MX',
      providerApiKey: platformKey,
      customerData: {
        legal_name: receiver.razon_social || receiver.nombre,
        tax_id: receiver.rfc,
        tax_system: receiver.regimen_fiscal,
        zip: receiver.cp_fiscal,
        cfdi_use: receiver.uso_cfdi || 'G03',
        payment_form: '03',
      },
      items: [{
        description: `Servicios de plataforma Cord Pagos ${batch.periodo}`,
        quantity: 1,
        unit_price: Number(batch.fee_base_cents || 0) / 100,
      }],
      totalAmounts: {
        subtotal: Number(batch.fee_base_cents || 0) / 100,
        taxes: Number(batch.fee_iva_cents || 0) / 100,
        total: Number(batch.total_cents || 0) / 100,
        currency: String(batch.currency || 'MXN'),
      },
    });
  } catch (error: any) {
    resp = { success: false, documentId: `err-platform-${batch.id}`, error: error?.message || 'fallo del proveedor fiscal' };
  }

  const providerData = resp.rawProviderData ?? {};
  await withSystemTx(sql`
    update comision_invoice_batches
       set status = ${resp.success ? 'issued' : 'error'},
           facturapi_id = ${resp.success ? resp.documentId : null},
           fiscal_uuid = ${resp.fiscalId ?? null},
           provider_data = ${JSON.stringify(providerData)},
           invoice_error = ${resp.success ? null : (resp.error || 'fallo al timbrar')},
           issued_at = ${resp.success ? new Date() : null},
           updated_at = now()
     where id = ${batchId} and status <> 'issued'`);

  return {
    emitted: resp.success,
    documentId: resp.documentId,
    fiscalId: resp.fiscalId,
    status: resp.success ? 'issued' : 'error',
    error: resp.error,
  };
}

// MX timbra CFDI 4.0; el resto (US, etc.) emite factura comercial simple.
function documentTypeFor(country: string): string {
  return country.toUpperCase() === 'MX' ? 'cfdi_40' : 'invoice';
}

export async function emitFiscalDocument(orgId: string, cotizacionId: string): Promise<EmitResult> {
  // 1. Datos de la org (país) + cotización (totales, divisa) + cliente.
  const [headRows, allItems] = await withOrgTx(orgId,
    sql`select
          o.country_code, o.iva_pct, o.cp_fiscal as org_cp, o.uso_cfdi as org_uso,
          o.facturapi_live_key, o.facturapi_live_key_enc, o.sandbox_of,
          c.subtotal, c.iva, c.total, c.fiscal_currency,
          cl.empresa as cliente_empresa, cl.rfc as cliente_rfc,
          cl.email as cliente_email, cl.contacto as cliente_contacto,
          cl.regimen_fiscal as cliente_regimen, cl.uso_cfdi as cliente_uso, cl.cp_fiscal as cliente_cp
        from cotizaciones c
        join orgs o on o.id = c.org_id
        left join clientes cl on cl.id = c.cliente_id
        where c.id = ${cotizacionId} and c.org_id = ${orgId}
        limit 1`,
    sql`select ci.descripcion, ci.cantidad, ci.precio_unitario, ci.precio_negociado, ci.aprobado
        from cotizacion_items ci
        join cotizaciones c on c.id = ci.cotizacion_id
        where ci.cotizacion_id = ${cotizacionId} and c.org_id = ${orgId}
        order by ci.orden asc`,
  );
  const head = headRows[0];

  if (!head) return { emitted: false, status: 'error', error: 'cotización no encontrada' };

  const country: string = (head.country_code as string) || 'MX';

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

  // ENTORNO DE PRUEBA: jamás timbrar un documento fiscal real. Se registra un
  // documento SIMULADO (honesto: provider_data.simulado + modo_prueba) para que
  // el flujo completo se pueda ensayar sin consecuencias ante el SAT.
  if (head.sandbox_of) {
    const fakeId = `SIM-${cotizacionId.slice(0, 8).toUpperCase()}`;
    const providerData = { simulado: true, modo_prueba: true, nota: 'Documento generado en el entorno de prueba — sin validez fiscal.' };
    await withOrgTx(orgId, sql`
      insert into documentos_fiscales (org_id, cotizacion_id, country_code, document_type, fiscal_id, status, provider_data)
      values (${orgId}, ${cotizacionId}, ${country}, ${docType}, ${fakeId}, 'issued', ${JSON.stringify(providerData)})`);
    return { emitted: true, documentId: fakeId, fiscalId: fakeId, status: 'issued' };
  }

  let resp: FiscalDocumentResponse;
  try {
    const provider = FiscalFactory.getProvider(country);
    resp = await provider.issueDocument({
      orgId,
      quoteId: cotizacionId,
      countryCode: country,
      // Si la org subió su CSD, timbra bajo SU RFC con su llave LIVE de Facturapi.
      providerApiKey: decryptSecret(head.facturapi_live_key_enc as string) || (head.facturapi_live_key as string) || undefined,
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
    await withOrgTx(orgId, sql`
      insert into documentos_fiscales (org_id, cotizacion_id, country_code, document_type, status, provider_data)
      values (${orgId}, ${cotizacionId}, ${country}, ${docType}, 'error', ${JSON.stringify({ error: err?.message ?? 'fallo del proveedor' })})`);
    return { emitted: false, status: 'error', error: err?.message ?? 'fallo del proveedor' };
  }

  const status: 'issued' | 'error' = resp.success ? 'issued' : 'error';
  // Anotamos en provider_data si se facturó una aprobación parcial (subset de líneas).
  const providerData = { ...(resp.rawProviderData ?? {}), ...(isPartial ? { aprobacion_parcial: true, lineas_facturadas: items.length, lineas_totales: allItems.length } : {}) };
  await withOrgTx(orgId, sql`
    insert into documentos_fiscales
      (org_id, cotizacion_id, country_code, document_type, fiscal_id, status, provider_data, pdf_url, xml_url)
    values
      (${orgId}, ${cotizacionId}, ${country}, ${docType}, ${resp.fiscalId ?? null}, ${status},
       ${JSON.stringify(providerData)}, ${resp.pdfUrl ?? null}, ${resp.xmlUrl ?? null})`);

  return {
    emitted: resp.success,
    documentId: resp.documentId,
    fiscalId: resp.fiscalId,
    status,
    error: resp.error,
  };
}
