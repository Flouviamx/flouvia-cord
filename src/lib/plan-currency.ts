// src/lib/plan-currency.ts
// Divisa en la que CORD le cobra a una organización sus propios planes.
//
// Es el tercer eje de la regla 21, y el que más fácil se confunde con los otros
// dos. No es la divisa de venta del negocio (`cotizaciones.base_currency`) ni su
// divisa contable (`orgs.moneda`): esas son del cliente. Esta es de Cord, y por
// eso NO se hereda de la organización — un negocio en Madrid que cotiza en euros
// le paga a Cord en dólares.
//
// Deliberadamente son DOS y no un catálogo abierto: cada divisa nueva exige
// configurarla en cada Price de Stripe (base y medidos). Un `orgs.moneda` libre
// —el usuario puede escribir cualquier ISO 4217 en Ajustes › General— no puede
// decidir en qué cobra la plataforma.
//
// Módulo PURO a propósito: lo importa `/precios`, que es prerenderizada. Nada de
// `db`, nada de Stripe. La variante con acceso a datos vive en `billing.ts`.

/** El set cerrado. Ampliarlo obliga a tocar los Prices de Stripe primero. */
export const PLATFORM_CURRENCIES = ['MXN', 'USD'] as const;
export type PlatformCurrency = (typeof PLATFORM_CURRENCIES)[number];

export const DEFAULT_PLATFORM_CURRENCY: PlatformCurrency = 'USD';

/** País cuya moneda local sí cobra Cord. El resto del mundo paga en dólares. */
const LOCAL_CURRENCY_COUNTRY = 'MX';

export function isPlatformCurrency(value: unknown): value is PlatformCurrency {
    return PLATFORM_CURRENCIES.includes(String(value ?? '').trim().toUpperCase() as PlatformCurrency);
}

/** Normaliza lo que devuelve Stripe (`'mxn'`) o la DB. `null` si no es válida. */
export function normalizePlatformCurrency(value: unknown): PlatformCurrency | null {
    const code = String(value ?? '').trim().toUpperCase();
    return isPlatformCurrency(code) ? (code as PlatformCurrency) : null;
}

/**
 * Divisa de plataforma de una organización.
 *
 * @param countryCode  `orgs.country_code` (ISO 3166-1 alpha-2).
 * @param locked       `orgs.billing_currency`, escrita desde una factura REAL.
 *
 * `locked` gana siempre que sea válida, y no es una preferencia: Stripe congela
 * `customer.currency` en la primera factura. Una org que ya pagó en MXN es MXN
 * para siempre, mude su país o no. Derivar del país a esas alturas produciría un
 * `currency` que contradice al customer y Stripe rechaza el cobro entero.
 *
 * Esto además le da consumidor a `orgs.billing_currency`, que hasta ahora se
 * escribía en el webhook y no la leía nadie (regla 15).
 */
export function platformCurrencyFor(
    countryCode?: string | null,
    locked?: string | null,
): PlatformCurrency {
    const evidence = normalizePlatformCurrency(locked);
    if (evidence) return evidence;
    const country = String(countryCode ?? '').trim().toUpperCase();
    return country === LOCAL_CURRENCY_COUNTRY ? 'MXN' : DEFAULT_PLATFORM_CURRENCY;
}
