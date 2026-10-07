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

// El prefijo "ES" es el NIF-IVA (el mismo NIF con el código de país delante):
// se quita solo cuando lo que sigue tiene la forma de un NIF. Sin esto,
// "ESB12345674" se leía como un CIF de letra E y se rechazaba.
const cleanEs = (value: string) => String(value || '').trim().toUpperCase()
    .replace(/[\s.\-/]/g, '')
    .replace(/^ES(?=[0-9A-Z]\d{7}[0-9A-Z]$)/, '');

/**
 * NIF de persona física: DNI (8 dígitos) o K/L/M + 7 dígitos (menores sin DNI,
 * españoles en el extranjero, extranjeros sin NIE). Los K/L/M usan la letra del
 * DNI sobre sus 7 dígitos, no el control del CIF (Orden EHA/451/2008).
 */
export function validNif(value: string): boolean {
    const m = /^(\d{8}|[KLM]\d{7})([A-Z])$/.exec(cleanEs(value));
    if (!m) return false;
    return NIF_LETTERS[Number(m[1].replace(/^[KLM]/, '')) % 23] === m[2];
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
    // K, L y M no son CIF: son NIF de persona física (ver validNif).
    const m = /^([A-HJNP-SUVW])(\d{7})([0-9A-J])$/.exec(cleanEs(value));
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

/** NIF, NIE o CIF español (con o sin prefijo "ES"), según el primer carácter. */
export function validSpainTaxId(value: string): boolean {
    const clean = cleanEs(value);
    if (/^[XYZ]/.test(clean)) return validNie(clean);
    if (/^[\dKLM]/.test(clean)) return validNif(clean);
    return validCif(clean);
}

// Prefijos que el IRS nunca ha asignado a un EIN. Su tabla de campus es la
// fuente: un EIN con estos dos primeros dígitos no existe.
const EIN_NO_ASIGNADOS = '00 07 08 09 17 18 19 28 29 49 69 70 78 79 89 96 97';

/** EIN de Estados Unidos: nueve dígitos, con o sin guion tras el segundo, y prefijo asignado. */
export function validEin(value: string): boolean {
    const v = String(value || '').trim();
    return /^\d{2}-?\d{7}$/.test(v) && !EIN_NO_ASIGNADOS.includes(v.slice(0, 2));
}

// ── validateTaxId: el identificador fiscal de los países que Cord ofrece ─────
// Un solo validador por país para la organización, sus clientes, el alta de
// cobros y el Fiscal Element (reglas 24 y 28). Lo que se puede demostrar mal
// —forma imposible, prefijo inexistente, dígito verificador que no cuadra— se
// rechaza aquí con un mensaje que nombra el dato local, en vez de dejar que lo
// rechace el proveedor con un error que no le dice nada al negocio (regla 14).
// Todo lo demás pasa: un falso rechazo deja a un negocio sin poder facturar ni
// cobrar, así que un país sin validador devuelve ok y no se inventan reglas.
// Los algoritmos están contrastados con python-stdnum y con la fuente oficial
// de cada país; los casos reales viven en test/tax-id.test.ts.

export type TaxIdLocale = 'es' | 'en';

export interface TaxIdOptions {
    /** Idioma del motivo de rechazo. Default: 'es'. */
    locale?: TaxIdLocale;
    /**
     * 'fisica' acepta además los identificadores de persona que no se usan
     * para facturar a una empresa: SSN/ITIN (US), National Insurance (GB),
     * número fiscal (FR) y DNI (AR, PE). Sin persona, solo los de negocio.
     */
    persona?: 'fisica' | 'moral';
}

export type TaxIdResult =
    | { ok: true; normalized: string; kind?: string }
    | { ok: false; reason: string };

type Miss = { e: 'fmt' | 'chk' | 'pre'; k?: string; p?: string };
type Check = [kind: string, normalized: string] | Miss;
type CountryCheck = (s: string, raw: string, fisica: boolean) => Check;

const fmt: Miss = { e: 'fmt' };
const chk = (k: string): Miss => ({ e: 'chk', k });
const pre = (k: string, s: string): Miss => ({ e: 'pre', k, p: s.slice(0, 2) });
const digit = (s: string, i: number) => s.charCodeAt(i) - 48;

function luhn(d: string): boolean {
    let t = 0;
    for (let i = 0; i < d.length; i++) {
        let n = digit(d, d.length - 1 - i);
        if (i % 2) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
        t += n;
    }
    return t % 10 === 0;
}

/** Suma ponderada de los primeros `weights.length` caracteres. */
function weighted(s: string, weights: number[]): number {
    let t = 0;
    for (let i = 0; i < weights.length; i++) t += digit(s, i) * weights[i];
    return t;
}

// Módulo 11 con pesos 2..9 cíclicos desde la derecha (CNPJ). Cada carácter
// vale su código ASCII − 48: así el CNPJ alfanumérico (julio de 2026) usa la
// misma cuenta que el numérico, como lo publicó la Receita Federal.
function mod11Dv(s: string, n: number, cycle: number): number {
    let t = 0;
    for (let i = 0; i < n; i++) t += digit(s, i) * (((n - 1 - i) % cycle) + 2);
    const r = t % 11;
    return r < 2 ? 0 : 11 - r;
}

/** ISO 7064 MOD 11,10: dígito de control de la USt-IdNr alemana (BZSt). */
function mod1110(d: string): boolean {
    let p = 10;
    for (let i = 0; i < d.length - 1; i++) p = (2 * ((digit(d, i) + p) % 10 || 10)) % 11;
    return (11 - p) % 10 === digit(d, d.length - 1);
}

const AR_PE_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const CO_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
const GB_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 1];

const VALIDATORS: Record<string, CountryCheck> = {
    MX: (s) => {
        const persona = rfcPersona(s);
        if (persona) return ['rfc_' + persona, s];
        const m = RFC_RE.exec(s);
        return m && validDate(m[2], m[3], m[4]) ? chk('rfc') : fmt;
    },
    ES: (s) => {
        const v = cleanEs(s);
        const kind = /^[XYZ]/.test(v) ? 'nie' : /^[\dKLM]/.test(v) ? 'nif' : 'cif';
        if (validSpainTaxId(v)) return [kind, v];
        return /^(\d{8}[A-Z]|[KLMXYZ]\d{7}[A-Z]|[A-HJNP-SUVW]\d{7}[0-9A-J])$/.test(v) ? chk(kind) : fmt;
    },
    US: (s, _, fisica) => {
        if (!/^\d{9}$/.test(s)) return fmt;
        if (fisica) {
            // SSN: área 000, 666 y 9xx nunca se asignan; grupo 00 y serie 0000 tampoco.
            const area = s.slice(0, 3);
            if (area !== '000' && area !== '666' && s[0] !== '9' && s.slice(3, 5) !== '00' && s.slice(5) !== '0000') return ['ssn', s];
            // ITIN: empieza en 9 y el 4.º-5.º dígito cae en los rangos del IRS.
            const g = Number(s.slice(3, 5));
            if (s[0] === '9' && ((g >= 50 && g <= 65) || (g >= 70 && g <= 88) || (g >= 90 && g <= 92) || g >= 94)) return ['itin', s];
        }
        return validEin(s) ? ['ein', s] : pre('ein', s);
    },
    FR: (s, _, fisica) => {
        // TVA intracomunitaria: clave de 2 caracteres + SIREN. Las claves
        // alfanuméricas existen y no se verifican; Mónaco usa SIREN 000…
        const tva = /^(?:FR)?([0-9A-HJ-NP-Z]{2})(\d{9})$/.exec(s);
        if (tva) {
            const [, key, siren] = tva;
            if (!siren.startsWith('000') && !luhn(siren)) return chk('tva');
            if (/^\d\d$/.test(key) && Number(key) !== (Number(siren) * 100 + 12) % 97) return chk('tva');
            return ['tva', 'FR' + key + siren];
        }
        if (/^\d{9}$/.test(s)) return luhn(s) ? ['siren', s] : chk('siren');
        if (/^\d{14}$/.test(s)) {
            // La Poste numera sus establecimientos sin Luhn: la suma de los
            // dígitos es múltiplo de 5 (salvo la sede, que sí cumple Luhn).
            const poste = s.startsWith('356000000') && s !== '35600000000048';
            const ok = poste ? s.split('').reduce((t, c) => t + Number(c), 0) % 5 === 0 : luhn(s);
            return ok && luhn(s.slice(0, 9)) ? ['siret', s] : chk('siret');
        }
        if (fisica && /^[0-3]\d{12}$/.test(s)) return Number(s.slice(0, 10)) % 511 === Number(s.slice(10)) ? ['spi', s] : chk('spi');
        return fmt;
    },
    DE: (s) => {
        const m = /^(?:DE)?([1-9]\d{8})$/.exec(s);
        if (m) return mod1110(m[1]) ? ['ust_idnr', 'DE' + m[1]] : chk('ust_idnr');
        // Steuernummer: 10 u 11 dígitos (formato del Land) o 13 (federal). No
        // tiene un dígito de control común a todos los Länder: solo la forma.
        return /^(\d{10,11}|\d{13})$/.test(s) ? ['steuernummer', s] : fmt;
    },
    GB: (s, _, fisica) => {
        const vat = /^(GB|XI)?(\d{9}|\d{12})$/.exec(s);
        if (vat) {
            // HMRC: módulo 97 y, para los números nuevos, la variante "9755"
            // (suma + 55 múltiplo de 97). Los ≥100 también aceptan resto 55.
            const r = weighted(vat[2], GB_WEIGHTS) % 97;
            const ok = r === 0 || r === 42 || (r === 55 && Number(vat[2].slice(0, 3)) >= 100);
            return ok ? ['vat', (vat[1] || 'GB') + vat[2]] : chk('vat');
        }
        const gov = /^(?:GB)?(GD[0-4]\d\d|HA[5-9]\d\d)$/.exec(s);
        if (gov) return ['vat', 'GB' + gov[1]];
        const utr = /^(\d{10})K?$/.exec(s);
        if (utr) return ['utr', utr[1]];
        // Company Number de Companies House: lo que el alta de cobros pide a una empresa.
        if (/^(\d{8}|(?!GB|XI)[A-Z]{2}\d{6})$/.test(s)) return ['crn', s];
        if (fisica && /^(?!BG|GB|NK|KN|TN|NT|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]$/.test(s)) return ['nino', s];
        return fmt;
    },
    CA: (s) => {
        // Business Number (o SIN de una persona: misma forma) con Luhn, solo o
        // con su cuenta de programa: RT es GST/HST; RC, RM, RP, RR y RZ, otras.
        const bn = /^(\d{9})(R[CMPRTZ]\d{4})?$/.exec(s);
        const kind = !bn || !bn[2] ? 'bn' : bn[2].startsWith('RT') ? 'gst_hst' : 'bn15';
        if (bn) return luhn(bn[1]) ? [kind, s] : chk(kind);
        return /^\d{10}TQ\d{4}$/.test(s) ? ['qst', s] : fmt;
    },
    BR: (s) => {
        if (/^(.)\1*$/.test(s)) return fmt;
        if (/^\d{11}$/.test(s)) {
            // CPF: dos dígitos módulo 11 con pesos 10..2 y 11..2.
            const dv = (n: number) => { const r = weighted(s, Array.from({ length: n }, (_, i) => n + 1 - i)) % 11; return r < 2 ? 0 : 11 - r; };
            return dv(9) === digit(s, 9) && dv(10) === digit(s, 10) ? ['cpf', s] : chk('cpf');
        }
        if (/^[0-9A-Z]{12}\d\d$/.test(s)) {
            return mod11Dv(s, 12, 8) === digit(s, 12) && mod11Dv(s, 13, 8) === digit(s, 13) ? ['cnpj', s] : chk('cnpj');
        }
        return fmt;
    },
    CO: (_, raw) => {
        // El DV solo se verifica cuando viene separado con guion: sin él, un
        // NIT de persona (cédula) de 10 dígitos y uno de 9 + DV son
        // indistinguibles, y adivinar rechazaría NIT reales.
        const m = /^(\d{5,15})(?:-(\d))?$/.exec(raw.replace(/[\s.,]/g, ''));
        if (!m) return fmt;
        if (m[2] === undefined) return ['nit', m[1]];
        let t = 0;
        for (let i = 0; i < m[1].length; i++) t += digit(m[1], m[1].length - 1 - i) * CO_WEIGHTS[i];
        const r = t % 11;
        return (r > 1 ? 11 - r : r) === Number(m[2]) ? ['nit', m[1] + '-' + m[2]] : chk('nit');
    },
    AR: (s, _, fisica) => {
        if (/^\d{11}$/.test(s)) {
            if (!/^(2[0347]|3[034]|5[015])/.test(s)) return pre('cuit', s);
            // Un resto que da 10 no se asigna (la AFIP cambia el prefijo a 23/33);
            // los padrones antiguos traen DV 9 en ese caso y se aceptan.
            const r = 11 - (weighted(s, AR_PE_WEIGHTS) % 11);
            return (r === 11 ? 0 : r === 10 ? 9 : r) === digit(s, 10) ? ['cuit', s] : chk('cuit');
        }
        return fisica && /^\d{7,8}$/.test(s) ? ['dni', s] : fmt;
    },
    CL: (_, raw) => {
        const m = /^(\d{6,8})-?([\dK])$/.exec(raw.replace(/[\s.]/g, '').replace(/^CL/, ''));
        if (!m) return fmt;
        let t = 0;
        for (let i = 0; i < m[1].length; i++) t += digit(m[1], m[1].length - 1 - i) * ((i % 6) + 2);
        const r = 11 - (t % 11);
        return (r === 11 ? '0' : r === 10 ? 'K' : String(r)) === m[2] ? ['rut', m[1] + '-' + m[2]] : chk('rut');
    },
    PE: (s, _, fisica) => {
        if (/^\d{11}$/.test(s)) {
            if (!/^(1[0567]|20)/.test(s)) return pre('ruc', s);
            return (11 - (weighted(s, AR_PE_WEIGHTS) % 11)) % 10 === digit(s, 10) ? ['ruc', s] : chk('ruc');
        }
        return fisica && /^\d{8}$/.test(s) ? ['dni', s] : fmt;
    },
};

/** Países cuyo identificador fiscal valida validateTaxId; el resto pasa sin bloquear. */
export const TAX_ID_COUNTRIES: string[] = /* @__PURE__ */ Object.keys(VALIDATORS);

const cleanTaxIdInput = (value: unknown) => String(value ?? '').trim().toUpperCase().replace(/[\u2010-\u2015]/g, '-');

// null = país sin validador. Separado del texto para que los bundles que solo
// necesitan saber si pasa (el Fiscal Element habla con códigos de error y los
// traduce con fiscalText) no carguen los motivos en dos idiomas.
function matchTaxId(cc: string, raw: string, fisica: boolean): Check | 'empty' | null {
    const s = raw.replace(/[\s.\-/,]/g, '');
    if (!s) return 'empty';
    const check = VALIDATORS[cc];
    if (!check) return null;
    return s.length > 20 || /^0+$/.test(s) ? fmt : check(s, raw, fisica);
}

/** validateTaxId sin el motivo: lo que usa el receptor fiscal. */
export function checkTaxId(country: string, value: string, options: TaxIdOptions = {}): Extract<TaxIdResult, { ok: true }> | { ok: false } {
    const raw = cleanTaxIdInput(value);
    const m = matchTaxId(String(country || '').trim().toUpperCase(), raw, options.persona === 'fisica');
    if (m === null) return { ok: true, normalized: raw.replace(/\s+/g, ' ') };
    return Array.isArray(m) ? { ok: true, normalized: m[1], kind: m[0] } : { ok: false };
}

// Nombre del dato local; los que no se traducen son siglas oficiales.
const NAMES: Record<string, string | [es: string, en: string]> = {
    rfc: 'RFC', nif: 'NIF', nie: 'NIE', cif: 'CIF', ein: 'EIN', ssn: 'SSN', itin: 'ITIN',
    siren: 'SIREN', siret: 'SIRET', tva: ['número de TVA', 'TVA number'], spi: ['número fiscal', 'tax number'],
    ust_idnr: 'USt-IdNr.', steuernummer: 'Steuernummer', vat: ['número de VAT', 'VAT number'], utr: 'UTR',
    bn: 'Business Number', gst_hst: ['número de GST/HST', 'GST/HST number'], bn15: ['número de programa', 'program account'],
    cpf: 'CPF', cnpj: 'CNPJ', nit: 'NIT', cuit: 'CUIT', rut: 'RUT', ruc: 'RUC',
};

// Qué se nombra cuando la forma no corresponde a ninguno, y un ejemplo válido.
const FORMATS: Record<string, [kinds: string[], example: string]> = {
    MX: [['rfc'], 'EKU9003173C9'],
    ES: [['nif', 'nie', 'cif'], 'B12345674'],
    US: [['ein'], '12-3456789'],
    FR: [['siren', 'siret', 'tva'], '732 829 320'],
    DE: [['ust_idnr', 'steuernummer'], 'DE136695976'],
    GB: [['vat', 'utr'], 'GB980780684'],
    CA: [['bn', 'gst_hst'], '123456782RT0001'],
    BR: [['cnpj', 'cpf'], '16.727.230/0001-97'],
    CO: [['nit'], '900.123.456-8'],
    AR: [['cuit'], '30-54668997-9'],
    CL: [['rut'], '76.086.428-5'],
    PE: [['ruc'], '20131312955'],
};

const TEXT = {
    es: {
        or: ' o ', id: 'identificador fiscal',
        fmt: 'Revisa el {l}: no tiene el formato correcto (ej. {x}).',
        chk: 'Revisa el {l}: el dígito verificador no coincide.',
        chkEs: 'Revisa el {l}: la letra o el dígito de control no coincide.',
        pre: 'Revisa el {l}: no existe con el prefijo {p}.',
        empty: 'Captura el {l}.',
    },
    en: {
        or: ' or ', id: 'tax ID',
        fmt: 'Check the {l}: the format is not valid (e.g. {x}).',
        chk: 'Check the {l}: the check digit does not match.',
        chkEs: 'Check the {l}: the control letter or digit does not match.',
        pre: 'Check the {l}: it does not exist with prefix {p}.',
        empty: 'Enter the {l}.',
    },
};

/**
 * Valida el identificador fiscal de `country` (ISO 3166-1 alpha-2). Normaliza
 * (mayúsculas, sin espacios, puntos, guiones ni diagonales; con el prefijo de
 * país en los números de IVA europeos y del Reino Unido, sin "ES" en el NIF
 * español) y devuelve `kind` con el tipo detectado. Un país sin validador
 * devuelve ok con el valor limpio: nunca bloquea lo que no puede demostrar.
 */
export function validateTaxId(country: string, value: string, options: TaxIdOptions = {}): TaxIdResult {
    const en = options.locale === 'en';
    const t = TEXT[en ? 'en' : 'es'];
    const cc = String(country || '').trim().toUpperCase();
    const raw = cleanTaxIdInput(value);
    const m = matchTaxId(cc, raw, options.persona === 'fisica');
    if (m === null) return { ok: true, normalized: raw.replace(/\s+/g, ' ') };
    if (Array.isArray(m)) return { ok: true, normalized: m[1], kind: m[0] };

    const name = (k: string) => { const n = NAMES[k] ?? k; return typeof n === 'string' ? n : n[en ? 1 : 0]; };
    const [kinds, example]: [string[], string] = FORMATS[cc] ?? [[], ''];
    const label = kinds.length ? kinds.map(name).join(', ').replace(/, ([^,]*)$/, t.or + '$1') : t.id;
    if (m === 'empty') return { ok: false, reason: t.empty.replace('{l}', label) };
    const msg = m.e === 'fmt' ? t.fmt : m.e === 'pre' ? t.pre : cc === 'ES' ? t.chkEs : t.chk;
    return { ok: false, reason: msg.replace('{l}', m.k ? name(m.k) : label).replace('{x}', example).replace('{p}', m.p ?? '') };
}
