// El idioma del texto no decide el país fiscal, la moneda ni la zona horaria.
// Un idioma objetivo no se ofrece en una superficie hasta traducirla completa.
export const LOCALES = {
    es: { label: 'Español', tag: 'es-MX' },
    en: { label: 'English', tag: 'en-US' },
    pt: { label: 'Português', tag: 'pt-BR' },
    fr: { label: 'Français', tag: 'fr-FR' },
    de: { label: 'Deutsch', tag: 'de-DE' },
} as const;

export type Locale = keyof typeof LOCALES;
export const PUBLIC_LOCALES = ['es', 'en'] as const;
export const APP_LOCALES = ['es', 'en'] as const;
export const AUTH_EMAIL_LOCALES = ['es', 'en', 'pt', 'fr', 'de'] as const;

/** Acepta variantes BCP-47, pero nunca valores heredados del prototipo. */
export function normalizeLocale(value: string | null | undefined): Locale | null {
    if (!value?.trim()) return null;
    try {
        const primary = new Intl.Locale(value.trim()).language;
        return Object.hasOwn(LOCALES, primary) ? primary as Locale : null;
    } catch {
        return null;
    }
}

/** Preferencias válidas, por peso y luego por orden del navegador. */
export function browserLocales(header: string | null | undefined): Locale[] {
    return (header ?? '').split(',').map((entry, index) => {
        const [tag, ...params] = entry.trim().split(';');
        const weights = params.map((param) => param.trim()).filter((param) => /^q\s*=/i.test(param));
        // No parseFloat: "0.9basura", valores >1 o dos q= no son pesos válidos.
        const weight = weights[0]?.match(/^q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/i);
        const q = weights.length === 0 ? 1 : weights.length === 1 && weight ? Number(weight[1]) : 0;
        return { locale: normalizeLocale(tag), q, index };
    }).filter((entry) => entry.locale !== null && entry.q > 0)
        .sort((a, b) => b.q - a.q || a.index - b.index)
        .map((entry) => entry.locale!);
}

/** Manual > navegador > inglés; sin preferencia concreta conserva español. */
export function resolveLocale<const T extends readonly Locale[]>(options: {
    available: T;
    saved?: string | null;
    browser?: string | null;
}): T[number] {
    const { available, saved, browser } = options;
    if (available.length === 0) throw new Error('A locale surface must have at least one translation');
    const explicit = normalizeLocale(saved);
    if (explicit && available.includes(explicit)) return explicit;
    const preferred = browserLocales(browser).find((locale) => available.includes(locale));
    if (preferred) return preferred;
    const hasConcretePreference = (browser ?? '').split(',').some((entry) => {
        const tag = entry.trim().split(';')[0];
        return tag.length > 0 && tag !== '*';
    });
    const fallback = hasConcretePreference ? 'en' : 'es';
    return available.includes(fallback) ? fallback : available[0];
}
