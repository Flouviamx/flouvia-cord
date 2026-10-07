// Formato de los datos de una CONTRAPARTE (el cliente del negocio) según su
// país: lada telefónica, cómo se llama su código postal y su subdivisión, un
// ejemplo de su identificador fiscal y una verificación BLANDA de su formato.
//
// Módulo puro y sin imports a propósito: lo consume el `<script>` del modal de
// clientes (bundleado al navegador) y los tests. Nada aquí toca la red ni el
// servidor.
//
// Lo que este módulo NO decide:
//   · Cómo se llama el identificador fiscal — eso es `taxIdLabel` del perfil del
//     país (`countries.ts`). Aquí solo hay un ejemplo de su forma.
//   · Si un identificador se ACEPTA. `checkTaxId()` aconseja, nunca bloquea: un
//     falso rechazo deja a un negocio sin poder dar de alta a quien le compra,
//     y un formato que no conocemos no es un formato inválido (mismo criterio
//     que la compuerta de captura de la regla 34).

export type PartyLocale = 'es' | 'en';

// ── Lada internacional (ITU-T E.164) por país ISO 3166-1 ────────────────────
//
// Sin la lada, un teléfono no le sirve a nada fuera de la pantalla: el envío
// por WhatsApp exige E.164 (`toE164()` de whatsapp.ts no inventa la lada, con
// razón) y un `wa.me/5512345678` le escribe a otro país. Los territorios sin
// servicio telefónico propio (BV, HM, TF) no aparecen.
export const CALLING_CODES: Record<string, string> = {
    AD: '376', AE: '971', AF: '93', AG: '1', AI: '1', AL: '355', AM: '374', AO: '244', AQ: '672',
    AR: '54', AS: '1', AT: '43', AU: '61', AW: '297', AX: '358', AZ: '994',
    BA: '387', BB: '1', BD: '880', BE: '32', BF: '226', BG: '359', BH: '973', BI: '257', BJ: '229',
    BL: '590', BM: '1', BN: '673', BO: '591', BQ: '599', BR: '55', BS: '1', BT: '975', BW: '267',
    BY: '375', BZ: '501',
    CA: '1', CC: '61', CD: '243', CF: '236', CG: '242', CH: '41', CI: '225', CK: '682', CL: '56',
    CM: '237', CN: '86', CO: '57', CR: '506', CU: '53', CV: '238', CW: '599', CX: '61', CY: '357',
    CZ: '420',
    DE: '49', DJ: '253', DK: '45', DM: '1', DO: '1', DZ: '213',
    EC: '593', EE: '372', EG: '20', EH: '212', ER: '291', ES: '34', ET: '251',
    FI: '358', FJ: '679', FK: '500', FM: '691', FO: '298', FR: '33',
    GA: '241', GB: '44', GD: '1', GE: '995', GF: '594', GG: '44', GH: '233', GI: '350', GL: '299',
    GM: '220', GN: '224', GP: '590', GQ: '240', GR: '30', GS: '500', GT: '502', GU: '1', GW: '245',
    GY: '592',
    HK: '852', HN: '504', HR: '385', HT: '509', HU: '36',
    ID: '62', IE: '353', IL: '972', IM: '44', IN: '91', IO: '246', IQ: '964', IR: '98', IS: '354',
    IT: '39',
    JE: '44', JM: '1', JO: '962', JP: '81',
    KE: '254', KG: '996', KH: '855', KI: '686', KM: '269', KN: '1', KP: '850', KR: '82', KW: '965',
    KY: '1', KZ: '7',
    LA: '856', LB: '961', LC: '1', LI: '423', LK: '94', LR: '231', LS: '266', LT: '370', LU: '352',
    LV: '371', LY: '218',
    MA: '212', MC: '377', MD: '373', ME: '382', MF: '590', MG: '261', MH: '692', MK: '389', ML: '223',
    MM: '95', MN: '976', MO: '853', MP: '1', MQ: '596', MR: '222', MS: '1', MT: '356', MU: '230',
    MV: '960', MW: '265', MX: '52', MY: '60', MZ: '258',
    NA: '264', NC: '687', NE: '227', NF: '672', NG: '234', NI: '505', NL: '31', NO: '47', NP: '977',
    NR: '674', NU: '683', NZ: '64',
    OM: '968',
    PA: '507', PE: '51', PF: '689', PG: '675', PH: '63', PK: '92', PL: '48', PM: '508', PN: '64',
    PR: '1', PS: '970', PT: '351', PW: '680', PY: '595',
    QA: '974',
    RE: '262', RO: '40', RS: '381', RU: '7', RW: '250',
    SA: '966', SB: '677', SC: '248', SD: '249', SE: '46', SG: '65', SH: '290', SI: '386', SJ: '47',
    SK: '421', SL: '232', SM: '378', SN: '221', SO: '252', SR: '597', SS: '211', ST: '239', SV: '503',
    SX: '1', SY: '963', SZ: '268',
    TC: '1', TD: '235', TG: '228', TH: '66', TJ: '992', TK: '690', TL: '670', TM: '993', TN: '216',
    TO: '676', TR: '90', TT: '1', TV: '688', TW: '886', TZ: '255',
    UA: '380', UG: '256', UM: '1', US: '1', UY: '598', UZ: '998',
    VA: '39', VC: '1', VE: '58', VG: '1', VI: '1', VN: '84', VU: '678',
    WF: '681', WS: '685',
    YE: '967', YT: '262',
    ZA: '27', ZM: '260', ZW: '263',
};

// Cuando varios países comparten lada (+1, +7, +44…), un número ya guardado no
// dice de cuál es. Si el país del cliente la comparte, gana el suyo; si no,
// este es el país que se muestra.
const PRIMARY_FOR_CODE: Record<string, string> = {
    '1': 'US', '7': 'RU', '39': 'IT', '44': 'GB', '47': 'NO', '61': 'AU', '64': 'NZ',
    '212': 'MA', '262': 'RE', '358': 'FI', '500': 'FK', '590': 'GP', '599': 'CW', '672': 'NF',
};

// Italia, San Marino y el Vaticano conservan el 0 inicial en formato
// internacional; en el resto, el 0 es el prefijo troncal NACIONAL y desaparece
// al anteponer la lada ("020 7946 0000" en Londres es +44 20 7946 0000).
const KEEPS_TRUNK_ZERO = new Set(['IT', 'SM', 'VA']);

export function callingCode(country: string | null | undefined): string | null {
    return CALLING_CODES[String(country || '').toUpperCase()] ?? null;
}

/**
 * Separa un teléfono guardado en país de la lada + número nacional.
 *
 * Un número sin `+` (capturado antes de que hubiera selector de lada) se
 * devuelve tal cual con el país de respaldo: no se adivina su lada.
 */
export function splitPhone(raw: string | null | undefined, fallbackCountry: string): { country: string; national: string } {
    const fallback = String(fallbackCountry || '').toUpperCase();
    const value = String(raw ?? '').trim();
    const intl = value.startsWith('+') ? value.slice(1) : value.startsWith('00') ? value.slice(2) : null;
    if (intl === null) return { country: fallback, national: value };
    const digits = intl.replace(/\D/g, '');
    for (let len = 3; len >= 1; len--) {
        const code = digits.slice(0, len);
        const owners = Object.keys(CALLING_CODES).filter((c) => CALLING_CODES[c] === code);
        if (!owners.length) continue;
        const country = owners.includes(fallback) ? fallback : (PRIMARY_FOR_CODE[code] ?? owners[0]);
        // Se conserva el formato que escribió la persona (espacios, guiones)
        // quitando solo la lada del principio.
        let rest = intl.trimStart();
        let consumed = 0;
        let i = 0;
        while (i < rest.length && consumed < code.length) {
            if (/\d/.test(rest[i])) consumed++;
            i++;
        }
        rest = rest.slice(i).replace(/^[\s\-.)]+/, '');
        return { country, national: rest };
    }
    return { country: fallback, national: value };
}

/**
 * Une país + número nacional en formato internacional legible
 * (`+52 55 1234 5678`). Si la persona ya escribió el número con `+` o `00`, se
 * respeta lo que escribió: es más específico que el selector.
 */
export function joinPhone(country: string, national: string | null | undefined): string {
    const value = String(national ?? '').trim();
    if (!value) return '';
    if (value.startsWith('+')) return value;
    if (value.startsWith('00')) return `+${value.slice(2).trimStart()}`;
    const code = callingCode(country);
    if (!code) return value;
    const cc = String(country).toUpperCase();
    const local = KEEPS_TRUNK_ZERO.has(cc) ? value : value.replace(/^0(?=\s*\d)/, '').trimStart();
    return `+${code} ${local}`;
}

// ── Vocabulario postal y de subdivisión ─────────────────────────────────────
//
// Mismo criterio que `taxIdLabel`: el nombre local cuando existe ("CEP",
// "ZIP code", "PLZ"), y uno neutro en el idioma de la cuenta cuando no.

type Bilingual = { es: string; en: string };
const same = (s: string): Bilingual => ({ es: s, en: s });

const POSTAL_LABELS: Record<string, Bilingual> = {
    US: { es: 'Código ZIP', en: 'ZIP code' },
    PR: { es: 'Código ZIP', en: 'ZIP code' },
    BR: same('CEP'),
    GB: { es: 'Código postal (postcode)', en: 'Postcode' },
    DE: { es: 'Código postal (PLZ)', en: 'Postal code (PLZ)' },
    AT: { es: 'Código postal (PLZ)', en: 'Postal code (PLZ)' },
    CH: { es: 'Código postal (NPA)', en: 'Postal code (NPA)' },
    IT: same('CAP'),
    IN: { es: 'Código PIN', en: 'PIN code' },
    IE: same('Eircode'),
};

const POSTAL_PLACEHOLDERS: Record<string, string> = {
    MX: '06600', US: '94105', CA: 'M5V 3L9', BR: '01310-100', ES: '28013', GB: 'SW1A 1AA',
    DE: '10115', FR: '75001', CO: '110111', AR: 'C1002AAP', CL: '8320000', PE: '15001',
    IT: '00184', PT: '1100-148', NL: '1012 AB', AU: '2000', JP: '100-0001', IN: '110001',
    IE: 'D02 X285', AT: '1010', CH: '8001', BE: '1000', UY: '11000', EC: '170150',
};

const REGION_LABELS: Record<string, Bilingual> = {
    MX: { es: 'Estado', en: 'State' },
    US: { es: 'Estado', en: 'State' },
    BR: { es: 'Estado (UF)', en: 'State (UF)' },
    AU: { es: 'Estado', en: 'State' },
    IN: { es: 'Estado', en: 'State' },
    VE: { es: 'Estado', en: 'State' },
    DE: { es: 'Estado federado', en: 'State' },
    CA: { es: 'Provincia', en: 'Province' },
    ES: { es: 'Provincia', en: 'Province' },
    AR: { es: 'Provincia', en: 'Province' },
    IT: { es: 'Provincia', en: 'Province' },
    EC: { es: 'Provincia', en: 'Province' },
    CO: { es: 'Departamento', en: 'Department' },
    PE: { es: 'Departamento', en: 'Department' },
    UY: { es: 'Departamento', en: 'Department' },
    GT: { es: 'Departamento', en: 'Department' },
    CL: { es: 'Región', en: 'Region' },
    FR: { es: 'Región', en: 'Region' },
    GB: { es: 'Condado', en: 'County' },
    IE: { es: 'Condado', en: 'County' },
    JP: { es: 'Prefectura', en: 'Prefecture' },
};

export function postalLabel(country: string, locale: PartyLocale): string {
    const entry = POSTAL_LABELS[String(country || '').toUpperCase()];
    if (entry) return entry[locale];
    return locale === 'en' ? 'Postal code' : 'Código postal';
}

export function postalPlaceholder(country: string): string {
    return POSTAL_PLACEHOLDERS[String(country || '').toUpperCase()] ?? '';
}

export function regionLabel(country: string, locale: PartyLocale): string {
    const entry = REGION_LABELS[String(country || '').toUpperCase()];
    if (entry) return entry[locale];
    return locale === 'en' ? 'State / province' : 'Estado / provincia';
}

// ── Identificador fiscal: ejemplo y verificación blanda ─────────────────────

// Ejemplos con dígito de control VÁLIDO (los verifica test/party-format.test.ts):
// un placeholder que no pasa su propia verificación enseña el formato mal.
const TAX_ID_EXAMPLES: Record<string, string> = {
    MX: 'DEZ981123QX1',
    US: '12-3456789',
    CA: '123456782RT0001',
    BR: '11.222.333/0001-81',
    ES: 'B12345674',
    GB: 'GB123456789',
    DE: 'DE123456789',
    FR: '732 829 320',
    CO: '900123456-8',
    AR: '30-71234567-1',
    CL: '76.123.456-0',
    PE: '20123456786',
};

export function taxIdPlaceholder(country: string): string {
    return TAX_ID_EXAMPLES[String(country || '').toUpperCase()] ?? '';
}

export type TaxIdCheck = 'valid' | 'invalid' | 'unchecked';

const compact = (raw: string) => String(raw ?? '').toUpperCase().replace(/[\s.\-/]/g, '');

/** Luhn (mod 10) sobre una cadena de dígitos, el último es el de control. */
function luhn(digits: string): boolean {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
        let d = Number(digits[digits.length - 1 - i]);
        if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
    }
    return sum % 10 === 0;
}

function weighted(digits: string, weights: number[]): number {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += Number(digits[i]) * weights[i];
    return sum;
}

function cpf(d: string): boolean {
    if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
    const dv = (len: number) => {
        let sum = 0;
        for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
        const r = (sum * 10) % 11;
        return r === 10 ? 0 : r;
    };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function cnpj(d: string): boolean {
    if (!/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
    const dv = (w: number[]) => { const r = weighted(d, w) % 11; return r < 2 ? 0 : 11 - r; };
    return dv([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[12])
        && dv([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[13]);
}

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

function spain(v: string): boolean {
    const s = v.startsWith('ES') ? v.slice(2) : v;
    // DNI / NIF de persona física
    if (/^\d{8}[A-Z]$/.test(s)) return DNI_LETTERS[Number(s.slice(0, 8)) % 23] === s[8];
    // NIE (X/Y/Z) y NIF especiales (K/L/M), misma letra de control
    if (/^[XYZ]\d{7}[A-Z]$/.test(s)) return DNI_LETTERS[Number('XYZ'.indexOf(s[0]) + s.slice(1, 8)) % 23] === s[8];
    if (/^[KLM]\d{7}[A-Z]$/.test(s)) return DNI_LETTERS[Number(s.slice(1, 8)) % 23] === s[8];
    // CIF / NIF de persona jurídica
    if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(s)) {
        const body = s.slice(1, 8);
        let sum = 0;
        for (let i = 0; i < 7; i++) {
            const n = Number(body[i]);
            if (i % 2 === 0) { const x = n * 2; sum += Math.floor(x / 10) + (x % 10); } else sum += n;
        }
        const control = (10 - (sum % 10)) % 10;
        const ctl = s[8];
        const letter = 'JABCDEFGHI'[control];
        if ('ABEH'.includes(s[0])) return ctl === String(control);
        if ('NPQRSW'.includes(s[0])) return ctl === letter;
        return ctl === String(control) || ctl === letter;
    }
    return false;
}

function colombia(raw: string): boolean {
    const parts = String(raw).replace(/[\s.]/g, '').split('-');
    if (parts.length > 2 || !parts.every((p) => /^\d+$/.test(p))) return false;
    const [base, dv] = parts;
    if (base.length < 6 || base.length > 10) return false;
    if (dv === undefined) return true; // sin guion no se distingue el DV del cuerpo
    if (dv.length !== 1) return false;
    const w = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += Number(base[base.length - 1 - i]) * w[i];
    const r = sum % 11;
    return (r > 1 ? 11 - r : r) === Number(dv);
}

function argentina(d: string): boolean {
    if (/^\d{7,8}$/.test(d)) return true; // DNI de consumidor final
    if (!/^\d{11}$/.test(d)) return false;
    const r = 11 - (weighted(d, [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]) % 11);
    const dv = r === 11 ? 0 : r;
    return dv !== 10 && dv === Number(d[10]);
}

function chile(v: string): boolean {
    if (!/^\d{7,8}[\dK]$/.test(v)) return false;
    const body = v.slice(0, -1);
    let sum = 0;
    for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (2 + (i % 6));
    const r = 11 - (sum % 11);
    const dv = r === 11 ? '0' : r === 10 ? 'K' : String(r);
    return dv === v.slice(-1);
}

function peru(d: string): boolean {
    if (/^\d{8}$/.test(d)) return true; // DNI de persona
    if (!/^(10|15|16|17|20)\d{9}$/.test(d)) return false;
    const r = 11 - (weighted(d, [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]) % 11);
    const dv = r === 10 ? 0 : r === 11 ? 1 : r;
    return dv === Number(d[10]);
}

/**
 * ¿El identificador fiscal tiene la FORMA que se espera en ese país?
 *
 * `unchecked` = no conocemos el formato de ese país, o el campo está vacío.
 * Nunca es motivo para impedir el guardado.
 */
export function checkTaxId(country: string, raw: string | null | undefined): TaxIdCheck {
    const v = compact(String(raw ?? ''));
    if (!v) return 'unchecked';
    switch (String(country || '').toUpperCase()) {
        case 'MX': {
            const m = /^[A-ZÑ&]{3,4}(\d{2})(\d{2})(\d{2})[A-Z\d]{3}$/.exec(v);
            if (!m) return 'invalid';
            const mes = Number(m[2]);
            const dia = Number(m[3]);
            return mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 ? 'valid' : 'invalid';
        }
        case 'US': return /^\d{9}$/.test(v) ? 'valid' : 'invalid'; // EIN, SSN o ITIN
        case 'CA': {
            const m = /^(\d{9})((RT|RC|RP|RM|RR|RZ)\d{4})?$/.exec(v);
            return m && luhn(m[1]) ? 'valid' : 'invalid';
        }
        case 'BR': return cpf(v) || cnpj(v) ? 'valid' : 'invalid';
        case 'ES': return spain(v) ? 'valid' : 'invalid';
        case 'GB': {
            const s = v.startsWith('GB') ? v.slice(2) : v;
            return /^(\d{9}|\d{12}|GD\d{3}|HA\d{3}|\d{10})$/.test(s) ? 'valid' : 'invalid';
        }
        case 'DE': {
            if (v.startsWith('DE')) return /^DE\d{9}$/.test(v) ? 'valid' : 'invalid';
            return /^\d{9,13}$/.test(v) ? 'valid' : 'invalid'; // USt-IdNr sin prefijo o Steuernummer
        }
        case 'FR': {
            if (v.startsWith('FR')) return /^FR[0-9A-Z]{2}\d{9}$/.test(v) && luhn(v.slice(4)) ? 'valid' : 'invalid';
            return /^(\d{9}|\d{14})$/.test(v) && luhn(v) ? 'valid' : 'invalid'; // SIREN / SIRET
        }
        case 'CO': return colombia(String(raw)) ? 'valid' : 'invalid';
        case 'AR': return argentina(v) ? 'valid' : 'invalid';
        case 'CL': return chile(v) ? 'valid' : 'invalid';
        case 'PE': return peru(v) ? 'valid' : 'invalid';
        default: return 'unchecked';
    }
}
