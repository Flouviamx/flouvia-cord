import { countryName, getCountryProfile } from '../countries';
import { createTextPdf } from '../simple-pdf';
import type { FiscalLineItem, FiscalParty } from './index';

interface InvoicePdfInput {
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
}

function address(party: FiscalParty): string {
  const value = party.address;
  if (!value) return '';
  return [value.line1, value.line2, value.city, value.region, value.postalCode, value.countryCode]
    .filter(Boolean)
    .join(', ');
}

export function createInvoicePdf(input: InvoicePdfInput): Buffer {
  const profile = getCountryProfile(input.countryCode);
  const locale = profile.locale.startsWith('es') ? 'es' : 'en';
  const isSpanish = locale === 'es';
  const formatMoney = (value: number) => new Intl.NumberFormat(profile.locale, {
    style: 'currency',
    currency: input.currency,
    currencyDisplay: 'code',
  }).format(value);
  const date = input.issuedAt
    ? new Intl.DateTimeFormat(profile.locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(input.issuedAt))
    : '—';
  const title = `${isSpanish ? 'Factura comercial' : 'Commercial invoice'} ${input.invoiceNumber}`;
  const values: unknown[] = [
    input.simulated ? (isSpanish ? 'DOCUMENTO DE PRUEBA - SIN VALIDEZ FISCAL' : 'TEST DOCUMENT - NOT VALID FOR TAX PURPOSES') : '',
    `${isSpanish ? 'Fecha de emisión' : 'Issue date'}: ${date}`,
    `${isSpanish ? 'País de emisión' : 'Issuing country'}: ${countryName(input.countryCode, locale)}`,
    '',
    isSpanish ? 'EMISOR' : 'ISSUER',
    input.issuer.legalName,
    input.issuer.taxId ? `${profile.taxIdLabel}: ${input.issuer.taxId}` : '',
    input.issuer.email || '',
    address(input.issuer),
    '',
    isSpanish ? 'CLIENTE' : 'BILL TO',
    input.recipient.legalName,
    input.recipient.taxId ? `${isSpanish ? 'Identificación fiscal' : 'Tax ID'}: ${input.recipient.taxId}` : '',
    input.recipient.email || '',
    address(input.recipient),
    '',
    isSpanish ? 'CONCEPTOS' : 'LINE ITEMS',
    ...input.lines.flatMap((line, index) => [
      `${index + 1}. ${line.description}`,
      `   ${line.quantity} x ${formatMoney(line.unitPrice)} = ${formatMoney(line.subtotal)} | ${isSpanish ? 'Impuesto' : 'Tax'} ${moneyPercent(line.taxRate)}: ${formatMoney(line.taxAmount)}`,
    ]),
    '',
    `${isSpanish ? 'Subtotal' : 'Subtotal'}: ${formatMoney(input.subtotal)}`,
    `${isSpanish ? 'Impuestos' : 'Tax'}: ${formatMoney(input.taxTotal)}`,
    `${isSpanish ? 'Total' : 'Total'}: ${formatMoney(input.total)}`,
    '',
    isSpanish
      ? 'Documento comercial emitido por Cord. No representa por sí solo una transmisión, autorización o timbrado ante la autoridad fiscal local.'
      : 'Commercial document issued by Cord. It does not by itself represent submission, clearance, or stamping by the local tax authority.',
  ].filter((value, index, all) => value !== '' || all[index - 1] !== '');

  return createTextPdf(title, values);
}

function moneyPercent(rate: number): string {
  return `${Math.round(rate * 10000) / 100}%`;
}
