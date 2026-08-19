// Ciclo de vida de la factura como objeto de primera clase.
//
// Hasta ago 2026 una factura solo podía nacer de una cotización aprobada, en un
// solo golpe: `emitFiscalDocument()` reservaba folio y timbraba en la misma
// llamada. Eso cubre el caso "cerré un trato", pero no cubre el caso más común
// de un negocio: "necesito cobrarle algo a alguien".
//
// Aquí viven los cuatro verbos que faltaban:
//
//   draft     → se arma sin tocar al proveedor ni consumir medidor
//   finalize  → reserva folio, timbra, y a partir de ahí es inmutable
//   void      → cancela ante el rail regulatorio (solo si nadie pagó)
//   creditNote→ el camino correcto cuando SÍ hubo pago
//
// `emitFiscalDocument()` (emit.ts) no cambia: sigue siendo el carril de la
// cotización, que ya está en producción timbrando CFDI real.

import { sql, withOrgTx } from '../db';
import { decryptSecret } from '../crypto-secret';
import { getCountryProfile } from '../countries';
import { logInvoiceEvent } from './timeline';
import { normalizeCurrency } from '../currency';
import { dueDateFor, isoDay } from '../cobros';
import { FXService, FXUnavailableError } from '../fx/FXService';
import { calculateInvoiceTotals, type TaxBreakdown } from '../../../packages/elements/src/engine';
import { FiscalFactory } from './FiscalFactory';
import {
  cleanPrefix,
  documentTypeFor,
  isBillableCfdi,
  metadata,
  money,
  newInvoiceToken,
  type EmitResult,
} from './emit';
import type {
  FiscalDocumentRequest,
  FiscalDocumentResponse,
  FiscalLineItem,
  FiscalParty,
} from './index';

export interface DraftLineInput {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  /** Producto del catálogo, si la línea vino de ahí. */
  productoId?: string | null;
  /** Precio pactado; si viene, manda sobre `precioUnitario` (el de lista). */
  precioNegociado?: number | null;
  costoUnitario?: number | null;
  /**
   * Tasa de ESTA línea, en fracción (0.16). Si falta, cae al default de la org.
   * Es lo que permite facturar un concepto exento junto a uno gravado, que es
   * normal en cuanto sales de un solo país.
   */
  taxRate?: number | null;
}

export interface CreateDraftInput {
  clienteId: string;
  items: DraftLineInput[];
  /** Divisa de la VENTA. Por defecto la contable de la org (Regla 21). */
  currency?: string;
  /** ISO date. Si falta, se deriva de los términos del cliente. */
  dueDate?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  /** Cobertura sobre la tasa spot, igual que en el editor de cotizaciones. */
  bufferPct?: number | null;
  /** Los precios capturados ya incluyen impuesto. */
  ivaIncluido?: boolean;
}

/** Máximo de conceptos por factura. Mismo tope que una cotización. */
export const MAX_INVOICE_ITEMS = 200;

/**
 * Traduce el shape HTTP del editor / API al del dominio. El saneo fino
 * (finitos, no-negativos, descripción acotada) lo hace `sanitizeItem` dentro
 * del motor; aquí solo se normaliza y se descartan las líneas vacías.
 *
 * Vive aquí y no en cada endpoint porque son tres los que lo necesitan
 * (crear, editar y la API pública) y cada copia es una oportunidad de que una
 * se olvide del `?? null` de `tax_rate`.
 */
export function parseInvoiceItems(raw: unknown): DraftLineInput[] {
  const arr = Array.isArray(raw) ? raw : [];
  const numOrNull = (v: unknown) =>
    v === null || v === undefined || v === '' ? null : Number(v);
  return arr.map((i: any) => ({
    descripcion: String(i?.descripcion ?? '').trim().slice(0, 500),
    cantidad: Number(i?.cantidad) || 0,
    precioUnitario: Number(i?.precio_unitario ?? i?.precioUnitario) || 0,
    productoId: i?.producto_id ? String(i.producto_id) : null,
    precioNegociado: numOrNull(i?.precio_negociado),
    costoUnitario: numOrNull(i?.costo_unitario),
    // `?? null` y no `|| null`: una línea exenta manda 0, y con `||` ese 0
    // caería al default de la org gravando lo que no debe gravarse.
    taxRate: numOrNull(i?.tax_rate),
  })).filter((i) => i.descripcion && i.cantidad > 0);
}

export interface DraftResult {
  ok: boolean;
  error?: string;
  documentId?: string;
  publicToken?: string;
}

/**
 * Convierte las líneas capturadas en el contrato fiscal, con sus totales.
 *
 * La aritmética la hace `calculateInvoiceTotals` del motor compartido, el MISMO
 * que corre en el navegador mientras el usuario captura: si el total que ve en
 * el resumen y el que se guarda salieran de dos implementaciones distintas,
 * sería cuestión de tiempo que difirieran por un centavo y nadie supiera cuál
 * es el bueno.
 */
function buildLines(
  items: DraftLineInput[],
  defaultTaxRate: number,
  ivaIncluido: boolean,
): { lines: FiscalLineItem[]; subtotal: number; taxes: number; total: number; byRate: TaxBreakdown[] } {
  const totals = calculateInvoiceTotals(
    items.map((item) => ({
      producto_id: item.productoId ?? null,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precioUnitario,
      precio_negociado: item.precioNegociado ?? null,
      costo_unitario: item.costoUnitario ?? null,
      // `?? defaultTaxRate` y no `|| defaultTaxRate`: una línea exenta manda 0,
      // y con `||` el 0 se caería al default gravando lo que no debe.
      tax_rate: item.taxRate ?? defaultTaxRate,
    })),
    { ivaIncluido },
  );

  const lines: FiscalLineItem[] = totals.lineas.map((l) => ({
    description: String(l.descripcion || 'Concepto').slice(0, 500),
    quantity: l.cantidad,
    // Con impuesto incluido, el documento fiscal declara el precio SIN impuesto:
    // es lo que el rail espera como valor unitario, y `taxAmount` lo acompaña.
    unitPrice: money(l.cantidad ? l.base / l.cantidad : l.base),
    taxRate: l.tax_rate,
    subtotal: money(l.base),
    taxAmount: money(l.impuesto),
    total: money(l.total),
  }));

  return {
    lines,
    subtotal: money(totals.subtotal),
    taxes: money(totals.impuestos),
    total: money(totals.total),
    byRate: totals.porTasa,
  };
}

function partiesFrom(head: any, country: string): { issuer: FiscalParty; recipient: FiscalParty } {
  const fiscalMetadata = metadata(head.fiscal_metadata);
  return {
    issuer: {
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
    },
    recipient: {
      legalName: String(head.cliente_empresa || head.cliente_contacto || 'Cliente'),
      taxId: head.cliente_rfc ? String(head.cliente_rfc) : undefined,
      taxSystem: head.cliente_regimen ? String(head.cliente_regimen) : undefined,
      email: head.cliente_email ? String(head.cliente_email) : undefined,
      contactName: head.cliente_contacto ? String(head.cliente_contacto) : undefined,
      address: {
        countryCode: country,
        postalCode: head.cliente_cp ? String(head.cliente_cp) : undefined,
      },
    },
  };
}

/**
 * Resuelve el tipo de cambio de la divisa de venta a la contable.
 *
 * Regla 22: la tasa viene de un tercero o la operación falla cerrada. Nunca
 * 1.0 de relleno, nunca una tabla de constantes. Lo comparten crear y editar
 * borrador para que las dos rutas fallen igual — si solo una validara, editar
 * un borrador sería la puerta de atrás para guardar una tasa inventada.
 */
async function resolveFxRate(
  currency: string,
  ledgerCurrency: string,
  total: number,
  bufferPct: number | null | undefined,
  country: string,
): Promise<{ rate: number } | { error: string }> {
  let rate = 1;
  if (currency !== ledgerCurrency) {
    try {
      const fx = await FXService.getExchangeRate({
        baseCurrency: currency,
        fiscalCurrency: ledgerCurrency,
        amount: total,
        bufferPct: Number(bufferPct) || 0,
      });
      rate = fx.appliedRate;
    } catch (error: unknown) {
      if (error instanceof FXUnavailableError) return { error: error.message };
      throw error;
    }
  }
  if (!(rate > 0)) {
    return { error: `No hay un tipo de cambio válido de ${currency} a ${ledgerCurrency}.` };
  }

  // El TipoCambio del CFDI es siempre "moneda del comprobante → MXN". Si ni el
  // comprobante ni los libros están en pesos, la tasa que pide el SAT no
  // existe: se dice aquí, con un mensaje accionable, en vez de mandar el
  // timbrado a fallar contra el PAC con un error críptico.
  if (country === 'MX' && currency !== 'MXN' && ledgerCurrency !== 'MXN') {
    return {
      error: `Un CFDI en ${currency} necesita su tipo de cambio a pesos mexicanos, y tu contabilidad está en ${ledgerCurrency}. Cambia la moneda contable a MXN en Ajustes para poder timbrar.`,
    };
  }
  return { rate };
}

/**
 * Crea una factura en borrador, sin cotización de por medio y sin tocar al
 * proveedor fiscal. Un borrador NO consume el medidor `timbrado`: no se timbró
 * nada todavía, y cobrarle a la org por un documento que quizá borre sería
 * cobrar por una intención.
 */
export async function createInvoiceDraft(orgId: string, input: CreateDraftInput): Promise<DraftResult> {
  const items = (input.items || []).filter((i) => i && String(i.descripcion || '').trim());
  if (!items.length) return { ok: false, error: 'La factura necesita al menos un concepto.' };
  if (!input.clienteId) return { ok: false, error: 'La factura necesita un cliente.' };

  const [headRows] = await withOrgTx(orgId, sql`
    select o.nombre as org_nombre, o.razon_social as org_razon_social, o.rfc as org_tax_id,
           o.regimen_fiscal as org_tax_system, o.country_code, o.iva_pct,
           o.cp_fiscal as org_cp, o.uso_cfdi as org_uso, o.email_contacto as org_email,
           o.direccion as org_direccion, o.moneda as org_moneda,
           o.fiscal_metadata, o.serie_folio,
           o.facturapi_live_key, o.facturapi_live_key_enc, o.sandbox_of,
           cl.id as cliente_id, cl.empresa as cliente_empresa, cl.rfc as cliente_rfc,
           cl.email as cliente_email, cl.contacto as cliente_contacto,
           cl.regimen_fiscal as cliente_regimen, cl.uso_cfdi as cliente_uso,
           cl.cp_fiscal as cliente_cp, cl.terminos_default as cliente_terminos
      from orgs o
      join clientes cl on cl.id = ${input.clienteId} and cl.org_id = o.id
     where o.id = ${orgId}
     limit 1`);
  const head = headRows[0];
  if (!head) return { ok: false, error: 'Cliente no encontrado.' };

  const country = String(head.country_code || 'MX').toUpperCase();
  const profile = getCountryProfile(country);
  const taxRate = head.iva_pct !== null && head.iva_pct !== undefined ? Number(head.iva_pct) / 100 : 0;
  let built;
  try {
    built = buildLines(items, taxRate, input.ivaIncluido === true);
  } catch (error: unknown) {
    // RangeError del motor = tasa fuera de [0,1]. Se traduce a un error de
    // captura en vez de dejar que reviente como 500 sin explicación.
    if (error instanceof RangeError) return { ok: false, error: 'Alguna línea tiene una tasa de impuesto inválida.' };
    throw error;
  }
  const { lines, subtotal, taxes, total } = built;

  const ledgerCurrency = normalizeCurrency((head.org_moneda as string) || profile.currency);
  const currency = normalizeCurrency(input.currency || ledgerCurrency, ledgerCurrency);

  const fx = await resolveFxRate(currency, ledgerCurrency, total, input.bufferPct, country);
  if ('error' in fx) return { ok: false, error: fx.error };
  const fxRate = fx.rate;

  const { issuer, recipient } = partiesFrom(head, country);
  const dueDate = input.dueDate
    || isoDay(dueDateFor(new Date(), (head.cliente_terminos as string) || null));
  const publicToken = newInvoiceToken();

  const [rows] = await withOrgTx(orgId, sql`
    insert into documentos_fiscales (
      org_id, cotizacion_id, cliente_id, country_code, document_type, status, provider,
      currency, ledger_currency, fx_rate, ledger_total, subtotal, tax_total, total,
      lifecycle, due_date, amount_paid, amount_remaining, public_token, notes, created_by,
      issuer_snapshot, recipient_snapshot, line_items_snapshot,
      schema_version, provider_data, updated_at
    ) values (
      ${orgId}, null, ${String(head.cliente_id)}, ${country}, ${documentTypeFor(country)}, 'pending',
      ${country === 'MX' ? 'facturapi' : 'cord'},
      ${currency}, ${ledgerCurrency}, ${fxRate}, ${money(total * fxRate)},
      ${subtotal}, ${taxes}, ${total},
      'draft', ${dueDate}::date, 0, ${total}, ${publicToken},
      ${input.notes || null}, ${input.createdBy || null},
      ${JSON.stringify(issuer)}, ${JSON.stringify(recipient)}, ${JSON.stringify(lines)},
      'cord.invoice.v1', '{}'::jsonb, now()
    )
    returning id, public_token`);
  const row = rows[0];
  if (!row) return { ok: false, error: 'No se pudo crear el borrador.' };
  await logInvoiceEvent(orgId, String(row.id), 'created', 'Borrador creado');
  return { ok: true, documentId: String(row.id), publicToken: String(row.public_token) };
}

/**
 * Reescribe un borrador. El equivalente de `update_draft` de cotizaciones.
 *
 * Solo opera sobre `lifecycle='draft'` y `invoice_number is null`. Una factura
 * emitida es inmutable por diseño: ya tiene folio consecutivo y, en México, un
 * comprobante timbrado ante el SAT — editarla en sitio produciría un documento
 * que no coincide con el que la autoridad ya recibió. Para corregir una emitida
 * existen anular y nota de crédito.
 *
 * El `public_token` NO se regenera: puede estar ya en manos del cliente.
 */
export async function updateInvoiceDraft(
  orgId: string,
  documentId: string,
  input: CreateDraftInput,
): Promise<DraftResult> {
  const items = (input.items || []).filter((i) => i && String(i.descripcion || '').trim());
  if (!items.length) return { ok: false, error: 'La factura necesita al menos un concepto.' };
  if (!input.clienteId) return { ok: false, error: 'La factura necesita un cliente.' };

  const [docRows] = await withOrgTx(orgId, sql`
    select id, lifecycle, invoice_number, public_token, amount_paid
      from documentos_fiscales
     where id = ${documentId} and org_id = ${orgId}
     limit 1`);
  const doc = docRows[0];
  if (!doc) return { ok: false, error: 'Factura no encontrada.' };
  if (doc.lifecycle !== 'draft' || doc.invoice_number) {
    return { ok: false, error: 'Esta factura ya fue emitida y no se puede editar. Anúlala o emite una nota de crédito.' };
  }

  const [headRows] = await withOrgTx(orgId, sql`
    select o.nombre as org_nombre, o.razon_social as org_razon_social, o.rfc as org_tax_id,
           o.regimen_fiscal as org_tax_system, o.country_code, o.iva_pct,
           o.cp_fiscal as org_cp, o.uso_cfdi as org_uso, o.email_contacto as org_email,
           o.direccion as org_direccion, o.moneda as org_moneda,
           o.fiscal_metadata, o.serie_folio,
           cl.id as cliente_id, cl.empresa as cliente_empresa, cl.rfc as cliente_rfc,
           cl.email as cliente_email, cl.contacto as cliente_contacto,
           cl.regimen_fiscal as cliente_regimen, cl.uso_cfdi as cliente_uso,
           cl.cp_fiscal as cliente_cp, cl.terminos_default as cliente_terminos
      from orgs o
      join clientes cl on cl.id = ${input.clienteId} and cl.org_id = o.id
     where o.id = ${orgId}
     limit 1`);
  const head = headRows[0];
  if (!head) return { ok: false, error: 'Cliente no encontrado.' };

  const country = String(head.country_code || 'MX').toUpperCase();
  const profile = getCountryProfile(country);
  const taxRate = head.iva_pct !== null && head.iva_pct !== undefined ? Number(head.iva_pct) / 100 : 0;
  let built;
  try {
    built = buildLines(items, taxRate, input.ivaIncluido === true);
  } catch (error: unknown) {
    if (error instanceof RangeError) return { ok: false, error: 'Alguna línea tiene una tasa de impuesto inválida.' };
    throw error;
  }
  const { lines, subtotal, taxes, total } = built;

  const ledgerCurrency = normalizeCurrency((head.org_moneda as string) || profile.currency);
  const currency = normalizeCurrency(input.currency || ledgerCurrency, ledgerCurrency);
  const fx = await resolveFxRate(currency, ledgerCurrency, total, input.bufferPct, country);
  if ('error' in fx) return { ok: false, error: fx.error };

  const { issuer, recipient } = partiesFrom(head, country);
  const dueDate = input.dueDate
    || isoDay(dueDateFor(new Date(), (head.cliente_terminos as string) || null));

  const [rows] = await withOrgTx(orgId, sql`
    update documentos_fiscales set
      cliente_id = ${String(head.cliente_id)},
      country_code = ${country},
      document_type = ${documentTypeFor(country)},
      currency = ${currency},
      ledger_currency = ${ledgerCurrency},
      fx_rate = ${fx.rate},
      ledger_total = ${money(total * fx.rate)},
      subtotal = ${subtotal},
      tax_total = ${taxes},
      total = ${total},
      amount_remaining = ${total} - coalesce(amount_paid, 0),
      due_date = ${dueDate}::date,
      notes = ${input.notes || null},
      issuer_snapshot = ${JSON.stringify(issuer)},
      recipient_snapshot = ${JSON.stringify(recipient)},
      line_items_snapshot = ${JSON.stringify(lines)},
      updated_at = now()
    where id = ${documentId} and org_id = ${orgId}
      and lifecycle = 'draft' and invoice_number is null
    returning id, public_token`);
  const row = rows[0];
  if (!row) return { ok: false, error: 'No se pudo actualizar el borrador.' };
  return { ok: true, documentId: String(row.id), publicToken: String(row.public_token) };
}

/**
 * Emite un borrador: le asigna folio, lo timbra ante el rail del país y lo
 * vuelve inmutable. Es el punto donde el documento empieza a existir para el
 * cliente y donde SÍ se consume el medidor (lo reserva el llamador).
 *
 * El folio se asigna aquí, no al crear el borrador: un borrador que se descarta
 * no debe dejar un hueco en la numeración fiscal.
 */
export async function finalizeInvoice(orgId: string, documentId: string): Promise<EmitResult> {
  const [headRows] = await withOrgTx(orgId, sql`
    select o.nombre as org_nombre, o.razon_social as org_razon_social, o.rfc as org_tax_id,
           o.regimen_fiscal as org_tax_system, o.country_code, o.iva_pct,
           o.cp_fiscal as org_cp, o.uso_cfdi as org_uso, o.email_contacto as org_email,
           o.direccion as org_direccion, o.moneda as org_moneda,
           o.fiscal_metadata, o.serie_folio,
           o.facturapi_live_key, o.facturapi_live_key_enc, o.sandbox_of,
           d.id, d.lifecycle, d.status, d.country_code as doc_country, d.document_type,
           d.currency, d.ledger_currency, d.fx_rate, d.ledger_total,
           d.subtotal, d.tax_total, d.total, d.invoice_number, d.public_token,
           d.issuer_snapshot, d.recipient_snapshot, d.line_items_snapshot,
           d.fiscal_id, d.provider_data,
           cl.uso_cfdi as cliente_uso
      from documentos_fiscales d
      join orgs o on o.id = d.org_id
      left join clientes cl on cl.id = d.cliente_id
     where d.id = ${documentId} and d.org_id = ${orgId}
     limit 1`);
  const head = headRows[0];
  if (!head) return { emitted: false, status: 'error', error: 'Factura no encontrada.' };

  // Ya emitida: idempotente, no se vuelve a timbrar ni se cobra medidor otra vez.
  if (head.status === 'issued') {
    return {
      emitted: true,
      documentId,
      fiscalId: head.fiscal_id ? String(head.fiscal_id) : undefined,
      invoiceNumber: String(head.invoice_number || ''),
      publicToken: String(head.public_token || ''),
      reused: true,
      billable: isBillableCfdi(String(head.doc_country), head.provider_data),
      status: 'issued',
    };
  }
  if (head.lifecycle === 'void') {
    return { emitted: false, status: 'error', error: 'Esta factura está anulada.' };
  }

  const country = String(head.doc_country || 'MX').toUpperCase();
  const profile = getCountryProfile(country);
  const docType = String(head.document_type || documentTypeFor(country));
  const fiscalMetadata = metadata(head.fiscal_metadata);
  const prefix = cleanPrefix(
    fiscalMetadata.invoice_prefix || (country === 'MX' ? head.serie_folio : ''),
    profile.invoicePrefix,
  );
  const idempotencyKey = `invoice:${documentId}:v1`;
  const issuedAt = new Date().toISOString();

  // Mismo advisory lock que el carril de cotización: serializa dos clicks de
  // "Emitir" sobre el mismo borrador. Sin él, dos pestañas queman dos folios.
  const [, claimedRows] = await withOrgTx(orgId,
    sql`select pg_advisory_xact_lock(hashtextextended(${`${orgId}:${idempotencyKey}`}, 0))`,
    sql`with next_number as (
          insert into invoice_sequences (org_id, country_code, document_type, prefix, next_value)
          select ${orgId}, ${country}, ${docType}, ${prefix}, 2
           where exists (
             select 1 from documentos_fiscales
              where id = ${documentId} and org_id = ${orgId}
                and lifecycle = 'draft' and invoice_number is null
           )
          on conflict (org_id, country_code, document_type) do update
             set next_value = invoice_sequences.next_value + 1,
                 prefix = excluded.prefix,
                 updated_at = now()
          returning next_value - 1 as sequence_value
        )
        update documentos_fiscales d
           set invoice_number = ${prefix} || '-' || lpad(next_number.sequence_value::text, 6, '0'),
               idempotency_key = ${idempotencyKey},
               updated_at = now()
          from next_number
         where d.id = ${documentId} and d.org_id = ${orgId} and d.invoice_number is null
        returning d.invoice_number`,
  );

  // Si otra transacción ya asignó el folio, se relee en vez de asignar otro.
  let invoiceNumber = String(claimedRows[0]?.invoice_number || head.invoice_number || '');
  if (!invoiceNumber) {
    const [again] = await withOrgTx(orgId, sql`
      select invoice_number from documentos_fiscales
       where id = ${documentId} and org_id = ${orgId} limit 1`);
    invoiceNumber = String(again[0]?.invoice_number || '');
  }
  if (!invoiceNumber) {
    return { emitted: false, status: 'error', error: 'No se pudo reservar el folio fiscal.' };
  }

  const request: FiscalDocumentRequest = {
    documentId,
    invoiceNumber,
    idempotencyKey,
    orgId,
    quoteId: documentId,
    countryCode: country,
    issuer: head.issuer_snapshot as FiscalParty,
    recipient: head.recipient_snapshot as FiscalParty,
    lines: (head.line_items_snapshot as FiscalLineItem[]) || [],
    totals: {
      subtotal: Number(head.subtotal) || 0,
      taxes: Number(head.tax_total) || 0,
      total: Number(head.total) || 0,
      currency: String(head.currency || 'MXN'),
      ...(Number(head.fx_rate) !== 1
        ? { exchangeRate: Number(head.fx_rate), ledgerCurrency: String(head.ledger_currency || '') }
        : {}),
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
      documentId,
      fiscalId: country === 'MX' ? `SIM-${documentId.slice(0, 8).toUpperCase()}` : undefined,
      pdfUrl: `/api/fiscal/documents/${documentId}/pdf`,
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
        documentId,
        error: error instanceof Error ? error.message : 'fallo del proveedor fiscal',
      };
    }
  }

  const providerData = {
    ...(response.rawProviderData ?? {}),
    ...(!response.success ? { error: response.error || 'fallo del proveedor fiscal' } : {}),
  };
  await withOrgTx(orgId, sql`
    update documentos_fiscales
       set status = ${response.success ? 'issued' : 'error'},
           lifecycle = ${response.success ? 'open' : 'draft'},
           provider = ${response.provider},
           provider_document_id = ${response.documentId || null},
           fiscal_id = ${response.fiscalId ?? null},
           provider_data = ${JSON.stringify(providerData)},
           pdf_url = ${response.pdfUrl ?? null},
           xml_url = ${response.xmlUrl ?? null},
           amount_remaining = coalesce(total, 0) - coalesce(amount_paid, 0),
           issued_at = ${response.success ? new Date(issuedAt) : null},
           updated_at = now()
     where id = ${documentId} and org_id = ${orgId}`);

  await logInvoiceEvent(
    orgId, documentId,
    response.success ? 'issued' : 'created',
    response.success ? `Factura ${invoiceNumber} emitida` : `Error al emitir: ${response.error || 'desconocido'}`,
  );

  return {
    emitted: response.success,
    documentId,
    fiscalId: response.fiscalId,
    invoiceNumber,
    publicToken: String(head.public_token || ''),
    billable: response.success && isBillableCfdi(country, providerData),
    status: response.success ? 'issued' : 'error',
    error: response.error,
  };
}

export interface VoidResult {
  ok: boolean;
  error?: string;
  /** true cuando el saldo ya tiene pagos: el camino correcto es nota de crédito. */
  requiresCreditNote?: boolean;
}

/**
 * Anula una factura ante el rail regulatorio.
 *
 * Una factura con pagos aplicados NO se anula: en México un CFDI con
 * complemento de pago no se cancela, se corrige con un CFDI de egreso. Y aunque
 * el rail lo permitiera, borrar el documento que respalda dinero ya cobrado
 * deja el cobro sin comprobante. Esa ruta devuelve `requiresCreditNote`.
 */
export async function voidInvoice(
  orgId: string,
  documentId: string,
  reason?: string,
): Promise<VoidResult> {
  const [rows] = await withOrgTx(orgId, sql`
    select d.id, d.lifecycle, d.status, d.amount_paid, d.country_code,
           d.provider_document_id, d.provider_data,
           o.facturapi_live_key, o.facturapi_live_key_enc, o.sandbox_of
      from documentos_fiscales d
      join orgs o on o.id = d.org_id
     where d.id = ${documentId} and d.org_id = ${orgId}
     limit 1`);
  const doc = rows[0];
  if (!doc) return { ok: false, error: 'Factura no encontrada.' };
  if (doc.lifecycle === 'void') return { ok: true };

  if (Number(doc.amount_paid) > 0) {
    return {
      ok: false,
      requiresCreditNote: true,
      error: 'Esta factura ya tiene pagos aplicados. Emite una nota de crédito en lugar de anularla.',
    };
  }

  // Un borrador nunca llegó al proveedor: se anula localmente y ya.
  if (doc.lifecycle === 'draft' || doc.status !== 'issued') {
    await withOrgTx(orgId, sql`
      update documentos_fiscales
         set lifecycle = 'void', status = 'cancelled',
             voided_at = now(), void_reason = ${reason || null}, updated_at = now()
       where id = ${documentId} and org_id = ${orgId}`);
    return { ok: true };
  }

  const country = String(doc.country_code || 'MX').toUpperCase();
  const providerKey = decryptSecret(doc.facturapi_live_key_enc as string)
    || (doc.facturapi_live_key as string)
    || undefined;

  const cancel = doc.sandbox_of
    ? { success: true, rawProviderData: { simulado: true } }
    : await FiscalFactory.getProvider(country).cancelDocument(
        String(doc.provider_document_id || documentId),
        { reason, providerApiKey: providerKey },
      );

  // Falla cerrada: si el SAT no confirmó la cancelación, la factura sigue viva
  // ahí afuera. Pintarla como anulada en Cord sería mentirle al vendedor.
  if (!cancel.success) {
    return { ok: false, error: cancel.error || 'El proveedor fiscal rechazó la cancelación.' };
  }

  await withOrgTx(orgId, sql`
    update documentos_fiscales
       set lifecycle = 'void', status = 'cancelled',
           voided_at = now(), void_reason = ${reason || null},
           provider_data = coalesce(provider_data, '{}'::jsonb) || ${JSON.stringify({ cancelacion: cancel.rawProviderData ?? {} })}::jsonb,
           updated_at = now()
     where id = ${documentId} and org_id = ${orgId}`);
  await logInvoiceEvent(orgId, documentId, 'void', reason ? `Anulada: ${reason}` : 'Anulada');
  return { ok: true };
}

/**
 * Emite una nota de crédito contra una factura ya emitida (CFDI de egreso en
 * México). Es un documento nuevo que apunta al original con `credit_note_of`;
 * el original conserva su historia y su folio.
 */
export async function createCreditNote(
  orgId: string,
  documentId: string,
  opts: { monto?: number; motivo?: string; createdBy?: string | null } = {},
): Promise<DraftResult> {
  const [rows] = await withOrgTx(orgId, sql`
    select id, cotizacion_id, cliente_id, country_code, currency, ledger_currency,
           fx_rate, total, tax_total, subtotal, lifecycle, status, due_date,
           issuer_snapshot, recipient_snapshot
      from documentos_fiscales
     where id = ${documentId} and org_id = ${orgId}
     limit 1`);
  const doc = rows[0];
  if (!doc) return { ok: false, error: 'Factura no encontrada.' };
  if (doc.status !== 'issued') {
    return { ok: false, error: 'Solo una factura emitida admite nota de crédito.' };
  }

  const total = money(Number(doc.total) || 0);
  const monto = opts.monto !== undefined ? money(Number(opts.monto)) : total;
  if (!(monto > 0) || monto > total) {
    return { ok: false, error: `El monto de la nota de crédito debe estar entre 0 y ${total}.` };
  }

  // El impuesto se prorratea respecto del original: una nota de crédito parcial
  // devuelve la misma proporción de base e impuesto que llevaba la factura.
  const ratio = total > 0 ? monto / total : 0;
  const subtotal = money((Number(doc.subtotal) || 0) * ratio);
  const taxes = money(monto - subtotal);
  const country = String(doc.country_code || 'MX').toUpperCase();
  const taxRate = subtotal > 0 ? taxes / subtotal : 0;
  const lines: FiscalLineItem[] = [{
    description: opts.motivo?.trim() || 'Nota de crédito',
    quantity: 1,
    unitPrice: subtotal,
    taxRate,
    subtotal,
    taxAmount: taxes,
    total: monto,
  }];

  const publicToken = newInvoiceToken();
  const [inserted] = await withOrgTx(orgId, sql`
    insert into documentos_fiscales (
      org_id, cotizacion_id, cliente_id, country_code, document_type, status, provider,
      currency, ledger_currency, fx_rate, ledger_total, subtotal, tax_total, total,
      lifecycle, due_date, amount_paid, amount_remaining, public_token,
      credit_note_of, notes, created_by,
      issuer_snapshot, recipient_snapshot, line_items_snapshot,
      schema_version, provider_data, updated_at
    ) values (
      ${orgId}, ${doc.cotizacion_id || null}, ${doc.cliente_id || null}, ${country},
      ${country === 'MX' ? 'cfdi_egreso' : 'credit_note'}, 'pending',
      ${country === 'MX' ? 'facturapi' : 'cord'},
      ${doc.currency}, ${doc.ledger_currency}, ${doc.fx_rate},
      ${money(monto * (Number(doc.fx_rate) || 1))}, ${subtotal}, ${taxes}, ${monto},
      'draft', ${doc.due_date}, 0, ${monto}, ${publicToken},
      ${documentId}, ${opts.motivo || null}, ${opts.createdBy || null},
      ${JSON.stringify(doc.issuer_snapshot)}, ${JSON.stringify(doc.recipient_snapshot)},
      ${JSON.stringify(lines)},
      'cord.invoice.v1', '{}'::jsonb, now()
    )
    returning id, public_token`);
  const row = inserted[0];
  if (!row) return { ok: false, error: 'No se pudo crear la nota de crédito.' };
  return { ok: true, documentId: String(row.id), publicToken: String(row.public_token) };
}
