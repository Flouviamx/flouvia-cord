// Formateo de dinero en el NAVEGADOR.
//
// El gemelo cliente de lib/fmt.ts. Existe porque los `<script>` de las páginas
// no pueden leer el frontmatter en runtime, y durante mucho tiempo cada uno
// resolvió lo mismo por su cuenta con `'$' + Intl.NumberFormat(...)`. Ese "$"
// era una mentira en cuanto el negocio no cobraba en pesos o dólares: un
// importe en euros, libras o yenes se renderizaba con símbolo de dólar y con
// decimales que la divisa no tiene.
//
// La divisa se publica UNA vez en `<body data-currency>` (AppLayout) o en el
// contenedor de la superficie pública, y todo el cliente la lee de ahí.

/** Divisa activa del documento; MXN si la página no la declaró. */
export function documentCurrency(scope?: Element | null): string {
    const el = scope?.closest?.('[data-currency]')
        ?? document.querySelector('[data-currency]');
    const code = String((el as HTMLElement | null)?.dataset?.currency || '').toUpperCase();
    return /^[A-Z]{3}$/.test(code) ? code : 'MXN';
}

/** Locale de formato del documento (`<html lang>`). */
export function documentLocale(): string {
    return document.documentElement.lang === 'en' ? 'en-US' : 'es-MX';
}

/** Decimales reales de la divisa: 0 en JPY/CLP/COP, 2 en la mayoría. */
export function decimalsFor(currency: string): number {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency })
            .resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
        return 2;
    }
}

/**
 * Formateador de dinero listo para usar en un `<script>` de página.
 *
 * `createMoney()` sin argumentos toma la divisa y el locale del documento, que
 * es lo correcto en /app. `opts.currency` sirve para superficies que muestran
 * una divisa distinta a la del negocio (p. ej. una cotización en otra moneda).
 */
export function createMoney(opts: { currency?: string; locale?: string; decimals?: number } = {}) {
    const currency = (opts.currency || documentCurrency()).toUpperCase();
    const locale = opts.locale || documentLocale();
    const decimals = opts.decimals ?? decimalsFor(currency);
    let formatter: Intl.NumberFormat;
    try {
        formatter = new Intl.NumberFormat(locale, {
            style: 'currency', currency,
            minimumFractionDigits: decimals, maximumFractionDigits: decimals,
        });
    } catch {
        // Un código de divisa que ICU no conoce nunca debe tumbar la página.
        formatter = new Intl.NumberFormat(locale, {
            minimumFractionDigits: decimals, maximumFractionDigits: decimals,
        });
    }
    return (value: number) => formatter.format(Number(value) || 0);
}

/** Variante entera (sin decimales), para KPIs y gráficas. */
export function createMoney0(opts: { currency?: string; locale?: string } = {}) {
    return createMoney({ ...opts, decimals: 0 });
}
