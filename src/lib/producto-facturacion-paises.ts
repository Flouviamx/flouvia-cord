// Datos y copy de dos secciones de /producto/facturacion (ES y EN):
//
//   · InvoicingCountries.astro  — "Cobra en los 12 países": una pestaña por
//     país con la calca de la página pública de la factura (/i/[token]).
//   · InvoicingFiscalMatrix.astro — "La factura con validez fiscal en cada
//     país": la matriz de los 12 países y la calca del panel "Factura
//     electrónica" del detalle de factura.
//
// Regla de este archivo: nada que el código ya sepa se escribe dos veces. Los
// países, las divisas, los rieles, los métodos, los impuestos con que nace una
// cuenta, la forma de la cuenta de depósito, el idioma del PDF, los totales y
// el ESTADO de cada riel fiscal se derivan de su fuente (comentada junto a cada
// dato). Lo único escrito a mano es el copy de marketing y los datos de demo
// (negocios, clientes y conceptos), que son ficción plausible por definición.
//
// Un estado se lee de `roadmapData` por slug: mover una iniciativa a `live`
// actualiza esta página sin tocarla, y un slug que deje de existir rompe el
// build en vez de dejar un estado viejo publicado.

import {
    SUPPORTED_COUNTRIES, countryName, getCountryProfile, hasOnlinePaymentRail,
    isEuCountry, supportsMercadoPago, supportsOnlinePayments, taxPresetsFor,
    taxRoundingFor, US_STATE_TAX, type SupportedCountry,
} from './countries';
import { OFFERED_CURRENCIES, currencyDecimals } from './currency';
import { payoutSpecFor, type PayoutFormat } from './payout-fields';
import { DOMICILIACION, metodosPara, speiDisponible } from './cobros/metodos';
import { roadmapData } from './roadmap-data';
import { docHref, findItem } from './docs-nav';
import { docLangFor } from './fiscal/invoice-pdf';
import { taxDisplayRows, fmtTaxPct } from './tax-components';
import { publicInvoiceGuidance, publicInvoicePayability, publicInvoiceContact } from './fiscal/public-invoice-state';
import { EINVOICE_LABELS } from './fiscal/einvoice/server';
import { EN16931_FORMATS } from './fiscal/einvoice/model';
import { calculateDocumentTotals } from '../../packages/elements/src/engine';

export type Lang = 'es' | 'en';
type L2 = { es: string; en: string };
const pick = (s: L2, lang: Lang) => s[lang];

// ── Estado de una iniciativa, leído del roadmap ─────────────────────────────
// src/lib/roadmap-data.ts es la fuente única. live = funciona sin activación;
// beta = construido, se enciende por país o con configuración de Flouvia;
// next = no construido o espera algo externo (docs/estado/landing.md).
export type Estado = 'live' | 'beta' | 'next';

export function estadoDe(slug: string): Estado {
    const item = roadmapData.find((i) => i.slug === slug);
    if (!item) throw new Error(`producto-facturacion-paises: el roadmap no tiene la iniciativa "${slug}"`);
    return item.status;
}

// Vocabulario de los docs públicos (pagos/paises/resumen.mdx: "Cómo leer el estado").
export const ESTADO_LABEL: Record<Estado, L2> = {
    live: { es: 'Disponible', en: 'Available' },
    beta: { es: 'En activación', en: 'Being activated' },
    next: { es: 'Próximamente', en: 'Coming soon' },
};

// ── Enlaces a docs.cordhq.app ───────────────────────────────────────────────
// Rutas reales de src/lib/docs-nav.ts; `findItem` hace fallar el build si una
// deja de existir (ya hubo 404 silenciosos por slugs inventados).
const DOCS_ORIGIN = 'https://docs.cordhq.app';
export function docsUrl(slug: string, lang: Lang): string {
    if (!findItem(slug)) throw new Error(`producto-facturacion-paises: docs-nav no tiene "${slug}"`);
    return `${DOCS_ORIGIN}${docHref(slug, lang)}`;
}

const COUNTRY_DOCS: Record<SupportedCountry, string> = {
    MX: 'pagos/paises/mexico', US: 'pagos/paises/estados-unidos', CA: 'pagos/paises/canada',
    BR: 'pagos/paises/brasil', ES: 'pagos/paises/espana', GB: 'pagos/paises/reino-unido',
    DE: 'pagos/paises/alemania', FR: 'pagos/paises/francia', CO: 'pagos/paises/colombia',
    AR: 'pagos/paises/argentina', CL: 'pagos/paises/chile', PE: 'pagos/paises/peru',
};

// ── Formato ─────────────────────────────────────────────────────────────────
// Importes: la regla de `moneyIn()` (src/lib/fmt-server.ts), que es la que usan
// la app y el link público: separadores del idioma de la interfaz (es-MX /
// en-US), divisa del documento y sus decimales (`currencyDecimals`, regla 21).
export function fmtMoney(n: number, currency: string, lang: Lang): string {
    const decimals = currencyDecimals(currency);
    return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-MX', {
        style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(n);
}

// Fechas: `fmtCalendarDate()` de src/lib/fmt-server.ts con el locale de FORMATO
// del país del negocio (`getFacturaByToken` fija `setRequestFormatLocale` con
// `getCountryProfile(pais).locale`), sin el primer punto de la abreviatura.
export function fmtDay(iso: string, country: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(getCountryProfile(country).locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(Date.UTC(y, m - 1, d))).replace('.', '');
}

// ── Métodos de cobro ────────────────────────────────────────────────────────
// Registro único de lo que muestra la sección. Agregar un método es UNA línea:
// `paises` y `roadmap` deciden en qué pestañas aparece y con qué estado, y
// `superficie` dónde lo dibuja la calca de /i cuando su estado es `live`:
//   · 'formulario' — pestaña del formulario de pago (Payment Element);
//   · 'selector'   — el selector "Tarjeta / Transferencia SPEI" de la página;
//   · 'boton'      — botón propio que redirige (Mercado Pago).
export interface Metodo {
    key: string;
    label: L2;
    /** Etiqueta dentro del formulario de pago, si se cobra ahí. */
    formulario?: L2;
    paises: readonly string[];
    roadmap: string;
    superficie: 'formulario' | 'selector' | 'boton';
}

export const METODOS: Metodo[] = [
    // Tarjeta: Cord Payments abre cuentas en estos países (CONNECT_COUNTRIES, countries.ts).
    { key: 'card', label: { es: 'Tarjeta', en: 'Card' }, formulario: { es: 'Tarjeta', en: 'Card' },
        paises: SUPPORTED_COUNTRIES.filter(supportsOnlinePayments), roadmap: 'cord-payments', superficie: 'formulario' },
    // SPEI con la CLABE de la factura: `speiDisponible` (cobros/metodos.ts) lo
    // acota a cuentas de México en MXN. En beta en el roadmap ('spei-facturas').
    { key: 'spei', label: { es: 'Transferencia SPEI', en: 'SPEI transfer' },
        paises: SUPPORTED_COUNTRIES.filter((c) => speiDisponible({ pais: c, cobroSpeiAuto: true, capacidades: {} }, getCountryProfile(c).currency)),
        roadmap: 'spei-facturas', superficie: 'selector' },
    // Mercado Pago: MERCADOPAGO_COUNTRIES (countries.ts). Redirige a su checkout:
    // Cord no lista sus métodos internos.
    { key: 'mercadopago', label: { es: 'Mercado Pago', en: 'Mercado Pago' },
        paises: SUPPORTED_COUNTRIES.filter(supportsMercadoPago), roadmap: 'cord-payments', superficie: 'boton' },
    // Domiciliación: DOMICILIACION (src/lib/cobros/metodos.ts). Construida y en
    // beta en el roadmap ('domiciliacion-sepa-ach').
    { key: 'sepa_debit', label: { es: 'Domiciliación SEPA', en: 'SEPA Direct Debit' }, formulario: { es: 'Débito SEPA', en: 'SEPA Debit' },
        paises: DOMICILIACION.sepa_debit.paises, roadmap: 'domiciliacion-sepa-ach', superficie: 'formulario' },
    { key: 'us_bank_account', label: { es: 'Cargo ACH', en: 'ACH Direct Debit' }, formulario: { es: 'Cuenta bancaria', en: 'US bank account' },
        paises: DOMICILIACION.us_bank_account.paises, roadmap: 'domiciliacion-sepa-ach', superficie: 'formulario' },
];

const PAYOUT_LABEL: Partial<Record<PayoutFormat, L2>> = {
    clabe: { es: 'Cuenta CLABE', en: 'CLABE account' },
    iban: { es: 'Cuenta IBAN', en: 'IBAN account' },
    us_aba: { es: 'Routing + cuenta', en: 'Routing + account' },
    gb_sort: { es: 'Sort code + cuenta', en: 'Sort code + account' },
    ca_transit: { es: 'Transit + institución + cuenta', en: 'Transit + institution + account' },
    br_bank: { es: 'Banco + agência + conta', en: 'Bank + agência + conta' },
};

// ── Formulario de tarjeta (Payment Element) ─────────────────────────────────
// /i/[token] crea el formulario con `stripe.elements({ clientSecret })` sin
// `locale`, así que el proveedor usa su default `auto`: el idioma del NAVEGADOR
// de quien paga. La calca supone el idioma del país del negocio. Estos textos
// son los del proveedor (no viven en este repo).
interface PeText { number: string; expiry: string; expiryPh: string; cvc: string; country: string; postal?: string; postalPh?: string }
const PE_TEXT: Record<string, PeText> = {
    'es-419': { number: 'Número de tarjeta', expiry: 'Fecha de vencimiento', expiryPh: 'MM / AA', cvc: 'Código de seguridad', country: 'País' },
    es: { number: 'Número de tarjeta', expiry: 'Fecha de caducidad', expiryPh: 'MM / AA', cvc: 'Código de seguridad', country: 'País' },
    en: { number: 'Card number', expiry: 'Expiration date', expiryPh: 'MM / YY', cvc: 'Security code', country: 'Country' },
    'en-GB': { number: 'Card number', expiry: 'Expiry date', expiryPh: 'MM / YY', cvc: 'Security code', country: 'Country' },
    de: { number: 'Kartennummer', expiry: 'Ablaufdatum', expiryPh: 'MM / JJ', cvc: 'Sicherheitscode', country: 'Land' },
    fr: { number: 'Numéro de carte', expiry: "Date d'expiration", expiryPh: 'MM / AA', cvc: 'Code de sécurité', country: 'Pays' },
    'pt-BR': { number: 'Número do cartão', expiry: 'Data de validade', expiryPh: 'MM / AA', cvc: 'Código de segurança', country: 'País' },
};
// El proveedor pide código postal con la tarjeta en EE. UU., Reino Unido y Canadá.
const PE_POSTAL: Partial<Record<string, { label: string; ph: string }>> = {
    US: { label: 'ZIP code', ph: '12345' },
    GB: { label: 'Postal code', ph: 'WS11 1DB' },
    CA: { label: 'Postal code', ph: 'M5T 1T4' },
};
function peText(country: string): PeText & { locale: string } {
    const locale = getCountryProfile(country).locale;
    const key = locale === 'es-ES' ? 'es' : locale.startsWith('es') ? 'es-419'
        : locale === 'en-GB' ? 'en-GB' : locale.startsWith('en') ? 'en'
        : locale.startsWith('pt') ? 'pt-BR' : locale.slice(0, 2);
    const base = PE_TEXT[key] ?? PE_TEXT.en;
    const postal = PE_POSTAL[country];
    return { ...base, ...(postal ? { postal: postal.label, postalPh: postal.ph } : {}), locale };
}

// ── Facturas de demostración ────────────────────────────────────────────────
// Ficción plausible: el mismo giro (materiales de construcción) en los 12
// países. México es la factura A-001048 que ya cuenta el hero de esta página
// (Materiales del Valle → Distribuidora El Zarco, dos abonos). EE. UU., Reino
// Unido, Francia y Perú reutilizan los negocios de FA_DOCS (BlockMockup.astro).
// Los identificadores fiscales pasan `checkTaxId` salvo los RFC de México, que
// son los de demo que ya usa el resto de la landing.
interface Demo {
    org: string; legal: string; color: string; email: string; tel: string; taxId: string;
    client: string; clientTaxId: string;
    prefix: string; seq: number; issued: string; due: string;
    /** Tasa del concepto como fracción (`cotizacion_items.tax_rate`). */
    rate: number;
    /** Provincia del emisor: decide el desglose de Canadá. */
    region?: string;
    lines: [string, number, number][];
    pagos?: [string, number][];
    /** UUID del CFDI (México): habilita "Descargar XML" y el folio fiscal. */
    fiscalId?: string;
}

const DEMO: Record<SupportedCountry, Demo> = {
    MX: { org: 'Materiales del Valle', legal: 'Materiales del Valle S.A. de C.V.', color: '#0a192f', email: 'ventas@materialesdelvalle.mx', tel: '+52 81 8340 2210', taxId: 'MVA240611AB3',
        client: 'Distribuidora El Zarco S.A. de C.V.', clientTaxId: 'DEZ981123QX1', prefix: 'A', seq: 1048, issued: '2026-09-12', due: '2026-10-12', rate: 0.16,
        lines: [['Cemento gris 50kg', 120, 182], ['Varilla corrugada 3/8"', 340, 168.5], ['Block hueco 15×20×40', 2400, 14.2], ['Arena de río m³', 180, 312]],
        pagos: [['2026-09-15', 60000], ['2026-09-27', 40000]], fiscalId: '5E2F9C1A-7B34-4D0E-9A61-3C8B2D4F7E10' },
    US: { org: 'Materiales del Valle USA', legal: 'Materiales del Valle USA LLC', color: '#1f3a5f', email: 'billing@mdvalle-usa.com', tel: '+1 956 724 3180', taxId: '88-4172093',
        client: 'Ridgeline Builders LLC', clientTaxId: '47-2918305', prefix: 'INV', seq: 214, issued: '2026-09-18', due: '2026-10-18', rate: 0.0625,
        lines: [['Portland cement, 94 lb bag', 120, 16.4], ['Rebar #3, 20 ft', 340, 9.85], ['Concrete block 8×8×16', 2400, 2.35]] },
    CA: { org: 'Matériaux Laurentides', legal: 'Matériaux Laurentides inc.', color: '#7a2e2e', email: 'facturation@materiauxlaurentides.ca', tel: '+1 514 382 6610', taxId: '812345676 RT0001',
        client: 'Construction Boréal ltée', clientTaxId: '784512360 RT0001', prefix: 'INV', seq: 76, issued: '2026-09-18', due: '2026-10-18', rate: 0.14975, region: 'QC',
        lines: [['Ciment Portland 30 kg', 160, 12.9], ["Barre d'armature 10M × 6 m", 280, 14.75], ['Bloc de béton 20 cm', 1800, 3.1]] },
    BR: { org: 'Materiais Serra Azul', legal: 'Materiais Serra Azul Ltda.', color: '#14532d', email: 'financeiro@serraazul.com.br', tel: '+55 11 3045 7781', taxId: '11.222.333/0001-81',
        client: 'Construtora Horizonte S.A.', clientTaxId: '45.987.123/0001-04', prefix: 'INV', seq: 391, issued: '2026-09-18', due: '2026-10-18', rate: 0,
        lines: [['Cimento CP II 50 kg', 200, 38.9], ['Vergalhão CA-50 10 mm × 12 m', 150, 62.4], ['Bloco de concreto 14×19×39', 3000, 3.85]] },
    ES: { org: 'Materiales Levante', legal: 'Materiales Levante S.L.', color: '#7c2d12', email: 'administracion@materialeslevante.es', tel: '+34 963 51 27 40', taxId: 'B98765431',
        client: 'Construcciones Turia S.A.', clientTaxId: 'A46123451', prefix: 'INV', seq: 187, issued: '2026-09-18', due: '2026-10-18', rate: 0.21,
        lines: [['Cemento gris 25 kg', 240, 6.85], ['Corrugado B500S Ø10 × 6 m', 180, 9.4], ['Bloque de hormigón 40×20×20', 1500, 1.18]] },
    GB: { org: 'Harlow Building Supplies', legal: 'Harlow Building Supplies Ltd', color: '#1e293b', email: 'accounts@harlowbs.co.uk', tel: '+44 113 496 0712', taxId: 'GB 284 1937 34',
        client: 'Kestrel Construction Ltd', clientTaxId: 'GB 519 2046 04', prefix: 'INV', seq: 87, issued: '2026-09-18', due: '2026-10-18', rate: 0.2,
        lines: [['Portland cement 25 kg', 200, 7.95], ['Rebar 10 mm × 6 m', 150, 11.2], ['Concrete block 440×215×100', 1500, 1.62]] },
    DE: { org: 'Baustoffe Rheinland', legal: 'Baustoffe Rheinland GmbH', color: '#0f3d3e', email: 'buchhaltung@baustoffe-rheinland.de', tel: '+49 221 9475 3300', taxId: 'DE287531942',
        client: 'Hansen Bau GmbH', clientTaxId: 'DE813456277', prefix: 'INV', seq: 418, issued: '2026-09-18', due: '2026-10-18', rate: 0.19,
        lines: [['Zement CEM II 25 kg', 220, 7.4], ['Betonstahl B500B Ø10, 6 m', 160, 10.9], ['Kalksandstein KS 24 × 11,5 × 11,3', 2000, 0.98]] },
    FR: { org: 'Matériaux Rhône', legal: 'Matériaux Rhône SAS', color: '#1e3a8a', email: 'comptabilite@materiaux-rhone.fr', tel: '+33 4 78 61 22 90', taxId: 'FR 44 832594014',
        client: 'Bâtiments Vercors SARL', clientTaxId: 'FR 34 519204309', prefix: 'INV', seq: 132, issued: '2026-09-18', due: '2026-10-18', rate: 0.2,
        lines: [['Ciment gris 35 kg', 180, 9.4], ['Fer à béton HA10, 6 m', 220, 12.8], ['Parpaing creux 20×20×50', 1200, 1.95]] },
    CO: { org: 'Ferretería Los Andes', legal: 'Ferretería Los Andes S.A.S.', color: '#713f12', email: 'cartera@ferreterialosandes.co', tel: '+57 601 744 2190', taxId: '901.234.567-7',
        client: 'Constructora Sabana S.A.S.', clientTaxId: '900.876.543-1', prefix: 'INV', seq: 266, issued: '2026-09-18', due: '2026-10-18', rate: 0.19,
        lines: [['Cemento gris 50 kg', 300, 32900], ['Varilla corrugada 1/2" × 6 m', 400, 28500], ['Bloque No. 5', 5000, 1350]] },
    AR: { org: 'Corralón del Plata', legal: 'Corralón del Plata S.R.L.', color: '#24477a', email: 'cobranzas@corralondelplata.com.ar', tel: '+54 11 4867 3302', taxId: '30-71234567-1',
        client: 'Constructora Pampa S.A.', clientTaxId: '30-70987654-2', prefix: 'INV', seq: 143, issued: '2026-09-18', due: '2026-10-18', rate: 0.21,
        lines: [['Cemento 50 kg', 200, 11850], ['Hierro aletado 10 mm × 12 m', 180, 14900], ['Ladrillo hueco 18×18×33', 3000, 780]] },
    CL: { org: 'Materiales Cordillera', legal: 'Materiales Cordillera SpA', color: '#7f1d1d', email: 'cobranza@materialescordillera.cl', tel: '+56 2 2945 6610', taxId: '76.543.210-3',
        client: 'Constructora Maipo Ltda.', clientTaxId: '77.123.456-9', prefix: 'INV', seq: 98, issued: '2026-09-18', due: '2026-10-18', rate: 0.19,
        lines: [['Cemento 25 kg', 300, 5490], ['Fierro estriado A630 10 mm', 200, 7990], ['Bloque de hormigón 14×19×39', 2500, 690]] },
    PE: { org: 'Ferretera Andina', legal: 'Ferretera Andina S.A.C.', color: '#6b2131', email: 'cobranzas@ferreteraandina.pe', tel: '+51 1 617 4420', taxId: '20548712301',
        client: 'Constructora Pachacámac S.A.', clientTaxId: '20601938406', prefix: 'INV', seq: 51, issued: '2026-09-18', due: '2026-10-18', rate: 0.18,
        lines: [['Cemento Portland tipo I, 42.5 kg', 300, 31.5], ['Fierro corrugado 1/2" × 9 m', 250, 47.9], ['Ladrillo King Kong 18 huecos', 4000, 1.25]] },
};

/** Folio como lo arma la emisión: prefijo (+ año en España) + '-' + 6 dígitos (src/lib/fiscal/emit.ts). */
function folio(code: string, d: Demo): string {
    const ejercicio = code === 'ES' ? d.issued.slice(0, 4) : '';
    return `${d.prefix}${ejercicio}-${String(d.seq).padStart(6, '0')}`;
}

// España: sin Verifactu activo el documento es proforma (roadmap
// 'facturacion-internacional': "el de España, una proforma").
const ES_PROFORMA = estadoDe('verifactu-espana') !== 'live';

// ── Pestaña de un país (InvoicingCountries) ─────────────────────────────────
export interface PaisCobro {
    code: SupportedCountry;
    name: string;
    flagCode: string;
    currency: string;
    metodos: { key: string; label: string; estado: Estado }[];
    payout: string[];
    pdfLang: string;
    docsUrl: string;
    /** La calca de /i/[token], ya resuelta con las funciones reales de la página. */
    iv: {
        color: string; org: string; legal: string; email: string; taxId: string; numero: string; titulo: string; proforma: boolean;
        cliente: string; clienteTaxId: string; taxIdLabel: string;
        saldo: string; emitida: string; vence: string; guidance: string; mailto: boolean; tel: boolean;
        lineas: { d: string; q: string; p: string; a: string }[];
        totales: { k: string; v: string; cls?: string }[];
        pagos: { cuando: string; monto: string }[];
        puedePagar: boolean; puedePagarMp: boolean;
        /** Selector "Tarjeta / Transferencia SPEI" de /i (`.iv-metodos`). */
        selector: boolean;
        descargas: string[]; fiscalId: string | null; currency: string;
        formulario: { tabs: string[]; text: PeText & { locale: string }; countryLabel: string } | null;
    };
}

// Textos de la página pública que no viven en src/i18n/app.ts: están escritos
// en línea en src/pages/i/[token].astro y se copian literal.
export const IV_LITERAL = {
    saldoPendiente: { es: 'Saldo pendiente', en: 'Balance due' },
    refrescar: { es: 'Actualizar saldo', en: 'Refresh balance' },
    escribir: { es: 'Escribir a la empresa', en: 'Email the business' },
    llamar: { es: 'Llamar a la empresa', en: 'Call the business' },
    desliza: { es: 'Desliza la tabla para ver todos los importes.', en: 'Swipe the table to see all amounts.' },
    proformaNota: { es: 'Documento comercial proforma. No sustituye una factura fiscal.', en: 'Pro forma commercial document. It does not replace a tax invoice.' },
} satisfies Record<string, L2>;

export function paisesCobro(lang: Lang, t: (key: any) => string): PaisCobro[] {
    return SUPPORTED_COUNTRIES.map((code) => {
        const d = DEMO[code];
        const profile = getCountryProfile(code);
        const currency = profile.currency;
        const decimals = currencyDecimals(currency);
        const money = (n: number) => fmtMoney(n, currency, lang);

        // Totales con el motor único (regla 23) y el redondeo del país.
        const totals = calculateDocumentTotals(
            d.lines.map(([descripcion, cantidad, precio]) => ({ descripcion, cantidad, precio_unitario: precio, tax_rate: d.rate })),
            { roundLines: decimals, taxRounding: taxRoundingFor(code) },
        );
        const pagado = (d.pagos ?? []).reduce((s, [, m]) => s + m, 0);
        const saldo = Math.round((totals.total - pagado) * 10 ** decimals) / 10 ** decimals;

        // Renglones de impuesto exactamente como /i: `taxDisplayRows` (Canadá
        // desglosa GST y QST) y, si devuelve null, un solo renglón "Impuestos".
        const filas = taxDisplayRows(
            totals.lineas.map((l) => ({ subtotal: l.base, impuesto: l.impuesto, taxRate: l.tax_rate })),
            code, { region: d.region, decimals, taxLabel: profile.taxLabel },
        );
        const totales: PaisCobro['iv']['totales'] = [{ k: t('fact.p_subtotal'), v: money(totals.subtotal) }];
        if (totals.impuestos > 0) {
            if (filas) filas.forEach((r) => totales.push({ k: `${r.nombre} ${fmtTaxPct(r.tasa)}`, v: money(r.impuesto) }));
            else totales.push({ k: t('fact.p_impuestos'), v: money(totals.impuestos) });
        }
        totales.push({ k: t('fact.p_total'), v: money(totals.total), cls: 'total' });
        if (pagado > 0) totales.push({ k: t('fact.p_pagado'), v: `−${money(pagado)}` });
        totales.push({ k: t('fact.p_saldo'), v: money(saldo), cls: 'due' });

        // Qué botones pinta /i: la misma función que la página.
        const metodosEnLinea = metodosPara({ aceptaTarjeta: true, aceptaDomiciliacion: false, capacidades: {} }, currency);
        const speiEnLinea = METODOS.some((m) => m.superficie === 'selector' && m.paises.includes(code) && estadoDe(m.roadmap) === 'live');
        const { puedePagar, puedePagarMp } = publicInvoicePayability({
            esNotaCredito: false, esPrueba: false, simulado: false, testMode: false,
            pagoDisponible: supportsOnlinePayments(code), aceptaTarjeta: true,
            mercadoPago: supportsMercadoPago(code), metodosEnLinea, speiEnLinea,
        }, true);
        const guidance = publicInvoiceGuidance({
            estado: 'open', esNotaCredito: false, porDevolver: 0, saldo, acreditado: 0, puedePagar, regresoDePago: false,
        }, lang);
        const contact = publicInvoiceContact(d.email, d.tel, folio(code, d), lang);
        const proforma = code === 'ES' && ES_PROFORMA;

        // Descargas: PDF siempre; XML con UUID en México; los formatos
        // EN 16931 para un emisor de la UE con factura (no proforma).
        const descargas = [t('fact.p_pdf')];
        if (code === 'MX' && d.fiscalId) descargas.push(t('fact.p_xml'));
        if (isEuCountry(code) && !proforma) EN16931_FORMATS.forEach((f) => descargas.push(EINVOICE_LABELS[f]));

        const metodos = METODOS.filter((m) => m.paises.includes(code));
        const vivos = metodos.filter((m) => estadoDe(m.roadmap) === 'live');
        const enFormulario = vivos.filter((m) => m.superficie === 'formulario');
        // /i dibuja el selector solo cuando hay tarjeta Y SPEI (`conTarjeta && conSpei`).
        const selector = puedePagar && enFormulario.length > 0 && vivos.some((m) => m.superficie === 'selector');
        const pe = peText(code);

        return {
            code,
            name: countryName(code, lang),
            flagCode: code,
            currency,
            metodos: metodos.map((m) => ({ key: m.key, label: pick(m.label, lang), estado: estadoDe(m.roadmap) })),
            payout: [
                ...(supportsOnlinePayments(code) && PAYOUT_LABEL[payoutSpecFor(code).format] ? [pick(PAYOUT_LABEL[payoutSpecFor(code).format]!, lang)] : []),
                ...(supportsMercadoPago(code) ? [lang === 'en' ? 'Your Mercado Pago account' : 'Tu cuenta de Mercado Pago'] : []),
            ],
            pdfLang: new Intl.DisplayNames([lang], { type: 'language' }).of(docLangFor(profile.locale)) ?? '',
            docsUrl: docsUrl(COUNTRY_DOCS[code], lang),
            iv: {
                color: d.color, org: d.org, legal: d.legal, email: d.email, taxId: d.taxId, numero: folio(code, d),
                titulo: proforma ? 'Proforma' : t('fact.p_factura'), proforma,
                cliente: d.client, clienteTaxId: d.clientTaxId, taxIdLabel: profile.taxIdLabel,
                saldo: money(saldo), emitida: fmtDay(d.issued, code), vence: fmtDay(d.due, code),
                guidance, mailto: !!contact.mailto, tel: !!contact.tel,
                lineas: totals.lineas.map((l) => ({
                    // /i pinta `{l.cantidad}` crudo, sin separador de miles.
                    d: l.descripcion, q: String(l.cantidad),
                    p: money(l.precio_unitario), a: money(l.base),
                })),
                totales,
                pagos: (d.pagos ?? []).map(([cuando, monto]) => ({ cuando: fmtDay(cuando, code), monto: money(monto) })),
                puedePagar, puedePagarMp, descargas, selector,
                fiscalId: code === 'MX' ? d.fiscalId ?? null : null,
                currency,
                formulario: puedePagar ? {
                    tabs: enFormulario.map((m) => pick(m.formulario ?? m.label, lang)),
                    text: pe,
                    countryLabel: new Intl.DisplayNames([pe.locale], { type: 'region' }).of(code) ?? code,
                } : null,
            },
        };
    });
}

// ── Lista de métodos de la cabecera (estilo checklist) ──────────────────────
export function resumenMetodos(lang: Lang) {
    const paises = (k: number) => (lang === 'en' ? `${k} countries` : `${k} países`);
    const conRiel = SUPPORTED_COUNTRIES.filter(hasOnlinePaymentRail);
    const m = (key: string) => METODOS.find((x) => x.key === key)!;
    const disponibles = [
        { key: 'card', label: pick({ es: 'Tarjeta con Cord Payments', en: 'Cards with Cord Payments' }, lang), detalle: paises(m('card').paises.length), estado: estadoDe(m('card').roadmap) },
        { key: 'mercadopago', label: pick({ es: 'Mercado Pago, con tu propia cuenta', en: 'Mercado Pago, with your own account' }, lang), detalle: paises(m('mercadopago').paises.length), estado: estadoDe(m('mercadopago').roadmap) },
        // "Pagar otra cantidad" sale con cualquier riel en línea (/i/[token]).
        { key: 'partial', label: pick({ es: 'Pago de otra cantidad desde el link', en: 'Partial payments from the link' }, lang), detalle: paises(conRiel.length), estado: estadoDe('facturas-emitidas') },
        // "Registrar pago" existe en toda factura abierta, sin depender del país.
        { key: 'manual', label: pick({ es: 'Transferencias que registras a mano', en: 'Transfers you record by hand' }, lang), detalle: paises(SUPPORTED_COUNTRIES.length), estado: estadoDe('facturas-emitidas') },
    ];
    // Lo construido que todavía no está encendido: sale del mismo registro.
    const proximos = METODOS.filter((x) => estadoDe(x.roadmap) !== 'live').map((x) => ({
        key: x.key, label: pick(x.label, lang), paises: x.paises.map((c) => countryName(c, lang)).join(', '),
    }));
    // Un método que pase a `live` entra a la lista de disponibles.
    for (const x of METODOS.filter((y) => estadoDe(y.roadmap) === 'live' && !['card', 'mercadopago'].includes(y.key))) {
        disponibles.push({ key: x.key, label: pick(x.label, lang), detalle: x.paises.map((c) => countryName(c, lang)).join(', '), estado: 'live' as Estado });
    }
    return { disponibles, proximos };
}

export const N_PAISES = SUPPORTED_COUNTRIES.length;
export const N_DIVISAS = OFFERED_CURRENCIES.length;
const N_CARD = METODOS.find((m) => m.key === 'card')!.paises.length;
const N_MP = METODOS.find((m) => m.key === 'mercadopago')!.paises.length;

export const COBRO_COPY: Record<Lang, {
    title: string; sub: string; tablist: string; paga: string; divisa: string; divisaNota: string; recibes: string;
    idioma: string; idiomaPagina: string; idiomaPdf: string; idiomaTarjeta: string; guia: string; caption: string; soon: string;
}> = {
    es: {
        title: `Cobra en ${N_PAISES} países y ${N_DIVISAS} divisas, desde el mismo link.`,
        sub: `Tu cliente abre la factura y paga ahí mismo: con tarjeta mediante Cord Payments en ${N_CARD} países o con tu cuenta de Mercado Pago en ${N_MP}. Puede liquidar el saldo o pagar otra cantidad, y lo que registras a mano descuenta del mismo saldo.`,
        tablist: 'Países',
        paga: 'Tu cliente paga con',
        divisa: 'Divisa',
        divisaNota: `La de tu país por defecto; puedes facturar en cualquiera de las ${N_DIVISAS}.`,
        recibes: 'Lo recibes en',
        idioma: 'Idioma',
        idiomaPagina: 'Página: el de tu cuenta, español o inglés',
        idiomaPdf: 'PDF',
        idiomaTarjeta: 'Formulario de tarjeta: el del navegador de tu cliente',
        guia: 'Guía del país',
        caption: 'Calca de la página que recibe tu cliente: arriba el saldo, abajo el cobro, después de pulsar Pagar.',
        soon: 'Próximamente',
    },
    en: {
        title: `Get paid in ${N_PAISES} countries and ${N_DIVISAS} currencies, from the same link.`,
        sub: `Your client opens the invoice and pays right there: by card through Cord Payments in ${N_CARD} countries, or with your Mercado Pago account in ${N_MP}. They can settle the balance or pay another amount, and what you record by hand comes off the same balance.`,
        tablist: 'Countries',
        paga: 'Your client pays with',
        divisa: 'Currency',
        divisaNota: `Your country’s by default; you can invoice in any of the ${N_DIVISAS}.`,
        recibes: 'You receive it in',
        idioma: 'Language',
        idiomaPagina: 'Page: your account’s, Spanish or English',
        idiomaPdf: 'PDF',
        idiomaTarjeta: 'Card form: your client’s browser language',
        guia: 'Country guide',
        caption: 'A replica of the page your client gets: the balance on top, the payment below, after pressing Pay.',
        soon: 'Coming soon',
    },
};

// ── Matriz fiscal (InvoicingFiscalMatrix) ───────────────────────────────────
// Documento, autoridad y nota por país: docs públicos (pagos/paises/resumen.mdx
// y la página de cada país) y el `shortDesc`/`scope` de cada iniciativa del
// roadmap. El estado NO se escribe aquí: sale de `roadmap` vía `estadoDe`.
interface DocFiscal { doc: L2; nota?: L2; ante: L2; roadmap: string }

const COMERCIAL = (nota?: L2): DocFiscal => ({
    doc: { es: 'Factura comercial', en: 'Commercial invoice' },
    nota: nota ?? { es: 'Con folio consecutivo, impuestos por línea y PDF.', en: 'With a sequential number, tax per line and a PDF.' },
    ante: { es: 'No aplica', en: 'Not applicable' },
    roadmap: 'facturacion-internacional',
});

const DOCS_FISCALES: Record<SupportedCountry, DocFiscal[]> = {
    MX: [{
        doc: { es: 'CFDI 4.0', en: 'CFDI 4.0' },
        nota: { es: 'Desde Starter con tu CSD; proforma en Gratis. Complemento de pago, factura global y sustitución.', en: 'From Starter with your CSD; pro forma on Free. Payment complement, global invoice and substitution.' },
        ante: { es: 'SAT', en: 'SAT' }, roadmap: 'cfdi-automatico',
    }],
    US: [
        COMERCIAL({ es: 'Con folio consecutivo y el sales tax de tu estado.', en: 'With a sequential number and your state’s sales tax.' }),
        {
            doc: { es: 'Sales tax por la dirección del cliente', en: 'Sales tax by client address' },
            nota: { es: 'Estado, condado, ciudad y distritos, desde Starter con Cord Payments.', en: 'State, county, city and districts, from Starter with Cord Payments.' },
            ante: { es: 'Lo declaras tú; Cord lo calcula', en: 'You file it; Cord calculates it' }, roadmap: 'sales-tax-estados-unidos',
        },
    ],
    CA: [COMERCIAL({ es: 'GST y la tasa provincial (QST, PST o RST) desglosadas; HST en las provincias armonizadas.', en: 'GST and the provincial rate (QST, PST or RST) broken out; HST in harmonized provinces.' })]
        .map((d) => ({ ...d, roadmap: 'impuestos-canada' })),
    BR: [
        COMERCIAL(),
        {
            doc: { es: 'NFS-e y NF-e', en: 'NFS-e and NF-e' },
            nota: { es: 'Servicios con la NFS-e nacional y mercancías con la NF-e modelo 55, desde Starter.', en: 'Services with the national NFS-e and goods with the model 55 NF-e, from Starter.' },
            ante: { es: 'Sistema Nacional NFS-e y SEFAZ de tu estado', en: 'National NFS-e system and your state’s SEFAZ' }, roadmap: 'factura-electronica-brasil',
        },
    ],
    ES: [
        { ...COMERCIAL({ es: 'Lo que emite una cuenta en España mientras Verifactu no está activo.', en: 'What an account in Spain issues while Verifactu is not active.' }), doc: { es: 'Proforma', en: 'Pro forma' } },
        {
            doc: { es: 'Factura registrada con Verifactu', en: 'Invoice registered with Verifactu' },
            nota: { es: 'Registros encadenados, QR de cotejo y envío, desde Starter.', en: 'Chained records, verification QR and submission, from Starter.' },
            ante: { es: 'AEAT', en: 'AEAT' }, roadmap: 'verifactu-espana',
        },
        {
            doc: { es: 'Facturae 3.2.2', en: 'Facturae 3.2.2' },
            nota: { es: 'Con IRPF y firma opcional, sobre facturas registradas con Verifactu.', en: 'With IRPF and optional signature, on invoices registered with Verifactu.' },
            ante: { es: 'Cord la genera; no la presenta en FACe', en: 'Cord generates it; it does not file it with FACe' }, roadmap: 'facturae-espana',
        },
        {
            doc: { es: 'Factura electrónica entre empresarios', en: 'E-invoicing between businesses' },
            nota: { es: 'Obligatoria desde el 6 de octubre de 2027 para quien factura más de 8 millones de euros.', en: 'Mandatory from October 6, 2027 for businesses invoicing over €8 million.' },
            ante: { es: 'AEAT', en: 'AEAT' }, roadmap: 'factura-b2b-espana',
        },
    ],
    GB: [
        COMERCIAL({ es: 'Con VAT por línea y tu VAT reg. no.', en: 'With VAT per line and your VAT reg. no.' }),
        {
            doc: { es: 'Factura electrónica por Peppol', en: 'E-invoicing over Peppol' },
            nota: { es: 'HMRC la exigirá en toda factura con VAT desde abril de 2029.', en: 'HMRC will require it on every VAT invoice from April 2029.' },
            ante: { es: 'HMRC', en: 'HMRC' }, roadmap: 'peppol-reino-unido',
        },
    ],
    DE: [{
        doc: { es: 'Factura con XRechnung, Factur-X y Peppol', en: 'Invoice with XRechnung, Factur-X and Peppol' },
        nota: { es: 'Norma EN 16931: se descargan desde la factura y pueden ir adjuntos en el correo.', en: 'EN 16931 standard: download them from the invoice or attach them to the email.' },
        ante: { es: 'Cord genera los archivos; no los transmite', en: 'Cord generates the files; it does not transmit them' }, roadmap: 'factura-electronica-europea',
    }],
    FR: [
        {
            doc: { es: 'Factura con Factur-X, XRechnung y Peppol', en: 'Invoice with Factur-X, XRechnung and Peppol' },
            nota: { es: 'Con las menciones de la reforma francesa.', en: 'With the French reform’s mandatory mentions.' },
            ante: { es: 'Cord genera los archivos', en: 'Cord generates the files' }, roadmap: 'factura-electronica-europea',
        },
        {
            doc: { es: 'Emisión por plataforma autorizada', en: 'Issuing through an approved platform' },
            nota: { es: 'Factur-X entre empresas, e-reporting de ventas a particulares y al extranjero, y comunicación de cobros.', en: 'Factur-X between businesses, e-reporting of consumer and foreign sales, and payment reporting.' },
            ante: { es: 'Plataforma autorizada (PA)', en: 'Approved platform (PA)' }, roadmap: 'factura-electronica-francia',
        },
    ],
    CO: [
        COMERCIAL(),
        {
            doc: { es: 'Factura electrónica de venta', en: 'Electronic sales invoice' },
            nota: { es: 'Con validación previa, CUFE y QR, como software propio.', en: 'With prior validation, CUFE and QR, as in-house software.' },
            ante: { es: 'DIAN', en: 'DIAN' }, roadmap: 'dian-colombia',
        },
    ],
    AR: [
        COMERCIAL(),
        {
            doc: { es: 'Factura A, B o C con CAE', en: 'Type A, B or C invoice with CAE' },
            nota: { es: 'CAE pedido directo con el certificado del negocio, con QR y leyendas.', en: 'CAE requested directly with the business’s certificate, with QR and legends.' },
            ante: { es: 'ARCA', en: 'ARCA' }, roadmap: 'arca-argentina',
        },
    ],
    CL: [
        { ...COMERCIAL({ es: 'El IVA se calcula una vez por documento, como el SII.', en: 'VAT is calculated once per document, as the SII does.' }), roadmap: 'iva-por-documento-chile' },
        {
            doc: { es: 'DTE 33, 34, 56 y 61', en: 'DTE 33, 34, 56 and 61' },
            nota: { es: 'Factura afecta y exenta, notas de débito y crédito, con timbre electrónico.', en: 'Taxable and exempt invoices, debit and credit notes, with electronic stamp.' },
            ante: { es: 'SII', en: 'SII' }, roadmap: 'sii-chile',
        },
    ],
    PE: [
        COMERCIAL(),
        {
            doc: { es: 'Factura y nota de crédito electrónicas', en: 'Electronic invoice and credit note' },
            nota: { es: 'Enviadas directo a SUNAT desde tu sistema, con QR.', en: 'Sent straight to SUNAT from your own system, with QR.' },
            ante: { es: 'SUNAT', en: 'SUNAT' }, roadmap: 'sunat-peru',
        },
    ],
};

export interface FilaFiscal {
    code: SupportedCountry;
    name: string;
    currency: string;
    impuestos: string[];
    impuestosMas: number;
    retenciones: number;
    docs: { doc: string; nota?: string; ante: string; estado: Estado }[];
    docsUrl: string;
}

export function filasFiscales(lang: Lang): FilaFiscal[] {
    return SUPPORTED_COUNTRIES.map((code) => {
        // Impuestos con que nace la cuenta: `taxPresetsFor` sin provincia.
        // EE. UU. no tiene tasa nacional: siembra la de su estado al declararlo
        // (`usStateTaxPresets`, US_STATE_TAX con las 50 + D.C.).
        const presets = taxPresetsFor(code);
        const nombres = presets.filter((p) => p.kind !== 'retencion').map((p) => p.nombre);
        // `US_STATE_TAX` tiene las 50 + D.C.: toda cuenta de EE. UU. nace con la de su estado.
        if (code === 'US' && Object.keys(US_STATE_TAX).length > 0) nombres.unshift(lang === 'en' ? 'Your state’s sales tax' : 'Sales tax de tu estado');
        const VISIBLES = 3;
        return {
            code,
            name: countryName(code, lang),
            currency: getCountryProfile(code).currency,
            impuestos: nombres.slice(0, VISIBLES),
            impuestosMas: Math.max(0, nombres.length - VISIBLES),
            retenciones: presets.filter((p) => p.kind === 'retencion').length,
            docs: DOCS_FISCALES[code].map((d) => ({
                doc: pick(d.doc, lang), nota: d.nota ? pick(d.nota, lang) : undefined, ante: pick(d.ante, lang), estado: estadoDe(d.roadmap),
            })),
            docsUrl: docsUrl(COUNTRY_DOCS[code], lang),
        };
    });
}

// ── Calca destacada: panel "Factura electrónica" del detalle (Alemania) ─────
// src/pages/app/facturas/[id].astro, sección `fd-einv`. Los formatos son los
// EN 16931 que ofrece `einvoiceStatus` a un emisor de la UE (sin Facturae, que
// es solo de España) con las etiquetas de EINVOICE_LABELS.
export function detalleEinvoice(lang: Lang) {
    const code: SupportedCountry = 'DE';
    const d = DEMO[code];
    const currency = getCountryProfile(code).currency;
    const decimals = currencyDecimals(currency);
    const totals = calculateDocumentTotals(
        d.lines.map(([descripcion, cantidad, precio]) => ({ descripcion, cantidad, precio_unitario: precio, tax_rate: d.rate })),
        { roundLines: decimals, taxRounding: taxRoundingFor(code) },
    );
    const money = (n: number) => fmtMoney(n, currency, lang);
    return {
        cliente: d.client,
        // Correo del CLIENTE (la fila "Enviada al cliente" del detalle).
        email: 'einkauf@hansen-bau.de',
        numero: folio(code, d),
        emitida: fmtDay(d.issued, code),
        vence: fmtDay(d.due, code),
        total: money(totals.total),
        lineas: totals.lineas.map((l) => ({ d: l.descripcion, q: String(l.cantidad), p: money(l.precio_unitario), a: money(l.base) })),
        subtotal: money(totals.subtotal),
        // Detalle de la app: un renglón por tasa, rotulado con el porcentaje
        // (`tasas` en src/pages/app/facturas/[id].astro, fuera de Canadá y EE. UU.).
        impuesto: { k: `${Math.round(d.rate * 10000) / 100}%`, v: money(totals.impuestos) },
        formatos: EN16931_FORMATS.map((f) => EINVOICE_LABELS[f]),
        docsUrl: docsUrl('pagos/factura-electronica', lang),
        estado: estadoDe('factura-electronica-europea'),
    };
}

export const FISCAL_COPY: Record<Lang, {
    title: string; sub: string; eyebrow: string; h3: string; p: string; limite: string; docsLabel: string;
    cols: { pais: string; impuestos: string; doc: string; ante: string; estado: string };
    retenciones: (n: number) => string; mas: (n: number) => string; guia: string;
    leyenda: Record<Estado, string>;
}> = {
    es: {
        title: 'La factura con validez fiscal en cada país.',
        sub: `Cord emite el documento que pide cada uno de los ${N_PAISES} países: CFDI 4.0 en México, la factura electrónica europea en Alemania y Francia y, en España y Latinoamérica, los rieles de cada autoridad, que se encienden país por país. Mientras uno está en activación, la factura sale como documento comercial y la cobras igual.`,
        eyebrow: 'ALEMANIA Y FRANCIA',
        h3: 'XRechnung, Factur-X y Peppol, en la misma factura.',
        p: 'Al emitir, la factura queda también escrita en los formatos de la norma europea EN 16931 que lee el sistema contable de tu cliente. Los descargas desde la factura, pueden ir adjuntos en el correo y tu cliente los encuentra en la página de pago. Si algo no cuadra al céntimo, no se generan.',
        limite: 'Cord genera los archivos; no los envía por la red Peppol.',
        docsLabel: 'Factura electrónica europea',
        cols: { pais: 'País', impuestos: 'Impuestos con que nace tu cuenta', doc: 'Documento', ante: 'Ante quién', estado: 'Estado' },
        retenciones: (n) => (n === 1 ? '1 retención' : `${n} retenciones`),
        mas: (n) => `+${n} más`,
        guia: 'Guía',
        leyenda: {
            live: 'Funciona hoy para toda cuenta del país, con el plan que se indica.',
            beta: 'Construido y probado; Cord lo enciende país por país. Mientras tanto, la factura sale como documento comercial.',
            next: 'Todavía no está disponible: espera algo externo o está por construirse.',
        },
    },
    en: {
        title: 'The invoice that counts for tax, in every country.',
        sub: `Cord issues the document each of the ${N_PAISES} countries asks for: CFDI 4.0 in Mexico, European e-invoicing in Germany and France and, in Spain and Latin America, each authority’s rail, switched on country by country. While one is being activated, the invoice goes out as a commercial document and you still get paid.`,
        eyebrow: 'GERMANY AND FRANCE',
        h3: 'XRechnung, Factur-X and Peppol, on the same invoice.',
        p: 'When you issue, the invoice is also written in the EN 16931 formats your client’s accounting system reads. You download them from the invoice, they can be attached to the email, and your client finds them on the payment page. If anything is off by a cent, they are not generated.',
        limite: 'Cord generates the files; it does not send them over the Peppol network.',
        docsLabel: 'European e-invoicing',
        cols: { pais: 'Country', impuestos: 'Taxes your account starts with', doc: 'Document', ante: 'Filed with', estado: 'Status' },
        retenciones: (n) => (n === 1 ? '1 withholding' : `${n} withholdings`),
        mas: (n) => `+${n} more`,
        guia: 'Guide',
        leyenda: {
            live: 'Works today for every account in the country, on the plan shown.',
            beta: 'Built and tested; Cord switches it on country by country. Meanwhile, the invoice goes out as a commercial document.',
            next: 'Not available yet: it waits on something external or is still to be built.',
        },
    },
};
