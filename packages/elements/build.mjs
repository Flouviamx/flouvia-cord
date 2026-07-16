// Build de @flouviahq/elements con esbuild (ESM + CJS para cada entry).
// Los tipos (.d.ts) se GENERAN desde src/ vía `tsc --emitDeclarationOnly`
// (ver tsconfig.json) — nunca se escriben a mano. Este script solo corre el
// bundler; `npm run build` corre tsc primero (ver package.json).
//
// Dual-package hazard: TS resuelve tipos de un `require()` vía `.d.cts`. tsc
// solo emite `.d.ts`, así que copiamos cada declaración a un `.d.cts` gemelo
// (mismo contenido — no usamos sintaxis ESM-only en las declaraciones).
//
// En este monorepo esbuild se resuelve desde el node_modules de la raíz; como
// paquete independiente, `npm i` lo trae vía devDependencies.
import * as esbuild from 'esbuild';
import { readdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const common = {
    bundle: true,
    minify: true,
    sourcemap: true,
    target: ['es2019'],
    logLevel: 'info',
    // React, Vue, and Framer quedan EXTERNOS: son peer dependency del consumidor.
    external: ['react', 'react-dom', 'react/jsx-runtime', 'vue', 'framer'],
};

const targets = [
    { entryPoints: ['src/index.ts'],  outfile: 'dist/index.mjs', format: 'esm' },
    { entryPoints: ['src/index.ts'],  outfile: 'dist/index.cjs', format: 'cjs' },
    { entryPoints: ['src/react.tsx'], outfile: 'dist/react.mjs', format: 'esm', jsx: 'automatic' },
    { entryPoints: ['src/react.tsx'], outfile: 'dist/react.cjs', format: 'cjs', jsx: 'automatic' },
    { entryPoints: ['src/vue.ts'], outfile: 'dist/vue.mjs', format: 'esm' },
    { entryPoints: ['src/vue.ts'], outfile: 'dist/vue.cjs', format: 'cjs' },
    { entryPoints: ['src/framer.tsx'], outfile: 'dist/framer.mjs', format: 'esm', jsx: 'automatic' },
    { entryPoints: ['src/framer.tsx'], outfile: 'dist/framer.cjs', format: 'cjs', jsx: 'automatic' },
    { entryPoints: ['src/webflow.ts'], outfile: 'dist/webflow.mjs', format: 'esm' },
    { entryPoints: ['src/webflow.ts'], outfile: 'dist/webflow.cjs', format: 'cjs' },
    { entryPoints: ['src/webflow.ts'], outfile: 'dist/webflow.js', format: 'iife', globalName: 'CordWebflow' },
    { entryPoints: ['src/server.ts'], outfile: 'dist/server.mjs', format: 'esm', platform: 'node' },
    { entryPoints: ['src/server.ts'], outfile: 'dist/server.cjs', format: 'cjs', platform: 'node' },
];

for (const t of targets) {
    await esbuild.build({ ...common, ...t });
}

// Copia dist/types/*.d.ts → *.d.cts para satisfacer la resolución `require` de TS.
const typesDir = 'dist/types';
try {
    for (const f of readdirSync(typesDir)) {
        if (f.endsWith('.d.ts')) {
            copyFileSync(join(typesDir, f), join(typesDir, f.replace(/\.d\.ts$/, '.d.cts')));
        }
    }
    console.log('✓ .d.cts generados en dist/types/ (dual-package)');
} catch (e) {
    console.warn('⚠ No se encontró dist/types/ — corre `tsc -p tsconfig.json` antes de build.mjs (usa `npm run build`).');
}

console.log('✓ @flouviahq/elements compilado en dist/');
