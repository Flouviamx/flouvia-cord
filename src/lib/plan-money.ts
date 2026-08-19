// src/lib/plan-money.ts
// Formateador ÚNICO de los precios de los planes de Cord.
//
// Reemplaza seis `'$' + Intl.NumberFormat('es-MX')` independientes que vivían en
// plan.astro, checkout.astro, PlanPaywallModal, Pricing y precios.astro. Cada uno
// pintaba un peso mexicano disfrazado de dólar y ninguno decía qué divisa era.
//
// NO se reutiliza `money()` de `mock.ts` ni `documentCurrency()` de
// `money-client.ts`: esos leen la divisa del NEGOCIO (`orgs.moneda`,
// `<body data-currency>`). Un negocio español vería "590 €" sobre lo que son
// 590 pesos. Son dos ejes distintos de la regla 21 y no se mezclan.

import type { PlatformCurrency } from './plan-currency';

/** Locale de presentación a partir del idioma de la interfaz. */
function intlLocale(locale?: string): string {
    return String(locale || '').toLowerCase().startsWith('en') ? 'en-US' : 'es-MX';
}

/**
 * Importe de un plan. Sin decimales: todos los precios de Cord son enteros en
 * ambas divisas, y "$590.00" sólo agrega ruido a una tarjeta de precio.
 */
export function planMoney(amount: number, currency: PlatformCurrency, locale?: string): string {
    const value = Number(amount) || 0;
    const opts: Intl.NumberFormatOptions = {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
    };
    try {
        // narrowSymbol evita "MX$590" en en-US: el símbolo va desnudo y la
        // divisa la declara `planCycleLabel()` al lado, nunca implícita.
        return new Intl.NumberFormat(intlLocale(locale), { ...opts, currencyDisplay: 'narrowSymbol' }).format(value);
    } catch {
        return new Intl.NumberFormat(intlLocale(locale), opts).format(value);
    }
}

/**
 * La etiqueta que acompaña al importe: "MXN / mes", "USD / month".
 *
 * Es lo que sustituye a los literales de i18n con divisa embebida
 * (`"MXN/mes · IVA incluido"`, y su traducción inglesa que también decía "MXN").
 * El importe sin esta etiqueta es un número, no dinero — regla 21.
 */
export function planCycleLabel(currency: PlatformCurrency, cycle: 'mensual' | 'anual', locale?: string): string {
    const en = intlLocale(locale) === 'en-US';
    const period = cycle === 'anual' ? (en ? 'year' : 'año') : (en ? 'month' : 'mes');
    return `${currency} / ${period}`;
}

/**
 * Nota fiscal del precio de lista.
 *
 * Los Price de Stripe tienen `tax_behavior: 'unspecified'` y Stripe Tax no está
 * activo: no se calcula ni se agrega impuesto sobre el importe, en ninguna
 * divisa. El cliente paga exactamente la cifra mostrada, y eso es lo que dice
 * esta nota.
 *
 * Nunca dice "IVA": ese es el nombre mexicano del impuesto y el mismo precio se
 * le muestra a un negocio en Austin o en Berlín (regla 24).
 */
export function planTaxNote(locale?: string): string {
    return intlLocale(locale) === 'en-US' ? 'taxes included' : 'impuestos incluidos';
}
