// ⚠️ Este módulo lo importan también los <script> del navegador (chart-mount,
// dashboard, informes, cobros). NO puede importar lib/context (AsyncLocalStorage
// es de Node y rompería el bundle del cliente): la divisa se lee del DOM, que es
// donde AppLayout la publica. El equivalente de servidor vive en lib/mock.ts.

/** Divisa activa del documento (`<body data-currency>`); MXN si no hay DOM. */
function ambientCurrency(): string {
    if (typeof document === 'undefined') return 'MXN';
    const code = String(
        (document.querySelector('[data-currency]') as HTMLElement | null)?.dataset?.currency || '',
    ).toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : 'MXN';
}

function decimalsFor(currency: string): number {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency })
            .resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
        return 2;
    }
}

export function intlLocale(locale?: string): string {
    const lang = locale || (typeof document !== 'undefined' ? document.documentElement.lang : 'es');
    return lang.toLowerCase().startsWith('en') ? 'en-US' : 'es-MX';
}

/**
 * Monto redondeado a unidades enteras.
 *
 * La divisa sale del documento, no de un default 'MXN' fijo: ese default era la
 * razón por la que un negocio en Madrid veía "MX$" en sus gráficas e informes.
 * Ver docs/estandares-ingenieria.md, regla 21.
 */
export function money(value: number, locale?: string, currency?: string): string {
    const code = currency || ambientCurrency();
    try {
        return new Intl.NumberFormat(intlLocale(locale), {
            style: 'currency', currency: code, maximumFractionDigits: 0,
        }).format(value);
    } catch {
        return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);
    }
}

/** Monto con todos los decimales que la divisa realmente tiene (JPY: ninguno). */
export function moneyFull(value: number, locale?: string, currency?: string): string {
    const code = currency || ambientCurrency();
    const decimals = decimalsFor(code);
    try {
        return new Intl.NumberFormat(intlLocale(locale), {
            style: 'currency', currency: code,
            minimumFractionDigits: decimals, maximumFractionDigits: decimals,
        }).format(value);
    } catch {
        return new Intl.NumberFormat(intlLocale(locale), {
            minimumFractionDigits: decimals, maximumFractionDigits: decimals,
        }).format(value);
    }
}

function utcDate(iso: string): Date { return new Date(`${iso}T00:00:00Z`); }

export function dateShort(iso: string, locale?: string): string {
    return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utcDate(iso));
}

export function dateMed(iso: string, locale?: string): string {
    return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(utcDate(iso));
}

export function dateFull(iso: string, locale?: string): string {
    return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utcDate(iso));
}

export function month(iso: string, locale?: string): string {
    return new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', timeZone: 'UTC' }).format(utcDate(iso));
}

