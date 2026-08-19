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

import { currentLocale, currentTimeZone } from './context';

/** Locale BCP-47 del request para Intl. */
export function intlLocale(): string {
    return currentLocale() === 'en' ? 'en-US' : 'es-MX';
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
