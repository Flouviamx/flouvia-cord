// Datos de demo compartidos por los mockups de Interacción y Gestión
// (DmQuoteLink, DmQuoteMobileFlow, DmQuoteDetail, DmQuoteThread, DmQuotesIndex,
// DmHome, DmTasksWidget, DmClients, DmReports, DmNotifMatrix).
//
// Un solo universo para que las pantallas cuenten la misma historia: la cotización
// COT-0149 de Materiales del Valle para Constructora Apex aparece igual en el link
// del cliente, en el detalle del vendedor, en la lista y en el tablero.
// No es un módulo de la app: solo lo leen los mockups (no se registra en index.ts,
// que toma únicamente Dm*.astro).

import type { QuoteStatus } from '../../../lib/quote';
import type { DmLang } from './format';

const LOCALE: Record<DmLang, string> = { es: 'es-MX', en: 'en-US' };

/** Monto SIN decimales, como money(x, 0) de la app en listas y KPI: { value: '$412,300', code: 'MXN' }. */
export function money0Parts(amount: number, currency = 'MXN', lang: DmLang = 'es') {
    const value = new Intl.NumberFormat(LOCALE[lang], {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
    return { value, code: currency.toUpperCase() };
}

/** Monto sin decimales como texto plano con divisa: "$412,300 MXN". */
export function money0(amount: number, currency = 'MXN', lang: DmLang = 'es'): string {
    const { value, code } = money0Parts(amount, currency, lang);
    return `${value} ${code}`;
}

/** Fecha corta del negocio: "14 oct 2026" / "Oct 14, 2026". */
export function dmDate(iso: string, lang: DmLang, withYear = true): string {
    const d = new Date(`${iso}T12:00:00`);
    return new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
        .format(d)
        .replace('.', '');
}

/** Número con separadores del idioma. */
export function dmNum(n: number, lang: DmLang): string {
    return new Intl.NumberFormat(LOCALE[lang]).format(n);
}

/** "Hoy" del universo de demo. */
export const TODAY = '2026-10-08';

/** Miembro del equipo que atiende la cuenta (presencia en el link). */
export const SELLER = 'Ana Torres';

/** COT-0149: Materiales del Valle → Constructora Apex. Subtotal 42,000 + IVA 16 % = 48,720 MXN. */
export const Q149 = {
    folio: 'COT-0149',
    token: 'r4Lm8vQe',
    cliente: 'Constructora Apex',
    contacto: 'Luis Herrera',
    firmante: 'María García López',
    vigencia: '2026-10-14',
    creada: '2026-09-29',
    anticipoPct: 50,
    iva: 0.16,
    lines: [
        { es: 'Cemento gris CPC 30R · 50 kg', en: 'Gray cement CPC 30R · 50 kg', qty: 120, unit: { es: 'bulto', en: 'bag' }, list: 250, price: 235 },
        { es: 'Block de concreto 15 × 20 × 40 cm', en: 'Concrete block 15 × 20 × 40 cm', qty: 1500, unit: { es: 'pza', en: 'pc' }, list: 7.2, price: 7.2 },
        { es: 'Flete a obra · Querétaro', en: 'Delivery to site · Querétaro', qty: 1, unit: { es: 'servicio', en: 'service' }, list: 3000, price: 3000 },
    ],
} as const;

export const lineAmount = (l: { qty: number; price: number }) => l.qty * l.price;
export const q149Subtotal = (only?: number[]) =>
    Q149.lines.reduce((s, l, i) => (only && !only.includes(i) ? s : s + lineAmount(l)), 0);
export const q149Total = (only?: number[]) => Math.round(q149Subtotal(only) * (1 + Q149.iva) * 100) / 100;

/** Pipeline de la organización (lo comparten Lista, Tablero e Inicio). */
export type DmQuoteRow = { folio: string; cliente: string; status: QuoteStatus; total: number; terminos: { es: string; en: string }; vigencia: string };
const CONTADO = { es: 'Contado', en: 'Due on receipt' };
const NET30 = { es: 'Net 30', en: 'Net 30' };
const NET60 = { es: 'Net 60', en: 'Net 60' };

export const PIPELINE: DmQuoteRow[] = [
    { folio: 'COT-0155', cliente: 'Desarrollos Sierra Madre', status: 'draft', total: 38600, terminos: NET30, vigencia: '2026-10-23' },
    { folio: 'COT-0154', cliente: 'Grupo Edificador Norte', status: 'sent', total: 52300, terminos: NET30, vigencia: '2026-10-21' },
    { folio: 'COT-0153', cliente: 'Ferretera Industrial del Bajío', status: 'sent', total: 37120, terminos: CONTADO, vigencia: '2026-10-20' },
    { folio: 'COT-0152', cliente: 'Acabados Monterrey', status: 'approved', total: 10000, terminos: CONTADO, vigencia: '2026-10-16' },
    { folio: 'COT-0151', cliente: 'Constructora GAMA', status: 'sent', total: 61480, terminos: NET60, vigencia: '2026-10-17' },
    { folio: 'COT-0150', cliente: 'Inmobiliaria Altavista', status: 'draft', total: 19850, terminos: CONTADO, vigencia: '2026-10-22' },
    { folio: 'COT-0149', cliente: 'Constructora Apex', status: 'viewed', total: 48720, terminos: CONTADO, vigencia: '2026-10-14' },
    { folio: 'COT-0148', cliente: 'Distribuidora El Zarco', status: 'viewed', total: 196469.2, terminos: NET30, vigencia: '2026-10-12' },
    { folio: 'COT-0147', cliente: 'Constructora GAMA', status: 'paid', total: 128940, terminos: NET60, vigencia: '2026-09-30' },
    { folio: 'COT-0146', cliente: 'Grupo Edificador Norte', status: 'approved', total: 64380, terminos: NET30, vigencia: '2026-10-09' },
    { folio: 'COT-0145', cliente: 'Desarrollos Sierra Madre', status: 'sent', total: 35500, terminos: NET30, vigencia: '2026-10-13' },
    { folio: 'COT-0144', cliente: 'Distribuidora El Zarco', status: 'approved', total: 41620, terminos: NET30, vigencia: '2026-10-06' },
    { folio: 'COT-0143', cliente: 'Acabados Monterrey', status: 'paid', total: 22740, terminos: CONTADO, vigencia: '2026-09-28' },
    { folio: 'COT-0142', cliente: 'Inmobiliaria Altavista', status: 'invoiced', total: 87310, terminos: NET30, vigencia: '2026-09-26' },
    { folio: 'COT-0141', cliente: 'Ferretera Industrial del Bajío', status: 'approved', total: 52000, terminos: CONTADO, vigencia: '2026-10-04' },
    { folio: 'COT-0140', cliente: 'Constructora Apex', status: 'paid', total: 74215.5, terminos: CONTADO, vigencia: '2026-09-24' },
    { folio: 'COT-0139', cliente: 'Constructora GAMA', status: 'approved', total: 20000, terminos: NET60, vigencia: '2026-10-02' },
    { folio: 'COT-0138', cliente: 'Grupo Edificador Norte', status: 'draft', total: 12800, terminos: NET30, vigencia: '2026-10-19' },
];

/** Conteos de la organización completa (34 cotizaciones; la lista solo pinta las primeras filas). */
export const COUNTS = { all: 34, open: 9, approval: 2, approved: 5, paid: 14, closed: 6 } as const;

/** Totales por columna del tablero, sobre las 34 cotizaciones. Abiertas = 9: 3 borradores, 4 enviadas, 2 vistas. */
export const BOARD_TOTALS: Record<'draft' | 'sent' | 'viewed' | 'approved' | 'paid', { n: number; total: number }> = {
    draft: { n: 3, total: 71250 },
    sent: { n: 4, total: 186400 },
    viewed: { n: 2, total: 245189.2 },
    approved: { n: 5, total: 188000 },
    paid: { n: 14, total: 1086420 },
};

export const OPEN_VALUE = BOARD_TOTALS.draft.total + BOARD_TOTALS.sent.total + BOARD_TOTALS.viewed.total;
