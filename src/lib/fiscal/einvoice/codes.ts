// Listas de códigos de la factura electrónica europea.
//
// Sin imports: lo usan el servidor, los formularios (cliente y Ajustes) y los
// checks con Node.
//
// EAS (Electronic Address Scheme, CEF): la lista exacta que valida BR-CL-25 en
// el schematron oficial de EN 16931 (CEN/TC 434, v1.3.16). Una dirección
// electrónica con un esquema fuera de esta lista hace fallar el documento
// entero, así que Cord no acepta guardarla.
export const EAS_SCHEMES: ReadonlySet<string> = new Set((
    '0002 0007 0009 0037 0060 0088 0096 0097 0106 0130 0135 0142 0147 0151 0154 0158 0170 0177 0183 0184 0188 '
    + '0190 0191 0192 0193 0194 0195 0196 0198 0199 0200 0201 0202 0203 0204 0205 0208 0209 0210 0211 0212 0213 '
    + '0215 0216 0217 0218 0219 0220 0221 0225 0230 0235 0240 0244 0242 0245 0246 0248 9910 9913 9914 9915 9918 '
    + '9919 9920 9922 9923 9924 9925 9926 9927 9928 9929 9930 9931 9932 9933 9934 9935 9936 9937 9938 9939 9940 '
    + '9941 9942 9943 9944 9945 9946 9947 9948 9949 9950 9951 9952 9953 9957 9959 AN AQ AS AU EM'
).split(' '));

/**
 * Los esquemas que un negocio de la UE usa de verdad, con su nombre. El
 * selector ofrece estos; el resto de la lista EAS se acepta si llega por la
 * API, pero no se dibuja un menú de 130 códigos.
 */
export const EAS_COMMON: readonly { code: string; es: string; en: string }[] = [
    { code: '0088', es: 'GLN (GS1)', en: 'GLN (GS1)' },
    { code: '0204', es: 'Leitweg-ID (administración pública alemana)', en: 'Leitweg-ID (German public sector)' },
    { code: '9930', es: 'NIF-IVA de Alemania', en: 'German VAT number' },
    { code: '0009', es: 'SIRET (Francia)', en: 'SIRET (France)' },
    { code: '0002', es: 'SIREN (Francia)', en: 'SIREN (France)' },
    { code: '0225', es: 'Dirección de facturación electrónica (Francia)', en: 'E-invoicing address (France)' },
    { code: '9957', es: 'NIF-IVA de Francia', en: 'French VAT number' },
    { code: '9920', es: 'NIF-IVA de España', en: 'Spanish VAT number' },
    { code: '0208', es: 'Número de empresa (Bélgica)', en: 'Enterprise number (Belgium)' },
    { code: '0106', es: 'KvK (Países Bajos)', en: 'KvK (Netherlands)' },
    { code: '0190', es: 'OIN (Países Bajos)', en: 'OIN (Netherlands)' },
    { code: '0211', es: 'Partita IVA (Italia)', en: 'Partita IVA (Italy)' },
    { code: '0007', es: 'Número de organización (Suecia)', en: 'Organisation number (Sweden)' },
    { code: '0184', es: 'CVR (Dinamarca)', en: 'CVR (Denmark)' },
    { code: '0192', es: 'Número de organización (Noruega)', en: 'Organisation number (Norway)' },
    { code: 'EM', es: 'Correo electrónico', en: 'Email address' },
];

/**
 * Valida y normaliza "esquema:identificador". Devuelve null si el esquema no
 * está en la lista EAS o falta el identificador; el llamador decide el mensaje.
 */
export function normalizeEInvoiceAddress(value: unknown): string | null {
    const m = /^\s*([0-9]{4}|[A-Za-z]{2})\s*:\s*(\S.*?)\s*$/.exec(String(value ?? ''));
    if (!m) return null;
    const scheme = m[1].toUpperCase();
    if (!EAS_SCHEMES.has(scheme)) return null;
    const id = m[2].slice(0, 120);
    if (scheme === 'EM' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id)) return null;
    return `${scheme}:${id}`;
}

/** "esquema:identificador" guardado → sus dos partes, o null si no es válido. */
export function splitEInvoiceAddress(value: unknown): { scheme: string; id: string } | null {
    const normalized = normalizeEInvoiceAddress(value);
    if (!normalized) return null;
    const i = normalized.indexOf(':');
    return { scheme: normalized.slice(0, i), id: normalized.slice(i + 1) };
}

// ── Leitweg-ID ───────────────────────────────────────────────────────────────
//
// Formatspezifikation Leitweg-ID v2.0.2 (KoSIT, 28.07.2021), caps. 2.1–2.4:
//   - Grobadressierung: 2 a 12 dígitos; los dos primeros son el Land (01–16)
//     o el Bund (99);
//   - Feinadressierung opcional: hasta 30 letras latinas o dígitos, sin
//     distinguir mayúsculas, precedida de "-";
//   - Prüfziffer: dos dígitos precedidos de "-", ISO/IEC 7064 MOD 97-10 sobre
//     Grob + Fein sin guiones, con las letras traducidas A=10 … Z=35.
// Ejemplo de la propia especificación: 04011000-1234512345-06.

export type LeitwegCheck =
    | { ok: true; normalized: string }
    | { ok: false; reason: 'shape' | 'land' | 'checksum' };

const LEITWEG_RE = /^(\d{2,12})(?:-([A-Z0-9]{1,30}))?-(\d{2})$/;

/** Cadena numérica de la spec: letras → 10…35, dígitos tal cual. */
function leitwegDigits(value: string): string {
    return value.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
}

/** Resto módulo 97 de un número decimal arbitrariamente largo (por tramos). */
function mod97(digits: string): number {
    let rest = 0;
    for (let i = 0; i < digits.length; i += 7) rest = Number(String(rest) + digits.slice(i, i + 7)) % 97;
    return rest;
}

/** Prüfziffer de "Grob[-Fein]" (sin Prüfziffer), dos dígitos. */
export function leitwegCheckDigits(withoutCheck: string): string {
    const base = String(withoutCheck).toUpperCase().replace(/-/g, '');
    return String(98 - mod97(leitwegDigits(base) + '00')).padStart(2, '0');
}

export function checkLeitwegId(value: unknown): LeitwegCheck {
    const v = String(value ?? '').trim().toUpperCase();
    const m = LEITWEG_RE.exec(v);
    if (!m) return { ok: false, reason: 'shape' };
    const land = Number(m[1].slice(0, 2));
    if (!((land >= 1 && land <= 16) || land === 99)) return { ok: false, reason: 'land' };
    if (mod97(leitwegDigits(m[1] + (m[2] ?? '') + m[3])) !== 1) return { ok: false, reason: 'checksum' };
    return { ok: true, normalized: v };
}

/** Mensaje accionable para quien capturó el Leitweg-ID. */
export function leitwegProblem(reason: 'shape' | 'land' | 'checksum', lang: 'es' | 'en'): string {
    if (reason === 'checksum') {
        return lang === 'en'
            ? 'The Leitweg-ID check digits do not match: copy it again, complete, from the purchase order or the public body.'
            : 'Los dígitos de control del Leitweg-ID no coinciden: vuelve a copiarlo completo de la orden de compra o del organismo.';
    }
    if (reason === 'land') {
        return lang === 'en'
            ? 'A Leitweg-ID starts with the code of a German state (01 to 16) or of the Federation (99).'
            : 'Un Leitweg-ID empieza con el código de un estado federado alemán (01 a 16) o de la Federación (99).';
    }
    return lang === 'en'
        ? 'The Leitweg-ID has 2 to 12 digits, an optional part of up to 30 letters or digits and 2 check digits, separated by hyphens (for example 04011000-1234512345-06).'
        : 'El Leitweg-ID lleva de 2 a 12 dígitos, una parte opcional de hasta 30 letras o dígitos y 2 dígitos de control, separados por guiones (por ejemplo 04011000-1234512345-06).';
}

/**
 * La dirección electrónica con esquema 0204 ES un Leitweg-ID (código EAS 0204,
 * registrado en ISO/IEC 6523 para la Leitweg-ID: cap. 1.5 de la spec). `null`
 * si la dirección no lo es o el Leitweg-ID es válido.
 */
export function einvoiceAddressLeitwegProblem(value: unknown): LeitwegCheck & { ok: false } | null {
    const parts = splitEInvoiceAddress(value);
    if (!parts || parts.scheme !== '0204') return null;
    const c = checkLeitwegId(parts.id);
    return c.ok ? null : c;
}

/** BIC/SWIFT: 8 u 11 caracteres (ISO 9362). Normalizado o null. */
export function normalizeBic(value: unknown): string | null {
    const v = String(value ?? '').toUpperCase().replace(/\s+/g, '');
    return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v) ? v : null;
}

/**
 * Qué formato estructurado acompaña al correo de una factura, por organización
 * (`fiscal_metadata.einvoice_email`).
 *   - facturx: el PDF adjunto ES el Factur-X (PDF/A-3 con el XML dentro).
 *   - xrechnung: el PDF de siempre MÁS el XML de XRechnung.
 *   - off: solo el PDF.
 * Sin valor guardado manda el país: Francia → facturx (la factura electrónica
 * B2B francesa parte de Factur-X), Alemania → xrechnung (la E-Rechnung
 * obligatoria entre empresas desde 2025), el resto → off.
 */
export type EInvoiceEmailMode = 'off' | 'facturx' | 'xrechnung';
export const EINVOICE_EMAIL_MODES: readonly EInvoiceEmailMode[] = ['off', 'facturx', 'xrechnung'];

export function einvoiceEmailMode(country: string, stored: unknown): EInvoiceEmailMode {
    const v = String(stored ?? '');
    if ((EINVOICE_EMAIL_MODES as readonly string[]).includes(v)) return v as EInvoiceEmailMode;
    const cc = String(country || '').toUpperCase();
    if (cc === 'FR') return 'facturx';
    if (cc === 'DE') return 'xrechnung';
    return 'off';
}
