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
// Para agregar un país nuevo: copiar su SVG desde
// `node_modules/circle-flags/flags/<iso2>.svg` (devDependency) a
// `public/flags/<iso2>.svg` y agregarlo aquí.
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
export const CURRENCY_FLAG: Record<string, string> = { MXN: 'MX', USD: 'US', EUR: 'EU' };

export function flagSrc(code: string): string {
    return FLAG_SRC[code] || FLAG_SRC.MX;
}
