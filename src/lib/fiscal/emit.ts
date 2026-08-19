// Emisión fiscal provider-neutral. Cord reserva primero el folio y persiste un
// documento canónico inmutable; después invoca el rail regulatorio del país.
// Así una falla de Facturapi no borra el intento ni convierte al proveedor en
// la fuente de verdad del producto.

import { sql, withOrgTx, withSystemTx } from '../db';
import { decryptSecret } from '../crypto-secret';
import { getCountryProfile } from '../countries';
import { normalizeCurrency } from '../currency';
import { dueDateFor, isoDay } from '../cobros';
import { FiscalFactory } from './FiscalFactory';
import type {
  FiscalDocumentRequest,
  FiscalDocumentResponse,
  FiscalLineItem,
  FiscalParty,
} from './index';

export interface EmitResult {
  emitted: boolean;
  documentId?: string;
  fiscalId?: string;
  invoiceNumber?: string;
  publicToken?: string;
  reused?: boolean;
  billable?: boolean;
  status: 'issued' | 'error';
  error?: string;
}

export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function cleanPrefix(value: unknown, fallback: string): string {
  const cleaned = String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
  return cleaned || fallback;
}

export function metadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === 'string')
    .map(([key, item]) => [key, String(item)]));
}

export function documentTypeFor(country: string): string {
  return country.toUpperCase() === 'MX' ? 'cfdi_40' : 'commercial_invoice';
}

/**
 * Token de la hosted invoice page (`/i/[token]`). Alfabeto sin caracteres
 * ambiguos y 32 chars de entropía: la URL es la única credencial de esa página,
 * así que no puede ser adivinable ni derivable del id del documento.
 */
export function newInvoiceToken(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function isBillableCfdi(country: string, providerData: unknown): boolean {
  if (country.toUpperCase() !== 'MX' || !providerData || typeof providerData !== 'object') return false;
  const data = providerData as Record<string, unknown>;
  return data.simulado !== true && data.livemode !== false && typeof data.facturapi_id === 'string';
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
           total_cents, status, facturapi_id, provider_data
      from comision_invoice_batches
     where id = ${batchId}
     limit 1`);
  if (!batch) return { emitted: false, status: 'error', error: 'borrador no encontrado' };
  if (batch.status === 'issued') {
    return { emitted: true, status: 'issued', documentId: batch.facturapi_id as string, reused: true };
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

  const subtotal = Number(batch.fee_base_cents || 0) / 100;
  const taxes = Number(batch.fee_iva_cents || 0) / 100;
  const total = Number(batch.total_cents || 0) / 100;
  let resp: FiscalDocumentResponse;
  try {
    resp = await FiscalFactory.getProvider('MX').issueDocument({
      documentId: String(batch.id),
      invoiceNumber: `CORD-${String(batch.periodo)}-${String(batch.id).slice(0, 8).toUpperCase()}`,
      idempotencyKey: `platform:${batch.id}:invoice:v1`,
      orgId,
      quoteId: `cord-fee-${batch.id}`,
      countryCode: 'MX',
      providerApiKey: platformKey,
      issuer: { legalName: 'CORD', address: { countryCode: 'MX' } },
      recipient: {
        legalName: String(receiver.razon_social || receiver.nombre),
        taxId: String(receiver.rfc),
        taxSystem: String(receiver.regimen_fiscal),
        address: { countryCode: 'MX', postalCode: String(receiver.cp_fiscal) },
      },
      lines: [{
        description: `Servicios de plataforma Cord ${batch.periodo}`,
        quantity: 1,
        unitPrice: subtotal,
        taxRate: subtotal ? taxes / subtotal : 0,
        subtotal,
        taxAmount: taxes,
        total,
      }],
      totals: { subtotal, taxes, total, currency: String(batch.currency || 'MXN') },
      issuedAt: new Date().toISOString(),
      cfdi: { use: String(receiver.uso_cfdi || 'G03'), paymentForm: '03', paymentMethod: 'PUE' },
    });
  } catch (error: unknown) {
    resp = {
      success: false,
      provider: 'facturapi',
      documentId: `err-platform-${batch.id}`,
      error: error instanceof Error ? error.message : 'fallo del proveedor fiscal',
    };
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

/**
 * Timbra el CFDI del pago de suscripción a Cord, con el CSD de Cord.
 *
 * Es el gemelo de `emitPlatformInvoice` para el otro concepto que Cord le cobra
 * al negocio: aquella factura las comisiones de Cord Payments, esta la cuota de
 * la plataforma. Mismo emisor, mismo proveedor, misma llave.
 *
 * Diferencia deliberada con las comisiones: aquí SÍ es autoservicio. El importe
 * no lo propone nadie —es el de un cobro que ya se liquidó—, el receptor son los
 * datos fiscales que el propio negocio capturó, y es él quien la pide. Lo que no
 * cambia es la irreversibilidad: cancelar un CFDI ante el SAT exige aprobación
 * del receptor, así que el doble timbrado se cierra en el índice único de
 * `suscripcion_facturas.stripe_invoice_id`, no con un `if`.
 *
 * Solo México: el CFDI es un riel mexicano. Fuera, el comprobante del cobro ya
 * es el documento y esta función ni se ofrece (regla 24).
 */
export async function emitSubscriptionInvoice(
  orgId: string,
  invoice: { id: string; total: number; currency: string; number?: string | null; created?: number },
): Promise<EmitResult> {
  const platformKey = process.env.FACTURAPI_CORD_ORG_KEY || '';
  if (!platformKey) {
    return { emitted: false, status: 'error', error: 'La facturación de tu suscripción todavía no está disponible.' };
  }

  const [[receiver]] = await withOrgTx(orgId, sql`
    select nombre, razon_social, rfc, regimen_fiscal, cp_fiscal, uso_cfdi, country_code
      from orgs where id = ${orgId} limit 1`);
  if (!receiver) return { emitted: false, status: 'error', error: 'organización no encontrada' };
  if (String(receiver.country_code || 'MX').toUpperCase() !== 'MX') {
    return { emitted: false, status: 'error', error: 'El CFDI aplica solo a negocios en México. Tu comprobante de pago es tu documento.' };
  }
  if (!receiver.rfc || !receiver.regimen_fiscal || !receiver.cp_fiscal) {
    return {
      emitted: false,
      status: 'error',
      error: 'Faltan tus datos fiscales: RFC, régimen fiscal y código postal.',
    };
  }

  // Reserva ANTES de llamar al proveedor. Si el proceso muere a media llamada,
  // la fila queda y el índice único impide que un reintento timbre dos veces.
  const [[reserved]] = await withOrgTx(orgId, sql`
    insert into suscripcion_facturas (org_id, stripe_invoice_id, currency, total_cents, status)
    values (${orgId}, ${invoice.id}, ${normalizeCurrency(invoice.currency)}, ${Math.round(invoice.total * 100)}, 'pending')
    on conflict (stripe_invoice_id) do update
       set updated_at = now()
     where suscripcion_facturas.status <> 'issued'
    returning id, status, facturapi_id, fiscal_uuid`);

  if (!reserved) {
    const [[existing]] = await withOrgTx(orgId, sql`
      select facturapi_id, fiscal_uuid, invoice_number from suscripcion_facturas
       where stripe_invoice_id = ${invoice.id} and org_id = ${orgId} limit 1`);
    return {
      emitted: true, reused: true, status: 'issued',
      documentId: existing?.facturapi_id as string,
      fiscalId: existing?.fiscal_uuid as string,
      invoiceNumber: existing?.invoice_number as string,
    };
  }

  // El precio de Cord se publica con impuesto incluido: 240 es lo que se cobró,
  // no 240 + IVA. Por eso el subtotal se DESAGREGA del total en vez de sumarle
  // el impuesto encima, que facturaría un peso que nadie pagó.
  const IVA = 0.16;
  const total = money(invoice.total);
  const subtotal = money(total / (1 + IVA));
  const taxes = money(total - subtotal);
  const periodo = invoice.created
    ? new Date(invoice.created * 1000).toISOString().slice(0, 7)
    : new Date().toISOString().slice(0, 7);

  let resp: FiscalDocumentResponse;
  try {
    resp = await FiscalFactory.getProvider('MX').issueDocument({
      documentId: String(reserved.id),
      invoiceNumber: `CORD-SUB-${String(invoice.number || invoice.id).replace(/[^A-Za-z0-9-]/g, '').slice(-16).toUpperCase()}`,
      idempotencyKey: `subscription:${invoice.id}:invoice:v1`,
      orgId,
      quoteId: `cord-sub-${invoice.id}`,
      countryCode: 'MX',
      providerApiKey: platformKey,
      issuer: { legalName: 'CORD', address: { countryCode: 'MX' } },
      recipient: {
        legalName: String(receiver.razon_social || receiver.nombre),
        taxId: String(receiver.rfc),
        taxSystem: String(receiver.regimen_fiscal),
        address: { countryCode: 'MX', postalCode: String(receiver.cp_fiscal) },
      },
      lines: [{
        description: `Suscripción a la plataforma Cord ${periodo}`,
        quantity: 1,
        unitPrice: subtotal,
        taxRate: IVA,
        subtotal,
        taxAmount: taxes,
        total,
      }],
      totals: { subtotal, taxes, total, currency: normalizeCurrency(invoice.currency) },
      issuedAt: new Date().toISOString(),
      cfdi: { use: String(receiver.uso_cfdi || 'G03'), paymentForm: '04', paymentMethod: 'PUE' },
    });
  } catch (error: unknown) {
    resp = {
      success: false,
      provider: 'facturapi',
      documentId: `err-sub-${invoice.id}`,
      error: error instanceof Error ? error.message : 'fallo del proveedor fiscal',
    };
  }

  await withOrgTx(orgId, sql`
    update suscripcion_facturas
       set status = ${resp.success ? 'issued' : 'error'},
           facturapi_id = ${resp.success ? resp.documentId : null},
           fiscal_uuid = ${resp.fiscalId ?? null},
           invoice_number = ${resp.success ? (resp.invoiceNumber ?? null) : null},
           provider_data = ${JSON.stringify(resp.rawProviderData ?? {})},
           invoice_error = ${resp.success ? null : (resp.error || 'fallo al timbrar')},
           issued_at = ${resp.success ? new Date() : null},
           updated_at = now()
     where id = ${reserved.id} and org_id = ${orgId} and status <> 'issued'`);

  return {
    emitted: resp.success,
    documentId: resp.documentId,
    fiscalId: resp.fiscalId,
    invoiceNumber: resp.invoiceNumber,
    status: resp.success ? 'issued' : 'error',
    error: resp.error,
  };
}

export async function emitFiscalDocument(orgId: string, cotizacionId: string): Promise<EmitResult> {
  const [headRows, allItems] = await withOrgTx(orgId,
    sql`select
          o.nombre as org_nombre, o.razon_social as org_razon_social, o.rfc as org_tax_id,
          o.regimen_fiscal as org_tax_system, o.country_code, o.iva_pct,
          o.cp_fiscal as org_cp, o.uso_cfdi as org_uso, o.email_contacto as org_email,
          o.telefono as org_telefono, o.direccion as org_direccion,
          o.fiscal_metadata, o.serie_folio,
          o.facturapi_live_key, o.facturapi_live_key_enc, o.sandbox_of,
          c.folio as quote_folio, c.subtotal, c.iva, c.total,
          c.cliente_id, c.terminos as quote_terminos, c.created_at as quote_created,
          c.base_currency, c.fiscal_currency, c.fx_rate, c.fx_rate_source, c.fx_locked_until,
          o.moneda as org_moneda,
          cl.empresa as cliente_empresa, cl.rfc as cliente_rfc,
          cl.email as cliente_email, cl.contacto as cliente_contacto,
          cl.regimen_fiscal as cliente_regimen, cl.uso_cfdi as cliente_uso,
          cl.cp_fiscal as cliente_cp
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

  const country = String(head.country_code || 'MX').toUpperCase();
  const profile = getCountryProfile(country);
  const docType = documentTypeFor(country);
  const approvedItems = allItems.filter((item: any) => item.aprobado !== false);
  if (!approvedItems.length) {
    return { emitted: false, status: 'error', error: 'no hay líneas aprobadas para facturar' };
  }

  const isPartial = approvedItems.length < allItems.length;
  const taxRate = head.iva_pct !== null && head.iva_pct !== undefined ? Number(head.iva_pct) / 100 : 0;
  const lines: FiscalLineItem[] = approvedItems.map((item: any) => {
    const quantity = Number(item.cantidad) || 1;
    const unitPrice = Number(item.precio_negociado ?? item.precio_unitario) || 0;
    const subtotal = money(quantity * unitPrice);
    const taxAmount = money(subtotal * taxRate);
    return {
      description: String(item.descripcion || 'Concepto'),
      quantity,
      unitPrice,
      taxRate,
      subtotal,
      taxAmount,
      total: money(subtotal + taxAmount),
    };
  });

  let subtotal = Number(head.subtotal) || 0;
  let taxes = Number(head.iva) || 0;
  let total = Number(head.total) || 0;
  if (isPartial) {
    subtotal = money(lines.reduce((sum, line) => sum + line.subtotal, 0));
    taxes = money(lines.reduce((sum, line) => sum + line.taxAmount, 0));
    total = money(subtotal + taxes);
  }

  const fiscalMetadata = metadata(head.fiscal_metadata);
  const issuer: FiscalParty = {
    legalName: fiscalMetadata.legal_name || String(head.org_razon_social || head.org_nombre || 'Emisor'),
    taxId: fiscalMetadata.tax_id || (head.org_tax_id ? String(head.org_tax_id) : undefined),
    taxSystem: head.org_tax_system ? String(head.org_tax_system) : undefined,
    email: head.org_email ? String(head.org_email) : undefined,
    address: {
      countryCode: country,
      line1: fiscalMetadata.address_line1 || (head.org_direccion ? String(head.org_direccion) : undefined),
      line2: fiscalMetadata.address_line2 || undefined,
      city: fiscalMetadata.city || undefined,
      region: fiscalMetadata.region || undefined,
      postalCode: fiscalMetadata.postal_code || (head.org_cp ? String(head.org_cp) : undefined),
    },
  };
  const recipient: FiscalParty = {
    legalName: String(head.cliente_empresa || head.cliente_contacto || 'Cliente'),
    taxId: head.cliente_rfc ? String(head.cliente_rfc) : undefined,
    taxSystem: head.cliente_regimen ? String(head.cliente_regimen) : undefined,
    email: head.cliente_email ? String(head.cliente_email) : undefined,
    contactName: head.cliente_contacto ? String(head.cliente_contacto) : undefined,
    address: {
      countryCode: country,
      postalCode: head.cliente_cp ? String(head.cliente_cp) : undefined,
    },
  };
  // ── Divisa del comprobante ────────────────────────────────────────────────
  // La factura se emite en la divisa de la VENTA (`base_currency`): sus importes
  // son exactamente los que el cliente aprobó y paga. Cuando la contabilidad del
  // negocio lleva otra divisa (`fiscal_currency`), el documento declara el tipo
  // de cambio congelado al cotizar — que es lo que el SAT exige como TipoCambio.
  //
  // Antes se tomaba `fiscal_currency` como etiqueta de importes que seguían en
  // `base_currency` y `fx_rate` no se leía en ningún lado: una venta de USD 1,000
  // se facturaba como "MXN 1,000". Ver docs/historial-billing-cobros.md.
  const currency = normalizeCurrency(
    (head.base_currency as string) || (head.org_moneda as string) || profile.currency,
  );
  const ledgerCurrency = normalizeCurrency(
    (head.fiscal_currency as string) || (head.org_moneda as string) || profile.currency,
    currency,
  );
  const storedRate = Number(head.fx_rate);
  const fxRate = currency === ledgerCurrency
    ? 1
    : (Number.isFinite(storedRate) && storedRate > 0 ? storedRate : 0);
  if (!fxRate) {
    // Una cotización multi-divisa sin tasa utilizable no se factura a ciegas:
    // el importe contable sería inventado. Se pide re-cotizar el tipo de cambio.
    return {
      emitted: false,
      status: 'error',
      error: `Esta cotización está en ${currency} y tu contabilidad en ${ledgerCurrency}, pero no tiene un tipo de cambio válido. Vuelve a guardarla para recalcularlo.`,
    };
  }
  const ledgerTotal = money(total * fxRate);

  // CFDI: el TipoCambio del SAT es siempre "moneda del comprobante → MXN". Si el
  // comprobante no va en pesos y la contabilidad de la organización tampoco, no
  // existe la tasa que el SAT pide. Se dice aquí, con un mensaje accionable, en
  // vez de mandar el timbrado a fallar contra el PAC con un error críptico.
  if (country === 'MX' && currency !== 'MXN' && ledgerCurrency !== 'MXN') {
    return {
      emitted: false,
      status: 'error',
      error: `Un CFDI en ${currency} necesita su tipo de cambio a pesos mexicanos, y tu contabilidad está configurada en ${ledgerCurrency}. Cambia la moneda contable a MXN en Ajustes para poder timbrar.`,
    };
  }
  const prefix = cleanPrefix(
    fiscalMetadata.invoice_prefix || (country === 'MX' ? head.serie_folio : ''),
    profile.invoicePrefix,
  );
  const idempotencyKey = `quote:${cotizacionId}:invoice:v1`;
  const issuedAt = new Date().toISOString();
  // La factura estrena vencimiento PROPIO. Se siembra de los términos de la
  // cotización (contado/net30/net60) porque es el dato que ya pactaron las
  // partes, pero a partir de aquí vive en la factura: el aging y los
  // recordatorios leen `due_date`, no vuelven a derivarlo de la cotización.
  const dueDate = isoDay(dueDateFor(
    (head.quote_created as string) || issuedAt,
    (head.quote_terminos as string) || null,
  ));
  const publicToken = newInvoiceToken();

  // El advisory lock serializa dos clicks/pestañas del mismo documento. Dentro
  // de esa misma transacción se revisa idempotencia, se incrementa la secuencia
  // solo si hace falta y se crea el pending antes de tocar al proveedor.
  const [, reservedRows] = await withOrgTx(orgId,
    sql`select pg_advisory_xact_lock(hashtextextended(${`${orgId}:${idempotencyKey}`}, 0))`,
    sql`with existing as (
          select id, invoice_number, fiscal_id, status, provider_data, pdf_url, xml_url, public_token, created_at, updated_at
            from documentos_fiscales
           where org_id = ${orgId} and idempotency_key = ${idempotencyKey}
           limit 1
        ), next_number as (
          insert into invoice_sequences (org_id, country_code, document_type, prefix, next_value)
          select ${orgId}, ${country}, ${docType}, ${prefix}, 2
           where not exists (select 1 from existing)
          on conflict (org_id, country_code, document_type) do update
             set next_value = invoice_sequences.next_value + 1,
                 prefix = excluded.prefix,
                 updated_at = now()
          returning next_value - 1 as sequence_value
        ), inserted as (
          insert into documentos_fiscales (
            org_id, cotizacion_id, cliente_id, country_code, document_type, status, provider,
            invoice_number, currency, ledger_currency, fx_rate, ledger_total,
            subtotal, tax_total, total,
            lifecycle, due_date, amount_paid, amount_remaining, public_token,
            issuer_snapshot, recipient_snapshot, line_items_snapshot,
            idempotency_key, schema_version, provider_data, updated_at
          )
          select ${orgId}, ${cotizacionId}, ${(head.cliente_id as string) || null},
                 ${country}, ${docType}, 'pending',
                 ${country === 'MX' ? 'facturapi' : 'cord'},
                 ${prefix} || '-' || lpad(sequence_value::text, 6, '0'),
                 ${currency}, ${ledgerCurrency}, ${fxRate}, ${ledgerTotal},
                 ${subtotal}, ${taxes}, ${total},
                 'draft', ${dueDate}::date, 0, ${total}, ${publicToken},
                 ${JSON.stringify(issuer)}, ${JSON.stringify(recipient)}, ${JSON.stringify(lines)},
                 ${idempotencyKey}, 'cord.invoice.v1', '{}'::jsonb, now()
            from next_number
          returning id, invoice_number, fiscal_id, status, provider_data, pdf_url, xml_url, public_token, created_at, updated_at
        ), claimed as (
          update documentos_fiscales d
             set status = 'pending', updated_at = now()
           where d.id = (select id from existing)
             and (
               d.status = 'error'
               or (d.status = 'pending' and d.updated_at < now() - interval '2 minutes')
             )
          returning id, invoice_number, fiscal_id, status, provider_data, pdf_url, xml_url, public_token, created_at, updated_at
        )
        select inserted.*, true as created from inserted
        union all
        select claimed.*, true as created from claimed
        union all
        select existing.*, false as created from existing
         where not exists (select 1 from claimed)
        limit 1`,
  );
  const reserved = reservedRows[0];
  if (!reserved) return { emitted: false, status: 'error', error: 'no se pudo reservar el folio fiscal' };
  const localDocumentId = String(reserved.id);
  const invoiceNumber = String(reserved.invoice_number || '');
  const token = (reserved.public_token as string) || publicToken;

  if (!reserved.created && reserved.status === 'issued') {
    return {
      emitted: true,
      documentId: localDocumentId,
      fiscalId: reserved.fiscal_id ? String(reserved.fiscal_id) : undefined,
      invoiceNumber,
      publicToken: token,
      reused: true,
      billable: isBillableCfdi(country, reserved.provider_data),
      status: 'issued',
    };
  }
  if (!reserved.created && reserved.status === 'pending') {
    return {
      emitted: false,
      documentId: localDocumentId,
      invoiceNumber,
      status: 'error',
      error: 'la emisión de esta factura ya está en proceso; vuelve a consultar en unos segundos',
    };
  }
  const request: FiscalDocumentRequest = {
    documentId: localDocumentId,
    invoiceNumber,
    idempotencyKey,
    orgId,
    quoteId: cotizacionId,
    countryCode: country,
    issuer,
    recipient,
    lines,
    totals: {
      subtotal, taxes, total, currency,
      ...(fxRate !== 1 ? { exchangeRate: fxRate, ledgerCurrency } : {}),
    },
    issuedAt,
    providerApiKey: decryptSecret(head.facturapi_live_key_enc as string)
      || (head.facturapi_live_key as string)
      || undefined,
    cfdi: {
      use: String(head.cliente_uso || head.org_uso || 'G03'),
      paymentForm: '03',
      paymentMethod: 'PUE',
    },
  };

  let response: FiscalDocumentResponse;
  if (head.sandbox_of) {
    response = {
      success: true,
      provider: 'cord-sandbox',
      documentId: localDocumentId,
      fiscalId: country === 'MX' ? `SIM-${cotizacionId.slice(0, 8).toUpperCase()}` : undefined,
      pdfUrl: `/api/fiscal/documents/${localDocumentId}/pdf`,
      rawProviderData: {
        simulado: true,
        modo_prueba: true,
        regulatory_status: country === 'MX' ? 'not_stamped' : 'commercial_only',
      },
    };
  } else {
    try {
      response = await FiscalFactory.getProvider(country).issueDocument(request);
    } catch (error: unknown) {
      response = {
        success: false,
        provider: country === 'MX' ? 'facturapi' : 'cord',
        documentId: localDocumentId,
        error: error instanceof Error ? error.message : 'fallo del proveedor fiscal',
      };
    }
  }

  const status: 'issued' | 'error' = response.success ? 'issued' : 'error';
  const providerData = {
    ...(response.rawProviderData ?? {}),
    ...(isPartial ? {
      aprobacion_parcial: true,
      lineas_facturadas: approvedItems.length,
      lineas_totales: allItems.length,
    } : {}),
    ...(!response.success ? { error: response.error || 'fallo del proveedor fiscal' } : {}),
  };
  await withOrgTx(orgId, sql`
    update documentos_fiscales
       set status = ${status},
           -- lifecycle solo avanza a 'open' cuando el rail fiscal confirmó.
           -- Si el proveedor falló, el documento sigue siendo un borrador y no
           -- entra al aging ni a cobranza: cobrar una factura que nunca se
           -- timbró es exactamente el error que esta separación evita.
           lifecycle = ${response.success ? 'open' : 'draft'},
           provider = ${response.provider},
           provider_document_id = ${response.documentId || null},
           fiscal_id = ${response.fiscalId ?? null},
           provider_data = ${JSON.stringify(providerData)},
           pdf_url = ${response.pdfUrl ?? null},
           xml_url = ${response.xmlUrl ?? null},
           issued_at = ${response.success ? new Date(issuedAt) : null},
           updated_at = now()
     where id = ${localDocumentId} and org_id = ${orgId}`);

  return {
    emitted: response.success,
    documentId: localDocumentId,
    fiscalId: response.fiscalId,
    invoiceNumber,
    publicToken: token,
    billable: response.success && isBillableCfdi(country, providerData),
    status,
    error: response.error,
  };
}
