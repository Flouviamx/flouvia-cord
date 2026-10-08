import { resolveBrandProfile, onBrandColor } from '../brand-profile';
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
import { mmAPuntos, VERIFACTU_QR_PRESENTACION } from './verifactu/qr';
import { countryName, getCountryProfile, isEuCountry } from '../countries';
import { currencyDecimals, normalizeCurrency } from '../currency';
import { fmtTaxPct, splitTaxBucket } from '../tax-components';
import { EXEMPTION_INFO, isExemptionReason } from './exemption';
import {
  PdfDocument, measureText as measure, prepareImage, truncateText as truncate, wrapText as wrap,
  type Align, type FontKey, type RGB,
} from '../pdf/writer';
import type { FiscalLineItem, FiscalParty, FiscalRetencion } from './index';
import { termDays } from '../payment-terms';

export interface InvoicePdfInput {
  brandProfile?: unknown;
  brandSecondary?: string | null;
  invoiceNumber: string;
  countryCode: string;
  documentType?: string;
  currency: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  issuedAt: string | Date | null;
  issuer: FiscalParty;
  recipient: FiscalParty;
  lines: FiscalLineItem[];
  simulated?: boolean;
  /** La factura se anuló: el PDF lo dice arriba, para que no circule como vigente. */
  voided?: boolean;
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
  /**
   * Fecha de prestación (Leistungsdatum) y fin del periodo, aaaa-mm-dd. Sin
   * ellas, una factura alemana dice que coincide con la fecha de emisión: el
   * § 14 Abs. 4 Nr. 6 UStG exige que conste.
   */
  serviceDate?: string | null;
  serviceDateEnd?: string | null;
  /**
   * Código del plazo (src/lib/payment-terms.ts: `contado` o `net<N>`). El PDF
   * lo rotula en el idioma del documento; antes llegaba "Contado" ya resuelto
   * en español, también a una factura en inglés de un negocio en Austin.
   */
  paymentTermsCode?: string | null;
  /**
   * Zona horaria del EMISOR (`orgs.zona_horaria`). La fecha de expedición es un
   * instante y se imprime en el día del negocio: formateada en la zona del
   * servidor (UTC en Vercel), una factura emitida a las 19:00 en Ciudad de
   * México salía fechada el día siguiente (regla 24).
   */
  timeZone?: string | null;
  /** Referencia u orden de compra del cliente. */
  reference?: string | null;
  /** Folio de la factura ORIGINAL, si este documento es su nota de crédito/rectificativa. */
  creditNoteOfNumber?: string | null;
  /** Registro Verifactu (España) ya encadenado — `provider_data.verifactu` de SpainVerifactuProvider. */
  verifactu?: { qrUrl: string; huella: string; leyenda: string; leyendaCorta: string; etiquetaQr?: string } | null;
  /** Instrucciones de pago (link, banco). Se imprime tal cual. */
  paymentInstructions?: string | null;
  /** Condiciones generales del negocio (orgs.pdf_condiciones), iguales en cada documento. */
  notes?: string | null;
  /**
   * Notas de ESTE documento. En una nota de crédito es el motivo de la
   * rectificación, que la ley pide que conste (no solo en el historial).
   */
  documentNotes?: string | null;
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
  // `size` es el CÓDIGO (lo que la norma mide: 30–40 mm). La zona de silencio
  // va por fuera, como espacio en blanco alrededor, no restada del código.
  const quiet = 0;
  const cell = size / (modules.size + quiet * 2);
  doc.rect(x, top, size, size, { fill: WHITE });
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (!modules.get(row, col)) continue;
      doc.rect(x + (col + quiet) * cell, top + (row + quiet) * cell, cell, cell, { fill: INK });
    }
  }
}

function addressLines(party: FiscalParty, locale: DocLang): string[] {
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

// ── Idioma del documento ─────────────────────────────────────────────────────
//
// La factura se imprime en el idioma del país del EMISOR. Antes eran dos
// idiomas (español o inglés), así que un negocio en París o en Berlín emitía
// su factura en inglés y uno en São Paulo también. Francia exige la factura en
// francés frente a su administración, y Alemania y Brasil pueden pedir una
// traducción: el documento que el comprador archiva debe estar en la lengua
// del emisor. WinAnsi (ver lib/pdf/writer.ts) cubre todos los acentos de estas
// cinco lenguas, incluidas ß, ç, ã y õ.
export type DocLang = 'es' | 'en' | 'fr' | 'de' | 'pt';

export function docLangFor(locale: string): DocLang {
  const base = String(locale || '').slice(0, 2).toLowerCase();
  return base === 'es' || base === 'fr' || base === 'de' || base === 'pt' ? base : 'en';
}

type Phrase = Record<DocLang, string>;
const P = (es: string, en: string, fr: string, de: string, pt: string): Phrase => ({ es, en, fr, de, pt });

const PDF_TEXT = {
  proforma: P('PROFORMA', 'PRO FORMA', 'PROFORMA', 'PROFORMA', 'PRÓ-FORMA'),
  creditNote: P('NOTA DE CRÉDITO', 'CREDIT NOTE', 'AVOIR', 'GUTSCHRIFT', 'NOTA DE CRÉDITO'),
  invoice: P('FACTURA', 'INVOICE', 'FACTURE', 'RECHNUNG', 'FATURA'),
  testDoc: P('DOCUMENTO DE PRUEBA — SIN VALIDEZ FISCAL', 'TEST DOCUMENT — NOT VALID FOR TAX PURPOSES',
    'DOCUMENT DE TEST — SANS VALEUR FISCALE', 'TESTDOKUMENT — STEUERLICH UNGÜLTIG', 'DOCUMENTO DE TESTE — SEM VALIDADE FISCAL'),
  voided: P('FACTURA ANULADA — SIN VALOR DE COBRO', 'VOIDED INVOICE — NOT PAYABLE', 'FACTURE ANNULÉE — NON EXIGIBLE',
    'STORNIERTE RECHNUNG — NICHT ZAHLBAR', 'FATURA ANULADA — SEM VALOR DE COBRANÇA'),
  from: P('DE', 'FROM', 'ÉMETTEUR', 'VON', 'EMITENTE'),
  billTo: P('PARA', 'BILL TO', 'CLIENT', 'AN', 'CLIENTE'),
  corrects: P('Rectifica a', 'Corrects invoice', 'Rectifie la facture', 'Berichtigt Rechnung', 'Retifica a fatura'),
  dueDate: P('Vencimiento', 'Due date', "Date d'échéance", 'Fällig am', 'Vencimento'),
  serviceDate: P('Fecha de prestación', 'Date of supply', 'Date de la prestation', 'Leistungsdatum', 'Data da prestação'),
  servicePeriod: P('Periodo de prestación', 'Supply period', 'Période de prestation', 'Leistungszeitraum', 'Período da prestação'),
  sameAsInvoiceDate: P('La de la factura', 'Same as invoice date', 'Identique à la date de facture', 'entspricht dem Rechnungsdatum', 'A da fatura'),
  terms: P('Condiciones', 'Terms', 'Conditions', 'Zahlungsbedingungen', 'Condições'),
  currency: P('Moneda', 'Currency', 'Devise', 'Währung', 'Moeda'),
  reference: P('Referencia', 'Reference', 'Référence', 'Referenz', 'Referência'),
  description: P('Concepto', 'Description', 'Désignation', 'Beschreibung', 'Descrição'),
  qty: P('Cant.', 'Qty', 'Qté', 'Menge', 'Qtd.'),
  unitPrice: P('P. unitario', 'Unit price', 'Prix unit. HT', 'Einzelpreis', 'Preço unit.'),
  amount: P('Importe', 'Amount', 'Montant HT', 'Betrag', 'Valor'),
  subtotal: P('Subtotal', 'Subtotal', 'Total HT', 'Zwischensumme', 'Subtotal'),
  base: P('base', 'base', 'base', 'Basis', 'base'),
  total: P('TOTAL', 'TOTAL', 'TOTAL TTC', 'GESAMT', 'TOTAL'),
  invoiceTotal: P('Importe total factura', 'Invoice total', 'Total facture TTC', 'Rechnungsbetrag', 'Total da fatura'),
  totalDue: P('TOTAL A PAGAR', 'TOTAL DUE', 'NET À PAYER', 'ZAHLBETRAG', 'TOTAL A PAGAR'),
  exchangeRate: P('Tipo de cambio', 'Exchange rate', 'Taux de change', 'Wechselkurs', 'Taxa de câmbio'),
  totalIn: P('Total en', 'Total in', 'Total en', 'Gesamt in', 'Total em'),
  howToPay: P('Cómo pagar', 'How to pay', 'Comment payer', 'Zahlung', 'Como pagar'),
  legalNotice: P('Mención legal', 'Legal notice', 'Mention légale', 'Rechtlicher Hinweis', 'Menção legal'),
  notes: P('Notas', 'Notes', 'Notes', 'Hinweise', 'Observações'),
  conditions: P('Términos y condiciones', 'Terms and conditions', 'Conditions générales', 'Allgemeine Bedingungen', 'Termos e condições'),
  reason: P('Motivo', 'Reason', 'Motif', 'Grund', 'Motivo'),
  disclaimerProforma: P(
    'Documento comercial proforma. No sustituye una factura fiscal ni acredita envío a una autoridad tributaria.',
    'Pro forma commercial document. It does not replace a tax invoice or certify submission to a tax authority.',
    "Document commercial pro forma. Il ne remplace pas une facture et n'atteste aucune transmission à une administration fiscale.",
    'Proforma-Dokument. Es ersetzt keine Rechnung und belegt keine Übermittlung an eine Steuerbehörde.',
    'Documento comercial pró-forma. Não substitui uma nota fiscal nem comprova envio a uma autoridade tributária.',
  ),
  disclaimerCfdi: P(
    'Representación de un comprobante emitido con Cord. La validez fiscal la determina el CFDI timbrado y su XML.',
    'Representation of a receipt issued with Cord. Tax validity is determined by the stamped CFDI and its XML.',
    'Représentation d\'un justificatif émis avec Cord. La validité fiscale est déterminée par le CFDI tamponné et son XML.',
    'Darstellung eines mit Cord ausgestellten Belegs. Steuerlich maßgeblich sind das gestempelte CFDI und sein XML.',
    'Representação de um comprovante emitido com Cord. A validade fiscal é determinada pelo CFDI carimbado e seu XML.',
  ),
  disclaimerCommercial: P(
    'Documento comercial emitido por Cord. No representa por sí solo una transmisión, autorización o timbrado ante la autoridad fiscal local.',
    'Commercial document issued by Cord. It does not by itself represent submission, clearance, or stamping by the local tax authority.',
    "Document commercial émis par Cord. Il ne constitue pas à lui seul une transmission ou une validation auprès de l'administration fiscale locale.",
    'Mit Cord erstelltes Handelsdokument. Es stellt für sich genommen keine Übermittlung an oder Freigabe durch die örtliche Steuerbehörde dar.',
    'Documento comercial emitido pelo Cord. Por si só, não representa transmissão, autorização ou validação perante a autoridade fiscal local.',
  ),
} satisfies Record<string, Phrase>;

const CONTADO_TEXT = P('Contado', 'Due on receipt', 'Paiement à réception', 'Sofort fällig', 'À vista');

/** "net45" → "45 días" / "Net 45" / "45 jours"… en la lengua del documento. */
export function termText(code: unknown, lang: DocLang): string {
  const days = termDays(code);
  if (!days) return CONTADO_TEXT[lang];
  return { es: `${days} días`, en: `Net ${days}`, fr: `${days} jours`, de: `${days} Tage netto`, pt: `${days} dias` }[lang];
}

/**
 * Mención obligatoria de la inversión del sujeto pasivo (art. 226.11 bis de la
 * Directiva 2006/112/CE), en la LENGUA y con la base legal del país EMISOR.
 *
 * Antes se imprimía para cualquier emisor de la UE la cita de la ley española
 * (art. 25 de la Ley 37/1992): un estudio de París facturando a Berlín citaba
 * una ley que no le aplica. Francia exige textualmente "Autoliquidation" (art.
 * 242 nonies A del CGI) y Alemania "Steuerschuldnerschaft des
 * Leistungsempfängers" (§ 14a Abs. 5 UStG). El resto de la UE recibe la
 * mención en inglés con la cita de la Directiva, que es la norma común.
 */
export function reverseChargeNotice(issuerCountry: string, lang: DocLang): string {
  switch (String(issuerCountry || '').toUpperCase()) {
    case 'ES':
      return 'Inversión del sujeto pasivo: servicio no sujeto al IVA español (art. 69 de la Ley 37/1992) o entrega intracomunitaria exenta (art. 25); el destinatario autoliquida el IVA (art. 196 de la Directiva 2006/112/CE).';
    case 'FR':
      return 'Autoliquidation — TVA due par le preneur (art. 259-1 du CGI ; art. 196 de la directive 2006/112/CE). Livraisons intracommunautaires : exonération de TVA, art. 262 ter I du CGI.';
    case 'DE':
      return 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG; Art. 196 MwStSystRL). Innergemeinschaftliche Lieferungen sind nach § 4 Nr. 1b i. V. m. § 6a UStG steuerfrei.';
    default:
      return lang === 'es'
        ? 'Inversión del sujeto pasivo: el destinatario debe autoliquidar el IVA (arts. 138 y 196 de la Directiva 2006/112/CE).'
        : 'Reverse charge — VAT to be accounted for by the recipient (Articles 138 and 196 of Council Directive 2006/112/EC).';
  }
}

/**
 * Menciones que la ley FRANCESA exige en toda factura entre profesionales
 * (art. L441-9 y L441-10 del Code de commerce): la tasa de penalización por
 * retraso, la indemnización fija de 40 € por gastos de cobro y las condiciones
 * de descuento por pronto pago. Sin ellas la factura es sancionable aunque el
 * importe sea correcto. La tasa que se imprime es la SUPLETORIA de la ley (BCE
 * + 10 puntos), que es la que aplica cuando el contrato no fija otra.
 */
/**
 * Franquicia de IVA de pequeñas empresas. La mención es obligatoria en la
 * factura (FR: CGI art. 242 nonies A; DE: § 19 UStG) y va en el idioma de la
 * ley, no en el del documento: es lo que la autoridad y el cliente buscan.
 */
export function smallBusinessNotice(issuerCountry: string): string | null {
  const cc = issuerCountry.toUpperCase();
  if (cc === 'FR') return 'TVA non applicable, art. 293 B du CGI.';
  if (cc === 'DE') return 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.';
  return null;
}

const FR_B2B_NOTICE = "En cas de retard de paiement, pénalités au taux d'intérêt de la BCE majoré de 10 points et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 du Code de commerce). Pas d'escompte pour paiement anticipé.";

/**
 * Fecha de calendario (`date` de Postgres, sin hora). El driver la entrega
 * como un Date a medianoche LOCAL del proceso; se rearma en UTC con sus
 * componentes locales (mismo criterio que `venceDia()`) y se formatea en UTC,
 * para que ninguna zona horaria la corra un día.
 */
function calendarDate(value: string | Date): Date {
  if (value instanceof Date) return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const parsed = new Date(value);
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

function validTimeZone(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
}

export function createInvoicePdf(input: InvoicePdfInput): Buffer {
  const appearance = resolveBrandProfile(input.brandProfile);
  const fontFamily = appearance.font === 'editorial' ? 'serif' : 'sans';
  const measureText = (text:string,size:number,font:FontKey='regular') => measure(text,size,font,fontFamily);
  const truncateText = (text:string,width:number,size:number,font:FontKey='regular') => truncate(text,width,size,font,fontFamily);
  const wrapText = (text:string,width:number,size:number,font:FontKey='regular') => wrap(text,width,size,font,fontFamily);
  const corner = {precise:0,soft:5,round:10}[appearance.corners];
  const profile = getCountryProfile(input.countryCode);
  const lang = docLangFor(profile.locale);
  const tx = (key: keyof typeof PDF_TEXT) => PDF_TEXT[key][lang];
  const timeZone = validTimeZone(input.timeZone);

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
  // La expedición es un INSTANTE: se imprime en el día del emisor.
  const fmtDate = (value: string | Date | null | undefined) => (value
    ? new Intl.DateTimeFormat(profile.locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone })
      .format(new Date(value))
    : '—');
  // El vencimiento es una FECHA de calendario: se imprime tal cual, en UTC.
  // Versión corta para la franja de datos clave: ahí cada dato tiene un cuarto
  // del ancho, y "15 de septiembre de 2026" se cortaba a "15 de septiembre d…".
  const fmtCalendarShort = (value: string | Date | null | undefined) => (value
    ? new Intl.DateTimeFormat(profile.locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
      .format(calendarDate(value))
    : '—');

  const brand = hexToRgb(input.brandColor, [10, 25, 47]);
  const onBrand = hexToRgb(onBrandColor(input.brandColor || '#0a192f'),WHITE);
  const secondary = hexToRgb(input.brandSecondary,brand);
  const logo = prepareImage(input.logo);

  const doc = new PdfDocument({ width: PAGE_W, height: PAGE_H, fontFamily });
  const contentW = PAGE_W - MARGIN * 2;

  // ── Cabecera de marca ──────────────────────────────────────────────────────
  const HEADER_H = 104;
  const contrast = appearance.header === 'contrast';
  const headerInk = contrast ? onBrand : INK;
  doc.rect(0, 0, PAGE_W, HEADER_H, { fill: contrast ? brand : appearance.header === 'soft' ? tint(secondary,.9) : WHITE });
  if (appearance.header === 'classic') doc.line(MARGIN,HEADER_H,MARGIN+contentW,HEADER_H,{color:brand,width:2});

  if (logo) {
    const { w, h } = PdfDocument.fit(logo,160,{small:30,medium:42,large:60}[appearance.logoSize]);
    doc.image(logo, MARGIN, (HEADER_H-h)/2, w, h);
  } else {
    // Sin logo, el nombre del negocio ES la marca: se ENCOGE para caber entero
    // antes de recortarse. "Distribuidora Peñafiel y Asociados S.A. de C.V."
    // cortado a "Distribuidora Peñafiel y Asociados…" se lee como un error.
    const name = input.issuer.legalName || '—';
    const maxW = PAGE_W - MARGIN - 240;
    const size = [17, 15, 13, 11.5].find((candidate) => measureText(name, candidate, 'bold') <= maxW) ?? 11.5;
    doc.text(truncateText(name, maxW, size, 'bold'), MARGIN, 52, {
      size, font: 'bold', color: headerInk,
    });
  }

  const headRight = PAGE_W - MARGIN - 220;
  doc.text(input.documentType === 'proforma' ? tx('proforma') : input.creditNoteOfNumber ? tx('creditNote') : tx('invoice'), headRight, 42, {
    size: 9, font: 'bold', color: headerInk, align: 'right', width: 220, tracking: 2.4,
  });
  doc.text(truncateText(input.invoiceNumber, 220, 19, 'bold'), headRight, 66, {
    size: 19, font: 'bold', color: headerInk, align: 'right', width: 220,
  });
  doc.text(fmtDate(input.issuedAt), headRight, 84, {
    size: 8.5, color: headerInk, align: 'right', width: 220,
  });

  let y = HEADER_H + 26;

  // ── Aviso de documento de prueba ───────────────────────────────────────────
  // Va antes que nada: una factura de prueba nunca puede confundirse con una real.
  if (input.simulated) {
    doc.rect(MARGIN, y, contentW, 26, { fill: WARN_BG, radius: 5 });
    doc.text(
      tx('testDoc'),
      MARGIN, y + 17, { size: 8.5, font: 'bold', color: WARN, align: 'center', width: contentW, tracking: 0.8 },
    );
    y += 40;
  }
  // Una factura anulada se sigue pudiendo descargar desde la app (es parte del
  // historial), pero antes salía idéntica a una vigente: el mismo PDF podía
  // reenviarse y cobrarse.
  if (input.voided) {
    doc.rect(MARGIN, y, contentW, 26, { fill: WARN_BG, radius: 5 });
    doc.text(
      tx('voided'),
      MARGIN, y + 17, { size: 8.5, font: 'bold', color: WARN, align: 'center', width: contentW, tracking: 0.8 },
    );
    y += 40;
  }

  // ── Verifactu: QR tributario al principio de la primera página ─────────────
  // Orden HAC/1177/2024 y especificación del QR de la AEAT: el código mide
  // entre 30 y 40 mm, lleva "QR tributario:" encima y la leyenda debajo, en un
  // cuerpo no menor que el del documento, y va al principio de la factura y
  // solo en la primera página. Antes medía 64 pt (≈ 23 mm) y vivía junto a
  // los totales. Margen blanco alrededor: 6 mm, el recomendado.
  if (input.verifactu?.qrUrl) {
    const qrSize = mmAPuntos(32);
    const clear = mmAPuntos(VERIFACTU_QR_PRESENTACION.margenRecomendadoMm);
    const blockW = Math.max(qrSize, 190);
    const label = input.verifactu.etiquetaQr || VERIFACTU_QR_PRESENTACION.etiquetaSuperior;
    doc.text(label, MARGIN, y + 2, { size: 9, font: 'bold', color: INK, align: 'center', width: blockW });
    const qrTop = y + 12 + clear / 2;
    drawQr(doc, input.verifactu.qrUrl, MARGIN + (blockW - qrSize) / 2, qrTop, qrSize);
    let ly = qrTop + qrSize + clear / 2 + 10;
    for (const line of wrapText(input.verifactu.leyenda || VERIFACTU_QR_PRESENTACION.leyendaInferior, blockW, 9)) {
      doc.text(line, MARGIN, ly, { size: 9, color: INK, align: 'center', width: blockW });
      ly += 11.5;
    }
    y = ly + clear;
  }

  // ── Emisor y cliente, en dos columnas ──────────────────────────────────────
  const colW = (contentW - 28) / 2;
  const colRight = MARGIN + colW + 28;
  doc.text(tx('from'), MARGIN, y, { size: 7, font: 'bold', color: MUTED, tracking: 1.2 });
  doc.text(tx('billTo'), colRight, y, { size: 7, font: 'bold', color: MUTED, tracking: 1.2 });
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
      // Número de QST (Quebec): sin él, el cliente no recupera la QST.
      ...(p.extraTaxIds ?? []).map((x) => `${lang === 'fr' ? 'TVQ' : 'QST'}: ${x.value}`),
      p.contactName || '',
      ...addressLines(p, lang),
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
  if (input.creditNoteOfNumber) facts.push({ k: tx('corrects'), v: input.creditNoteOfNumber });
  if (input.serviceDate && input.serviceDateEnd) {
    facts.push({ k: tx('servicePeriod'), v: `${fmtCalendarShort(input.serviceDate)} – ${fmtCalendarShort(input.serviceDateEnd)}` });
  } else if (input.serviceDate) {
    facts.push({ k: tx('serviceDate'), v: fmtCalendarShort(input.serviceDate) });
  } else if (String(input.issuer.address?.countryCode || input.countryCode).toUpperCase() === 'DE' && !input.creditNoteOfNumber) {
    facts.push({ k: tx('serviceDate'), v: tx('sameAsInvoiceDate') });
  }
  if (input.dueDate) facts.push({ k: tx('dueDate'), v: fmtCalendarShort(input.dueDate) });
  if (input.paymentTermsCode) facts.push({ k: tx('terms'), v: termText(input.paymentTermsCode, lang) });
  facts.push({ k: tx('currency'), v: currency });
  if (input.reference) facts.push({ k: tx('reference'), v: input.reference });

  // Más de cuatro datos van en dos filas: en una sola, cada uno tenía una
  // sexta parte del ancho y un dato legal ("entspricht dem Rechnungsdatum",
  // un periodo de prestación) salía cortado. Antes de cortar, se achica.
  const FACT_H = 42;
  const perRow = facts.length <= 4 ? facts.length : Math.ceil(facts.length / 2);
  for (let start = 0; start < facts.length; start += perRow) {
    const row = facts.slice(start, start + perRow);
    doc.rect(MARGIN, y, contentW, FACT_H, { fill: tint(brand, 0.93), radius: 6 });
    const slot = contentW / perRow;
    row.forEach((fact, index) => {
      const x = MARGIN + slot * index + 14;
      const w = slot - 28;
      const size = [9.5, 8.5, 7.5].find((candidate) => measureText(fact.v, candidate, 'bold') <= w) ?? 7.5;
      doc.text(fact.k.toUpperCase(), x, y + 17, { size: 6.6, font: 'bold', color: MUTED, tracking: 0.9 });
      doc.text(truncateText(fact.v, w, size, 'bold'), x, y + 31, { size, font: 'bold', color: INK });
    });
    y += FACT_H + (start + perRow < facts.length ? 8 : 24);
  }

  // ── Tabla de conceptos ─────────────────────────────────────────────────────
  const COLS: { title: string; width: number; align: Align }[] = [
    { title: tx('description'), width: contentW - 262, align: 'left' },
    { title: tx('qty'), width: 44, align: 'right' },
    { title: tx('unitPrice'), width: 78, align: 'right' },
    // El nombre real del impuesto del país ('IVA', 'VAT', 'Sales tax'…), no un
    // "Tax" genérico — una factura española decía "Impuesto 21%" en la tabla
    // y "IVA" en el editor de origen; ahora dicen lo mismo.
    { title: truncateText(profile.taxLabel, 58, 6.8, 'bold'), width: 58, align: 'right' },
    { title: tx('amount'), width: 82, align: 'right' },
  ];
  const colX = (index: number) => MARGIN + COLS.slice(0, index).reduce((sum, c) => sum + c.width, 0);
  const PAD = appearance.density === 'compact' ? 5 : 8;
  const LINE_H = 12;
  const HEAD_H = 26;

  const drawTableHead = (top: number): number => {
    doc.rect(MARGIN, top, contentW, HEAD_H, { fill: tint(secondary, 0.87), radius: corner });
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
  // Un renglón por IMPUESTO, no por tasa: en Canadá un 14.975% son dos
  // impuestos (GST + QST) que el cliente recupera por separado, y la factura
  // los muestra así (src/lib/tax-components.ts). El resto de países conserva el
  // renglón por tasa con la etiqueta del país.
  const taxDisplay = taxRows.flatMap(([rate, bucket]) => {
    const partes = splitTaxBucket(input.countryCode, rate * 100, bucket.base, bucket.amount, {
      region: input.issuer.address?.region, lang, decimals,
    });
    if (!partes) return [{ label: `${profile.taxLabel} ${taxLabel(rate)}`, base: bucket.base, amount: bucket.amount }];
    return partes.map((p) => ({ label: `${p.nombre} ${fmtTaxPct(p.tasa)}`, base: bucket.base, amount: p.impuesto }));
  });
  const retenciones = (input.retenciones ?? []).filter((r) => Number(r.monto) > 0);
  const fxRate = Number(input.fxRate);
  const ledger = normalizeCurrency(input.ledgerCurrency ?? '', '');
  const hasFx = !!ledger && ledger !== currency && Number.isFinite(fxRate) && fxRate > 0;
  // Directiva de IVA, art. 230: en una factura en divisa extranjera, el
  // impuesto se expresa TAMBIÉN en la moneda nacional del emisor. El total
  // convertido no basta: es la cuota la que se declara.
  const issuerCountry = String(input.issuer.address?.countryCode || input.countryCode).toUpperCase();
  const taxInLedger = hasFx && isEuCountry(issuerCountry) && Number(input.taxTotal) > 0;
  const totalsH = 16 + (taxDisplay.length || 1) * 16 + (retenciones.length ? 16 : 0) + retenciones.length * 16 + 42 + (hasFx ? 26 : 0) + (taxInLedger ? 11 : 0);

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

  totalRow(tx('subtotal'), `${money(input.subtotal)} ${currency}`);
  if (taxDisplay.length) {
    for (const row of taxDisplay) {
      totalRow(`${row.label} · ${tx('base')} ${money(row.base)}`, `${money(row.amount)} ${currency}`, true);
    }
  } else if (Number(input.taxTotal) > 0) {
    totalRow(profile.taxLabel, `${money(input.taxTotal)} ${currency}`, true);
  }
  // Una retención se RESTA: va junto a los impuestos pero con el signo a la
  // vista, porque apunta en dirección contraria (regla 20 de estándares
  // aplicada a dinero — la posición sola no distingue suma de resta).
  // Con retenciones, el "importe total de la factura" (base + impuestos, el que
  // declara Verifactu y lleva el QR) y lo que se paga son números distintos, y
  // la factura los muestra por separado (FAQ de desarrolladores de la AEAT).
  if (retenciones.length) {
    totalRow(tx('invoiceTotal'), `${money(Number(input.subtotal) + Number(input.taxTotal))} ${currency}`);
  }
  for (const r of retenciones) {
    totalRow(r.nombre, `−${money(r.monto)} ${currency}`, true);
  }

  // El total va en el color de la marca: es el número que todos buscan primero.
  const TOTAL_H = 36;
  doc.rect(totalsX, ty - 6, totalsW, TOTAL_H, { fill: brand, radius: corner });
  doc.text(retenciones.length ? tx('totalDue') : tx('total'), totalsX + 13, ty + 16, { size: 8, font: 'bold', color: onBrand, tracking: 1.3 });
  doc.text(`${money(input.total)} ${currency}`, totalsX, ty + 16, {
    size: 13, font: 'bold', color: onBrand, align: 'right', width: totalsW - 13,
  });
  ty += TOTAL_H + 6;

  if (hasFx) {
    const rateText = new Intl.NumberFormat(profile.locale, { maximumFractionDigits: 6 }).format(fxRate);
    doc.text(`${tx('exchangeRate')}: 1 ${currency} = ${rateText} ${ledger}`,
      totalsX, ty + 8, { size: 7.6, color: MUTED, align: 'right', width: totalsW });
    if (Number(input.ledgerTotal) > 0) {
      const ledgerTotal = new Intl.NumberFormat(profile.locale, {
        minimumFractionDigits: currencyDecimals(ledger), maximumFractionDigits: currencyDecimals(ledger),
        useGrouping: 'always',
      }).format(Number(input.ledgerTotal));
      doc.text(`${tx('totalIn')} ${ledger}: ${ledgerTotal}`,
        totalsX, ty + 19, { size: 7.6, color: MUTED, align: 'right', width: totalsW });
    }
    if (taxInLedger) {
      const decimals = currencyDecimals(ledger);
      const factor = 10 ** decimals;
      const taxLedger = Math.round((Number(input.taxTotal) * fxRate + Number.EPSILON) * factor) / factor;
      const text = new Intl.NumberFormat(profile.locale, {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: 'always',
      }).format(taxLedger);
      doc.text(`${profile.taxLabel} ${ledger}: ${text}`,
        totalsX, ty + 30, { size: 7.6, color: MUTED, align: 'right', width: totalsW });
      ty += 11;
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
  const recipientCountry = String(input.recipient.address?.countryCode || '').toUpperCase();
  const isIntraCommunity = isEuCountry(issuerCountry) && isEuCountry(recipientCountry)
    && issuerCountry !== recipientCountry && !!input.issuer.taxId && !!input.recipient.taxId
    && input.lines.some((l) => (Number(l.taxRate) || 0) === 0);
  // Francia, entre profesionales: el receptor con identificador fiscal es la
  // señal de B2B que tiene el documento.
  const frenchB2b = issuerCountry === 'FR' && !!input.recipient.taxId && input.documentType !== 'proforma';

  let by = totalsTop;

  // Franquicia: solo si el emisor estaba en el régimen al emitir (snapshot) y
  // el documento de verdad no cobra impuesto. Imprimirla junto a un IVA
  // repercutido sería contradecir el propio documento.
  const smallBusiness = input.issuer.vatRegime === 'small_business' && !(Number(input.taxTotal) > 0)
    ? smallBusinessNotice(issuerCountry) : null;
  const isCreditNote = !!input.creditNoteOfNumber || input.documentType === 'cfdi_egreso';
  // España: la factura cita el precepto de cada exención (RD 1619/2012, art.
  // 6.1.j) — una por causa elegida en los conceptos. Si ya va la mención de
  // operación intracomunitaria, las causas que esa mención cubre no se repiten.
  const exemptionNotes = issuerCountry === 'ES'
    ? [...new Set(input.lines.map((l) => l.exemptionReason).filter(isExemptionReason))]
      .filter((c) => !(isIntraCommunity && (c === 'E5' || c === 'N2' || c === 'S2')))
      .map((c) => EXEMPTION_INFO[c].mencion)
    : [];

  // ── Cómo pagar y notas, a la izquierda de los totales ──────────────────────
  const blocks = [
    input.paymentInstructions ? { title: tx('howToPay'), body: input.paymentInstructions } : null,
    smallBusiness ? { title: tx('legalNotice'), body: smallBusiness } : null,
    isIntraCommunity ? { title: tx('legalNotice'), body: reverseChargeNotice(issuerCountry, lang) } : null,
    exemptionNotes.length ? { title: tx('legalNotice'), body: exemptionNotes.join(' ') } : null,
    frenchB2b ? { title: tx('legalNotice'), body: FR_B2B_NOTICE } : null,
    input.documentNotes ? { title: isCreditNote ? tx('reason') : tx('notes'), body: input.documentNotes } : null,
    input.notes ? { title: tx('conditions'), body: input.notes } : null,
  ].filter(Boolean) as { title: string; body: string }[];

  if (blocks.length) {
    const blockW = contentW - totalsW - 28;
    // Sin espacio se sigue en otra página, nunca se corta: una mención legal
    // (franquicia, inversión del sujeto pasivo) que no se imprime invalida la
    // factura, y antes el bucle simplemente se detenía.
    for (const block of blocks) {
      if (by + 40 > BOTTOM_LIMIT) { doc.addPage(); by = MARGIN + 8; }
      doc.text(block.title.toUpperCase(), MARGIN, by, { size: 6.8, font: 'bold', color: MUTED, tracking: 1 });
      by += 13;
      for (const line of wrapText(block.body, blockW, 8.5)) {
        if (by > BOTTOM_LIMIT) { doc.addPage(); by = MARGIN + 8; }
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
  const disclaimer = input.documentType === 'proforma'
    ? tx('disclaimerProforma')
    : input.countryCode.toUpperCase() === 'MX' && ['cfdi_40', 'cfdi_egreso'].includes(input.documentType || 'cfdi_40')
    ? tx('disclaimerCfdi')
    : tx('disclaimerCommercial');

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
