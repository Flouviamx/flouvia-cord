// Fuente única de banderas circulares — SVG de `circle-flags` (MIT, cero
// dependencias, ya recortados en círculo) copiados a `public/flags/*.svg`.
// Se sirven como assets ESTÁTICOS (no via import de módulo): Astro intercepta
// cualquier `import '*.svg'` con su propio pipeline de imágenes y lo convierte
// en un componente SSR o en un objeto ImageMetadata según el entorno — dos
// formas distintas e incompatibles entre React (islands) y Astro. Un path
// plano bajo `public/` no pasa por ese pipeline y funciona idéntico en ambos.
//
// Reemplaza el emoji de bandera que vivía antes en countries.ts — ver la
// Regla 1 de CLAUDE.md / design-reviewer: ya no hay excepción de emoji.
// Las banderas frecuentes viven locales. El catálogo ISO completo usa el CDN
// oficial del mismo proyecto para no versionar cientos de SVG duplicados.
export const FLAG_SRC: Record<string, string> = {
    MX: '/flags/mx.svg',
    US: '/flags/us.svg',
    CO: '/flags/co.svg',
    AR: '/flags/ar.svg',
    CL: '/flags/cl.svg',
    PE: '/flags/pe.svg',
    ES: '/flags/es.svg',
    EU: '/flags/eu.svg',
};

// El selector de moneda (nueva.astro) no tiene un país, tiene una divisa —
// mapeo divisa → bandera representativa.
export const CURRENCY_FLAG: Record<string, string> = {
    ARS: 'AR', AUD: 'AU', BRL: 'BR', CAD: 'CA', CHF: 'CH', CLP: 'CL', CNY: 'CN',
    COP: 'CO', CRC: 'CR', DOP: 'DO', EUR: 'EU', GBP: 'GB', GTQ: 'GT', HKD: 'HK',
    IDR: 'ID', ILS: 'IL', INR: 'IN', JPY: 'JP', KRW: 'KR', MXN: 'MX', MYR: 'MY',
    NOK: 'NO', NZD: 'NZ', PEN: 'PE', PHP: 'PH', PLN: 'PL', PYG: 'PY', SAR: 'SA',
    SEK: 'SE', SGD: 'SG', TRY: 'TR', TWD: 'TW', USD: 'US', UYU: 'UY', ZAR: 'ZA',
};

export function flagSrc(code: string): string {
    const normalized = String(code || '').toUpperCase();
    return FLAG_SRC[normalized]
        || `https://hatscripts.github.io/circle-flags/flags/${normalized.toLowerCase()}.svg`;
}
