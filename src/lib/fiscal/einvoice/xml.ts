// Ayudantes de serialización XML de la factura electrónica europea.
//
// Mismo estilo que `verifactu/aeat.ts`: XML armado por concatenación, con un
// `esc()` que además quita los caracteres que XML 1.0 no admite y un `el()`
// que OMITE el elemento cuando no hay valor. Peppol rechaza un elemento vacío
// (PEPPOL-EN16931-R008) y el XSD de CII rechaza un `<ram:ID/>` sin contenido:
// "no hay dato" se escribe no escribiendo nada.
//
// Sin dependencias: lo cargan los editores de pruebas (vitest), el check con
// Node (`--experimental-strip-types`) y el servidor.

const XML_INVALID = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;

export function esc(value: unknown): string {
    return String(value ?? '')
        .replace(XML_INVALID, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export type Attrs = Record<string, string | number | undefined | null>;

function attrs(a?: Attrs): string {
    if (!a) return '';
    return Object.entries(a)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => ` ${k}="${esc(v)}"`)
        .join('');
}

/** Elemento con texto. Sin valor no se escribe (nunca un elemento vacío). */
export function el(name: string, value: string | number | undefined | null, a?: Attrs): string {
    if (value === undefined || value === null) return '';
    const text = String(value).trim();
    if (!text) return '';
    return `<${name}${attrs(a)}>${esc(text)}</${name}>`;
}

/** Elemento contenedor. Si todos sus hijos quedaron vacíos, no se escribe. */
export function group(name: string, children: Array<string | false | null | undefined>, a?: Attrs): string {
    const body = children.filter(Boolean).join('');
    if (!body) return '';
    return `<${name}${attrs(a)}>${body}</${name}>`;
}

/**
 * Importe con dos decimales exactos. EN 16931 (BR-DEC-*) admite como máximo
 * dos decimales en todo importe: la divisa con tres (KWD, BHD) se rechaza
 * antes de llegar aquí, y la que no tiene decimales (JPY) se escribe ".00",
 * que es el mismo número.
 */
export function amount(value: number): string {
    const cents = Math.round((Number(value) + Number.EPSILON) * 100);
    const sign = cents < 0 ? '-' : '';
    const abs = Math.abs(cents);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Cantidad o precio: hasta `max` decimales, sin ceros sobrantes y sin notación científica. */
export function decimal(value: number, max = 6): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    const fixed = n.toFixed(max);
    const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
    return trimmed === '-0' ? '0' : trimmed;
}

/** Porcentaje de IVA desde la fracción del snapshot (0.21 → "21", 0.055 → "5.5"). */
export function percent(fraction: number): string {
    return decimal(Math.round(Number(fraction) * 1e8) / 1e6, 4);
}

/** aaaa-mm-dd → aaaammdd (formato 102 de UNTDID 2379, el que exige CII). */
export function cii102(isoDay: string): string {
    return isoDay.replace(/-/g, '');
}
