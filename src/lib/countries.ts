// Catálogo internacional de organizaciones. Cord puede crear una cuenta y emitir
// una factura comercial en cualquier territorio ISO 3166-1 alpha-2. El único
// carril regulatorio conectado hoy es CFDI 4.0 para México; en los demás países
// el documento es comercial y no se presenta automáticamente a la autoridad.

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
    ],
    CA: [std('GST 5%', 5), red('HST 13%', 13), red('HST 15%', 15), ZERO_RATED],

    // Latinoamérica
    AR: [std('IVA 21%', 21), red('IVA 10,5%', 10.5), red('IVA 27%', 27), EXENTO],
    CL: [std('IVA 19%', 19), EXENTO],
    CO: [
        std('IVA 19%', 19),
        red('IVA 5%', 5),
        EXENTO,
        { nombre: 'ReteIVA 15%', kind: 'retencion', tipo: 'ret_iva', tasa: 15 },
        { nombre: 'ReteFuente 2,5%', kind: 'retencion', tipo: 'ret_isr', tasa: 2.5 },
    ],
    CR: [std('IVA 13%', 13), red('IVA 4%', 4), red('IVA 2%', 2), red('IVA 1%', 1), EXENTO],
    DO: [std('ITBIS 18%', 18), red('ITBIS 16%', 16), EXENTO],
    GT: [std('IVA 12%', 12), EXENTO],
    PA: [std('ITBMS 7%', 7), EXENTO],
    PE: [std('IGV 18%', 18), EXENTO],
    PY: [std('IVA 10%', 10), red('IVA 5%', 5), EXENTO],
    UY: [std('IVA 22%', 22), red('IVA 10%', 10), EXENTO],

    // Europa
    CH: [std('MWST 8.1%', 8.1), red('MWST 3.8%', 3.8), red('MWST 2.6%', 2.6), ZERO_RATED],
    DE: [std('USt. 19%', 19), red('USt. 7%', 7), ZERO_RATED],
    ES: [std('IVA 21%', 21), red('IVA 10%', 10), red('IVA 4%', 4), EXENTO],
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
    const safeCode = isCountryCode(normalized) ? normalized : 'MX';
    return TAX_PRESETS[safeCode] ?? [EXENTO];
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
    };
}

export function listCountries(locale: 'es' | 'en' = 'es') {
    const featured: CountryCode[] = ['MX', 'US', 'CO', 'AR', 'CL', 'PE', 'ES', 'BR', 'CA', 'GB'];
    const rank = new Map(featured.map((code, index) => [code, index]));
    return COUNTRY_CODES
        .map((code) => ({
            code,
            name: countryName(code, locale),
            tag: code === 'MX'
                ? (locale === 'en' ? 'CFDI 4.0' : 'CFDI 4.0')
                : (locale === 'en' ? 'Commercial invoice' : 'Factura comercial'),
        }))
        .sort((a, b) => {
            const ar = rank.get(a.code);
            const br = rank.get(b.code);
            if (ar !== undefined || br !== undefined) return (ar ?? 999) - (br ?? 999);
            return a.name.localeCompare(b.name, locale);
        });
}

// Compatibilidad con los consumidores existentes en español.
export const COUNTRIES = listCountries('es');
