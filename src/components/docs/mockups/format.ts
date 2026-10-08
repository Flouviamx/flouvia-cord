// Utilidades compartidas de los mockups de docs (dm-*).
//
// - Los textos de UI que YA existen en la app se leen de su diccionario real
//   (src/i18n/app.ts) con dmT(): si la app cambia "Configura Cord", el mockup
//   cambia con ella. Los DATOS de demo (clientes, folios, montos) viven en el
//   objeto { es, en } de cada componente.
// - Todo monto lleva su divisa (regla 21): dmMoney() siempre la escribe.

import { t, type AppStringKey } from '../../../i18n/app';
import { currencyDecimals } from '../../../lib/currency';

export type DmLang = 'es' | 'en';

/** Texto real de la app en el idioma del mockup. */
export function dmT(lang: DmLang, key: AppStringKey): string {
    return t(lang, key);
}

/** Elige la rama de un objeto { es, en }. */
export function pick<T>(data: { es: T; en: T }, lang: DmLang): T {
    return data[lang] ?? data.es;
}

/** Interpola `{var}` en una plantilla del diccionario. */
export function tpl(s: string, vars: Record<string, string | number>): string {
    return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

const LOCALE: Record<DmLang, string> = { es: 'es-MX', en: 'en-US' };

/**
 * Monto en dos partes: la cifra con símbolo local y el código ISO.
 * dmMoneyParts(196469.2, 'MXN', 'es') → { value: '$196,469.20', code: 'MXN' }.
 * `locale` permite forzar el formato de un país (p.ej. 'es-ES' para EUR).
 */
export function dmMoneyParts(amount: number, currency = 'MXN', lang: DmLang = 'es', locale?: string) {
    const decimals = currencyDecimals(currency);
    const value = new Intl.NumberFormat(locale ?? LOCALE[lang], {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(amount);
    return { value, code: currency.toUpperCase() };
}

/** Monto como texto plano con divisa: "$196,469.20 MXN". */
export function dmMoney(amount: number, currency = 'MXN', lang: DmLang = 'es', locale?: string): string {
    const { value, code } = dmMoneyParts(amount, currency, lang, locale);
    return `${value} ${code}`;
}

/** Logo real de una marca vía Google Favicon V2 (regla 8). */
export function favicon(domain: string, size = 64): string {
    return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=${size}`;
}

/** Iniciales para un avatar: "Raúl Mendoza" → "RM". */
export function initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
}

/** stroke-dasharray del anillo de progreso (r = 15.5 en un viewBox de 36). */
export function ringDash(pct: number): string {
    return `${(Math.max(0, Math.min(100, pct)) * 0.9739).toFixed(2)} 100`;
}

/** Universo de demo compartido: úsalo para que los mockups cuenten la misma historia. */
export const DEMO = {
    org: 'Materiales del Valle',
    orgInitial: 'M',
    brand: '#2f5d50',
    cliente: 'Distribuidora El Zarco',
    contacto: 'Raúl Mendoza',
    folio: 'COT-0148',
    total: 196469.2,
    currency: 'MXN',
} as const;
