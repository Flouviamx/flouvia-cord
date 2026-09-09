import type { FiscalLineItem, FiscalRetencion } from './index';

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Prorratea conceptos sin sustituir sus tasas por una tasa promedio. */
export function creditNoteBreakdown(doc: Record<string, unknown>, amount: number) {
  const original = Number(doc.total);
  if (!Number.isFinite(amount) || amount <= 0 || amount > original) throw new Error('El importe de la nota de crédito no es válido.');
  const source = doc.line_items_snapshot as FiscalLineItem[];
  if (!Array.isArray(source) || !source.length) throw new Error('Falta el desglose original para calcular la nota de crédito.');
  const ratio = amount / original;
  const lines = source.map((line) => {
    if (![line.quantity, line.subtotal, line.taxRate, line.taxAmount].every(Number.isFinite)
      || line.quantity <= 0 || line.subtotal < 0 || line.taxRate < 0 || line.taxRate > 1) throw new Error('El desglose original no es válido.');
    const subtotal = money(line.subtotal * ratio);
    const taxAmount = money(subtotal * line.taxRate);
    return { ...line, unitPrice: Math.round(subtotal / line.quantity * 1e6) / 1e6, subtotal, taxAmount, total: money(subtotal + taxAmount) };
  });
  const subtotal = money(lines.reduce((sum, line) => sum + line.subtotal, 0));
  const taxes = money(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const sourceRetentions = (doc.retenciones_snapshot || []) as FiscalRetencion[];
  if (!Array.isArray(sourceRetentions)) throw new Error('Falta el desglose original de retenciones.');
  const retenciones = sourceRetentions.map((r) => {
    const baseTipo = r.baseTipo || (Math.abs(r.base - Number(doc.subtotal)) < 0.011 ? 'subtotal'
      : Math.abs(r.base - Number(doc.tax_total)) < 0.011 ? 'impuesto' : undefined);
    if (!baseTipo || !Number.isFinite(r.tasa) || r.tasa < 0 || r.tasa > 1) throw new Error('No se puede identificar la base original de la retención.');
    const base = baseTipo === 'impuesto' ? taxes : subtotal;
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
