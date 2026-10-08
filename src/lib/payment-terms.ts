// Términos de pago — FUENTE ÚNICA.
//
// Antes vivían en ~20 sitios con la misma lista escrita a mano
// (`['contado', 'net30', 'net60']`) y su propio mapa de días: el endpoint de
// clientes, el de la org, la API pública, el MCP, Elements, el PDF de la
// factura, el recordatorio de cobranza, la vista `cuentas_por_cobrar`… Agregar
// un plazo exigía tocarlos todos, y olvidar uno no rompía nada visible: el
// vencimiento caía a 0 días en silencio y la cobranza perseguía como vencida
// una factura que el cliente todavía podía pagar.
//
// El contrato es el CÓDIGO, no la etiqueta: `contado` o `net<N>`, donde N son
// los días naturales desde la fecha del documento. La regla "net<N> = N días"
// la aplica también Postgres (`cord_term_days()` en db/schema.sql), así que
// un plazo nuevo solo se agrega a TERM_CODES — el cálculo ya lo entiende.
//
// Módulo sin imports a propósito: lo consumen scripts del navegador, el
// servidor y el contrato de la API.

export const TERM_CODES = ['contado', 'net7', 'net15', 'net30', 'net45', 'net60', 'net90'] as const;
export type TermCode = (typeof TERM_CODES)[number];

/** Plazos de crédito que se ofrecen como chips rápidos; el resto vive en "Otro plazo". */
export const COMMON_TERM_CODES: readonly TermCode[] = ['contado', 'net15', 'net30', 'net60'];

export function isTermCode(value: unknown): value is TermCode {
    return typeof value === 'string' && (TERM_CODES as readonly string[]).includes(value);
}

/**
 * Normaliza un código recibido de afuera. Un valor desconocido cae al
 * `fallback` (contado por defecto): nunca se inventa un plazo de crédito.
 */
export function normalizeTerm(value: unknown, fallback: TermCode = 'contado'): TermCode {
    const v = String(value ?? '').trim().toLowerCase();
    return isTermCode(v) ? v : fallback;
}

/**
 * Días naturales del plazo. Entiende cualquier `net<N>` (no solo los
 * ofrecidos) para que un dato ya guardado con un plazo retirado siga
 * venciendo en su fecha real; lo demás es 0 (contado).
 */
export function termDays(code: unknown): number {
    const m = /^net(\d{1,3})$/.exec(String(code ?? '').trim().toLowerCase());
    return m ? Number(m[1]) : 0;
}

/** ¿El plazo es de crédito (se paga después) o de contado? */
export function isCredit(code: unknown): boolean {
    return termDays(code) > 0;
}

/**
 * Etiqueta legible. "Net N" es el término que usan las áreas de cuentas por
 * pagar en México y EE. UU.; en español se acompaña de los días para quien no
 * lo conoce.
 */
export function termLabel(code: unknown, locale: 'es' | 'en' = 'es'): string {
    const days = termDays(code);
    if (!days) return locale === 'en' ? 'Due on receipt' : 'Contado';
    return `Net ${days}`;
}

/** Etiqueta larga para selectores: "Net 45 · 45 días". */
export function termOptionLabel(code: unknown, locale: 'es' | 'en' = 'es'): string {
    const days = termDays(code);
    if (!days) return termLabel(code, locale);
    return locale === 'en' ? `Net ${days} · ${days} days` : `Net ${days} · ${days} días`;
}

/** Fecha de vencimiento: la fecha base más los días del plazo (sin tocar la hora). */
export function termDueDate(base: Date, code: unknown): Date {
    const due = new Date(base.getTime());
    due.setDate(due.getDate() + termDays(code));
    return due;
}

/**
 * Lee un plazo escrito por una persona (CSV, correo, IA): "Net 45", "45 días",
 * "crédito 30", "contado", "upfront". Devuelve el código ofrecido más cercano
 * SIN pasarse — un "40 días" se lee como net30, no net45: prometer menos
 * crédito del pactado es corregible; cobrar antes de tiempo no.
 */
export function parseTermText(text: unknown): TermCode {
    const s = String(text ?? '').trim().toLowerCase();
    if (!s) return 'contado';
    if (isTermCode(s)) return s;
    const n = /(\d{1,3})/.exec(s);
    if (n) {
        const days = Number(n[1]);
        let best: TermCode = 'contado';
        for (const code of TERM_CODES) if (termDays(code) <= days) best = code;
        return best;
    }
    if (/cr[eé]dito|credit|net|plazo/.test(s)) return 'net30';
    return 'contado';
}
