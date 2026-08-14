// Fuente única de banderas circulares — SVG de `circle-flags` (MIT, cero
// dependencias, ya recortados en círculo) copiados a `public/flags/*.svg`.
// Se sirven como assets ESTÁTICOS (no via import de módulo): Astro intercepta
// cualquier `import '*.svg'` con su propio pipeline de imágenes y lo convierte
// en un componente SSR o en un objeto ImageMetadata según el entorno — dos
// formas distintas e incompatibles entre React (islands) y Astro. Un path
// plano bajo `public/` no pasa por ese pipeline y funciona idéntico en ambos.
//
// Reemplaza el emoji de bandera que vivía antes en countries.ts — ver la
// Regla 1 de CLAUDE.md / design-reviewer: ya no hay excepción de emoji.
// Las banderas frecuentes viven locales. El catálogo ISO completo usa el CDN
// oficial del mismo proyecto para no versionar cientos de SVG duplicados.
export const FLAG_SRC: Record<string, string> = {
    MX: '/flags/mx.svg',
    US: '/flags/us.svg',
    CO: '/flags/co.svg',
    AR: '/flags/ar.svg',
    CL: '/flags/cl.svg',
    PE: '/flags/pe.svg',
    ES: '/flags/es.svg',
    EU: '/flags/eu.svg',
};

// El selector de moneda (nueva.astro) no tiene un país, tiene una divisa —
// mapeo divisa → bandera representativa. Cubre todas las divisas de
// Intl.supportedValuesOf('currency') para que ninguna caiga a un fallback
// incorrecto. Las divisas regionales (XAF, XOF, XCD, XPF) usan la bandera
// de la economía más representativa o una genérica; las supranacionales
// (XDR, XSU, XCG) no tienen bandera obvia y se omiten (el CDN devuelve un
// placeholder genérico para códigos desconocidos).
export const CURRENCY_FLAG: Record<string, string> = {
    // A
    AED: 'AE', AFN: 'AF', ALL: 'AL', AMD: 'AM', ANG: 'CW', AOA: 'AO',
    ARS: 'AR', AUD: 'AU', AWG: 'AW', AZN: 'AZ',
    // B
    BAM: 'BA', BBD: 'BB', BDT: 'BD', BGN: 'BG', BHD: 'BH', BIF: 'BI',
    BMD: 'BM', BND: 'BN', BOB: 'BO', BRL: 'BR', BSD: 'BS', BTN: 'BT',
    BWP: 'BW', BYN: 'BY', BZD: 'BZ',
    // C
    CAD: 'CA', CDF: 'CD', CHF: 'CH', CLP: 'CL', CNY: 'CN', COP: 'CO',
    CRC: 'CR', CUC: 'CU', CUP: 'CU', CVE: 'CV', CZK: 'CZ',
    // D
    DJF: 'DJ', DKK: 'DK', DOP: 'DO', DZD: 'DZ',
    // E
    EGP: 'EG', ERN: 'ER', ETB: 'ET', EUR: 'EU',
    // F
    FJD: 'FJ', FKP: 'FK',
    // G
    GBP: 'GB', GEL: 'GE', GHS: 'GH', GIP: 'GI', GMD: 'GM', GNF: 'GN',
    GTQ: 'GT', GYD: 'GY',
    // H
    HKD: 'HK', HNL: 'HN', HRK: 'HR', HTG: 'HT', HUF: 'HU',
    // I
    IDR: 'ID', ILS: 'IL', INR: 'IN', IQD: 'IQ', IRR: 'IR', ISK: 'IS',
    // J
    JMD: 'JM', JOD: 'JO', JPY: 'JP',
    // K
    KES: 'KE', KGS: 'KG', KHR: 'KH', KMF: 'KM', KPW: 'KP', KRW: 'KR',
    KWD: 'KW', KYD: 'KY', KZT: 'KZ',
    // L
    LAK: 'LA', LBP: 'LB', LKR: 'LK', LRD: 'LR', LSL: 'LS', LYD: 'LY',
    // M
    MAD: 'MA', MDL: 'MD', MGA: 'MG', MKD: 'MK', MMK: 'MM', MNT: 'MN',
    MOP: 'MO', MRU: 'MR', MUR: 'MU', MVR: 'MV', MWK: 'MW', MXN: 'MX',
    MYR: 'MY', MZN: 'MZ',
    // N
    NAD: 'NA', NGN: 'NG', NIO: 'NI', NOK: 'NO', NPR: 'NP', NZD: 'NZ',
    // O
    OMR: 'OM',
    // P
    PAB: 'PA', PEN: 'PE', PGK: 'PG', PHP: 'PH', PKR: 'PK', PLN: 'PL',
    PYG: 'PY',
    // Q
    QAR: 'QA',
    // R
    RON: 'RO', RSD: 'RS', RUB: 'RU', RWF: 'RW',
    // S
    SAR: 'SA', SBD: 'SB', SCR: 'SC', SDG: 'SD', SEK: 'SE', SGD: 'SG',
    SHP: 'SH', SLE: 'SL', SLL: 'SL', SOS: 'SO', SRD: 'SR', SSP: 'SS',
    STN: 'ST', SVC: 'SV', SYP: 'SY', SZL: 'SZ',
    // T
    THB: 'TH', TJS: 'TJ', TMT: 'TM', TND: 'TN', TOP: 'TO', TRY: 'TR',
    TTD: 'TT', TWD: 'TW', TZS: 'TZ',
    // U
    UAH: 'UA', UGX: 'UG', USD: 'US', UYU: 'UY', UZS: 'UZ',
    // V
    VES: 'VE', VND: 'VN', VUV: 'VU',
    // W
    WST: 'WS',
    // X — divisas regionales / supranacionales: usamos la economía principal
    XAF: 'CM', // Franco CFA central — Camerún como referente
    XCD: 'AG', // Dólar del Caribe Oriental — Antigua como referente
    XOF: 'SN', // Franco CFA occidental — Senegal como referente
    XPF: 'PF', // Franco CFP — Polinesia Francesa
    // XDR, XSU, XCG: sin bandera representativa, caen al CDN genérico
    // Y
    YER: 'YE',
    // Z
    ZAR: 'ZA', ZMW: 'ZM', ZWG: 'ZW', ZWL: 'ZW',
};

export function flagSrc(code: string): string {
    const normalized = String(code || '').toUpperCase();
    return FLAG_SRC[normalized]
        || `https://hatscripts.github.io/circle-flags/flags/${normalized.toLowerCase()}.svg`;
}
