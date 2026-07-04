// Build de @flouviahq/elements con esbuild (ESM + CJS para los entries `.` y `./react`).
// Los tipos (.d.ts) están escritos a mano en types/ (superficie pequeña).
// En este monorepo esbuild se resuelve desde el node_modules de la raíz; como
// paquete independiente, `npm i` lo trae vía devDependencies.
import * as esbuild from 'esbuild';

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
console.log('✓ @flouviahq/elements compilado en dist/');
