import type { FiscalLineItem, FiscalRetencion } from './index';
import { currencyDecimals } from '../currency';
import { taxRoundingFor } from '../countries';
import { calculateInvoiceTotals, type TaxRounding } from '../../../packages/elements/src/engine';

/**
 * Impuesto de cada línea (base ya redondeada × su tasa) con el motor ÚNICO y
 * la regla de redondeo dada (regla 23): por línea, o por documento (CL).
 */
function impuestosDeLineas(bases: number[], tasas: number[], decimals: number, taxRounding: TaxRounding): number[] {
  return calculateInvoiceTotals(
    bases.map((base, i) => ({ cantidad: 1, precio_unitario: base, tax_rate: tasas[i] })),
    { roundLines: decimals, taxRounding },
  ).lineas.map((l) => l.impuesto);
}

/** Prorratea conceptos sin sustituir sus tasas por una tasa promedio. */
export function creditNoteBreakdown(doc: Record<string, unknown>, amount: number) {
  // Decimales de la divisa del documento: a dos decimales fijos, una nota en
  // CLP o JPY producía importes con centavos que esa divisa no tiene.
  const decimals = currencyDecimals(String(doc.currency || 'MXN'));
  const factor = 10 ** decimals;
  const money = (n: number) => Math.round((n + Number.EPSILON) * factor) / factor;
  const tolerance = 1.1 / factor;
  const original = Number(doc.total);
  if (!Number.isFinite(amount) || amount <= 0 || amount > original) throw new Error('El importe de la nota de crédito no es válido.');
  const source = doc.line_items_snapshot as FiscalLineItem[];
  if (!Array.isArray(source) || !source.length) throw new Error('Falta el desglose original para calcular la nota de crédito.');
  const ratio = amount / original;
  for (const line of source) {
    if (![line.quantity, line.subtotal, line.taxRate, line.taxAmount].every(Number.isFinite)
      || line.quantity <= 0 || line.subtotal < 0 || line.taxRate < 0 || line.taxRate > 1) throw new Error('El desglose original no es válido.');
  }
  // Regla de redondeo del impuesto: la del país del emisor (CL: por
  // documento). Si el original no se calculó con ella —un documento anterior a
  // que existiera—, la suya: el snapshot manda y la nota lo refleja.
  const tasas = source.map((line) => line.taxRate);
  const reproduce = (modo: TaxRounding) => money(impuestosDeLineas(source.map((l) => l.subtotal), tasas, decimals, modo)
    .reduce((sum, t) => sum + t, 0)) === money(Number(doc.tax_total));
  const delPais = taxRoundingFor(doc.country_code);
  const otro: TaxRounding = delPais === 'document' ? 'line' : 'document';
  const taxRounding = reproduce(delPais) || !reproduce(otro) ? delPais : otro;
  const bases = source.map((line) => money(line.subtotal * ratio));
  const impuestos = impuestosDeLineas(bases, tasas, decimals, taxRounding);
  const lines = source.map((line, i) => {
    const subtotal = bases[i];
    const taxAmount = impuestos[i];
    // El descuento de documento que traía la línea se acredita en la misma
    // proporción: la nota conserva la forma de la factura (bruto − descuento =
    // base), y el CFDI de egreso lo declara igual que el de ingreso.
    const discount = Number(line.discount) > 0 ? money(Number(line.discount) * ratio) : 0;
    const { discount: _sinDescuento, ...rest } = line;
    return {
      ...rest,
      unitPrice: Math.round(subtotal / line.quantity * 1e6) / 1e6, subtotal, taxAmount, total: money(subtotal + taxAmount),
      ...(discount > 0 ? { discount } : {}),
    };
  });
  const subtotal = money(lines.reduce((sum, line) => sum + line.subtotal, 0));
  const taxes = money(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const sourceRetentions = (doc.retenciones_snapshot || []) as FiscalRetencion[];
  if (!Array.isArray(sourceRetentions)) throw new Error('Falta el desglose original de retenciones.');
  const retenciones = sourceRetentions.map((r) => {
    const baseTipo = r.baseTipo || (Math.abs(r.base - Number(doc.subtotal)) < tolerance ? 'subtotal'
      : Math.abs(r.base - Number(doc.tax_total)) < tolerance ? 'impuesto' : undefined);
    if (!baseTipo || !Number.isFinite(r.tasa) || r.tasa < 0 || r.tasa > 1) throw new Error('No se puede identificar la base original de la retención.');
    const base = baseTipo === 'impuesto' ? taxes
      : baseTipo === 'gravado' ? money(lines.reduce((sum, line) => sum + (line.taxRate > 0 ? line.subtotal : 0), 0))
      : subtotal;
    return { ...r, baseTipo, base, monto: money(base * r.tasa) };
  });
  if (money(sourceRetentions.reduce((sum, r) => sum + Number(r.monto), 0)) !== money(Number(doc.retencion_total || 0))) {
    throw new Error('El desglose de retenciones original está incompleto.');
  }
  const retencionTotal = money(retenciones.reduce((sum, r) => sum + r.monto, 0));
  if (money(subtotal + taxes - retencionTotal) !== money(amount)) {
    throw new Error('Ese importe no conserva el desglose fiscal al redondear. Ajusta el importe de la nota de crédito.');
  }
  return { lines, subtotal, taxes, retenciones, retencionTotal };
}
