// Países soportados. México es el único con facturación (CFDI 4.0) 100% activa
// hoy; el resto se captura para la expansión / facturación internacional que
// viene. Fuente única — antes vivía solo dentro de CreateWorkspaceModal.tsx.
// Las banderas ya NO son emoji (ver src/lib/flags.ts / FlagSelect) — se
// resuelven por `code` contra `FLAG_SRC`, un SVG circular de `circle-flags`.
export const COUNTRIES = [
    { code: 'MX', name: 'México', tag: 'CFDI 4.0' },
    { code: 'US', name: 'Estados Unidos', tag: '' },
    { code: 'CO', name: 'Colombia', tag: '' },
    { code: 'AR', name: 'Argentina', tag: '' },
    { code: 'CL', name: 'Chile', tag: '' },
    { code: 'PE', name: 'Perú', tag: '' },
    { code: 'ES', name: 'España', tag: '' },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]['code'];
export const COUNTRY_CODES: string[] = COUNTRIES.map((c) => c.code);
