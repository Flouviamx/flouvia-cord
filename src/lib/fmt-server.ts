// Formato de fechas y números en SERVIDOR, con el locale y la zona horaria del
// request. El equivalente de navegador es `lib/fmt.ts`, que lee del DOM porque
// AsyncLocalStorage no existe ahí.
//
// Antes cada archivo llamaba a `Intl.DateTimeFormat('es-MX', …)` por su cuenta y
// ninguno pasaba `timeZone`. Dos consecuencias reales:
//
//   · Un negocio en Londres o en São Paulo leía sus fechas en formato mexicano
//     aunque toda su cuenta estuviera en inglés o en portugués.
//   · `orgs.zona_horaria` se guardaba desde Ajustes y no la usaba NADIE, así que
//     todo se renderizaba en la zona del servidor. Un negocio en Tokio veía sus
//     cotizaciones fechadas un día antes de haberlas creado, y "hoy"/"ayer" se
//     calculaban contra un día que no era el suyo.

import { currentCurrency, currentLocale, currentFormatLocale, currentTimeZone } from './context';
import { currencyDecimals } from './currency';

/**
 * Locale BCP-47 del request para Intl — el de FORMATO (`getCountryProfile`
 * del país de la org: 'pt-BR', 'de-DE', 'en-GB'…), no el de la interfaz.
 *
 * `currentLocale()` solo distingue es/en (qué diccionario de i18n/app.ts
 * usar); antes era también la ÚNICA señal que llegaba a `Intl`, así que un
 * negocio en São Paulo o en Londres leía sus fechas en formato mexicano o
 * estadounidense aunque toda su cuenta estuviera en portugués o en inglés
 * británico. Sin `formatLocale` resuelto (crons, scripts, requests sin
 * organización) se conserva el fallback de siempre.
 */
export function intlLocale(): string {
    return currentFormatLocale() ?? (currentLocale() === 'en' ? 'en-US' : 'es-MX');
}

const opts = (extra: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions => {
    const tz = currentTimeZone();
    return tz ? { ...extra, timeZone: tz } : extra;
};

const asDate = (d: string | Date) => (typeof d === 'string' ? new Date(d) : d);

/** '12 ago 2026'. El punto de la abreviatura sobra en español. */
export function fmtDate(d: string | Date | null | undefined): string {
    if (!d) return '—';
    return new Intl.DateTimeFormat(intlLocale(), opts({ day: 'numeric', month: 'short', year: 'numeric' }))
        .format(asDate(d)).replace('.', '');
}

/** '12 de agosto de 2026' — para documentos, no para listas. */
export function fmtDateLong(d: string | Date | null | undefined): string {
    if (!d) return '—';
    return new Intl.DateTimeFormat(intlLocale(), opts({ day: 'numeric', month: 'long', year: 'numeric' }))
        .format(asDate(d));
}

/** '14:35' en la zona del negocio, nunca en la del servidor. */
export function fmtTime(d: string | Date): string {
    return new Intl.DateTimeFormat(intlLocale(), opts({ hour: '2-digit', minute: '2-digit', hour12: false }))
        .format(asDate(d));
}

/** Día civil 'YYYY-MM-DD' EN LA ZONA DEL NEGOCIO — la clave de "hoy" y "ayer". */
export function civilDay(d: string | Date): string {
    // `en-CA` produce ISO (YYYY-MM-DD) sin tener que armar el string a mano.
    return new Intl.DateTimeFormat('en-CA', opts({ year: 'numeric', month: '2-digit', day: '2-digit' }))
        .format(asDate(d));
}

/**
 * 'hoy, 14:35' · 'ayer, 09:12' · '3 ago, 16:40'.
 *
 * "Hoy" se decide contra el día civil del NEGOCIO. Comparando `toDateString()`
 * —que usa la zona del servidor— una cotización creada esta mañana en Tokio se
 * describía como de ayer.
 */
export function fmtRelative(d: string | Date): string {
    const date = asDate(d);
    const en = currentLocale() === 'en';
    const hhmm = fmtTime(date);

    const hoy = civilDay(new Date());
    const dia = civilDay(date);
    if (dia === hoy) return en ? `today, ${hhmm}` : `hoy, ${hhmm}`;

    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    if (dia === civilDay(ayer)) return en ? `yesterday, ${hhmm}` : `ayer, ${hhmm}`;

    const md = new Intl.DateTimeFormat(intlLocale(), opts({ day: 'numeric', month: 'short' }))
        .format(date).replace('.', '');
    return `${md}, ${hhmm}`;
}

/** Número simple con el locale del request (sin divisa: eso es money()). */
export function fmtNumber(n: number, maximumFractionDigits = 0): string {
    return new Intl.NumberFormat(intlLocale(), { maximumFractionDigits }).format(n);
}

/**
 * Importe con la divisa del request (regla 21). Lo re-exporta `lib/queries` y lo
 * usa casi toda la app y el link público.
 *
 * La divisa sale del contexto: la del negocio en /app, la de la cotización en
 * /q/[token]. Antes era un `'$'` literal con locale es-MX fijo, así que un
 * negocio en España mostraba "$1.000,00" donde debía decir "1.000,00 €" y uno
 * en Japón inventaba dos decimales que el yen no tiene.
 *
 * Separadores: sigue el idioma de la interfaz (es-MX / en-US), no el locale de
 * formato del país que usan las fechas. Es el comportamiento que hoy ven los
 * clientes; pasarlo a `intlLocale()` es un cambio visible y se decide aparte.
 *
 * `dec` existe para los pocos call-sites que piden enteros (dec = 0); por
 * defecto manda la divisa: JPY/CLP/COP nunca llevan decimales.
 */
export function money(n: number, dec?: number): string {
    const currency = currentCurrency();
    const decimals = dec ?? currencyDecimals(currency);
    const locale = currentLocale() === 'en' ? 'en-US' : 'es-MX';
    const digits = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
    try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency, ...digits }).format(n);
    } catch {
        return new Intl.NumberFormat(locale, digits).format(n);
    }
}
