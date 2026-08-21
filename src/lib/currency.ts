// Contrato ÚNICO de divisa de Cord.
//
// Dos preguntas distintas viven aquí, y confundirlas cuesta dinero real:
//
//   1. ¿Cómo se ESCRIBE un monto?  → decimales de presentación (ISO 4217).
//   2. ¿Cómo se ENVÍA a Stripe?    → unidad mínima, que NO siempre es /100.
//
// Cord nació MXN-only y durante mucho tiempo respondió "$" y "×100" a ambas.
// Eso es correcto para MXN/USD/EUR y falso para JPY, CLP, COP o KWD. Un JPY
// tratado como decimal se cobra 100 veces de más; un KWD, 100 veces de menos.
//
// El catálogo ISO 4217 sale de ICU (Node 24) — sin dependencias ni API externa,
// igual que el selector de moneda de Ajustes.

/** Divisas SIN decimales según Stripe: el "centavo" ES la unidad. */
const ZERO_DECIMAL = new Set([
    'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
    'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

// Stripe recibe estas en unidad mínima de 3 decimales pero EXIGE que el último
// dígito sea 0 (cobra en centenas). Documentado en su guía de divisas.
const THREE_DECIMAL = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND']);

/** Divisas que Stripe no liquida y que por tanto no pueden cobrar en línea. */
const STRIPE_UNSUPPORTED = new Set(['CUP', 'KPW', 'IRR', 'SYP', 'VES']);

const ISO_4217: Set<string> = (() => {
    try {
        return new Set(Intl.supportedValuesOf('currency'));
    } catch {
        return new Set(['MXN', 'USD', 'EUR', 'GBP', 'CAD', 'BRL', 'COP', 'CLP', 'ARS', 'PEN']);
    }
})();

export const DEFAULT_CURRENCY = 'MXN';

// ── Divisas que Cord OFRECE ─────────────────────────────────────────────────
//
// El catálogo ISO tiene ~300 códigos y los selectores los listaban todos. Una
// cotización capturada en VND o en GNF no se puede convertir (ninguna fuente de
// FX publica el par), no se puede cobrar (Stripe no la liquida) y el negocio se
// entera hasta el momento del cobro — cuando ya se la mandó al cliente.
//
// Este set son las divisas de los países soportados (`SUPPORTED_COUNTRIES` en
// countries.ts) más las de comercio internacional, para el negocio que vende
// fuera de su mercado. `isSupportedCurrency` sigue siendo el catálogo ISO
// completo: es la frontera de integridad de un dato YA GUARDADO, no lo que se
// ofrece capturar.
export const OFFERED_CURRENCIES = [
    // Divisas de los países soportados
    'MXN', 'USD', 'CAD', 'BRL', 'EUR', 'GBP', 'COP', 'ARS', 'CLP', 'PEN',
    // Comercio internacional
    'JPY', 'CNY', 'CHF', 'AUD',
] as const;

export function isOfferedCurrency(value: unknown): boolean {
    const code = String(value ?? '').trim().toUpperCase();
    return (OFFERED_CURRENCIES as readonly string[]).includes(code);
}

/**
 * Las divisas del selector, con la actual primero.
 *
 * `include` conserva la divisa que la organización o el documento ya tienen
 * guardada aunque haya quedado fuera del set: recortar el catálogo no puede
 * reescribir el importe de una venta viva.
 */
export function listOfferedCurrencies(include?: string | null): string[] {
    const current = String(include || '').trim().toUpperCase();
    const codes = [...OFFERED_CURRENCIES] as string[];
    if (current && isSupportedCurrency(current) && !isOfferedCurrency(current)) codes.push(current);
    return [...new Set(codes)].sort((a, b) => {
        if (a === current) return -1;
        if (b === current) return 1;
        const ai = (OFFERED_CURRENCIES as readonly string[]).indexOf(a);
        const bi = (OFFERED_CURRENCIES as readonly string[]).indexOf(b);
        return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
}

export function normalizeCurrency(value: unknown, fallback = DEFAULT_CURRENCY): string {
    const code = String(value ?? '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) && ISO_4217.has(code) ? code : fallback;
}

export function isSupportedCurrency(value: unknown): boolean {
    const code = String(value ?? '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(code) && ISO_4217.has(code);
}

/** Decimales de PRESENTACIÓN de la divisa (2 para la enorme mayoría). */
export function currencyDecimals(currency: string): number {
    const code = normalizeCurrency(currency);
    if (ZERO_DECIMAL.has(code)) return 0;
    if (THREE_DECIMAL.has(code)) return 3;
    return 2;
}

/** ¿Stripe puede cobrar en esta divisa? Falla cerrado ante un código raro. */
export function stripeSupportsCurrency(currency: string): boolean {
    const code = String(currency ?? '').trim().toUpperCase();
    return isSupportedCurrency(code) && !STRIPE_UNSUPPORTED.has(code);
}

/**
 * Monto → unidad mínima de Stripe (lo que va en `amount`).
 *
 * MXN 10.50 → 1050 · JPY 1000 → 1000 · KWD 10.500 → 10500 (último dígito 0).
 * Devuelve un entero seguro o lanza: un monto que no se puede expresar sin
 * perder dinero NUNCA debe llegar a Stripe redondeado en silencio.
 */
export function toMinorUnits(amount: number, currency: string): number {
    const value = Number(amount);
    if (!Number.isFinite(value)) throw new Error(`Monto inválido para ${currency}`);
    const decimals = currencyDecimals(currency);
    const scaled = Math.round(value * 10 ** decimals);
    // Stripe rechaza los tres decimales que no terminan en 0; se redondea a la
    // centena EXPLÍCITAMENTE en vez de dejar que el PSP falle en producción.
    const minor = decimals === 3 ? Math.round(scaled / 10) * 10 : scaled;
    if (!Number.isSafeInteger(minor)) throw new Error(`Monto fuera de rango para ${currency}`);
    return minor;
}

/** Unidad mínima de Stripe → monto legible por humanos. */
export function fromMinorUnits(minor: number, currency: string): number {
    const decimals = currencyDecimals(currency);
    return Number(minor) / 10 ** decimals;
}

/** Código en minúsculas, como lo espera el parámetro `currency` de la API de Stripe. */
export function stripeCurrency(currency: string): string {
    return normalizeCurrency(currency).toLowerCase();
}
