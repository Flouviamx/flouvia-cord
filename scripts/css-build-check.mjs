// Contrato del CSS ya COMPILADO — corre sobre .vercel/output/static/_astro/*.css.
//
// Por qué existe: `npm run typecheck` y `npm run build` pasan felices con este
// bug presente, porque el fuente es correcto y el daño ocurre en la
// minificación. La única forma de detectarlo es mirar el bundle.
//
// El caso real (ago 2026): Astro 7.2 trae su propio Vite 8, y Vite 8 invirtió
// el default del minificador de CSS a lightningcss. lightningcss BORRA la
// propiedad estándar cuando el fuente declara también el prefijo a mano — se
// queda sólo con la última de las dos. Este repo escribe el `-webkit-` al
// final en 54 declaraciones, así que producción perdía `backdrop-filter` en 14
// de 16 casos. Firefox se quedaba sin blur, y como `.topbar`/`.sidebar` tienen
// fondo al 72% que DEPENDE del blur, el chrome se veía translúcido. En dev no
// se minifica, así que sólo pasaba en producción y nadie lo veía en localhost.
//
// El arreglo vive en astro.config.mjs (`cssMinify: 'esbuild'`). Este check
// vigila que no vuelva en silencio en la próxima subida de Astro o Vite.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, '.vercel/output/static/_astro');

let files;
try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.css'));
} catch {
    console.error(
        'css-build-check: no hay build que revisar en .vercel/output/static/_astro.\n' +
        'Corre `npm run build` antes de este check.',
    );
    process.exit(1);
}
assert.ok(files.length, 'css-build-check: el build no produjo ningún .css');

// Una declaración de propiedad, no la condición de un @supports: exige el `:`
// y descarta lo que venga precedido de `(`, que es la forma del test.
const WEBKIT = /(^|[;{\s])-webkit-backdrop-filter\s*:/g;
const STANDARD = /(^|[;{\s])backdrop-filter\s*:/g;

const offenders = [];
let totalWebkit = 0;
let totalStandard = 0;

for (const file of files) {
    const css = await readFile(resolve(dir, file), 'utf8');
    const webkit = (css.match(WEBKIT) ?? []).length;
    const standard = (css.match(STANDARD) ?? []).length;
    totalWebkit += webkit;
    totalStandard += standard;
    // Cada `-webkit-backdrop-filter` tiene que venir acompañado de su forma
    // estándar. Al revés SÍ es válido (una regla puede declarar sólo la
    // estándar), por eso la comparación no es de igualdad.
    if (webkit > standard) {
        offenders.push({ file, webkit, standard });
    }
}

if (offenders.length) {
    console.error(
        'css-build-check: el minificador borró la propiedad ESTÁNDAR `backdrop-filter`.\n' +
        'Firefox no soporta `-webkit-backdrop-filter`, así que ahí no habrá blur; y como\n' +
        '.topbar/.sidebar tienen fondo translúcido que depende del blur, el chrome se va a\n' +
        'ver transparente en producción.\n\n' +
        'Revisa que astro.config.mjs siga teniendo `vite.build.cssMinify: \'esbuild\'`.\n\n' +
        offenders.map((o) => `  ${o.file}: ${o.webkit} prefijadas contra ${o.standard} estándar`).join('\n'),
    );
    process.exitCode = 1;
} else {
    process.stdout.write(
        `css-build-check: backdrop-filter íntegro en el bundle ` +
        `(${totalStandard} estándar / ${totalWebkit} prefijadas, ${files.length} archivos) OK\n`,
    );
}
