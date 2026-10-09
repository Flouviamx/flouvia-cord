// Gancho de resolución para correr con Node plano (`--experimental-strip-types`)
// módulos de src/ que importan sin extensión, como los escribe el resto de la
// app para Vite (`import { x } from '../countries'`). Node exige la extensión
// en ESM; este gancho reintenta con `.ts` y `/index.ts` SOLO para rutas
// relativas que no la llevan. No transforma código ni toca paquetes de npm.
//
//   node --experimental-strip-types --import ./scripts/lib/ts-resolve.mjs script.mjs
import { register } from 'node:module';

register('./ts-resolve-hooks.mjs', import.meta.url);
