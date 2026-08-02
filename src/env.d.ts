// src/env.d.ts — tipos de App.Locals para Astro.
//
// No existía en el repo — por eso ningún residuo de `Astro.locals.auth` /
// `context.locals.auth()` (Clerk) se detectó por TypeScript tras la
// migración: `Locals` caía a `any` implícito y esos accesos compilaban sin
// avisar, aunque `locals.auth` nunca se define en el auth propio (que
// resuelve todo vía AsyncLocalStorage — ver src/lib/context.ts). Ambos sitios
// ya se corrigieron; este archivo existe para que un residuo similar en el
// futuro sea un error de compilación, no un 500 en producción.
declare namespace App {
    interface Locals {}
}
