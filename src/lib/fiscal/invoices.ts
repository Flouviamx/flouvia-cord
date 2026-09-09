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

import { documentTypeForOrg, documentPrefix, isFiscalDocument } from './document-kind';
import { getEffectivePlan } from '../org-entitlements';
import { planIncludes } from '../entitlements';
import { meterInvoiceEmission } from './issuance-usage';
import { sql, withOrgTx } from '../db';
import { decryptSecret } from '../crypto-secret';
import { getCountryProfile } from '../countries';
import { logInvoiceEvent } from './timeline';
import { normalizeCurrency } from '../currency';
import { dueDateFor, isoDay } from '../cobros';
import { FXService, FXUnavailableError } from '../fx/FXService';
import { calculateDocumentTotals, type TaxBreakdown } from '../../../packages/elements/src/engine';
import { FiscalFactory } from './FiscalFactory';
import { partiesFrom } from './parties';
import { creditNoteBreakdown } from './credit-note';
import { invoiceBalanceLock, invoiceBalanceQuery, reconcileInvoice } from './reconciliation';
import { taxCatalogFor, TaxCatalogUnavailableError } from '../impuestos-db';
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
  FiscalCancelResponse,
  FiscalLineItem,
  FiscalParty,
  FiscalRetencion,
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
  documentMode?: unknown;
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
  retenciones: { nombre: string; tasa: number; tipo?: string }[] = [],
): {
  lines: FiscalLineItem[]; subtotal: number; taxes: number; total: number; byRate: TaxBreakdown[];
  retenciones: FiscalRetencion[]; retencionTotal: number;
} {
  // calculateDocumentTotals, no calculateInvoiceTotals: el editor
  // (facturas/nueva.astro) resta las retenciones del catálogo al mostrar el
  // total, y si aquí se guardara sin restarlas la pantalla diría un total y
  // el documento persistido sería otro.
  const totals = calculateDocumentTotals(
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
    { ivaIncluido, retenciones },
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
    retenciones: totals.retenciones.map((r) => ({ ...r, base: money(r.base), monto: money(r.monto) })),
    retencionTotal: money(totals.retencionTotal),
    byRate: totals.porTasa,
  };
}

// partiesFrom() vive en ./parties — compartida con emit.ts para que el país y
// la dirección del RECEPTOR (no del emisor) se resuelvan una sola vez.

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
  fiscal = true,
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
  if (fiscal && country === 'MX' && currency !== 'MXN' && ledgerCurrency !== 'MXN') {
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
           cl.cp_fiscal as cliente_cp, cl.terminos_default as cliente_terminos,
           cl.country_code as cliente_country_code, cl.direccion_line1 as cliente_direccion_line1,
           cl.direccion_line2 as cliente_direccion_line2, cl.ciudad as cliente_ciudad, cl.region as cliente_region
      from orgs o
      join clientes cl on cl.id = ${input.clienteId} and cl.org_id = o.id
     where o.id = ${orgId}
     limit 1`);
  const head = headRows[0];
  if (!head) return { ok: false, error: 'Cliente no encontrado.' };

  const country = String(head.country_code || 'MX').toUpperCase();
  const profile = getCountryProfile(country);
  let docType: string;
  try { docType = await documentTypeForOrg(orgId, country, input.documentMode); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'No se pudo verificar el tipo de documento.' }; }
  // Mismo catálogo y misma validación de servidor que las cotizaciones (regla
  // 23): sin esto, un POST a /api/facturas podía declarar cualquier tax_rate y
  // el único freno era el rango [0,1] del motor. Las retenciones tampoco se
  // eligen por línea — son la política de retención del negocio, resuelta aquí.
  // `catalogo.defaultRate` ya incorpora `orgs.iva_pct` como respaldo cuando el
  // catálogo no tiene un consumo marcado `es_default` (impuestos-db.ts).
  let catalogo;
  try {
    catalogo = await taxCatalogFor(orgId);
  } catch (error) {
    if (error instanceof TaxCatalogUnavailableError) return { ok: false, error: error.message };
    throw error;
  }
  const itemsConTasaValidada = items.map((it) => ({
    ...it,
    taxRate: catalogo.resolve(it.taxRate, catalogo.defaultRate),
  }));
  let built;
  try {
    built = buildLines(itemsConTasaValidada, catalogo.defaultRate, input.ivaIncluido === true, catalogo.retenciones);
  } catch (error: unknown) {
    // RangeError del motor = tasa fuera de [0,1]. Se traduce a un error de
    // captura en vez de dejar que reviente como 500 sin explicación.
    if (error instanceof RangeError) return { ok: false, error: 'Alguna línea tiene una tasa de impuesto inválida.' };
    throw error;
  }
  const { lines, subtotal, taxes, total, retenciones, retencionTotal } = built;

  const ledgerCurrency = normalizeCurrency((head.org_moneda as string) || profile.currency);
  const currency = normalizeCurrency(input.currency || ledgerCurrency, ledgerCurrency);

  const fx = await resolveFxRate(currency, ledgerCurrency, total, input.bufferPct, country, isFiscalDocument(docType, country));
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
      retencion_total, retenciones_snapshot,
      lifecycle, due_date, amount_paid, amount_remaining, public_token, notes, created_by,
      issuer_snapshot, recipient_snapshot, line_items_snapshot,
      schema_version, provider_data, updated_at
    ) values (
      ${orgId}, null, ${String(head.cliente_id)}, ${country}, ${docType}, 'pending',
      ${docType === 'cfdi_40' ? 'facturapi' : 'cord'},
      ${currency}, ${ledgerCurrency}, ${fxRate}, ${money(total * fxRate)},
      ${subtotal}, ${taxes}, ${total}, ${retencionTotal}, ${JSON.stringify(retenciones)}::jsonb,
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
    select id, lifecycle, invoice_number, public_token, amount_paid, credit_note_of, document_type, country_code, provider_data
      from documentos_fiscales
     where id = ${documentId} and org_id = ${orgId}
     limit 1`);
  const doc = docRows[0];
  if (!doc) return { ok: false, error: 'Factura no encontrada.' };
  if (doc.credit_note_of) return { ok: false, error: 'La nota de crédito conserva el desglose de la factura original; descártala y crea otra para cambiar el importe.' };
  if (doc.lifecycle !== 'draft' || doc.invoice_number || doc.provider_data?.cord_issuance) {
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
           cl.cp_fiscal as cliente_cp, cl.terminos_default as cliente_terminos,
           cl.country_code as cliente_country_code, cl.direccion_line1 as cliente_direccion_line1,
           cl.direccion_line2 as cliente_direccion_line2, cl.ciudad as cliente_ciudad, cl.region as cliente_region
      from orgs o
      join clientes cl on cl.id = ${input.clienteId} and cl.org_id = o.id
     where o.id = ${orgId}
     limit 1`);
  const head = headRows[0];
  if (!head) return { ok: false, error: 'Cliente no encontrado.' };

  const country = String(head.country_code || 'MX').toUpperCase();
  const profile = getCountryProfile(country);
  let docType = String(doc.document_type);
  if (input.documentMode !== undefined) {
    try { docType = await documentTypeForOrg(orgId, country, input.documentMode); }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Tipo de documento no disponible.' }; }
  } else if (country !== doc.country_code) return { ok: false, error: 'El país del emisor cambió. Crea un borrador nuevo.' };
  let catalogo;
  try {
    catalogo = await taxCatalogFor(orgId);
  } catch (error) {
    if (error instanceof TaxCatalogUnavailableError) return { ok: false, error: error.message };
    throw error;
  }
  const itemsConTasaValidada = items.map((it) => ({
    ...it,
    taxRate: catalogo.resolve(it.taxRate, catalogo.defaultRate),
  }));
  let built;
  try {
    built = buildLines(itemsConTasaValidada, catalogo.defaultRate, input.ivaIncluido === true, catalogo.retenciones);
  } catch (error: unknown) {
    if (error instanceof RangeError) return { ok: false, error: 'Alguna línea tiene una tasa de impuesto inválida.' };
    throw error;
  }
  const { lines, subtotal, taxes, total, retenciones, retencionTotal } = built;

  const ledgerCurrency = normalizeCurrency((head.org_moneda as string) || profile.currency);
  const currency = normalizeCurrency(input.currency || ledgerCurrency, ledgerCurrency);
  const fx = await resolveFxRate(currency, ledgerCurrency, total, input.bufferPct, country, isFiscalDocument(docType, country));
  if ('error' in fx) return { ok: false, error: fx.error };

  const { issuer, recipient } = partiesFrom(head, country);
  const dueDate = input.dueDate
    || isoDay(dueDateFor(new Date(), (head.cliente_terminos as string) || null));

  const [rows] = await withOrgTx(orgId, sql`
    update documentos_fiscales set
      cliente_id = ${String(head.cliente_id)},
      country_code = ${country},
      document_type = ${docType},
      currency = ${currency},
      ledger_currency = ${ledgerCurrency},
      fx_rate = ${fx.rate},
      ledger_total = ${money(total * fx.rate)},
      subtotal = ${subtotal},
      tax_total = ${taxes},
      total = ${total},
      retencion_total = ${retencionTotal},
      retenciones_snapshot = ${JSON.stringify(retenciones)}::jsonb,
      amount_remaining = ${total} - coalesce(amount_paid, 0),
      due_date = ${dueDate}::date,
      notes = ${input.notes || null},
      issuer_snapshot = ${JSON.stringify(issuer)},
      recipient_snapshot = ${JSON.stringify(recipient)},
      line_items_snapshot = ${JSON.stringify(lines)},
      updated_at = now()
    where id = ${documentId} and org_id = ${orgId}
      and lifecycle = 'draft' and invoice_number is null and credit_note_of is null
      and provider_data->'cord_issuance' is null
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
  return meterInvoiceEmission(orgId, documentId, () => finalizeReservedInvoice(orgId, documentId));
}

async function finalizeReservedInvoice(orgId: string, documentId: string): Promise<EmitResult> {
  const [headRows] = await withOrgTx(orgId, sql`
    select o.nombre as org_nombre, o.razon_social as org_razon_social, o.rfc as org_tax_id,
           o.regimen_fiscal as org_tax_system, o.country_code, o.iva_pct,
           o.cp_fiscal as org_cp, o.uso_cfdi as org_uso, o.email_contacto as org_email,
           o.direccion as org_direccion, o.moneda as org_moneda,
           o.fiscal_metadata, o.serie_folio,
           o.facturapi_live_key, o.facturapi_live_key_enc, o.sandbox_of,
           d.id, d.cotizacion_id, d.lifecycle, d.status, d.country_code as doc_country, d.document_type,
           d.currency, d.ledger_currency, d.fx_rate, d.ledger_total,
           d.subtotal, d.tax_total, d.total, d.retencion_total, d.retenciones_snapshot,
           d.invoice_number, d.public_token, d.idempotency_key,
           d.issuer_snapshot, d.recipient_snapshot, d.line_items_snapshot,
           d.fiscal_id, d.provider, d.provider_data, d.credit_note_of,
           original.fiscal_id as original_fiscal_id, original.status as original_status,
           cl.uso_cfdi as cliente_uso
      from documentos_fiscales d
      join orgs o on o.id = d.org_id
      left join clientes cl on cl.id = d.cliente_id and cl.org_id = d.org_id
      left join documentos_fiscales original on original.id = d.credit_note_of and original.org_id = d.org_id
     where d.id = ${documentId} and d.org_id = ${orgId}
     limit 1`);
  const head = headRows[0];
  if (!head) return { emitted: false, status: 'error', error: 'Factura no encontrada.' };

  // Ya emitida: idempotente, no se vuelve a timbrar ni se cobra medidor otra vez.
  if (head.status === 'issued') {
    if (head.credit_note_of) await reconcileInvoice(orgId, String(head.credit_note_of));
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

  if (head.credit_note_of) {
    const [, allowed] = await withOrgTx(orgId,
      invoiceBalanceLock(orgId, String(head.credit_note_of)),
      sql`select original.id from documentos_fiscales original
        where original.id = ${String(head.credit_note_of)} and original.org_id = ${orgId}
          and original.status = 'issued' and original.lifecycle <> 'void'
          and original.currency = ${String(head.currency)}
          and coalesce((select sum(n.total) from documentos_fiscales n
            where n.credit_note_of = original.id and n.org_id = original.org_id
              and n.lifecycle <> 'void'), 0) <= original.total`);
    if (!allowed.length) return { emitted: false, status: 'error', error: 'Las notas reservadas superan el importe disponible o la factura original ya no está vigente.' };
  }

  const country = String(head.doc_country || 'MX').toUpperCase();
  const profile = getCountryProfile(country);
  const docType = String(head.document_type || documentTypeFor(country));
  const regulatory = isFiscalDocument(docType, country, String(head.provider));
  if (regulatory && !planIncludes(await getEffectivePlan(orgId), 'cfdi')) {
    return { emitted: false, status: 'error', httpStatus: 402, error: 'La emisión fiscal integrada requiere Starter o un plan superior. El documento conserva su tipo original.' };
  }
  const fiscalMetadata = metadata(head.fiscal_metadata);
  const prefix = documentPrefix(docType, cleanPrefix(
    fiscalMetadata.invoice_prefix || (country === 'MX' ? head.serie_folio : ''),
    profile.invoicePrefix,
  ));
  const idempotencyKey = String(head.idempotency_key || `invoice:${documentId}:v1`);
  const issuedAt = new Date().toISOString();
  // Serie + ejercicio: mismo criterio que emit.ts — la serie es el propio
  // `prefix` (cambiarlo en Ajustes reinicia el contador, en vez de reutilizar
  // la secuencia vieja); `ejercicio=0` preserva la numeración indefinida de
  // las orgs ya existentes, y España reinicia cada año porque el ejercicio es
  // parte del PK de la secuencia.
  const serie = prefix;
  const ejercicio = country === 'ES' ? new Date(issuedAt).getFullYear() : 0;
  const folioPrefix = ejercicio > 0 ? `${prefix}${ejercicio}` : prefix;

  // Mismo advisory lock que el carril de cotización: serializa dos clicks de
  // "Emitir" sobre el mismo borrador. Sin él, dos pestañas queman dos folios.
  const [, claimedRows] = await withOrgTx(orgId,
    sql`select pg_advisory_xact_lock(hashtextextended(${`${orgId}:${idempotencyKey}`}, 0))`,
    sql`with next_number as (
          insert into invoice_sequences (org_id, country_code, document_type, serie, ejercicio, prefix, next_value)
          select ${orgId}, ${country}, ${docType}, ${serie}, ${ejercicio}, ${folioPrefix}, 2
           where exists (
             select 1 from documentos_fiscales
              where id = ${documentId} and org_id = ${orgId}
                and lifecycle = 'draft' and invoice_number is null
           )
          on conflict (org_id, country_code, document_type, serie, ejercicio) do update
             set next_value = invoice_sequences.next_value + 1,
                 prefix = excluded.prefix,
                 updated_at = now()
          returning next_value - 1 as sequence_value
        )
        update documentos_fiscales d
           set invoice_number = ${folioPrefix} || '-' || lpad(next_number.sequence_value::text, 6, '0'),
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
    quoteId: String(head.cotizacion_id || documentId),
    countryCode: country,
    documentType: regulatory && country === 'ES' ? (head.credit_note_of ? 'verifactu_credit_note' : 'verifactu_invoice') : docType,
    relatedFiscalId: head.original_status === 'issued' ? String(head.original_fiscal_id || '') : undefined,
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
      ...(Number(head.retencion_total) > 0
        ? { retenciones: (head.retenciones_snapshot as FiscalRetencion[]) || [], retencionTotal: Number(head.retencion_total) }
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
      fiscalId: regulatory && country === 'MX' ? `SIM-${documentId.slice(0, 8).toUpperCase()}` : undefined,
      pdfUrl: `/api/fiscal/documents/${documentId}/pdf`,
      rawProviderData: {
        simulado: true,
        modo_prueba: true,
        regulatory_status: regulatory && country === 'MX' ? 'not_stamped' : 'commercial_only',
      },
    };
  } else {
    try {
      response = await FiscalFactory.getProvider(country, regulatory && country === 'ES' ? (head.credit_note_of ? 'verifactu_credit_note' : 'verifactu_invoice') : docType).issueDocument(request);
    } catch (error: unknown) {
      response = {
        success: false,
        provider: country === 'MX' ? 'facturapi' : 'cord',
        documentId,
        error: error instanceof Error ? error.message : 'fallo del proveedor fiscal',
        rawProviderData: { delivery_uncertain: true },
      };
    }
  }

  const providerData = {
    ...(response.rawProviderData ?? {}),
    ...(!response.success ? { error: response.error || 'fallo del proveedor fiscal' } : {}),
  };
  await withOrgTx(orgId,
    ...(head.credit_note_of ? [invoiceBalanceLock(orgId, String(head.credit_note_of))] : []),
    sql`
    update documentos_fiscales
       set status = ${response.success ? 'issued' : 'error'},
           lifecycle = ${response.success ? 'open' : 'draft'},
           provider = ${response.provider},
           provider_document_id = ${response.documentId || null},
           fiscal_id = ${response.fiscalId ?? null},
           provider_data = coalesce(provider_data, '{}'::jsonb) || ${JSON.stringify(providerData)}::jsonb,
           pdf_url = ${response.pdfUrl ?? null},
           xml_url = ${response.xmlUrl ?? null},
           amount_remaining = case when credit_note_of is not null then 0 else coalesce(total, 0) - coalesce(amount_paid, 0) end,
           issued_at = ${response.success ? new Date(issuedAt) : null},
           updated_at = now()
     where id = ${documentId} and org_id = ${orgId}`,
    ...(response.success && head.credit_note_of ? [invoiceBalanceQuery(orgId, String(head.credit_note_of))] : []),
  );

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
  cancellationStatus?: FiscalCancelResponse['status'];
  pending?: boolean;
  reused?: boolean;
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
  checkOnly = false,
): Promise<VoidResult> {
  const [rows] = await withOrgTx(orgId, sql`
    select d.id, d.lifecycle, d.status, d.amount_paid, d.country_code, d.credit_note_of,
           exists (select 1 from documentos_fiscales n where n.credit_note_of = d.id and n.org_id = d.org_id and n.lifecycle <> 'void') as has_credit_notes,
           d.provider_document_id, d.provider_data, d.document_type, d.provider,
           o.facturapi_live_key, o.facturapi_live_key_enc, o.sandbox_of
      from documentos_fiscales d
      join orgs o on o.id = d.org_id
     where d.id = ${documentId} and d.org_id = ${orgId}
     limit 1`);
  const doc = rows[0];
  if (!doc) return { ok: false, error: 'Factura no encontrada.' };
  if (doc.lifecycle === 'void') {
    if (doc.credit_note_of) await reconcileInvoice(orgId, String(doc.credit_note_of));
    return { ok: true, reused: true, cancellationStatus: 'accepted' };
  }
  if (doc.has_credit_notes && !checkOnly) return { ok: false, error: 'Primero anula o descarta las notas de crédito vinculadas a esta factura.' };

  if (Number(doc.amount_paid) > 0 && !checkOnly) {
    return {
      ok: false,
      requiresCreditNote: true,
      error: 'Esta factura ya tiene pagos aplicados. Emite una nota de crédito en lugar de anularla.',
    };
  }

  // Un borrador nunca llegó al proveedor: se anula localmente y ya.
  if (doc.status !== 'issued') {
    if (checkOnly || doc.provider_data?.cord_issuance || doc.provider_data?.delivery_uncertain || doc.provider_document_id && !String(doc.provider_document_id).startsWith('err_')) {
      return { ok: false, error: 'Primero confirma el resultado de la emisión fiscal antes de anular este documento.' };
    }
    await withOrgTx(orgId,
      ...(doc.credit_note_of ? [invoiceBalanceLock(orgId, String(doc.credit_note_of))] : []),
      sql`
      update documentos_fiscales
         set lifecycle = 'void', status = 'cancelled',
             voided_at = now(), void_reason = ${reason || null}, updated_at = now()
       where id = ${documentId} and org_id = ${orgId}`,
      ...(doc.credit_note_of ? [invoiceBalanceQuery(orgId, String(doc.credit_note_of))] : []),
    );
    return { ok: true };
  }

  const country = String(doc.country_code || 'MX').toUpperCase();
  const regulatory = isFiscalDocument(String(doc.document_type || documentTypeFor(country)), country, String(doc.provider));
  if (checkOnly && (country !== 'MX' || !regulatory)) return { ok: false, error: 'La consulta de cancelación solo aplica al CFDI de México.' };
  const orgKey = decryptSecret(doc.facturapi_live_key_enc as string)
    || (doc.facturapi_live_key as string) || undefined;
  const scope = doc.provider_data?.credential_scope;
  if (scope === 'organization' && !orgKey) return { ok: false, error: 'Falta la credencial del emisor original.' };
  const providerKey = scope === 'platform' ? undefined : orgKey;
  const simulated = doc.sandbox_of || doc.provider_data?.simulado === true;
  if (!simulated && !doc.provider_document_id) return { ok: false, error: 'Falta el identificador del comprobante emitido.' };
  const cancel: FiscalCancelResponse = simulated
    ? { success: true, status: 'accepted', rawProviderData: { simulado: true } }
    : await FiscalFactory.getProvider(country, regulatory && country === 'ES' ? 'verifactu_invoice' : String(doc.document_type || documentTypeFor(country))).cancelDocument(
        String(doc.provider_document_id), { reason, checkOnly, providerApiKey: providerKey, orgId },
      );
  const confirmed = cancel.success && (cancel.status === 'accepted' || country !== 'MX' && !cancel.status || !regulatory && !cancel.status);
  if (!confirmed) {
    const state = cancel.status || 'unknown';
    await withOrgTx(orgId, sql`
      update documentos_fiscales
         set provider_data = coalesce(provider_data, '{}'::jsonb) || ${JSON.stringify({ cancelacion: { ...cancel.rawProviderData, status: state } })}::jsonb,
             updated_at = now()
       where id = ${documentId} and org_id = ${orgId} and lifecycle <> 'void'`);
    if (cancel.success && ['pending', 'verifying'].includes(state)) {
      return { ok: true, pending: true, cancellationStatus: state };
    }
    return { ok: false, cancellationStatus: state,
      error: cancel.error || (state === 'rejected' ? 'La cancelación fue rechazada; la factura sigue vigente.'
        : state === 'expired' ? 'La solicitud de cancelación expiró; la factura sigue vigente.'
        : 'La cancelación aún no está confirmada; la factura sigue vigente.') };
  }

  await withOrgTx(orgId,
    ...(doc.credit_note_of ? [invoiceBalanceLock(orgId, String(doc.credit_note_of))] : []),
    sql`
    update documentos_fiscales
       set lifecycle = 'void', status = 'cancelled',
           voided_at = now(), void_reason = ${reason || null},
           provider_data = coalesce(provider_data, '{}'::jsonb) || ${JSON.stringify({ cancelacion: { ...cancel.rawProviderData, status: 'accepted' } })}::jsonb,
           updated_at = now()
     where id = ${documentId} and org_id = ${orgId}`,
    ...(doc.credit_note_of ? [invoiceBalanceQuery(orgId, String(doc.credit_note_of))] : []),
  );
  await logInvoiceEvent(orgId, documentId, 'void', reason ? `Anulada: ${reason}` : 'Anulada');
  return { ok: true, cancellationStatus: 'accepted' };
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
    select id, cotizacion_id, cliente_id, country_code, document_type, provider, currency, ledger_currency,
           fx_rate, total, tax_total, subtotal, lifecycle, status, due_date,
           issuer_snapshot, recipient_snapshot, line_items_snapshot, retenciones_snapshot, retencion_total, credit_note_of,
           (select coalesce(sum(n.total), 0) from documentos_fiscales n
             where n.credit_note_of = documentos_fiscales.id and n.org_id = ${orgId}
               and n.lifecycle <> 'void') as reserved_total
      from documentos_fiscales
     where id = ${documentId} and org_id = ${orgId}
     limit 1`);
  const doc = rows[0];
  if (!doc) return { ok: false, error: 'Factura no encontrada.' };
  if (doc.status !== 'issued' || doc.lifecycle === 'void' || doc.credit_note_of) {
    return { ok: false, error: 'Solo una factura de ingreso vigente admite nota de crédito.' };
  }

  const total = money(Number(doc.total) || 0);
  const monto = opts.monto !== undefined ? money(Number(opts.monto)) : money(total - Number(doc.reserved_total || 0));
  if (!(monto > 0) || monto > total) {
    return { ok: false, error: `El monto de la nota de crédito debe estar entre 0 y ${total}.` };
  }

  let credit;
  try { credit = creditNoteBreakdown(doc, monto); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'No se pudo calcular la nota de crédito.' }; }
  const { lines, subtotal, taxes, retenciones, retencionTotal } = credit;
  const country = String(doc.country_code || 'MX').toUpperCase();

  const regulatory = isFiscalDocument(String(doc.document_type || documentTypeFor(country)), country, String(doc.provider));
  const creditType = regulatory ? (country === 'MX' ? 'cfdi_egreso' : 'verifactu_credit_note') : 'commercial_credit_note';
  const publicToken = newInvoiceToken();
  const [, inserted] = await withOrgTx(orgId, invoiceBalanceLock(orgId, documentId), sql`
    insert into documentos_fiscales (
      org_id, cotizacion_id, cliente_id, country_code, document_type, status, provider,
      currency, ledger_currency, fx_rate, ledger_total, subtotal, tax_total, total,
      lifecycle, due_date, amount_paid, amount_remaining, public_token,
      credit_note_of, notes, created_by, retenciones_snapshot, retencion_total,
      issuer_snapshot, recipient_snapshot, line_items_snapshot,
      schema_version, provider_data, updated_at
    ) select
      ${orgId}, ${doc.cotizacion_id || null}, ${doc.cliente_id || null}, ${country},
      ${creditType}, 'pending',
      ${regulatory && country === 'MX' ? 'facturapi' : 'cord'},
      ${doc.currency}, ${doc.ledger_currency}, ${doc.fx_rate},
      ${money(monto * (Number(doc.fx_rate) || 1))}, ${subtotal}, ${taxes}, ${monto},
      'draft', ${doc.due_date}, 0, 0, ${publicToken},
      ${documentId}, ${opts.motivo || null}, ${opts.createdBy || null}, ${JSON.stringify(retenciones)}::jsonb, ${retencionTotal},
      ${JSON.stringify(doc.issuer_snapshot)}, ${JSON.stringify(doc.recipient_snapshot)},
      ${JSON.stringify(lines)},
      'cord.invoice.v1', '{}'::jsonb, now()
    from documentos_fiscales original
    where original.id = ${documentId} and original.org_id = ${orgId}
      and original.status = 'issued' and original.lifecycle <> 'void'
      and original.credit_note_of is null and original.currency = ${String(doc.currency)}
      and ${monto} + coalesce((select sum(n.total) from documentos_fiscales n
        where n.credit_note_of = original.id and n.org_id = original.org_id
          and n.lifecycle <> 'void'), 0) <= original.total
    returning id, public_token`);
  const row = inserted[0];
  if (!row) return { ok: false, error: 'No queda importe disponible: otra nota ya lo reservó o la factura dejó de estar vigente.' };
  return { ok: true, documentId: String(row.id), publicToken: String(row.public_token) };
}
