// Factura comercial de Cord: el documento que descarga y reenvía el cliente de
// nuestro cliente. Fuera de México es LA factura que ve el comprador, así que se
// diseña como pieza de marca del negocio emisor, no como un volcado de datos.
//
// Antes esto era texto plano en Helvetica, renglón por renglón y normalizado a
// ASCII: "España" salía "Espana", un guion largo salía "?", los conceptos no
// formaban columnas y no había ni logo ni color. Ahora se dibuja con el escritor
// vectorial de `lib/pdf/writer.ts`.
//
// Lo que NO cambia es el pie: este documento no afirma haber sido transmitido ni
// autorizado por ninguna autoridad fiscal (reglas 10 y 14).

import QRCode from 'qrcode';
import { countryName, getCountryProfile, isEuCountry } from '../countries';
import { currencyDecimals, normalizeCurrency } from '../currency';
import {
  PdfDocument, measureText, prepareImage, truncateText, wrapText,
  type Align, type FontKey, type RGB,
} from '../pdf/writer';
import type { FiscalLineItem, FiscalParty, FiscalRetencion } from './index';

export interface InvoicePdfInput {
  invoiceNumber: string;
  countryCode: string;
  currency: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  issuedAt: string | Date | null;
  issuer: FiscalParty;
  recipient: FiscalParty;
  lines: FiscalLineItem[];
  simulated?: boolean;
  /** Retenciones del documento — se RESTAN de subtotal+impuestos para llegar a `total`. */
  retenciones?: FiscalRetencion[] | null;
  /** Divisa contable del emisor, si difiere de `currency`. */
  ledgerCurrency?: string | null;
  /** Tipo de cambio `currency` → `ledgerCurrency` aplicado al documento. */
  fxRate?: number | null;
  /** Total convertido a la divisa contable. */
  ledgerTotal?: number | null;

  // ── Marca y contexto (opcionales: el documento se sostiene sin ellos) ──
  /** Logo del negocio (data URL PNG/JPEG). Si no se puede incrustar, se usa el nombre. */
  logo?: string | null;
  /** Color de marca en hex (#0a192f). */
  brandColor?: string | null;
  /** Vencimiento del pago. */
  dueDate?: string | Date | null;
  /** Condiciones legibles ("Contado", "Net 30"). */
  paymentTerms?: string | null;
  /** Referencia u orden de compra del cliente. */
  reference?: string | null;
  /** Folio de la factura ORIGINAL, si este documento es su nota de crédito/rectificativa. */
  creditNoteOfNumber?: string | null;
  /** Registro Verifactu (España) ya encadenado — `provider_data.verifactu` de SpainVerifactuProvider. */
  verifactu?: { qrUrl: string; huella: string; leyenda: string; leyendaCorta: string } | null;
  /** Instrucciones de pago (link, banco). Se imprime tal cual. */
  paymentInstructions?: string | null;
  /** Nota libre al pie. */
  notes?: string | null;
}

const INK: RGB = [17, 24, 39];
const MUTED: RGB = [107, 114, 128];
const HAIRLINE: RGB = [229, 231, 235];
const ZEBRA: RGB = [249, 250, 251];
const WHITE: RGB = [255, 255, 255];
const WARN: RGB = [180, 83, 9];
const WARN_BG: RGB = [254, 243, 199];

const MARGIN = 48;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const FOOT_TOP = PAGE_H - 62;
const BOTTOM_LIMIT = FOOT_TOP - 18;

function hexToRgb(value: string | null | undefined, fallback: RGB): RGB {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(String(value ?? '').trim());
  if (!match) return fallback;
  const int = parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** Mezcla con blanco: tintes suaves sin tener que pedir un segundo color. */
function tint(rgb: RGB, amount: number): RGB {
  return rgb.map((channel) => Math.round(channel + (255 - channel) * amount)) as RGB;
}

/** Tinta legible sobre un fondo dado. Una marca clara no puede llevar texto blanco. */
function readableOn(rgb: RGB): RGB {
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance > 0.6 ? INK : WHITE;
}

/**
 * QR de Verifactu dibujado como una cuadrícula de rectángulos vectoriales, no
 * como un PNG incrustado: `QRCode.create()` es síncrono y puro (sin canvas ni
 * I/O), coherente con que todo este documento sea vectorial (ver cabecera del
 * archivo). Zona de silencio de 2 módulos — sin ella algunos lectores de móvil
 * fallan al enfocar el código pegado al resto del contenido.
 */
function drawQr(doc: PdfDocument, url: string, x: number, top: number, size: number): void {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const modules = qr.modules;
  const quiet = 2;
  const cell = size / (modules.size + quiet * 2);
  doc.rect(x, top, size, size, { fill: WHITE });
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (!modules.get(row, col)) continue;
      doc.rect(x + (col + quiet) * cell, top + (row + quiet) * cell, cell, cell, { fill: INK });
    }
  }
}

function addressLines(party: FiscalParty, locale: 'es' | 'en'): string[] {
  const value = party.address;
  if (!value) return [];
  const street = [value.line1, value.line2].filter(Boolean).join(', ');
  // Ciudad y estado se repiten con frecuencia (Madrid/Madrid, Ciudad de
  // México/CDMX). Imprimirlos dos veces se lee como un error de captura.
  const same = String(value.city || '').trim().toLowerCase() === String(value.region || '').trim().toLowerCase();
  const city = [value.postalCode, value.city, same ? '' : value.region].filter(Boolean).join(' ');
  // El idioma del DOCUMENTO, no un 'es' fijo: una factura en inglés (país no
  // hispanohablante) imprimía "Estados Unidos" en vez de "United States".
  const country = value.countryCode ? countryName(value.countryCode, locale) : '';
  return [street, city, country].map((line) => String(line || '').trim()).filter(Boolean);
}

export function createInvoicePdf(input: InvoicePdfInput): Buffer {
  const profile = getCountryProfile(input.countryCode);
  const isSpanish = profile.locale.startsWith('es');
  const t = (es: string, en: string) => (isSpanish ? es : en);

  const currency = normalizeCurrency(input.currency, 'USD');
  const decimals = currencyDecimals(currency);
  // `useGrouping: 'always'` a propósito: varios locales (es-ES entre ellos) no
  // agrupan los números de cuatro dígitos por default, así que la misma columna
  // mostraba "48.000,00" junto a "4200,00". En una tabla de importes eso se lee
  // como un error de captura.
  const nf = new Intl.NumberFormat(profile.locale, {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: 'always',
  });
  const money = (value: number) => nf.format(Number(value) || 0);
  const qtyFmt = new Intl.NumberFormat(profile.locale, { maximumFractionDigits: 3, useGrouping: 'always' });
  const fmtDate = (value: string | Date | null | undefined) => (value
    ? new Intl.DateTimeFormat(profile.locale, { year: 'numeric', month: 'long', day: 'numeric' })
      .format(new Date(value))
    : '—');
  // Versión corta para la franja de datos clave: ahí cada dato tiene un cuarto
  // del ancho, y "15 de septiembre de 2026" se cortaba a "15 de septiembre d…".
  const fmtDateShort = (value: string | Date | null | undefined) => (value
    ? new Intl.DateTimeFormat(profile.locale, { year: 'numeric', month: 'short', day: 'numeric' })
      .format(new Date(value))
    : '—');

  const brand = hexToRgb(input.brandColor, [10, 25, 47]);
  const onBrand = readableOn(brand);
  const logo = prepareImage(input.logo);

  const doc = new PdfDocument({ width: PAGE_W, height: PAGE_H });
  const contentW = PAGE_W - MARGIN * 2;

  // ── Cabecera de marca ──────────────────────────────────────────────────────
  const HEADER_H = 104;
  doc.rect(0, 0, PAGE_W, HEADER_H, { fill: brand });

  if (logo) {
    const { w, h } = PdfDocument.fit(logo, 160, 44);
    doc.image(logo, MARGIN, 30, w, h);
  } else {
    // Sin logo, el nombre del negocio ES la marca: se ENCOGE para caber entero
    // antes de recortarse. "Distribuidora Peñafiel y Asociados S.A. de C.V."
    // cortado a "Distribuidora Peñafiel y Asociados…" se lee como un error.
    const name = input.issuer.legalName || '—';
    const maxW = PAGE_W - MARGIN - 240;
    const size = [17, 15, 13, 11.5].find((candidate) => measureText(name, candidate, 'bold') <= maxW) ?? 11.5;
    doc.text(truncateText(name, maxW, size, 'bold'), MARGIN, 52, {
      size, font: 'bold', color: onBrand,
    });
  }

  const headRight = PAGE_W - MARGIN - 220;
  doc.text(t('FACTURA', 'INVOICE'), headRight, 42, {
    size: 9, font: 'bold', color: onBrand, align: 'right', width: 220, tracking: 2.4,
  });
  doc.text(truncateText(input.invoiceNumber, 220, 19, 'bold'), headRight, 66, {
    size: 19, font: 'bold', color: onBrand, align: 'right', width: 220,
  });
  doc.text(fmtDate(input.issuedAt), headRight, 84, {
    size: 8.5, color: onBrand, align: 'right', width: 220,
  });

  let y = HEADER_H + 26;

  // ── Aviso de documento de prueba ───────────────────────────────────────────
  // Va antes que nada: una factura de prueba nunca puede confundirse con una real.
  if (input.simulated) {
    doc.rect(MARGIN, y, contentW, 26, { fill: WARN_BG, radius: 5 });
    doc.text(
      t('DOCUMENTO DE PRUEBA — SIN VALIDEZ FISCAL', 'TEST DOCUMENT — NOT VALID FOR TAX PURPOSES'),
      MARGIN, y + 17, { size: 8.5, font: 'bold', color: WARN, align: 'center', width: contentW, tracking: 0.8 },
    );
    y += 40;
  }

  // ── Emisor y cliente, en dos columnas ──────────────────────────────────────
  const colW = (contentW - 28) / 2;
  const colRight = MARGIN + colW + 28;
  doc.text(t('DE', 'FROM'), MARGIN, y, { size: 7, font: 'bold', color: MUTED, tracking: 1.2 });
  doc.text(t('PARA', 'BILL TO'), colRight, y, { size: 7, font: 'bold', color: MUTED, tracking: 1.2 });
  y += 16;

  const party = (p: FiscalParty, x: number, top: number): number => {
    let cursor = top;
    for (const line of wrapText(p.legalName || '—', colW, 11, 'bold').slice(0, 2)) {
      doc.text(line, x, cursor, { size: 11, font: 'bold', color: INK });
      cursor += 14;
    }
    cursor += 2;
    // El label del tax id sale del país DE ESTA PARTE, no del emisor: un
    // emisor mexicano facturando a un cliente español etiquetaba el NIF/CIF
    // del cliente como "RFC".
    const partyTaxIdLabel = getCountryProfile(p.address?.countryCode || input.countryCode).taxIdLabel;
    const rows = [
      p.taxId ? `${partyTaxIdLabel}: ${p.taxId}` : '',
      p.contactName || '',
      ...addressLines(p, isSpanish ? 'es' : 'en'),
      p.email || '',
    ].filter(Boolean);
    for (const row of rows) {
      for (const line of wrapText(row, colW, 8.5)) {
        doc.text(line, x, cursor, { size: 8.5, color: MUTED });
        cursor += 11.5;
      }
    }
    return cursor;
  };
  y = Math.max(party(input.issuer, MARGIN, y), party(input.recipient, colRight, y)) + 14;

  // ── Franja de datos clave ──────────────────────────────────────────────────
  const facts: { k: string; v: string }[] = [];
  // La referencia a la factura ORIGINAL es obligatoria en una rectificativa —
  // sin ella, el documento se lee como una factura nueva y no como lo que
  // corrige. Va primero: es el dato más importante de todo el documento.
  if (input.creditNoteOfNumber) facts.push({ k: t('Rectifica a', 'Corrects invoice'), v: input.creditNoteOfNumber });
  if (input.dueDate) facts.push({ k: t('Vencimiento', 'Due date'), v: fmtDateShort(input.dueDate) });
  if (input.paymentTerms) facts.push({ k: t('Condiciones', 'Terms'), v: input.paymentTerms });
  facts.push({ k: t('Moneda', 'Currency'), v: currency });
  if (input.reference) facts.push({ k: t('Referencia', 'Reference'), v: input.reference });

  const FACT_H = 42;
  doc.rect(MARGIN, y, contentW, FACT_H, { fill: tint(brand, 0.93), radius: 6 });
  const slot = contentW / facts.length;
  facts.forEach((fact, index) => {
    const x = MARGIN + slot * index + 14;
    const w = slot - 28;
    doc.text(fact.k.toUpperCase(), x, y + 17, { size: 6.6, font: 'bold', color: MUTED, tracking: 0.9 });
    doc.text(truncateText(fact.v, w, 9.5, 'bold'), x, y + 31, { size: 9.5, font: 'bold', color: INK });
  });
  y += FACT_H + 24;

  // ── Tabla de conceptos ─────────────────────────────────────────────────────
  const COLS: { title: string; width: number; align: Align }[] = [
    { title: t('Concepto', 'Description'), width: contentW - 262, align: 'left' },
    { title: t('Cant.', 'Qty'), width: 44, align: 'right' },
    { title: t('P. unitario', 'Unit price'), width: 78, align: 'right' },
    // El nombre real del impuesto del país ('IVA', 'VAT', 'Sales tax'…), no un
    // "Tax" genérico — una factura española decía "Impuesto 21%" en la tabla
    // y "IVA" en el editor de origen; ahora dicen lo mismo.
    { title: truncateText(profile.taxLabel, 58, 6.8, 'bold'), width: 58, align: 'right' },
    { title: t('Importe', 'Amount'), width: 82, align: 'right' },
  ];
  const colX = (index: number) => MARGIN + COLS.slice(0, index).reduce((sum, c) => sum + c.width, 0);
  const PAD = 8;
  const LINE_H = 12;
  const HEAD_H = 26;

  const drawTableHead = (top: number): number => {
    doc.rect(MARGIN, top, contentW, HEAD_H, { fill: tint(brand, 0.87), radius: 4 });
    COLS.forEach((col, index) => {
      const left = colX(index) + (col.align === 'left' ? 10 : 0);
      doc.text(col.title.toUpperCase(), left, top + 17, {
        size: 6.8, font: 'bold', color: INK, tracking: 0.8,
        align: col.align, width: col.width - (col.align === 'right' ? 10 : 0),
      });
    });
    return top + HEAD_H;
  };
  y = drawTableHead(y);

  const taxLabel = (rate: number) => (rate > 0 ? `${Math.round(rate * 10000) / 100}%` : '—');
  // Desglose por tasa: varios países exigen ver la base imponible de cada tipo,
  // no un único renglón de "impuestos".
  const taxBuckets = new Map<number, { base: number; amount: number }>();

  input.lines.forEach((line, index) => {
    const descLines = wrapText(String(line.description || '—'), COLS[0].width - 20, 9);
    const rowH = Math.max(LINE_H * descLines.length, LINE_H) + PAD * 2;

    if (y + rowH > BOTTOM_LIMIT) {
      doc.addPage();
      y = drawTableHead(MARGIN + 8);
    }
    if (index % 2 === 1) doc.rect(MARGIN, y, contentW, rowH, { fill: ZEBRA });

    const baseY = y + PAD + 9;
    descLines.forEach((text, i) => {
      doc.text(text, colX(0) + 10, baseY + i * LINE_H, { size: 9, color: INK });
    });
    const cell = (col: number, value: string, font: FontKey = 'regular') =>
      doc.text(value, colX(col), baseY, {
        size: 9, font, color: INK, align: 'right', width: COLS[col].width - 10,
      });
    cell(1, qtyFmt.format(Number(line.quantity) || 0));
    cell(2, money(line.unitPrice));
    cell(3, taxLabel(Number(line.taxRate) || 0));
    cell(4, money(line.subtotal), 'bold');

    const rate = Number(line.taxRate) || 0;
    const bucket = taxBuckets.get(rate) ?? { base: 0, amount: 0 };
    bucket.base += Number(line.subtotal) || 0;
    bucket.amount += Number(line.taxAmount) || 0;
    taxBuckets.set(rate, bucket);

    y += rowH;
    doc.line(MARGIN, y, MARGIN + contentW, y, { color: HAIRLINE, width: 0.5 });
  });

  // ── Totales ────────────────────────────────────────────────────────────────
  const taxRows = [...taxBuckets.entries()].filter(([rate]) => rate > 0).sort((a, b) => a[0] - b[0]);
  const retenciones = (input.retenciones ?? []).filter((r) => Number(r.monto) > 0);
  const fxRate = Number(input.fxRate);
  const ledger = normalizeCurrency(input.ledgerCurrency ?? '', '');
  const hasFx = !!ledger && ledger !== currency && Number.isFinite(fxRate) && fxRate > 0;
  const totalsH = 16 + (taxRows.length || 1) * 16 + retenciones.length * 16 + 42 + (hasFx ? 26 : 0);

  if (y + totalsH > BOTTOM_LIMIT) { doc.addPage(); y = MARGIN + 8; }
  const totalsTop = y + 16;
  const totalsW = 236;
  const totalsX = MARGIN + contentW - totalsW;
  let ty = totalsTop;

  const totalRow = (labelText: string, value: string, muted = false) => {
    doc.text(labelText, totalsX, ty, { size: 8.8, color: muted ? MUTED : INK });
    doc.text(value, totalsX, ty, { size: 8.8, color: muted ? MUTED : INK, align: 'right', width: totalsW });
    ty += 16;
  };

  totalRow(t('Subtotal', 'Subtotal'), `${money(input.subtotal)} ${currency}`);
  if (taxRows.length) {
    for (const [rate, bucket] of taxRows) {
      totalRow(`${profile.taxLabel} ${taxLabel(rate)} · ${t('base', 'base')} ${money(bucket.base)}`,
        `${money(bucket.amount)} ${currency}`, true);
    }
  } else if (Number(input.taxTotal) > 0) {
    totalRow(profile.taxLabel, `${money(input.taxTotal)} ${currency}`, true);
  }
  // Una retención se RESTA: va junto a los impuestos pero con el signo a la
  // vista, porque apunta en dirección contraria (regla 20 de estándares
  // aplicada a dinero — la posición sola no distingue suma de resta).
  for (const r of retenciones) {
    totalRow(r.nombre, `−${money(r.monto)} ${currency}`, true);
  }

  // El total va en el color de la marca: es el número que todos buscan primero.
  const TOTAL_H = 36;
  doc.rect(totalsX, ty - 6, totalsW, TOTAL_H, { fill: brand, radius: 5 });
  doc.text(t('TOTAL', 'TOTAL'), totalsX + 13, ty + 16, { size: 8, font: 'bold', color: onBrand, tracking: 1.3 });
  doc.text(`${money(input.total)} ${currency}`, totalsX, ty + 16, {
    size: 13, font: 'bold', color: onBrand, align: 'right', width: totalsW - 13,
  });
  ty += TOTAL_H + 6;

  if (hasFx) {
    const rateText = new Intl.NumberFormat(profile.locale, { maximumFractionDigits: 6 }).format(fxRate);
    doc.text(`${t('Tipo de cambio', 'Exchange rate')}: 1 ${currency} = ${rateText} ${ledger}`,
      totalsX, ty + 8, { size: 7.6, color: MUTED, align: 'right', width: totalsW });
    if (Number(input.ledgerTotal) > 0) {
      const ledgerTotal = new Intl.NumberFormat(profile.locale, {
        minimumFractionDigits: currencyDecimals(ledger), maximumFractionDigits: currencyDecimals(ledger),
        useGrouping: 'always',
      }).format(Number(input.ledgerTotal));
      doc.text(`${t('Total en', 'Total in')} ${ledger}: ${ledgerTotal}`,
        totalsX, ty + 19, { size: 7.6, color: MUTED, align: 'right', width: totalsW });
    }
    ty += 26;
  }

  // ── Inversión del sujeto pasivo (reverse charge) ────────────────────────────
  // Una venta B2B entre dos países de la UE con NIF-IVA en ambos lados va a
  // tipo 0 y el documento DEBE llevar esta mención — no es opcional, es lo que
  // le dice a la autoridad del receptor por qué no hay IVA repercutido en un
  // documento que de otro modo se vería como una venta exenta sin motivo.
  // Cord no valida el NIF-IVA contra VIES (el servicio de la Comisión Europea
  // no siempre responde, y bloquear la factura por eso sería peor que no
  // validar): solo verifica que ambas partes declaren tax id y country code
  // en países distintos de la UE.
  const issuerCountry = String(input.issuer.address?.countryCode || input.countryCode).toUpperCase();
  const recipientCountry = String(input.recipient.address?.countryCode || '').toUpperCase();
  const isIntraCommunity = isEuCountry(issuerCountry) && isEuCountry(recipientCountry)
    && issuerCountry !== recipientCountry && !!input.issuer.taxId && !!input.recipient.taxId
    && input.lines.some((l) => (Number(l.taxRate) || 0) === 0);
  const reverseChargeNotice = t(
    'Operación intracomunitaria. Inversión del sujeto pasivo — Art. 25 Ley 37/1992 del IVA. El adquirente debe autorrepercutirse el IVA en su declaración.',
    'Intra-Community supply. Reverse charge — VAT self-assessed by the recipient in accordance with Art. 25 of Spanish VAT Law 37/1992.',
  );

  // ── Verifactu: QR + huella, la evidencia de que este registro se encadenó ──
  // Va ANTES de "Cómo pagar" porque la ley exige que el QR y su leyenda sean
  // tan legibles como el resto de la factura — no un pie de página diminuto.
  let by = totalsTop;
  if (input.verifactu?.qrUrl) {
    const qrSize = 64;
    if (by + qrSize > BOTTOM_LIMIT) { doc.addPage(); by = MARGIN + 8; }
    drawQr(doc, input.verifactu.qrUrl, MARGIN, by, qrSize);
    const textX = MARGIN + qrSize + 12;
    const textW = contentW - totalsW - 28 - qrSize - 12;
    doc.text(input.verifactu.leyendaCorta, textX, by + 2, { size: 8, font: 'bold', color: INK, tracking: 0.6 });
    const leyendaLines = wrapText(input.verifactu.leyenda, textW, 7.4);
    leyendaLines.forEach((line, i) => {
      doc.text(line, textX, by + 15 + i * 9.5, { size: 7.4, color: MUTED });
    });
    const huellaY = by + 15 + leyendaLines.length * 9.5 + 6;
    doc.text(`Huella: ${input.verifactu.huella}`, textX, huellaY, { size: 6.4, color: MUTED });
    by += qrSize + 14;
  }

  // ── Cómo pagar y notas, a la izquierda de los totales ──────────────────────
  const blocks = [
    input.paymentInstructions ? { title: t('Cómo pagar', 'How to pay'), body: input.paymentInstructions } : null,
    isIntraCommunity ? { title: t('Mención legal', 'Legal notice'), body: reverseChargeNotice } : null,
    input.notes ? { title: t('Notas', 'Notes'), body: input.notes } : null,
  ].filter(Boolean) as { title: string; body: string }[];

  if (blocks.length) {
    const blockW = contentW - totalsW - 28;
    for (const block of blocks) {
      if (by + 40 > BOTTOM_LIMIT) break;
      doc.text(block.title.toUpperCase(), MARGIN, by, { size: 6.8, font: 'bold', color: MUTED, tracking: 1 });
      by += 13;
      for (const line of wrapText(block.body, blockW, 8.5)) {
        if (by > BOTTOM_LIMIT) break;
        doc.text(line, MARGIN, by, { size: 8.5, color: INK });
        by += 11.5;
      }
      by += 12;
    }
  }
  y = Math.max(ty, by);

  // ── Pie legal y numeración, en TODAS las páginas ───────────────────────────
  // Este texto es la diferencia entre una factura comercial y una fiscal: se
  // conserva palabra por palabra y nunca se omite.
  const disclaimer = input.countryCode.toUpperCase() === 'MX'
    ? t('Representación de un comprobante emitido con Cord. La validez fiscal la determina el CFDI timbrado y su XML.',
        'Representation of a receipt issued with Cord. Tax validity is determined by the stamped CFDI and its XML.')
    : t('Documento comercial emitido por Cord. No representa por sí solo una transmisión, autorización o timbrado ante la autoridad fiscal local.',
        'Commercial document issued by Cord. It does not by itself represent submission, clearance, or stamping by the local tax authority.');

  const pages = doc.pageCount;
  for (let page = 0; page < pages; page++) {
    doc.selectPage(page);
    doc.line(MARGIN, FOOT_TOP, MARGIN + contentW, FOOT_TOP, { color: HAIRLINE, width: 0.5 });
    wrapText(disclaimer, contentW - 60, 7.2).forEach((line, index) => {
      doc.text(line, MARGIN, FOOT_TOP + 14 + index * 9, { size: 7.2, color: MUTED });
    });
    doc.text(`${page + 1} / ${pages}`, MARGIN, FOOT_TOP + 14, {
      size: 7.2, color: MUTED, align: 'right', width: contentW,
    });
  }

  return doc.build();
}
