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
    invoicePrefix: string;
    regulatoryRail: 'cfdi_40' | 'commercial_invoice';
}

type ProfileDefaults = Pick<CountryProfile, 'currency' | 'locale' | 'timeZone' | 'taxIdLabel' | 'invoicePrefix'>;

const DEFAULT_PROFILE: ProfileDefaults = {
    currency: 'USD',
    locale: 'en-US',
    timeZone: 'UTC',
    taxIdLabel: 'Tax ID',
    invoicePrefix: 'INV',
};

// Defaults operativos, no reglas tributarias. Evitan que una cuenta nueva en
// otro país nazca con MXN y horario de Ciudad de México. Lo no listado cae a
// USD/UTC y puede ajustarse en Configuración.
const PROFILE_DEFAULTS: Partial<Record<CountryCode, Partial<ProfileDefaults>>> = {
    AR: { currency: 'ARS', locale: 'es-AR', timeZone: 'America/Argentina/Buenos_Aires', taxIdLabel: 'CUIT' },
    AU: { currency: 'AUD', locale: 'en-AU', timeZone: 'Australia/Sydney', taxIdLabel: 'ABN' },
    BR: { currency: 'BRL', locale: 'pt-BR', timeZone: 'America/Sao_Paulo', taxIdLabel: 'CNPJ / CPF' },
    CA: { currency: 'CAD', locale: 'en-CA', timeZone: 'America/Toronto', taxIdLabel: 'Business number / Tax ID' },
    CH: { currency: 'CHF', locale: 'de-CH', timeZone: 'Europe/Zurich', taxIdLabel: 'UID / VAT ID' },
    CL: { currency: 'CLP', locale: 'es-CL', timeZone: 'America/Santiago', taxIdLabel: 'RUT' },
    CN: { currency: 'CNY', locale: 'zh-CN', timeZone: 'Asia/Shanghai', taxIdLabel: 'Unified social credit code' },
    CO: { currency: 'COP', locale: 'es-CO', timeZone: 'America/Bogota', taxIdLabel: 'NIT' },
    CR: { currency: 'CRC', locale: 'es-CR', timeZone: 'America/Costa_Rica', taxIdLabel: 'Cédula jurídica / NITE' },
    DE: { currency: 'EUR', locale: 'de-DE', timeZone: 'Europe/Berlin', taxIdLabel: 'USt-IdNr.' },
    DO: { currency: 'DOP', locale: 'es-DO', timeZone: 'America/Santo_Domingo', taxIdLabel: 'RNC' },
    EC: { currency: 'USD', locale: 'es-EC', timeZone: 'America/Guayaquil', taxIdLabel: 'RUC' },
    ES: { currency: 'EUR', locale: 'es-ES', timeZone: 'Europe/Madrid', taxIdLabel: 'NIF / CIF' },
    FR: { currency: 'EUR', locale: 'fr-FR', timeZone: 'Europe/Paris', taxIdLabel: 'SIREN / VAT ID' },
    GB: { currency: 'GBP', locale: 'en-GB', timeZone: 'Europe/London', taxIdLabel: 'UTR / VAT number' },
    GT: { currency: 'GTQ', locale: 'es-GT', timeZone: 'America/Guatemala', taxIdLabel: 'NIT' },
    HK: { currency: 'HKD', locale: 'en-HK', timeZone: 'Asia/Hong_Kong', taxIdLabel: 'Business registration number' },
    ID: { currency: 'IDR', locale: 'id-ID', timeZone: 'Asia/Jakarta', taxIdLabel: 'NPWP' },
    IE: { currency: 'EUR', locale: 'en-IE', timeZone: 'Europe/Dublin', taxIdLabel: 'Tax reference / VAT number' },
    IL: { currency: 'ILS', locale: 'he-IL', timeZone: 'Asia/Jerusalem', taxIdLabel: 'Tax ID' },
    IN: { currency: 'INR', locale: 'en-IN', timeZone: 'Asia/Kolkata', taxIdLabel: 'GSTIN / PAN' },
    IT: { currency: 'EUR', locale: 'it-IT', timeZone: 'Europe/Rome', taxIdLabel: 'Partita IVA / Codice fiscale' },
    JP: { currency: 'JPY', locale: 'ja-JP', timeZone: 'Asia/Tokyo', taxIdLabel: 'Corporate number / T-number' },
    KR: { currency: 'KRW', locale: 'ko-KR', timeZone: 'Asia/Seoul', taxIdLabel: 'Business registration number' },
    MX: { currency: 'MXN', locale: 'es-MX', timeZone: 'America/Mexico_City', taxIdLabel: 'RFC', invoicePrefix: 'FAC' },
    MY: { currency: 'MYR', locale: 'en-MY', timeZone: 'Asia/Kuala_Lumpur', taxIdLabel: 'TIN / Registration number' },
    NL: { currency: 'EUR', locale: 'nl-NL', timeZone: 'Europe/Amsterdam', taxIdLabel: 'BTW-id / KVK' },
    NO: { currency: 'NOK', locale: 'nb-NO', timeZone: 'Europe/Oslo', taxIdLabel: 'Organization number / MVA' },
    NZ: { currency: 'NZD', locale: 'en-NZ', timeZone: 'Pacific/Auckland', taxIdLabel: 'NZBN / GST number' },
    PA: { currency: 'USD', locale: 'es-PA', timeZone: 'America/Panama', taxIdLabel: 'RUC' },
    PE: { currency: 'PEN', locale: 'es-PE', timeZone: 'America/Lima', taxIdLabel: 'RUC' },
    PH: { currency: 'PHP', locale: 'en-PH', timeZone: 'Asia/Manila', taxIdLabel: 'TIN' },
    PL: { currency: 'PLN', locale: 'pl-PL', timeZone: 'Europe/Warsaw', taxIdLabel: 'NIP' },
    PT: { currency: 'EUR', locale: 'pt-PT', timeZone: 'Europe/Lisbon', taxIdLabel: 'NIF' },
    PY: { currency: 'PYG', locale: 'es-PY', timeZone: 'America/Asuncion', taxIdLabel: 'RUC' },
    SA: { currency: 'SAR', locale: 'ar-SA', timeZone: 'Asia/Riyadh', taxIdLabel: 'VAT / Tax ID' },
    SE: { currency: 'SEK', locale: 'sv-SE', timeZone: 'Europe/Stockholm', taxIdLabel: 'Organization number / VAT ID' },
    SG: { currency: 'SGD', locale: 'en-SG', timeZone: 'Asia/Singapore', taxIdLabel: 'UEN / GST number' },
    TR: { currency: 'TRY', locale: 'tr-TR', timeZone: 'Europe/Istanbul', taxIdLabel: 'VKN / TCKN' },
    TW: { currency: 'TWD', locale: 'zh-TW', timeZone: 'Asia/Taipei', taxIdLabel: 'Uniform business number' },
    US: { currency: 'USD', locale: 'en-US', timeZone: 'America/New_York', taxIdLabel: 'EIN / Tax ID' },
    UY: { currency: 'UYU', locale: 'es-UY', timeZone: 'America/Montevideo', taxIdLabel: 'RUT' },
    VE: { currency: 'USD', locale: 'es-VE', timeZone: 'America/Caracas', taxIdLabel: 'RIF' },
    ZA: { currency: 'ZAR', locale: 'en-ZA', timeZone: 'Africa/Johannesburg', taxIdLabel: 'Tax / VAT number' },
};

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
