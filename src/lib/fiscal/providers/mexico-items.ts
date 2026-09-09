import type { FiscalDocumentRequest } from '../index';

const rounded = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const matches = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.011;

/** Traduce los snapshots; nunca deja que el PAC elija impuestos por defecto. */
export function mexicoItems(request: FiscalDocumentRequest) {
  const { lines, totals } = request;
  if (!lines.length) throw new Error('La factura necesita conceptos fiscales.');
  const retentions = totals.retenciones || [];
  const bases = retentions.map((r) => {
    if (!['ret_iva', 'ret_isr'].includes(r.tipo) || !Number.isFinite(r.tasa) || r.tasa < 0 || r.tasa > 1) {
      throw new Error('La retención no tiene un tipo o una tasa fiscal admitidos.');
    }
    const baseType = r.baseTipo || (matches(r.base, totals.subtotal) ? 'subtotal' : matches(r.base, totals.taxes) ? 'impuesto' : undefined);
    const expectedBase = baseType === 'subtotal' ? totals.subtotal : totals.taxes;
    if (!baseType || !matches(r.base, expectedBase) || !matches(r.monto, rounded(r.base * r.tasa))) {
      throw new Error('La base de la retención no coincide con el desglose guardado.');
    }
    return baseType;
  });
  const retained = rounded(retentions.reduce((sum, r) => sum + r.monto, 0));
  if (!matches(retained, totals.retencionTotal || 0) || !matches(totals.total, rounded(totals.subtotal + totals.taxes - retained))) {
    throw new Error('El total fiscal no coincide con los impuestos y retenciones guardados.');
  }
  let subtotal = 0;
  let taxes = 0;
  const items = lines.map((line) => {
    // El catálogo actual distingue IVA 16%, 8% y exento (tasa 0).
    // IEPS y tasa cero gravada requieren metadatos distintos; no se inventan.
    if (![0, 0.08, 0.16].includes(line.taxRate) || !Number.isFinite(line.quantity) || line.quantity <= 0
      || !Number.isFinite(line.subtotal) || line.subtotal < 0
      || !matches(line.taxAmount, rounded(line.subtotal * line.taxRate))) {
      throw new Error('El concepto no tiene un desglose de IVA compatible con su snapshot fiscal.');
    }
    subtotal += line.subtotal;
    taxes += line.taxAmount;
    // El snapshot anterior redondeaba el unitario a centavos aun para cantidades
    // fraccionarias. Recuperamos hasta 6 decimales desde la base congelada.
    const price = Math.round(line.subtotal / line.quantity * 1e6) / 1e6;
    if (!matches(rounded(price * line.quantity), line.subtotal)) throw new Error('No se puede representar la base del concepto con precisión fiscal.');
    return {
      quantity: line.quantity,
      product: {
        description: String(line.description || 'Concepto').slice(0, 1000),
        product_key: String(line.productKey || '01010101'), unit_key: String(line.unitKey || 'H87'),
        price, tax_included: false,
        taxes: [
          { type: 'IVA', rate: line.taxRate, factor: line.taxRate === 0 ? 'Exento' : 'Tasa' },
          ...retentions.flatMap((r, i) => {
            const rate = Math.round(r.tasa * (bases[i] === 'impuesto' ? line.taxRate : 1) * 1e6) / 1e6;
            return rate > 0 ? [{ type: r.tipo === 'ret_iva' ? 'IVA' : 'ISR', rate, factor: 'Tasa', withholding: true }] : [];
          }),
        ],
      },
    };
  });
  if (!matches(rounded(subtotal), totals.subtotal) || !matches(rounded(taxes), totals.taxes)) {
    throw new Error('Los conceptos no coinciden con los totales de la factura.');
  }
  retentions.forEach((r, i) => {
    const expected = rounded(items.reduce((sum, item, j) => {
      const rate = Math.round(r.tasa * (bases[i] === 'impuesto' ? lines[j].taxRate : 1) * 1e6) / 1e6;
      return sum + item.quantity * item.product.price * rate;
    }, 0));
    if (!matches(expected, r.monto)) throw new Error('La retención no se puede representar sin cambiar su importe.');
  });
  return items;
}
