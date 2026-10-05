// Identificadores fiscales por país. Fuente única para la app (src/lib/tax-id.ts
// la reexporta) y para el Fiscal Element: el navegador valida mientras se
// escribe y el servidor vuelve a validar con este mismo código.

export type RfcPersona = 'fisica' | 'moral' | 'generico';

const RFC_RE = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z0-9]{2})([0-9A])$/;
const RFC_DICT = '0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ';
// Público en general y extranjeros: el SAT los publica fijos, sin dígito calculado.
export const RFC_GENERICOS = new Set(['XAXX010101000', 'XEXX010101000']);

export function normalizeRfc(value: string): string {
    return String(value || '').trim().toUpperCase().replace(/[\s-]/g, '');
}

function rfcCheckDigit(rfc: string): string {
    const base = (rfc.length === 12 ? ' ' + rfc : rfc).slice(0, 12);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += RFC_DICT.indexOf(base[i]) * (13 - i);
    const r = sum % 11;
    if (r === 0) return '0';
    return 11 - r === 10 ? 'A' : String(11 - r);
}

function validDate(yy: string, mm: string, dd: string): boolean {
    const m = Number(mm);
    const d = Number(dd);
    if (m < 1 || m > 12 || d < 1) return false;
    const daysInMonth = new Date(Date.UTC(2000 + Number(yy), m, 0)).getUTCDate();
    return d <= Math.max(daysInMonth, m === 2 ? 29 : 0);
}

/** RFC con forma, fecha y dígito verificador del SAT. */
export function validRfc(value: string): boolean {
    const rfc = normalizeRfc(value);
    if (RFC_GENERICOS.has(rfc)) return true;
    const m = RFC_RE.exec(rfc);
    if (!m || !validDate(m[2], m[3], m[4])) return false;
    return rfcCheckDigit(rfc) === m[6];
}

/** 13 caracteres = persona física; 12 = persona moral. */
export function rfcPersona(value: string): RfcPersona | null {
    const rfc = normalizeRfc(value);
    if (RFC_GENERICOS.has(rfc)) return 'generico';
    if (!validRfc(rfc)) return null;
    return rfc.length === 13 ? 'fisica' : 'moral';
}

// Letra de control española: resto entre 23 indexado en esta tabla. Misma
// fórmula para NIF y NIE (el NIE antepone X/Y/Z como 0/1/2).
const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

const cleanEs = (value: string) => String(value || '').trim().toUpperCase().replace(/[\s-]/g, '');

export function validNif(value: string): boolean {
    const m = /^(\d{8})([A-Z])$/.exec(cleanEs(value));
    if (!m) return false;
    return NIF_LETTERS[Number(m[1]) % 23] === m[2];
}

export function validNie(value: string): boolean {
    const m = /^([XYZ])(\d{7})([A-Z])$/.exec(cleanEs(value));
    if (!m) return false;
    const prefix = { X: '0', Y: '1', Z: '2' }[m[1]] as string;
    return NIF_LETTERS[Number(prefix + m[2]) % 23] === m[3];
}

// Para las siglas cuya forma de control declara la norma se exige esa forma;
// para el resto se aceptan las dos: un CIF real rechazado bloquea a un negocio.
const CIF_DIGIT_ONLY = new Set(['A', 'B', 'E', 'H']);
const CIF_LETTER_ONLY = new Set(['N', 'P', 'Q', 'R', 'S', 'W']);
const CIF_CONTROL_LETTERS = 'JABCDEFGHI';

export function validCif(value: string): boolean {
    const m = /^([A-HJ-NP-SUVW])(\d{7})([0-9A-J])$/.exec(cleanEs(value));
    if (!m) return false;
    const [, letter, digits, control] = m;
    let sumEven = 0;
    let sumOdd = 0;
    for (let i = 0; i < 7; i++) {
        const d = Number(digits[i]);
        if (i % 2 === 1) sumEven += d;
        else sumOdd += d * 2 >= 10 ? d * 2 - 9 : d * 2;
    }
    const controlDigit = (10 - ((sumEven + sumOdd) % 10)) % 10;
    const controlLetter = CIF_CONTROL_LETTERS[controlDigit];
    if (CIF_DIGIT_ONLY.has(letter)) return control === String(controlDigit);
    if (CIF_LETTER_ONLY.has(letter)) return control === controlLetter;
    return control === String(controlDigit) || control === controlLetter;
}

/** NIF, NIE o CIF español, según el primer carácter. */
export function validSpainTaxId(value: string): boolean {
    const clean = cleanEs(value);
    if (/^[XYZ]/.test(clean)) return validNie(clean);
    if (/^\d/.test(clean)) return validNif(clean);
    return validCif(clean);
}

/** EIN de Estados Unidos: nueve dígitos, con o sin guion tras el segundo. */
export function validEin(value: string): boolean {
    return /^\d{2}-?\d{7}$/.test(String(value || '').trim());
}
