// Catálogo de países de Cord. Dos listas con trabajos distintos:
//
//   · COUNTRY_CODES  — el vocabulario ISO 3166-1 alpha-2 completo. Valida un
//     país YA GUARDADO. Nunca se ofrece entero en un select.
//   · SUPPORTED_COUNTRIES — los mercados que Cord ofrece hoy al crear una
//     cuenta. Es el set que ve el usuario.
//
// El único carril regulatorio conectado es CFDI 4.0 para México; en los demás
// países el documento es comercial y no se presenta automáticamente a la
// autoridad.

export const COUNTRY_CODES = [
    'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
    'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
    'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
    'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE',
    'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
    'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
    'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM',
    'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC',
    'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
    'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
    'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG',
    'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
    'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
    'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO',
    'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
    'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

// ── Países que Cord OFRECE hoy ──────────────────────────────────────────────
//
// `COUNTRY_CODES` es el vocabulario ISO completo y sigue siendo la frontera de
// validación de un dato ya guardado: una organización creada antes de este
// recorte no puede quedar con un país inválido. Pero OFRECER 249 países en un
// select cuando solo unos cuantos tienen perfil, impuestos y riel de cobro es
// la regla 15 a escala de país — el producto prometía 249 mercados y sostenía
// 23. Los demás nacían con USD, UTC, "Tax ID" genérico, catálogo de impuestos
// vacío y un campo de cuenta bancaria que el proveedor iba a rebotar.
//
// Este set son los mercados donde Cord se vende hoy. Agregar uno no es escribir
// dos letras aquí: exige perfil en PROFILE_DEFAULTS, tasas en TAX_PRESETS (o la
// decisión explícita de no tenerlas), y decidir su riel de cobro abajo.
export const SUPPORTED_COUNTRIES = [
    'MX', 'US', 'CA', 'BR',
    'ES', 'GB', 'DE', 'FR',
    'CO', 'AR', 'CL', 'PE',
] as const;

export type SupportedCountry = (typeof SUPPORTED_COUNTRIES)[number];

export function isSupportedCountry(value: string): value is SupportedCountry {
    return (SUPPORTED_COUNTRIES as readonly string[]).includes(String(value || '').toUpperCase());
}

// ── Riel de cobro por país ──────────────────────────────────────────────────
//
// Cord Payments corre sobre Stripe Connect, y Stripe no abre cuentas conectadas
// en todos los países del set. Donde no las abre, la cuenta sirve igual para
// cotizar, facturar y llevar la cobranza — lo que no existe es el cobro con
// tarjeta dentro del link, y eso se DICE antes de empezar el alta en vez de
// dejar que el proveedor devuelva un error que no le habla al dueño del negocio
// (regla 14). Hoy Colombia, Argentina, Chile y Perú están en ese caso.
const CONNECT_COUNTRIES = new Set<string>(['MX', 'US', 'CA', 'BR', 'ES', 'GB', 'DE', 'FR']);

/** ¿Cord Payments (cobro en línea) está disponible en este país? */
export function supportsOnlinePayments(code: string): boolean {
    return CONNECT_COUNTRIES.has(String(code || '').toUpperCase());
}

export interface CountryProfile {
    code: CountryCode;
    name: string;
    currency: string;
    locale: string;
    timeZone: string;
    taxIdLabel: string;
    /**
     * Cómo se LLAMA el impuesto al consumo en ese país. No es lo mismo en todos
     * lados —IVA en Latinoamérica y España, VAT en la UE y Reino Unido, GST en
     * Canadá/Australia/India, Sales tax en EE.UU.— y llamarle "IVA" a todo hace
     * que la factura de un negocio en Sídney diga algo que ahí no existe.
     *
     * Es solo el NOMBRE. La tasa la define cada organización en Ajustes ›
     * Impuestos: Cord no mantiene tablas tributarias de 200 países ni pretende
     * saber qué tasa le toca a cada concepto.
     */
    taxLabel: string;
    invoicePrefix: string;
    regulatoryRail: 'cfdi_40' | 'commercial_invoice';
    /** `stripe_connect` = se puede cobrar en línea; `manual` = solo registro de pagos. */
    paymentsRail: 'stripe_connect' | 'manual';
}

type ProfileDefaults = Pick<CountryProfile, 'currency' | 'locale' | 'timeZone' | 'taxIdLabel' | 'taxLabel' | 'invoicePrefix'>;

const DEFAULT_PROFILE: ProfileDefaults = {
    currency: 'USD',
    locale: 'en-US',
    timeZone: 'UTC',
    taxIdLabel: 'Tax ID',
    taxLabel: 'Tax',
    invoicePrefix: 'INV',
};

// Defaults operativos, no reglas tributarias. Evitan que una cuenta nueva en
// otro país nazca con MXN y horario de Ciudad de México. Lo no listado cae a
// USD/UTC y puede ajustarse en Configuración.
const PROFILE_DEFAULTS: Partial<Record<CountryCode, Partial<ProfileDefaults>>> = {
    AE: { currency: 'AED', locale: 'ar-AE', timeZone: 'Asia/Dubai', taxIdLabel: 'TRN', taxLabel: 'VAT' },
    AR: { currency: 'ARS', locale: 'es-AR', timeZone: 'America/Argentina/Buenos_Aires', taxIdLabel: 'CUIT', taxLabel: 'IVA' },
    AU: { currency: 'AUD', locale: 'en-AU', timeZone: 'Australia/Sydney', taxIdLabel: 'ABN', taxLabel: 'GST' },
    BR: { currency: 'BRL', locale: 'pt-BR', timeZone: 'America/Sao_Paulo', taxIdLabel: 'CNPJ / CPF', taxLabel: 'ICMS / ISS' },
    CA: { currency: 'CAD', locale: 'en-CA', timeZone: 'America/Toronto', taxIdLabel: 'Business number / Tax ID', taxLabel: 'GST/HST' },
    CH: { currency: 'CHF', locale: 'de-CH', timeZone: 'Europe/Zurich', taxIdLabel: 'UID / VAT ID', taxLabel: 'MWST / TVA' },
    CL: { currency: 'CLP', locale: 'es-CL', timeZone: 'America/Santiago', taxIdLabel: 'RUT', taxLabel: 'IVA' },
    CN: { currency: 'CNY', locale: 'zh-CN', timeZone: 'Asia/Shanghai', taxIdLabel: 'Unified social credit code', taxLabel: 'VAT' },
    CO: { currency: 'COP', locale: 'es-CO', timeZone: 'America/Bogota', taxIdLabel: 'NIT', taxLabel: 'IVA' },
    CR: { currency: 'CRC', locale: 'es-CR', timeZone: 'America/Costa_Rica', taxIdLabel: 'Cédula jurídica / NITE', taxLabel: 'IVA' },
    DE: { currency: 'EUR', locale: 'de-DE', timeZone: 'Europe/Berlin', taxIdLabel: 'USt-IdNr.', taxLabel: 'USt.' },
    DO: { currency: 'DOP', locale: 'es-DO', timeZone: 'America/Santo_Domingo', taxIdLabel: 'RNC', taxLabel: 'ITBIS' },
    EC: { currency: 'USD', locale: 'es-EC', timeZone: 'America/Guayaquil', taxIdLabel: 'RUC', taxLabel: 'IVA' },
    ES: { currency: 'EUR', locale: 'es-ES', timeZone: 'Europe/Madrid', taxIdLabel: 'NIF / CIF', taxLabel: 'IVA' },
    FR: { currency: 'EUR', locale: 'fr-FR', timeZone: 'Europe/Paris', taxIdLabel: 'SIREN / VAT ID', taxLabel: 'TVA' },
    GB: { currency: 'GBP', locale: 'en-GB', timeZone: 'Europe/London', taxIdLabel: 'UTR / VAT number', taxLabel: 'VAT' },
    GT: { currency: 'GTQ', locale: 'es-GT', timeZone: 'America/Guatemala', taxIdLabel: 'NIT', taxLabel: 'IVA' },
    HK: { currency: 'HKD', locale: 'en-HK', timeZone: 'Asia/Hong_Kong', taxIdLabel: 'Business registration number', taxLabel: 'Tax' },
    ID: { currency: 'IDR', locale: 'id-ID', timeZone: 'Asia/Jakarta', taxIdLabel: 'NPWP', taxLabel: 'PPN' },
    IE: { currency: 'EUR', locale: 'en-IE', timeZone: 'Europe/Dublin', taxIdLabel: 'Tax reference / VAT number', taxLabel: 'VAT' },
    IL: { currency: 'ILS', locale: 'he-IL', timeZone: 'Asia/Jerusalem', taxIdLabel: 'Tax ID', taxLabel: 'VAT' },
    IN: { currency: 'INR', locale: 'en-IN', timeZone: 'Asia/Kolkata', taxIdLabel: 'GSTIN / PAN', taxLabel: 'GST' },
    IT: { currency: 'EUR', locale: 'it-IT', timeZone: 'Europe/Rome', taxIdLabel: 'Partita IVA / Codice fiscale', taxLabel: 'IVA' },
    JP: { currency: 'JPY', locale: 'ja-JP', timeZone: 'Asia/Tokyo', taxIdLabel: 'Corporate number / T-number', taxLabel: '消費税 (JCT)' },
    KR: { currency: 'KRW', locale: 'ko-KR', timeZone: 'Asia/Seoul', taxIdLabel: 'Business registration number', taxLabel: 'VAT' },
    MX: { currency: 'MXN', locale: 'es-MX', timeZone: 'America/Mexico_City', taxIdLabel: 'RFC', invoicePrefix: 'FAC', taxLabel: 'IVA' },
    MY: { currency: 'MYR', locale: 'en-MY', timeZone: 'Asia/Kuala_Lumpur', taxIdLabel: 'TIN / Registration number', taxLabel: 'SST' },
    NL: { currency: 'EUR', locale: 'nl-NL', timeZone: 'Europe/Amsterdam', taxIdLabel: 'BTW-id / KVK', taxLabel: 'BTW' },
    NO: { currency: 'NOK', locale: 'nb-NO', timeZone: 'Europe/Oslo', taxIdLabel: 'Organization number / MVA', taxLabel: 'MVA' },
    NZ: { currency: 'NZD', locale: 'en-NZ', timeZone: 'Pacific/Auckland', taxIdLabel: 'NZBN / GST number', taxLabel: 'GST' },
    PA: { currency: 'USD', locale: 'es-PA', timeZone: 'America/Panama', taxIdLabel: 'RUC', taxLabel: 'ITBMS' },
    PE: { currency: 'PEN', locale: 'es-PE', timeZone: 'America/Lima', taxIdLabel: 'RUC', taxLabel: 'IGV' },
    PH: { currency: 'PHP', locale: 'en-PH', timeZone: 'Asia/Manila', taxIdLabel: 'TIN', taxLabel: 'VAT' },
    PL: { currency: 'PLN', locale: 'pl-PL', timeZone: 'Europe/Warsaw', taxIdLabel: 'NIP', taxLabel: 'VAT' },
    PT: { currency: 'EUR', locale: 'pt-PT', timeZone: 'Europe/Lisbon', taxIdLabel: 'NIF', taxLabel: 'IVA' },
    PY: { currency: 'PYG', locale: 'es-PY', timeZone: 'America/Asuncion', taxIdLabel: 'RUC', taxLabel: 'IVA' },
    SA: { currency: 'SAR', locale: 'ar-SA', timeZone: 'Asia/Riyadh', taxIdLabel: 'VAT / Tax ID', taxLabel: 'VAT' },
    SE: { currency: 'SEK', locale: 'sv-SE', timeZone: 'Europe/Stockholm', taxIdLabel: 'Organization number / VAT ID', taxLabel: 'Moms' },
    SG: { currency: 'SGD', locale: 'en-SG', timeZone: 'Asia/Singapore', taxIdLabel: 'UEN / GST number', taxLabel: 'GST' },
    TR: { currency: 'TRY', locale: 'tr-TR', timeZone: 'Europe/Istanbul', taxIdLabel: 'VKN / TCKN', taxLabel: 'KDV' },
    TW: { currency: 'TWD', locale: 'zh-TW', timeZone: 'Asia/Taipei', taxIdLabel: 'Uniform business number', taxLabel: 'VAT' },
    US: { currency: 'USD', locale: 'en-US', timeZone: 'America/New_York', taxIdLabel: 'EIN / Tax ID', taxLabel: 'Sales tax' },
    UY: { currency: 'UYU', locale: 'es-UY', timeZone: 'America/Montevideo', taxIdLabel: 'RUT', taxLabel: 'IVA' },
    VE: { currency: 'USD', locale: 'es-VE', timeZone: 'America/Caracas', taxIdLabel: 'RIF', taxLabel: 'IVA' },
    ZA: { currency: 'ZAR', locale: 'en-ZA', timeZone: 'Africa/Johannesburg', taxIdLabel: 'Tax / VAT number', taxLabel: 'VAT' },
};

// ── Presets de impuestos por país ───────────────────────────────────────────
//
// Esto NO es una tabla tributaria. Cord no mantiene las reglas fiscales de 200
// países y no pretende saber qué tasa le toca a cada concepto — eso lo decide
// el negocio con su contador. Lo que sí puede hacer, y es la diferencia entre
// una cuenta usable y una cuenta vacía, es que una organización nueva nazca con
// las tasas ESTÁNDAR de su país ya capturadas y editables, en vez de con un
// catálogo en blanco o —peor— con el 16% mexicano heredado.
//
// Reglas de esta tabla:
//   · `nombre` va en el vocabulario real del país, no traducido ("Moms", "KDV",
//     "ITBIS"): es lo que el negocio va a reconocer y lo que imprime la factura.
//   · Solo se listan países con una tasa NACIONAL única y estable. Estados
//     Unidos (sales tax por jurisdicción) y Brasil (ICMS estatal + ISS
//     municipal) nacen sin preset a propósito: inventarles una tasa nacional
//     sería peor que dejarlos elegir.
//   · Las tasas cambian. Son un punto de partida editable, no una fuente de
//     verdad; la UI lo dice así y el negocio manda.
export interface TaxPreset {
    /** Nombre en el vocabulario del país. Se muestra e imprime tal cual. */
    nombre: string;
    /** Clasificación neutra — es la que decide la aritmética. */
    kind: TaxKind;
    /** Subcódigo del país. Solo México lo usa (mapea a los impuestos del CFDI). */
    tipo: 'iva' | 'ieps' | 'ret_iva' | 'ret_isr' | 'exento';
    /** Porcentaje 0–100, no fracción. */
    tasa: number;
    /** Se aplica a las líneas nuevas del editor. Uno por país. */
    esDefault?: boolean;
    /**
     * Solo para `kind: 'retencion'`. Sobre qué se calcula: `'subtotal'`
     * (default, correcto para México) o `'impuesto'` (Colombia: la ReteIVA es
     * 15% DEL IVA, no del subtotal). Ver RetencionInput en engine.ts.
     */
    base?: 'subtotal' | 'impuesto';
}

export type TaxKind = 'consumo' | 'retencion' | 'exento';

/** Exento estándar: toda org lo necesita, ningún país lo omite. */
const EXENTO: TaxPreset = { nombre: 'Exento', kind: 'exento', tipo: 'exento', tasa: 0 };
const ZERO_RATED: TaxPreset = { nombre: 'Zero-rated', kind: 'exento', tipo: 'exento', tasa: 0 };

const std = (nombre: string, tasa: number): TaxPreset => ({ nombre, kind: 'consumo', tipo: 'iva', tasa, esDefault: true });
const red = (nombre: string, tasa: number): TaxPreset => ({ nombre, kind: 'consumo', tipo: 'iva', tasa });

export const TAX_PRESETS: Partial<Record<CountryCode, TaxPreset[]>> = {
    // Norteamérica
    MX: [
        std('IVA 16%', 16),
        red('IVA 8% región fronteriza', 8),
        EXENTO,
        { nombre: 'Retención IVA 10.667%', kind: 'retencion', tipo: 'ret_iva', tasa: 10.667 },
        { nombre: 'Retención ISR 1.25%', kind: 'retencion', tipo: 'ret_isr', tasa: 1.25 },
        // Art. 1-A LIVA: fracción IV (autotransporte de carga federal) y
        // fracción II inciso a) (servicios de personal / outsourcing).
        { nombre: 'Retención IVA 4% (autotransporte)', kind: 'retencion', tipo: 'ret_iva', tasa: 4 },
        { nombre: 'Retención IVA 6% (servicios de personal)', kind: 'retencion', tipo: 'ret_iva', tasa: 6 },
    ],
    // GST/HST son federales. QST/PST/RST son IMPUESTOS PROVINCIALES aparte —en
    // QC/BC/SK/MB se cobran junto al 5% de GST, no en su lugar— y aquí se
    // ofrecen como una tasa seleccionable más, con el nombre de su provincia,
    // para el negocio que solo necesita una tasa por línea. HST de Nueva
    // Escocia bajó de 15% a 14% en abril de 2025; "HST 15%" sigue vigente en
    // New Brunswick, Newfoundland & Labrador y Prince Edward Island.
    CA: [
        std('GST 5%', 5),
        red('HST 13% (ON)', 13),
        red('HST 14% (NS)', 14),
        red('HST 15% (NB/NL/PE)', 15),
        red('QST 9.975% (QC)', 9.975),
        red('PST 7% (BC)', 7),
        red('PST 6% (SK)', 6),
        red('RST 7% (MB)', 7),
        ZERO_RATED,
    ],

    // Latinoamérica
    AR: [std('IVA 21%', 21), red('IVA 10,5%', 10.5), red('IVA 27%', 27), EXENTO],
    CL: [std('IVA 19%', 19), EXENTO],
    CO: [
        std('IVA 19%', 19),
        red('IVA 5%', 5),
        EXENTO,
        // 15% DEL IVA, no del subtotal — `base: 'impuesto'` es lo que hace que
        // el motor calcule sobre la base correcta (regla del motor, engine.ts).
        { nombre: 'ReteIVA 15%', kind: 'retencion', tipo: 'ret_iva', tasa: 15, base: 'impuesto' },
        { nombre: 'ReteFuente 2,5%', kind: 'retencion', tipo: 'ret_isr', tasa: 2.5 },
    ],
    CR: [std('IVA 13%', 13), red('IVA 4%', 4), red('IVA 2%', 2), red('IVA 1%', 1), EXENTO],
    DO: [std('ITBIS 18%', 18), red('ITBIS 16%', 16), EXENTO],
    GT: [std('IVA 12%', 12), EXENTO],
    PA: [std('ITBMS 7%', 7), EXENTO],
    // Régimen de Retenciones del IGV (RS 037-2002/SUNAT): 3% del importe de la
    // operación, tasa única sin importar el rubro — a diferencia de las
    // Detracciones (SPOT), que varían 4-12% por tipo de bien o servicio y por
    // eso NO se agregan aquí como una sola tasa.
    PE: [std('IGV 18%', 18), EXENTO, { nombre: 'Retención IGV 3%', kind: 'retencion', tipo: 'ret_iva', tasa: 3 }],
    PY: [std('IVA 10%', 10), red('IVA 5%', 5), EXENTO],
    UY: [std('IVA 22%', 22), red('IVA 10%', 10), EXENTO],

    // Europa
    CH: [std('MWST 8.1%', 8.1), red('MWST 3.8%', 3.8), red('MWST 2.6%', 2.6), ZERO_RATED],
    DE: [std('USt. 19%', 19), red('USt. 7%', 7), ZERO_RATED],
    // IRPF del autónomo: 15% general, 7% los primeros 3 años de alta (art. 101
    // LIRPF). Es retención del PROPIO emisor —se resta de lo que cobra—, no un
    // impuesto que el negocio le traslade a nadie.
    ES: [
        std('IVA 21%', 21), red('IVA 10%', 10), red('IVA 4%', 4), EXENTO,
        { nombre: 'Retención IRPF 15%', kind: 'retencion', tipo: 'ret_isr', tasa: 15 },
        { nombre: 'Retención IRPF 7% (nuevo autónomo)', kind: 'retencion', tipo: 'ret_isr', tasa: 7 },
    ],
    FR: [std('TVA 20%', 20), red('TVA 10%', 10), red('TVA 5,5%', 5.5), red('TVA 2,1%', 2.1), ZERO_RATED],
    GB: [std('VAT 20%', 20), red('VAT 5%', 5), ZERO_RATED],
    IE: [std('VAT 23%', 23), red('VAT 13.5%', 13.5), red('VAT 9%', 9), ZERO_RATED],
    IT: [std('IVA 22%', 22), red('IVA 10%', 10), red('IVA 5%', 5), red('IVA 4%', 4), EXENTO],
    NL: [std('BTW 21%', 21), red('BTW 9%', 9), ZERO_RATED],
    NO: [std('MVA 25%', 25), red('MVA 15%', 15), red('MVA 12%', 12), ZERO_RATED],
    PL: [std('VAT 23%', 23), red('VAT 8%', 8), red('VAT 5%', 5), ZERO_RATED],
    PT: [std('IVA 23%', 23), red('IVA 13%', 13), red('IVA 6%', 6), EXENTO],
    SE: [std('Moms 25%', 25), red('Moms 12%', 12), red('Moms 6%', 6), ZERO_RATED],
    TR: [std('KDV 20%', 20), red('KDV 10%', 10), red('KDV 1%', 1), ZERO_RATED],

    // Asia-Pacífico, África y Medio Oriente
    AE: [std('VAT 5%', 5), ZERO_RATED],
    AU: [std('GST 10%', 10), ZERO_RATED],
    JP: [std('消費税 10%', 10), red('消費税 8% (軽減税率)', 8), ZERO_RATED],
    KR: [std('VAT 10%', 10), ZERO_RATED],
    NZ: [std('GST 15%', 15), ZERO_RATED],
    PH: [std('VAT 12%', 12), ZERO_RATED],
    SA: [std('VAT 15%', 15), ZERO_RATED],
    SG: [std('GST 9%', 9), ZERO_RATED],
    ZA: [std('VAT 15%', 15), ZERO_RATED],

    // Sin preset a propósito:
    //   US — sales tax por estado/condado/ciudad, no hay tasa nacional.
    //   BR — ICMS estatal + ISS municipal + PIS/COFINS; una sola tasa mentiría.
    //   HK — no existe impuesto al consumo general.
};

/** Presets del país, o solo "Exento" cuando no hay tasa nacional que sugerir. */
export function taxPresetsFor(code: string): TaxPreset[] {
    const normalized = code.toUpperCase();
    // Un código inválido NO cae a 'MX': eso heredaba el 16% mexicano completo
    // (con retenciones incluidas) exactamente en el caso que el comentario de
    // arriba dice evitar — "el 16% mexicano heredado". `hasTaxPreset` ya
    // devolvía `false` para lo mismo; las dos funciones se contradecían.
    return isCountryCode(normalized) ? (TAX_PRESETS[normalized] ?? [EXENTO]) : [EXENTO];
}

/** ¿Cord tiene tasas estándar que sugerir para este país? */
export function hasTaxPreset(code: string): boolean {
    const normalized = code.toUpperCase();
    return isCountryCode(normalized) && !!TAX_PRESETS[normalized];
}

/**
 * Cómo se le llama a cada clase de impuesto EN ESTE PAÍS.
 *
 * `kind` es neutro por dentro; hacia afuera nunca se muestra crudo. Un impuesto
 * de consumo se llama IVA en México, VAT en Reino Unido, GST en Australia y
 * Moms en Suecia — el nombre sale del perfil del país, no de una constante.
 */
export function taxKindLabel(kind: TaxKind, locale: 'es' | 'en', countryCode: string): string {
    if (kind === 'consumo') return getCountryProfile(countryCode, locale).taxLabel;
    if (kind === 'retencion') return locale === 'en' ? 'Withholding' : 'Retención';
    return locale === 'en' ? 'Exempt' : 'Exento';
}

export function countryName(code: string, locale: 'es' | 'en' = 'es'): string {
    try {
        return new Intl.DisplayNames([locale], { type: 'region' }).of(code.toUpperCase()) || code;
    } catch {
        return code;
    }
}

export function isCountryCode(value: string): value is CountryCode {
    return (COUNTRY_CODES as readonly string[]).includes(value.toUpperCase());
}

export function getCountryProfile(code: string, displayLocale: 'es' | 'en' = 'es'): CountryProfile {
    const normalized = code.toUpperCase();
    const safeCode = isCountryCode(normalized) ? normalized : 'MX';
    const defaults = { ...DEFAULT_PROFILE, ...(PROFILE_DEFAULTS[safeCode] || {}) };
    return {
        code: safeCode,
        name: countryName(safeCode, displayLocale),
        ...defaults,
        regulatoryRail: safeCode === 'MX' ? 'cfdi_40' : 'commercial_invoice',
        paymentsRail: supportsOnlinePayments(safeCode) ? 'stripe_connect' : 'manual',
    };
}

// ── Identificación de una PERSONA, no del negocio ───────────────────────────
//
// `taxIdLabel` nombra el identificador FISCAL de la empresa (RFC, NIF, EIN).
// El KYC de Connect pide además, en algunos países, el identificador de la
// persona física que representa al negocio — y no es el mismo dato ni tiene el
// mismo nombre: en México es la CURP o el RFC personal, en Estados Unidos el
// SSN, en Canadá el SIN, en Brasil el CPF.
//
// España, Alemania, Francia y Reino Unido NO aparecen aquí a propósito:
// verificado contra la API de requisitos de Stripe, ahí no se pide
// identificación personal, así que no hay etiqueta que dar. Que un país falte
// en este mapa es la señal de que el campo no debe dibujarse — no un hueco.
const PERSON_ID_LABELS: Partial<Record<CountryCode, { es: string; en: string }>> = {
    MX: { es: 'CURP o RFC personal', en: 'CURP or personal RFC' },
    US: { es: 'Número de Seguro Social (SSN)', en: 'Social Security Number (SSN)' },
    CA: { es: 'Número de seguro social (SIN)', en: 'Social Insurance Number (SIN)' },
    BR: { es: 'CPF', en: 'CPF' },
};

/**
 * Cómo se llama la identificación PERSONAL en este país.
 *
 * Devuelve una etiqueta neutra donde no hay un nombre local, para que el campo
 * siga siendo legible si Stripe llega a pedirlo en un país que este mapa no
 * cubre todavía. Quién decide si el campo se PIDE es
 * `requiresField()` de `connect-requirements.ts`, nunca este mapa.
 */
export function personIdLabel(code: string, locale: 'es' | 'en' = 'es'): string {
    const normalized = String(code || '').toUpperCase();
    const entry = isCountryCode(normalized) ? PERSON_ID_LABELS[normalized] : undefined;
    if (entry) return entry[locale];
    return locale === 'en' ? 'Personal tax ID' : 'Identificación fiscal personal';
}

/**
 * Los países que se OFRECEN, en orden de relevancia comercial.
 *
 * `include` agrega un país fuera del set cuando la organización ya lo tiene
 * guardado: recortar el catálogo no puede hacer que una cuenta existente vea su
 * propio país desaparecer del selector y se le reescriba al guardar Ajustes.
 */
export function listCountries(locale: 'es' | 'en' = 'es', include?: string | null) {
    const extra = String(include || '').toUpperCase();
    const codes: CountryCode[] = [...SUPPORTED_COUNTRIES];
    if (extra && isCountryCode(extra) && !isSupportedCountry(extra)) codes.push(extra);
    const rank = new Map(SUPPORTED_COUNTRIES.map((code, index) => [code as string, index]));
    return codes
        .map((code) => ({
            code,
            name: countryName(code, locale),
            tag: code === 'MX'
                ? 'CFDI 4.0'
                : (locale === 'en' ? 'Commercial invoice' : 'Factura comercial'),
        }))
        .sort((a, b) => (rank.get(a.code) ?? 999) - (rank.get(b.code) ?? 999));
}

// Compatibilidad con los consumidores existentes en español.
export const COUNTRIES = listCountries('es');

// ── Estados Unidos: sales tax ───────────────────────────────────────────────
//
// Estados Unidos no tiene tasa nacional (por eso no está en TAX_PRESETS: ver
// el comentario de esa tabla), pero eso no puede significar que el catálogo
// de una cuenta nueva se quede vacío y la columna de impuesto ni se dibuje
// (`MULTI_TAX` en el editor exige más de una opción). `US_STATE_TAX` es la
// tasa BASE estatal — no incluye condado ni ciudad, que en varios estados
// suman puntos porcentuales adicionales y varían por jurisdicción exacta.
// Es un punto de partida editable, igual que cualquier fila de TAX_PRESETS:
// el negocio la ajusta con su contador a la tasa real de su domicilio.
// ── Unión Europea: inversión del sujeto pasivo (reverse charge) ────────────
// Una venta B2B entre dos estados miembro con NIF-IVA en ambos lados va a
// tipo 0 y el documento debe llevar la mención legal — no se ofrece como
// tasa, es una CONSECUENCIA de emisor y receptor estar en países distintos
// de este set y ambos declarar tax id (ver invoice-pdf.ts).
export const EU_COUNTRIES = new Set([
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
    'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
    'SI', 'ES', 'SE',
]);

export function isEuCountry(code: string): boolean {
    return EU_COUNTRIES.has(String(code || '').toUpperCase());
}

export const US_STATES: { code: string; name: string }[] = [
    { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
    { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
    { code: 'DC', name: 'District of Columbia' }, { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
    { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' },
    { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
    { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' },
    { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
    { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' },
    { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
    { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' },
    { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
    { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' },
    { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
    { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' },
    { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
    { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' },
    { code: 'WY', name: 'Wyoming' },
];

// ── Subdivisiones de los demás países con cobro en línea ────────────────────
//
// El alta de Connect sólo tenía catálogo para México y Estados Unidos; el resto
// era un input libre. No es un detalle cosmético: el proveedor EXIGE el código
// de 2 letras de la provincia en Canadá y de la UF en Brasil, así que escribir
// "Ontario" o "São Paulo" hacía que la cuenta rebotara con un error del
// proveedor que no le dice nada al dueño del negocio (regla 14 y regla 24).
//
// España va con el código de 2 dígitos del INE, que es como se identifica la
// provincia en cualquier trámite. Reino Unido, Alemania y Francia NO llevan
// catálogo a propósito: ahí el proveedor no pide subdivisión, y ofrecer un
// selector obligatorio donde no hace falta es pedir un dato inventado.

export const CA_PROVINCES: { code: string; name: string }[] = [
    { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'British Columbia' },
    { code: 'MB', name: 'Manitoba' }, { code: 'NB', name: 'New Brunswick' },
    { code: 'NL', name: 'Newfoundland and Labrador' }, { code: 'NS', name: 'Nova Scotia' },
    { code: 'NT', name: 'Northwest Territories' }, { code: 'NU', name: 'Nunavut' },
    { code: 'ON', name: 'Ontario' }, { code: 'PE', name: 'Prince Edward Island' },
    { code: 'QC', name: 'Quebec' }, { code: 'SK', name: 'Saskatchewan' },
    { code: 'YT', name: 'Yukon' },
];

export const BR_STATES: { code: string; name: string }[] = [
    { code: 'AC', name: 'Acre' }, { code: 'AL', name: 'Alagoas' }, { code: 'AP', name: 'Amapá' },
    { code: 'AM', name: 'Amazonas' }, { code: 'BA', name: 'Bahia' }, { code: 'CE', name: 'Ceará' },
    { code: 'DF', name: 'Distrito Federal' }, { code: 'ES', name: 'Espírito Santo' },
    { code: 'GO', name: 'Goiás' }, { code: 'MA', name: 'Maranhão' }, { code: 'MT', name: 'Mato Grosso' },
    { code: 'MS', name: 'Mato Grosso do Sul' }, { code: 'MG', name: 'Minas Gerais' },
    { code: 'PA', name: 'Pará' }, { code: 'PB', name: 'Paraíba' }, { code: 'PR', name: 'Paraná' },
    { code: 'PE', name: 'Pernambuco' }, { code: 'PI', name: 'Piauí' }, { code: 'RJ', name: 'Rio de Janeiro' },
    { code: 'RN', name: 'Rio Grande do Norte' }, { code: 'RS', name: 'Rio Grande do Sul' },
    { code: 'RO', name: 'Rondônia' }, { code: 'RR', name: 'Roraima' }, { code: 'SC', name: 'Santa Catarina' },
    { code: 'SP', name: 'São Paulo' }, { code: 'SE', name: 'Sergipe' }, { code: 'TO', name: 'Tocantins' },
];

export const ES_PROVINCES: { code: string; name: string }[] = [
    { code: '01', name: 'Álava' }, { code: '02', name: 'Albacete' }, { code: '03', name: 'Alicante' },
    { code: '04', name: 'Almería' }, { code: '05', name: 'Ávila' }, { code: '06', name: 'Badajoz' },
    { code: '07', name: 'Illes Balears' }, { code: '08', name: 'Barcelona' }, { code: '09', name: 'Burgos' },
    { code: '10', name: 'Cáceres' }, { code: '11', name: 'Cádiz' }, { code: '12', name: 'Castellón' },
    { code: '13', name: 'Ciudad Real' }, { code: '14', name: 'Córdoba' }, { code: '15', name: 'A Coruña' },
    { code: '16', name: 'Cuenca' }, { code: '17', name: 'Girona' }, { code: '18', name: 'Granada' },
    { code: '19', name: 'Guadalajara' }, { code: '20', name: 'Gipuzkoa' }, { code: '21', name: 'Huelva' },
    { code: '22', name: 'Huesca' }, { code: '23', name: 'Jaén' }, { code: '24', name: 'León' },
    { code: '25', name: 'Lleida' }, { code: '26', name: 'La Rioja' }, { code: '27', name: 'Lugo' },
    { code: '28', name: 'Madrid' }, { code: '29', name: 'Málaga' }, { code: '30', name: 'Murcia' },
    { code: '31', name: 'Navarra' }, { code: '32', name: 'Ourense' }, { code: '33', name: 'Asturias' },
    { code: '34', name: 'Palencia' }, { code: '35', name: 'Las Palmas' }, { code: '36', name: 'Pontevedra' },
    { code: '37', name: 'Salamanca' }, { code: '38', name: 'Santa Cruz de Tenerife' },
    { code: '39', name: 'Cantabria' }, { code: '40', name: 'Segovia' }, { code: '41', name: 'Sevilla' },
    { code: '42', name: 'Soria' }, { code: '43', name: 'Tarragona' }, { code: '44', name: 'Teruel' },
    { code: '45', name: 'Toledo' }, { code: '46', name: 'Valencia' }, { code: '47', name: 'Valladolid' },
    { code: '48', name: 'Bizkaia' }, { code: '49', name: 'Zamora' }, { code: '50', name: 'Zaragoza' },
    { code: '51', name: 'Ceuta' }, { code: '52', name: 'Melilla' },
];

/**
 * El catálogo de subdivisiones del país, o `null` si ahí no se pide una.
 *
 * `null` NO es un hueco: significa "este país no usa subdivisión en el alta" y
 * la UI debe pintar un input libre (o ninguno), no un selector vacío. México
 * vive en `STRIPE_MX_STATES` porque su catálogo lo consume además el CFDI.
 */
export function subdivisionsFor(countryCode: string): { code: string; name: string }[] | null {
    switch (String(countryCode || '').toUpperCase()) {
        case 'US': return US_STATES;
        case 'CA': return CA_PROVINCES;
        case 'BR': return BR_STATES;
        case 'ES': return ES_PROVINCES;
        default: return null;
    }
}

export function isUsState(code: string): boolean {
    const normalized = String(code || '').toUpperCase();
    return US_STATES.some((s) => s.code === normalized);
}

// Tasa BASE estatal de sales tax, en porcentaje. 0 = el estado no cobra sales
// tax estatal (puede seguir habiendo impuesto local — Alaska tiene sales tax
// municipal pese a no tener estatal). No es una tabla tributaria completa:
// condado y ciudad se editan a mano en Ajustes.
export const US_STATE_TAX: Record<string, number> = {
    AL: 4, AK: 0, AZ: 5.6, AR: 6.5, CA: 7.25, CO: 2.9, CT: 6.35, DE: 0, DC: 6,
    FL: 6, GA: 4, HI: 4, ID: 6, IL: 6.25, IN: 7, IA: 6, KS: 6.5, KY: 6, LA: 4.45,
    ME: 5.5, MD: 6, MA: 6.25, MI: 6, MN: 6.875, MS: 7, MO: 4.225, MT: 0, NE: 5.5,
    NV: 6.85, NH: 0, NJ: 6.625, NM: 4.875, NY: 4, NC: 4.75, ND: 5, OH: 5.75,
    OK: 4.5, OR: 0, PA: 6, RI: 7, SC: 6, SD: 4.2, TN: 7, TX: 6.25, UT: 4.85,
    VT: 6, VA: 4.3, WA: 6.5, WV: 6, WI: 5, WY: 4,
};

/**
 * Presets de sales tax para el estado del negocio — se usan al sembrar, NO
 * viven en TAX_PRESETS (esa tabla es por país; esto es por estado). `state`
 * ya validado contra US_STATES por el llamador.
 */
export function usStateTaxPresets(state: string): TaxPreset[] {
    const rate = US_STATE_TAX[state.toUpperCase()] ?? 0;
    const presets: TaxPreset[] = [];
    if (rate > 0) presets.push(std(`Sales tax ${state.toUpperCase()} ${rate}%`, rate));
    presets.push({ nombre: 'Exempt / Resale', kind: 'exento', tipo: 'exento', tasa: 0 });
    return presets;
}
