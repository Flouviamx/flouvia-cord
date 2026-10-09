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
import { currencyDecimals, normalizeCurrency } from '../currency';
import { dueDateFor, isoDay } from '../cobros';
import { FXService, FXUnavailableError } from '../fx/FXService';
import { calculateDocumentTotals, type TaxBreakdown } from '../../../packages/elements/src/engine';
import { FiscalFactory } from './FiscalFactory';
import { partiesFrom } from './parties';
import { creditNoteBreakdown } from './credit-note';
import { invoiceBalanceLock, invoiceBalanceQuery, reconcileInvoice } from './reconciliation';
import { taxCatalogFor, TaxCatalogUnavailableError } from '../impuestos-db';
import { log } from '../log';
import { satFormFor as satPaymentForm } from './payment-complement';
import { serieCompartida, serieCompartidaMensaje } from './serie';
import { isISODate } from '../rango';
import { prepararAnulacionVerifactu, reactivarAltaVerifactu, VerifactuCorreccionError } from './verifactu/correcciones';
import { VerifactuDatosError } from './verifactu/validacion';
import { SifNotConfiguredError } from './verifactu/sif';
import {
  cleanPrefix,
  documentTypeFor,
  isBillableCfdi,
  metadata,
  money,
  newInvoiceToken,
  roundTo,
  madridYear,
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
import { resolveLineSatKeys } from './sat-claves';
import { exemptionReasonFor } from './exemption';
import { descuentoDesdeJson, descuentoParaMotor, type DescuentoDef, type DescuentoSolicitud } from '../descuentos';
import { DescuentoError, liberarCupon, redimirCupon, resolverDescuento } from '../cupones';
import { railDeDocumento } from './latam/rieles';

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
  /** España: causa de exención del concepto (E1–E6, N1, N2, S2). Ver fiscal/exemption.ts. */
  exemptionReason?: string | null;
}

export interface CreateDraftInput {
  documentMode?: unknown;
  clienteId: string;
  items: DraftLineInput[];
  /** Divisa de la VENTA. Por defecto la contable de la org (Regla 21). */
  currency?: string;
  /** ISO date. Si falta, se deriva de los términos del cliente. */
  dueDate?: string | null;
  /**
   * Fecha de prestación (Leistungsdatum) y, para un periodo, su fin. ISO.
   * Nula = coincide con la fecha de la factura.
   */
  serviceDate?: string | null;
  serviceDateEnd?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  /** Cobertura sobre la tasa spot, igual que en el editor de cotizaciones. */
  bufferPct?: number | null;
  /** Los precios capturados ya incluyen impuesto. */
  ivaIncluido?: boolean;
  /**
   * Descuento de documento pedido: manual (`{tipo, valor}`) o cupón (código).
   * El importe lo calcula el motor; nunca viene del navegador. En una edición,
   * `undefined` conserva el que el borrador ya tenía.
   */
  descuento?: DescuentoSolicitud | null;
}

/** Máximo de conceptos por factura. Mismo tope que una cotización. */
export const MAX_INVOICE_ITEMS = 200;

/**
 * Fecha o periodo de prestación desde el body HTTP (`service_date`,
 * `service_date_end`). El fin sin inicio, o anterior a él, se rechaza: el
 * periodo se imprime en la factura alemana como Leistungszeitraum.
 */
export function parseServiceDates(body: Record<string, unknown>):
  | { ok: true; serviceDate: string | null; serviceDateEnd: string | null }
  | { ok: false; error: string } {
  const start = String(body.service_date ?? '').trim();
  const end = String(body.service_date_end ?? '').trim();
  if (start && !isISODate(start)) return { ok: false, error: 'La fecha de prestación no es válida.' };
  if (end && !isISODate(end)) return { ok: false, error: 'El fin del periodo de prestación no es válido.' };
  if (end && !start) return { ok: false, error: 'Indica cuándo empieza el periodo de prestación.' };
  if (end && end < start) return { ok: false, error: 'El periodo de prestación termina antes de empezar.' };
  return { ok: true, serviceDate: start || null, serviceDateEnd: end && end !== start ? end : null };
}

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
    exemptionReason: i?.exemption_reason ? String(i.exemption_reason).slice(0, 4) : null,
    // Solo se descartan los renglones vacíos (cantidad 0 o en blanco). Una
    // cantidad negativa ya no se tira en silencio: llega a la validación y se
    // rechaza con un motivo (ver negativeLineError).
  })).filter((i) => i.descripcion && i.cantidad !== 0);
}

/**
 * Un concepto con cantidad o precio negativo. El motor convierte un negativo
 * en 0 (`num()`), así que una línea "Descuento −500" se guardaba a $0 y el
 * total salía 500 más alto de lo que el negocio escribió, sin aviso. Un
 * descuento se expresa bajando el precio del concepto (precio negociado).
 */
export function negativeLineError(items: Array<{ cantidad?: unknown; precioUnitario?: unknown; precioNegociado?: unknown }>): string | null {
  const negative = items.some((i) => Number(i.cantidad) < 0 || Number(i.precioUnitario) < 0
    || (i.precioNegociado !== null && i.precioNegociado !== undefined && Number(i.precioNegociado) < 0));
  return negative ? 'Un concepto no puede tener cantidad ni precio negativos. Para un descuento, baja el precio del concepto.' : null;
}

export interface DraftResult {
  ok: boolean;
  error?: string;
  /** HTTP sugerido y código estable cuando el motivo no es un dato mal capturado (un cupón agotado, por ejemplo). */
  status?: number;
  code?: string;
  documentId?: string;
  publicToken?: string;
}

/**
 * La definición de descuento de un borrador que se guarda. Un cupón que el
 * borrador YA tenía se conserva tal cual (se validó al aplicarlo; el tope de
 * usos lo vuelve a revisar la emisión): así reabrir y guardar no cambia el
 * importe. Con un monto expresado sobre precios con impuesto, el borrador ya
 * guardó sus precios sin impuesto, y ese monto pasa a su equivalente antes de
 * impuestos (`descuento_total`) para que el documento no cambie.
 */
async function descuentoDelBorrador(
  orgId: string,
  solicitud: DescuentoSolicitud | null | undefined,
  previo: { def: DescuentoDef | null; total: number; currency: string } | null,
  ctx: { moneda: string; clienteId: string; documentoId?: string; ivaIncluido: boolean },
): Promise<DescuentoDef | null> {
  const enOtraDivisa = (def: DescuentoDef | null) => def?.tipo === 'monto' && previo && normalizeCurrency(previo.currency) !== ctx.moneda;
  const conservar = (def: DescuentoDef): DescuentoDef => (def.tipo === 'monto' && def.iva_incluido && !ctx.ivaIncluido
    ? { tipo: 'monto', valor: previo?.total || 0, ...(def.codigo ? { codigo: def.codigo } : {}), ...(def.cupon_id ? { cupon_id: def.cupon_id } : {}) }
    : def);
  if (solicitud === undefined) {
    const def = previo?.def ?? null;
    if (enOtraDivisa(def)) throw new DescuentoError('El descuento está en otra divisa. Vuelve a aplicarlo.', 'discount_currency');
    return def ? conservar(def) : null;
  }
  if (!solicitud) return null;
  if (solicitud.cupon && previo?.def?.cupon_id && previo.def.codigo === solicitud.cupon && !enOtraDivisa(previo.def)) {
    return conservar(previo.def);
  }
  return resolverDescuento(orgId, solicitud, {
    moneda: ctx.moneda, clienteId: ctx.clienteId, documentoId: ctx.documentoId, ivaIncluido: ctx.ivaIncluido,
  });
}

/**
 * Agrega a cada concepto las claves SAT de su producto del catálogo. Las líneas
 * de `buildLines` conservan el orden de `items`. Se leen en servidor y acotadas
 * a la organización: el navegador no decide con qué clave se timbra.
 */
async function withSatKeys(orgId: string, items: DraftLineInput[], lines: FiscalLineItem[]): Promise<FiscalLineItem[]> {
  const ids = Array.from(new Set(items.map((i) => i.productoId).filter((id): id is string => !!id && UUID_RE.test(id))));
  if (!ids.length) return lines;
  const [rows] = await withOrgTx(orgId, sql`
    select id, clave_sat, clave_unidad_sat, unidad from productos
     where org_id = ${orgId} and id = any(${ids}::uuid[])`);
  const byId = new Map(rows.map((r: any) => [String(r.id), r]));
  return lines.map((line, i) => {
    const p: any = items[i]?.productoId ? byId.get(String(items[i].productoId)) : null;
    return p ? { ...line, ...resolveLineSatKeys({ claveSat: p.clave_sat, claveUnidadSat: p.clave_unidad_sat, unidad: p.unidad }) } : line;
  });
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  decimals = 2,
  descuento: DescuentoDef | null = null,
): {
  lines: FiscalLineItem[]; subtotal: number; taxes: number; total: number; byRate: TaxBreakdown[];
  retenciones: FiscalRetencion[]; retencionTotal: number; descuentoTotal: number;
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
    // Cada concepto redondeado a los decimales de la divisa y los totales como
    // la suma de esos importes: lo que el CFDI valida y lo que Verifactu
    // desglosa (ver RoundingOptions en engine.ts).
    // El descuento de documento se reparte por línea antes de impuestos: cada
    // concepto lleva su parte (`discount`) y `subtotal` queda como la base neta.
    { ivaIncluido, retenciones, roundLines: decimals, descuento: descuentoParaMotor(descuento) },
  );
  const round = (value: number) => roundTo(value, decimals);

  const lines: FiscalLineItem[] = totals.lineas.map((l, i) => ({
    description: String(l.descripcion || 'Concepto').slice(0, 500),
    quantity: l.cantidad,
    // Con impuesto incluido, el documento fiscal declara el precio SIN impuesto:
    // es lo que el rail espera como valor unitario, y `taxAmount` lo acompaña.
    // Seis decimales: a centavos, cantidad × unitario no reproducía la base.
    unitPrice: Math.round((l.cantidad ? l.base / l.cantidad : l.base) * 1e6) / 1e6,
    taxRate: l.tax_rate,
    subtotal: round(l.base),
    taxAmount: round(l.impuesto),
    total: round(l.total),
    ...(l.descuento > 0 ? { discount: round(l.descuento) } : {}),
    // `totals.lineas` conserva el orden de `items`. Ya validada por el llamador.
    ...(items[i]?.exemptionReason ? { exemptionReason: items[i].exemptionReason as string } : {}),
  }));

  return {
    lines,
    subtotal: round(totals.subtotal),
    taxes: round(totals.impuestos),
    total: round(totals.total),
    retenciones: totals.retenciones.map((r) => ({ ...r, base: round(r.base), monto: round(r.monto) })),
    retencionTotal: round(totals.retencionTotal),
    byRate: totals.porTasa,
    descuentoTotal: round(totals.descuentoTotal),
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
  country: string,
  fiscal = true,
): Promise<{ rate: number } | { error: string }> {
  let rate = 1;
  if (currency !== ledgerCurrency) {
    try {
      // Sin colchón: el tipo de cambio de una FACTURA es un dato que el
      // documento declara (el CFDI lo manda como TipoCambio y el PDF lo
      // imprime). El colchón es una protección comercial de la COTIZACIÓN; en
      // la factura convertía un tipo de cambio real en uno inflado.
      const fx = await FXService.getExchangeRate({
        baseCurrency: currency,
        fiscalCurrency: ledgerCurrency,
        amount: total,
        bufferPct: 0,
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
  const negative = negativeLineError(items);
  if (negative) return { ok: false, error: negative };

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
  const itemsConTasaValidada = items.map((it) => {
    const taxRate = catalogo.resolve(it.taxRate, catalogo.defaultRate);
    // La causa de exención se conserva solo en España y en una línea al 0 %.
    return { ...it, taxRate, exemptionReason: exemptionReasonFor(country, it.exemptionReason, taxRate) };
  });
  const ledgerCurrency = normalizeCurrency((head.org_moneda as string) || profile.currency);
  const currency = normalizeCurrency(input.currency || ledgerCurrency, ledgerCurrency);
  let descuento: DescuentoDef | null;
  try {
    descuento = await descuentoDelBorrador(orgId, input.descuento ?? null, null, {
      moneda: currency, clienteId: String(head.cliente_id), ivaIncluido: input.ivaIncluido === true,
    });
  } catch (error) {
    if (error instanceof DescuentoError) return { ok: false, error: error.message, status: error.status, code: error.code };
    throw error;
  }
  let built;
  try {
    built = buildLines(itemsConTasaValidada, catalogo.defaultRate, input.ivaIncluido === true, catalogo.retenciones, currencyDecimals(currency), descuento);
  } catch (error: unknown) {
    // RangeError del motor = tasa fuera de [0,1]. Se traduce a un error de
    // captura en vez de dejar que reviente como 500 sin explicación.
    if (error instanceof RangeError) return { ok: false, error: 'Alguna línea tiene una tasa de impuesto inválida.' };
    throw error;
  }
  const { subtotal, taxes, total, retenciones, retencionTotal } = built;
  // México: cada concepto lleva las claves SAT de su producto (sat-claves.ts).
  const lines = country === 'MX' ? await withSatKeys(orgId, itemsConTasaValidada, built.lines) : built.lines;

  const fx = await resolveFxRate(currency, ledgerCurrency, total, country, isFiscalDocument(docType, country));
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
      schema_version, provider_data, updated_at, service_date, service_date_end,
      descuento_total, descuento
    ) values (
      ${orgId}, null, ${String(head.cliente_id)}, ${country}, ${docType}, 'pending',
      ${docType === 'cfdi_40' ? 'facturapi' : 'cord'},
      ${currency}, ${ledgerCurrency}, ${fxRate}, ${roundTo(total * fxRate, currencyDecimals(ledgerCurrency))},
      ${subtotal}, ${taxes}, ${total}, ${retencionTotal}, ${JSON.stringify(retenciones)}::jsonb,
      'draft', ${dueDate}::date, 0, ${total}, ${publicToken},
      ${input.notes || null}, ${input.createdBy || null},
      ${JSON.stringify(issuer)}, ${JSON.stringify(recipient)}, ${JSON.stringify(lines)},
      'cord.invoice.v1', '{}'::jsonb, now(), ${input.serviceDate || null}::date, ${input.serviceDateEnd || null}::date,
      ${built.descuentoTotal}, ${descuento ? JSON.stringify(descuento) : null}::jsonb
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
  const negative = negativeLineError(items);
  if (negative) return { ok: false, error: negative };

  const [docRows] = await withOrgTx(orgId, sql`
    select id, lifecycle, invoice_number, public_token, amount_paid, credit_note_of, document_type, country_code, provider_data,
           descuento, descuento_total, currency
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
  const itemsConTasaValidada = items.map((it) => {
    const taxRate = catalogo.resolve(it.taxRate, catalogo.defaultRate);
    // La causa de exención se conserva solo en España y en una línea al 0 %.
    return { ...it, taxRate, exemptionReason: exemptionReasonFor(country, it.exemptionReason, taxRate) };
  });
  const ledgerCurrency = normalizeCurrency((head.org_moneda as string) || profile.currency);
  const currency = normalizeCurrency(input.currency || ledgerCurrency, ledgerCurrency);
  let descuento: DescuentoDef | null;
  try {
    descuento = await descuentoDelBorrador(orgId, input.descuento, {
      def: descuentoDesdeJson(doc.descuento), total: Number(doc.descuento_total) || 0, currency: String(doc.currency || currency),
    }, { moneda: currency, clienteId: String(head.cliente_id), documentoId: documentId, ivaIncluido: input.ivaIncluido === true });
  } catch (error) {
    if (error instanceof DescuentoError) return { ok: false, error: error.message, status: error.status, code: error.code };
    throw error;
  }
  let built;
  try {
    built = buildLines(itemsConTasaValidada, catalogo.defaultRate, input.ivaIncluido === true, catalogo.retenciones, currencyDecimals(currency), descuento);
  } catch (error: unknown) {
    if (error instanceof RangeError) return { ok: false, error: 'Alguna línea tiene una tasa de impuesto inválida.' };
    throw error;
  }
  const { subtotal, taxes, total, retenciones, retencionTotal } = built;
  // México: cada concepto lleva las claves SAT de su producto (sat-claves.ts).
  const lines = country === 'MX' ? await withSatKeys(orgId, itemsConTasaValidada, built.lines) : built.lines;

  const fx = await resolveFxRate(currency, ledgerCurrency, total, country, isFiscalDocument(docType, country));
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
      ledger_total = ${roundTo(total * fx.rate, currencyDecimals(ledgerCurrency))},
      subtotal = ${subtotal},
      tax_total = ${taxes},
      total = ${total},
      retencion_total = ${retencionTotal},
      retenciones_snapshot = ${JSON.stringify(retenciones)}::jsonb,
      descuento_total = ${built.descuentoTotal},
      descuento = ${descuento ? JSON.stringify(descuento) : null}::jsonb,
      amount_remaining = ${total} - coalesce(amount_paid, 0),
      due_date = ${dueDate}::date,
      notes = ${input.notes || null},
      service_date = ${input.serviceDate || null}::date,
      service_date_end = ${input.serviceDateEnd || null}::date,
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
           d.cliente_id as doc_cliente_id, d.descuento, d.descuento_total,
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
      documentType: String(head.document_type),
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
  ), profile.invoicePrefix);
  // Una serie por EMISOR, no por organización: si otra organización con el
  // mismo identificador fiscal ya numera con esta serie, se para antes de
  // reservar un número que repetiría el suyo (fiscal/serie.ts).
  if (!head.sandbox_of && !head.invoice_number && docType !== 'proforma' && await serieCompartida(orgId, {
    country,
    taxId: fiscalMetadata.tax_id || (head.org_tax_id as string | null),
    prefix: fiscalMetadata.invoice_prefix,
    defaultPrefix: profile.invoicePrefix,
  })) {
    return { emitted: false, status: 'error', error: serieCompartidaMensaje(cleanPrefix(fiscalMetadata.invoice_prefix, profile.invoicePrefix)) };
  }
  // El cupón se redime ANTES de reservar folio: si sus usos se agotaron entre
  // el borrador y la emisión, la factura no se emite y no se quema un número.
  // La redención es idempotente por documento (un reintento no cuenta dos
  // veces) y la factura de una cotización reusa la de la cotización.
  const descuentoDoc = descuentoDesdeJson(head.descuento);
  if (descuentoDoc?.cupon_id && !head.credit_note_of) {
    const redencion = await redimirCupon(orgId, descuentoDoc, {
      clienteId: head.doc_cliente_id ? String(head.doc_cliente_id) : null,
      cotizacionId: head.cotizacion_id ? String(head.cotizacion_id) : null,
      documentoId: documentId,
      monto: Number(head.descuento_total) || 0,
      moneda: String(head.currency || 'MXN'),
    });
    if (redencion !== 'ok') {
      const codigo = descuentoDoc.codigo || '';
      const motivo = redencion === 'agotado_cliente'
        ? `Este cliente ya usó el cupón ${codigo} todas las veces que permite.`
        : redencion === 'agotado' ? `El cupón ${codigo} ya no tiene usos disponibles.`
        : `El cupón ${codigo} ya no existe.`;
      return { emitted: false, status: 'error', httpStatus: 409, error: `${motivo} Quítalo del borrador para emitir la factura.` };
    }
  }

  const idempotencyKey = String(head.idempotency_key || `invoice:${documentId}:v1`);
  const issuedAt = new Date().toISOString();
  // Serie + ejercicio: mismo criterio que emit.ts — la serie es el propio
  // `prefix` (cambiarlo en Ajustes reinicia el contador, en vez de reutilizar
  // la secuencia vieja); `ejercicio=0` preserva la numeración indefinida de
  // las orgs ya existentes, y España reinicia cada año porque el ejercicio es
  // parte del PK de la secuencia.
  const serie = prefix;
  // Año en España, no el del servidor (UTC): ver madridYear en emit.ts.
  const ejercicio = country === 'ES' ? madridYear(new Date(issuedAt)) : 0;
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

  // ── Método y forma de pago del CFDI ───────────────────────────────────
  // Antes TODO CFDI salía "PUE / 03": pagado en una sola exhibición por
  // transferencia, aunque la factura fuera a 30 días o se cobrara con tarjeta.
  // El SAT exige PUE solo cuando el pago se recibió al emitir, con la forma
  // REAL; si no, PPD con forma 99 y un complemento de pago por cada cobro.
  const recipientRfc = String((head.recipient_snapshot as FiscalParty | null)?.taxId || '').toUpperCase().trim();
  const cfdiPayment = country === 'MX' && !head.credit_note_of
    ? await cfdiPaymentTerms(orgId, documentId, head.cotizacion_id ? String(head.cotizacion_id) : null, Number(head.total) || 0,
      !recipientRfc || recipientRfc === 'XAXX010101000')
    : { paymentMethod: 'PUE', paymentForm: '03' };

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
      ...(Number(head.descuento_total) > 0 ? { discountTotal: Number(head.descuento_total) } : {}),
    },
    issuedAt,
    providerApiKey: decryptSecret(head.facturapi_live_key_enc as string)
      || (head.facturapi_live_key as string)
      || undefined,
    cfdi: {
      use: String(head.cliente_uso || head.org_uso || 'G03'),
      paymentForm: cfdiPayment.paymentForm,
      paymentMethod: cfdiPayment.paymentMethod,
    },
  };

  let response: FiscalDocumentResponse;
  if (head.sandbox_of) {
    const { consumeFiscalOutcome, simulatedFiscalResponse } = await import('../sandbox-sim');
    response = simulatedFiscalResponse(await consumeFiscalOutcome(orgId), documentId, { regulatory, country });
  } else {
    try {
      response = await FiscalFactory.getProvider(country, regulatory && country === 'ES' ? (head.credit_note_of ? 'verifactu_credit_note' : 'verifactu_invoice') : docType).issueDocument(request);
    } catch (error: unknown) {
      // Solo México habla con un tercero dentro de esta llamada (el PAC): ahí
      // una excepción puede significar "se timbró y no alcanzamos a leerlo".
      // La factura comercial y Verifactu (que encadena en la base de forma
      // idempotente por documento y envía después) fallan ANTES de que exista
      // nada fuera de Cord: marcarlas inciertas bloqueaba el reintento, la
      // anulación y el borrado para siempre, con el folio quemado.
      const uncertain = country === 'MX';
      // El detalle crudo queda en el log; al vendedor le llega el estado (regla 14).
      log.error('el proveedor fiscal lanzó al emitir', { route: 'fiscal/invoices', err: error, orgId, documentId });
      response = {
        success: false,
        provider: country === 'MX' ? 'facturapi' : 'cord',
        documentId,
        error: uncertain
          ? 'No pudimos confirmar la emisión con la autoridad fiscal. Reintenta en unos minutos: no se duplicará.'
          : (error instanceof Error && error.message ? error.message : 'No se pudo emitir el documento.'),
        rawProviderData: uncertain ? { delivery_uncertain: true, retry_safe: true } : {},
      };
    }
  }

  const providerData = {
    ...(response.rawProviderData ?? {}),
    ...(!response.success ? { error: response.error || 'fallo del proveedor fiscal' } : {}),
  };
  // Un reintento que encuentra el registro Verifactu ya encadenado se fecha con
  // el del registro: la fecha de expedición que viajó a la AEAT (y que imprime
  // el QR) no puede diferir de la del documento.
  const registradaAt = (response.rawProviderData as any)?.verifactu?.emitidaAt ?? (response.success ? response.issuedAt : undefined);
  const issuedAtFinal = typeof registradaAt === 'string' && Number.isFinite(Date.parse(registradaAt)) ? registradaAt : issuedAt;
  // Rieles con numeración propia (ARCA): el número legal lo asigna la
  // autoridad y reemplaza al folio interno reservado arriba.
  if (response.success && response.invoiceNumber) invoiceNumber = response.invoiceNumber;
  await withOrgTx(orgId,
    ...(head.credit_note_of ? [invoiceBalanceLock(orgId, String(head.credit_note_of))] : []),
    sql`
    update documentos_fiscales
       set status = ${response.success ? 'issued' : 'error'},
           lifecycle = ${response.success ? 'open' : 'draft'},
           invoice_number = ${invoiceNumber},
           provider = ${response.provider},
           provider_document_id = ${response.documentId || null},
           fiscal_id = ${response.fiscalId ?? null},
           -- Un reintento exitoso limpia las marcas del intento incierto anterior:
           -- el documento ya no tiene nada pendiente de confirmar.
           provider_data = case when ${response.success}
               then coalesce(provider_data, '{}'::jsonb) - 'delivery_uncertain' - 'retry_safe' - 'error'
               else coalesce(provider_data, '{}'::jsonb) end || ${JSON.stringify(providerData)}::jsonb,
           pdf_url = ${response.pdfUrl ?? null},
           xml_url = ${response.xmlUrl ?? null},
           amount_remaining = case when credit_note_of is not null then 0 else coalesce(total, 0) - coalesce(amount_paid, 0) end,
           issued_at = ${response.success ? new Date(issuedAtFinal) : null},
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
    documentType: docType,
    fiscalId: response.fiscalId,
    invoiceNumber,
    publicToken: String(head.public_token || ''),
    billable: response.success && isBillableCfdi(country, providerData),
    status: response.success ? 'issued' : 'error',
    error: response.error,
  };
}


/**
 * PUE con la forma real si al emitir ya está pagado el total (la cotización se
 * cobró en su link, o hay abonos que lo cubren); PPD / 99 en cualquier otro
 * caso. Con PUE el SAT no admite la forma 99, así que se toma la del cobro de
 * mayor importe — la que el comprobante declara como "la" forma del pago.
 */
async function cfdiPaymentTerms(orgId: string, documentId: string, cotizacionId: string | null, total: number, publicoGeneral = false) {
  const [rows] = await withOrgTx(orgId, sql`
    with pagos as (
      select cc.monto, cc.payment_method as metodo
        from cotizacion_cobros cc
       where ${cotizacionId}::uuid is not null and cc.cotizacion_id = ${cotizacionId}::uuid
         and cc.org_id = ${orgId} and cc.status = 'pagado'
      union all
      select p.monto, p.metodo from documento_pagos p
       where p.documento_id = ${documentId} and p.org_id = ${orgId}
    )
    select coalesce(sum(monto), 0) as pagado,
           (select metodo from pagos order by monto desc limit 1) as metodo
      from pagos`);
  const pagado = Number(rows[0]?.pagado) || 0;
  if (total > 0 && pagado >= total - 0.005) {
    const form = satPaymentForm(rows[0]?.metodo);
    if (form !== '99') return { paymentMethod: 'PUE', paymentForm: form };
  }
  // "Público en general" (RFC genérico) no admite complemento de pago: el
  // comprobante se emite PUE, con la forma del cobro si ya existe o
  // transferencia, que era el comportamiento previo.
  if (publicoGeneral) {
    const form = satPaymentForm(rows[0]?.metodo);
    return { paymentMethod: 'PUE', paymentForm: form === '99' ? '03' : form };
  }
  return { paymentMethod: 'PPD', paymentForm: '99' };
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
           d.stripe_payment_intent_id, d.mp_preference_id, d.descuento,
           o.facturapi_live_key, o.facturapi_live_key_enc, o.sandbox_of, o.stripe_account_id
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
    if (descuentoDesdeJson(doc.descuento)?.cupon_id) await liberarCuponDe(orgId, documentId);
    return { ok: true };
  }

  const country = String(doc.country_code || 'MX').toUpperCase();
  const regulatory = isFiscalDocument(String(doc.document_type || documentTypeFor(country)), country, String(doc.provider));
  if (checkOnly && (country !== 'MX' || !regulatory)) return { ok: false, error: 'La consulta de cancelación solo aplica al CFDI de México.' };
  // Rieles donde lo autorizado no se anula ante la autoridad (Argentina): se
  // compensa con nota de crédito. Se dice ANTES de cerrar los cobros en vuelo
  // de un documento que va a seguir vigente.
  const railDoc = railDeDocumento(doc.document_type);
  if (railDoc && !railDoc.anulable && !(doc.sandbox_of || doc.provider_data?.simulado === true)) {
    return { ok: false, requiresCreditNote: true, error: `En ${railDoc.pais === 'AR' ? 'Argentina' : 'este país'} un comprobante autorizado por ${railDoc.autoridad} no se anula: emite una nota de crédito por el importe que quieras compensar.` };
  }

  // Antes de pedir la cancelación al proveedor fiscal, se cierra todo cobro en
  // vuelo de ESTA factura. Antes no se tocaba: el cliente con /i abierto
  // confirmaba la tarjeta sobre una factura ya anulada, el dinero se capturaba,
  // `applyPayment` lo rechazaba y el webhook fallaba para siempre sin que nadie
  // devolviera ese dinero. Falla cerrada: si no se puede confirmar que el cobro
  // quedó cerrado, la factura NO se anula.
  // España: la anulación se valida ANTES de soltar los cobros en vuelo y de
  // tocar la cadena. Si no se puede registrar (sin alta, datos que la AEAT
  // rechazaría), la factura sigue vigente y con su link de pago intacto.
  const simulatedDoc = doc.sandbox_of || doc.provider_data?.simulado === true;
  if (!checkOnly && regulatory && country === 'ES' && !simulatedDoc) {
    try { await prepararAnulacionVerifactu(orgId, documentId); }
    catch (e) {
      const seguro = e instanceof VerifactuCorreccionError || e instanceof VerifactuDatosError || e instanceof SifNotConfiguredError;
      if (!seguro) log.error('verifactu: no se pudo preparar la anulación', { route: 'fiscal/invoices', orgId, documentId, err: e });
      return { ok: false, error: seguro ? (e as Error).message : 'No se pudo preparar la anulación ante la AEAT. Intenta de nuevo en un momento.' };
    }
  }

  if (!checkOnly) {
    const released = await releaseInvoicePaymentAttempts(orgId, doc);
    if (!released.ok) return { ok: false, error: released.error };
  }
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

  // Bajo el lock del saldo y sin pagos: un abono manual registrado mientras el
  // proveedor procesaba la cancelación no puede quedar sobre una factura anulada.
  const voidResult = await withOrgTx(orgId,
    ...(doc.credit_note_of ? [invoiceBalanceLock(orgId, String(doc.credit_note_of))] : []),
    invoiceBalanceLock(orgId, documentId),
    sql`
    update documentos_fiscales
       set lifecycle = 'void', status = 'cancelled',
           voided_at = now(), void_reason = ${reason || null},
           provider_data = coalesce(provider_data, '{}'::jsonb) || ${JSON.stringify({ cancelacion: { ...cancel.rawProviderData, status: 'accepted' } })}::jsonb,
           updated_at = now()
     where id = ${documentId} and org_id = ${orgId} and coalesce(amount_paid, 0) = 0
     returning id`,
    ...(doc.credit_note_of ? [invoiceBalanceQuery(orgId, String(doc.credit_note_of))] : []),
  );
  const voided = voidResult[doc.credit_note_of ? 2 : 1] as any[];
  if (!voided?.length) {
    // La anulación ya está en la cadena Verifactu pero la factura sigue viva en
    // Cord: se reactiva el alta para que la AEAT no conserve una anulación de
    // una factura vigente.
    if (regulatory && country === 'ES' && !simulated) {
      try { await reactivarAltaVerifactu(orgId, documentId); }
      catch (e) {
        // No se puede reactivar todavía (p. ej. el alta aún no tiene respuesta
        // de la AEAT). No basta con el log: la factura queda vigente con una
        // anulación registrada, y eso lo tiene que ver el negocio y soporte.
        log.error('verifactu: no se pudo reactivar el alta', { route: 'fiscal/invoices', orgId, documentId, err: e });
        await withOrgTx(orgId, sql`
          update documentos_fiscales
             set provider_data = coalesce(provider_data, '{}'::jsonb) || ${JSON.stringify({ verifactu_reactivacion_pendiente: true })}::jsonb,
                 updated_at = now()
           where id = ${documentId} and org_id = ${orgId}`);
        await logInvoiceEvent(orgId, documentId, 'void', 'La anulación quedó registrada ante la AEAT, pero la factura sigue vigente por un pago: hay que volver a darla de alta. Escríbenos a soporte@flouvia.com.');
      }
    }
    await withOrgTx(orgId, sql`
      update documentos_fiscales
         set provider_data = coalesce(provider_data, '{}'::jsonb) || ${JSON.stringify({ cancelacion: { ...cancel.rawProviderData, status: 'accepted', requiere_revision: true } })}::jsonb,
             updated_at = now()
       where id = ${documentId} and org_id = ${orgId}`);
    await logInvoiceEvent(orgId, documentId, 'void', 'Cancelación aceptada por el proveedor, pero llegó un pago mientras se procesaba: requiere revisión');
    return {
      ok: false,
      requiresCreditNote: true,
      error: 'Llegó un pago mientras se procesaba la anulación. Revisa la factura: corresponde una nota de crédito o la devolución del pago.',
    };
  }
  await logInvoiceEvent(orgId, documentId, 'void', reason ? `Anulada: ${reason}` : 'Anulada');
  if (descuentoDesdeJson(doc.descuento)?.cupon_id) await liberarCuponDe(orgId, documentId);
  return { ok: true, cancellationStatus: 'accepted' };
}

/**
 * Una factura anulada devuelve el uso de su cupón. La anulación ya ocurrió y
 * no se deshace por esto: si liberar falla, el contador queda un uso arriba
 * (nunca abajo) y se deja rastro.
 */
async function liberarCuponDe(orgId: string, documentId: string) {
  try { await liberarCupon(orgId, { documentoId: documentId }); }
  catch (error) { log.error('no se liberó el cupón de una factura anulada', { route: 'fiscal/invoices', err: error, orgId, documentId }); }
}

/**
 * Cierra los intentos de cobro en vuelo de una factura antes de anularla: el
 * PaymentIntent de Stripe en la cuenta conectada y la preferencia de Mercado
 * Pago. Un intento ya en `processing`/`succeeded` NO se puede cerrar — ahí hay
 * dinero en camino y la factura no se anula: corresponde esperar el asiento y
 * emitir una nota de crédito.
 */
async function releaseInvoicePaymentAttempts(orgId: string, doc: any): Promise<{ ok: true } | { ok: false; error: string }> {
  const pi = doc.stripe_payment_intent_id ? String(doc.stripe_payment_intent_id) : '';
  const account = doc.stripe_account_id ? String(doc.stripe_account_id) : '';
  if (pi && account) {
    try {
      const { stripe } = await import('../billing');
      const intent = await stripe(`/v1/payment_intents/${encodeURIComponent(pi)}`, undefined, 'GET', { stripeAccount: account });
      const status = String(intent?.status || '');
      if (['processing', 'requires_capture', 'succeeded'].includes(status)) {
        return { ok: false, error: 'Hay un pago en proceso para esta factura. Espera a que se confirme y emite una nota de crédito en lugar de anularla.' };
      }
      if (status !== 'canceled') {
        await stripe(`/v1/payment_intents/${encodeURIComponent(pi)}/cancel`, undefined, 'POST', {
          stripeAccount: account, idempotencyKey: `cord-inv-void-${doc.id}-${pi}`,
        });
      }
    } catch (error: any) {
      // Un intento que ya no existe en la cuenta no puede cobrar.
      if (error?.code !== 'resource_missing') {
        return { ok: false, error: 'No pudimos cerrar el cobro en línea de esta factura. Intenta de nuevo en un momento.' };
      }
    }
  }
  // Cobros agrupados (portal, cobro automático) que incluyen esta factura: un
  // débito en proceso bloquea la anulación; uno que nadie confirmó se cancela
  // (es de varias facturas: el cliente vuelve a elegir desde su portal).
  const [agrupados] = await withOrgTx(orgId, sql`
    select p.id, p.estado, p.stripe_payment_intent_id from pagos_agrupados p
      join pago_agrupado_documentos a on a.pago_id = p.id and a.org_id = p.org_id
     where p.org_id = ${orgId} and a.documento_id = ${doc.id} and p.estado in ('creado', 'procesando')`);
  const enProceso = { ok: false as const, error: 'Hay un pago en proceso para esta factura. Espera a que se confirme y emite una nota de crédito en lugar de anularla.' };
  for (const row of agrupados) {
    if (row.estado !== 'creado' && row.estado !== 'procesando') continue;
    if (row.estado === 'procesando' || !account) return enProceso;
    const grupoPi = row.stripe_payment_intent_id ? String(row.stripe_payment_intent_id) : '';
    if (grupoPi) {
      try {
        const { stripe } = await import('../billing');
        const intent = await stripe(`/v1/payment_intents/${encodeURIComponent(grupoPi)}`, undefined, 'GET', { stripeAccount: account });
        const status = String(intent?.status || '');
        if (['processing', 'requires_capture', 'succeeded'].includes(status)) return enProceso;
        if (status !== 'canceled') {
          await stripe(`/v1/payment_intents/${encodeURIComponent(grupoPi)}/cancel`, undefined, 'POST', {
            stripeAccount: account, idempotencyKey: `cord-grupo-cancel-${row.id}`,
          });
        }
      } catch (error: any) {
        if (error?.code !== 'resource_missing') {
          return { ok: false, error: 'No pudimos cerrar el cobro en línea de esta factura. Intenta de nuevo en un momento.' };
        }
      }
    }
    await withOrgTx(orgId, sql`
      update pagos_agrupados set estado = 'cancelado', updated_at = now()
       where id = ${row.id} and org_id = ${orgId} and estado = 'creado'`);
  }
  if (doc.mp_preference_id) {
    const { expireMpPreference } = await import('../mercadopago');
    if (!(await expireMpPreference(orgId, String(doc.mp_preference_id)))) {
      return { ok: false, error: 'No pudimos cerrar el link de pago de esta factura. Intenta de nuevo en un momento.' };
    }
  }
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
  const descuentoNota = money(lines.reduce((sum, l) => sum + (Number(l.discount) || 0), 0));
  const country = String(doc.country_code || 'MX').toUpperCase();

  const regulatory = isFiscalDocument(String(doc.document_type || documentTypeFor(country)), country, String(doc.provider));
  const railNc = railDeDocumento(doc.document_type);
  const creditType = regulatory
    ? (country === 'MX' ? 'cfdi_egreso' : railNc ? railNc.documentos.notaCredito : 'verifactu_credit_note')
    : 'commercial_credit_note';
  const publicToken = newInvoiceToken();
  const [, inserted] = await withOrgTx(orgId, invoiceBalanceLock(orgId, documentId), sql`
    insert into documentos_fiscales (
      org_id, cotizacion_id, cliente_id, country_code, document_type, status, provider,
      currency, ledger_currency, fx_rate, ledger_total, subtotal, tax_total, total,
      lifecycle, due_date, amount_paid, amount_remaining, public_token,
      credit_note_of, notes, created_by, retenciones_snapshot, retencion_total,
      issuer_snapshot, recipient_snapshot, line_items_snapshot,
      schema_version, provider_data, updated_at, descuento_total
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
      'cord.invoice.v1', '{}'::jsonb, now(), ${descuentoNota}
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
