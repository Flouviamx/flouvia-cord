/// <reference types="astro/client" />
// Registro de mockups disponibles en el MDX de docs SIN importarlos.
//
// Todo `Dm*.astro` de esta carpeta (y `DocsMockup.astro`) queda disponible por
// su nombre de archivo: crear `DmFacturaPdf.astro` basta para escribir
// <DmFacturaPdf lang="es" /> en cualquier .mdx. src/pages/docs/[...slug].astro
// y src/pages/en/docs/[...slug].astro lo pasan con
// `<Content components={{ ..., ...docsMockups }} />`.
//
// Se arma con import.meta.glob y no con imports de .astro: `npm run typecheck`
// corre tsc a secas, que no resuelve módulos .astro desde un .ts.

const modules = import.meta.glob<{ default: unknown }>(['./Dm*.astro', './DocsMockup.astro'], { eager: true });

export const docsMockups: Record<string, any> = Object.fromEntries(
    Object.entries(modules).map(([path, mod]) => [path.replace(/^.*\/(.+)\.astro$/, '$1'), mod.default]),
);
