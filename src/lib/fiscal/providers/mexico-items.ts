import type { FiscalDocumentRequest } from '../index';
import { DEFAULT_PRODUCT_KEY, DEFAULT_UNIT_KEY, isProductKey, isUnitKey } from '../sat-claves';

function satKey(value: unknown, fallback: string, valid: (v: unknown) => boolean, description: unknown): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (!valid(value)) throw new Error(`El concepto "${String(description || 'Concepto').slice(0, 60)}" tiene una clave SAT con formato inválido.`);
  return String(value);
}

const rounded = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const matches = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.011;

/**
 * Tasa de la retención en UN concepto del CFDI (que la declara por concepto):
 * sobre el impuesto se convierte a tasa sobre la base, y la base gravada no
 * alcanza a un concepto exento o a tasa 0 (no traslada IVA que retener).
 */
function lineRetentionRate(tasa: number, base: string, lineTaxRate: number): number {
  if (base === 'gravado' && !(lineTaxRate > 0)) return 0;
  return Math.round(tasa * (base === 'impuesto' ? lineTaxRate : 1) * 1e6) / 1e6;
}

/** Traduce los snapshots; nunca deja que el PAC elija impuestos por defecto. */
export function mexicoItems(request: FiscalDocumentRequest) {
  const { lines, totals } = request;
  if (!lines.length) throw new Error('La factura necesita conceptos fiscales.');
  const retentions = totals.retenciones || [];
  // Base gravada: solo los conceptos que trasladan IVA (tasa > 0).
  const taxedBase = rounded(lines.reduce((sum, l) => sum + (l.taxRate > 0 ? l.subtotal : 0), 0));
  const bases = retentions.map((r) => {
    if (!['ret_iva', 'ret_isr'].includes(r.tipo) || !Number.isFinite(r.tasa) || r.tasa < 0 || r.tasa > 1) {
      throw new Error('La retención no tiene un tipo o una tasa fiscal admitidos.');
    }
    const baseType = r.baseTipo || (matches(r.base, totals.subtotal) ? 'subtotal' : matches(r.base, totals.taxes) ? 'impuesto' : undefined);
    const expectedBase = baseType === 'subtotal' ? totals.subtotal : baseType === 'gravado' ? taxedBase : totals.taxes;
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
  // Descuento de documento repartido por concepto (`line.discount`). Facturapi
  // lo recibe como `items[].discount`, "monto total de descuento aplicado a este
  // concepto" (API de Facturapi, LineItemInput), y el CFDI lo declara en
  // Concepto@Descuento: Importe = cantidad × ValorUnitario (BRUTO), la base del
  // impuesto es Importe − Descuento (la neta, nuestro `subtotal`) y
  // Comprobante@Descuento es la suma de los de los conceptos (Anexo 20, CFDI
  // 4.0: SubTotal antes de descuentos e impuestos; Total = SubTotal − Descuento
  // + trasladados − retenidos).
  const discounts = lines.map((line) => {
    const d = line.discount === undefined || line.discount === null ? 0 : Number(line.discount);
    if (!Number.isFinite(d) || d < 0) throw new Error('El descuento de un concepto no es válido.');
    return d;
  });
  const items = lines.map((line, i) => {
    // El catálogo actual distingue IVA 16%, 8% y exento (tasa 0).
    // IEPS y tasa cero gravada requieren metadatos distintos; no se inventan.
    if (![0, 0.08, 0.16].includes(line.taxRate) || !Number.isFinite(line.quantity) || line.quantity <= 0
      || !Number.isFinite(line.subtotal) || line.subtotal < 0
      || !matches(line.taxAmount, rounded(line.subtotal * line.taxRate))) {
      throw new Error('El concepto no tiene un desglose de IVA compatible con su snapshot fiscal.');
    }
    const discount = discounts[i];
    // El Anexo 20 exige que la Base de cada traslado sea mayor que cero: un
    // concepto que el descuento dejó en cero no se puede timbrar.
    if (discount > 0 && !(line.subtotal > 0)) {
      throw new Error(`El concepto "${String(line.description || 'Concepto').slice(0, 60)}" quedó en cero con el descuento, y el SAT no admite un concepto con base cero. Reduce el descuento.`);
    }
    subtotal += line.subtotal;
    taxes += line.taxAmount;
    // El snapshot anterior redondeaba el unitario a centavos aun para cantidades
    // fraccionarias. Recuperamos hasta 6 decimales desde la base congelada; con
    // descuento, el ValorUnitario es el BRUTO (base + descuento) y el descuento
    // viaja aparte.
    const gross = rounded(line.subtotal + discount);
    const price = Math.round(gross / line.quantity * 1e6) / 1e6;
    if (!matches(rounded(price * line.quantity), gross)) throw new Error('No se puede representar la base del concepto con precisión fiscal.');
    return {
      quantity: line.quantity,
      ...(discount > 0 ? { discount: rounded(discount) } : {}),
      product: {
        description: String(line.description || 'Concepto').slice(0, 1000),
        // Claves SAT del producto (sat-claves.ts) o los defaults del SAT: 01010101
        // "No existe en el catálogo" y H87 "Pieza". Una clave con forma inválida
        // se rechaza aquí, con el concepto nombrado, en vez de llegar al PAC.
        product_key: satKey(line.productKey, DEFAULT_PRODUCT_KEY, isProductKey, line.description),
        unit_key: satKey(line.unitKey, DEFAULT_UNIT_KEY, isUnitKey, line.description),
        price, tax_included: false,
        taxes: [
          { type: 'IVA', rate: line.taxRate, factor: line.taxRate === 0 ? 'Exento' : 'Tasa' },
          ...retentions.flatMap((r, i) => {
            const rate = lineRetentionRate(r.tasa, bases[i], line.taxRate);
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
      const rate = lineRetentionRate(r.tasa, bases[i], lines[j].taxRate);
      // La base de la retención por concepto también es Importe − Descuento.
      return sum + (item.quantity * item.product.price - discounts[j]) * rate;
    }, 0));
    if (!matches(expected, r.monto)) throw new Error('La retención no se puede representar sin cambiar su importe.');
  });
  return items;
}
