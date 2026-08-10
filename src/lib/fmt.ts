export function intlLocale(locale?: string): string {
    const lang = locale || (typeof document !== 'undefined' ? document.documentElement.lang : 'es');
    return lang.toLowerCase().startsWith('en') ? 'en-US' : 'es-MX';
}

export function money(value: number, locale?: string, currency = 'MXN'): string {
    return new Intl.NumberFormat(intlLocale(locale), {
        style: 'currency', currency, maximumFractionDigits: 0,
    }).format(value);
}

export function moneyFull(value: number, locale?: string, currency = 'MXN'): string {
    return new Intl.NumberFormat(intlLocale(locale), {
        style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value);
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

