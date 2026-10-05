import * as esbuild from 'esbuild';
import { chmodSync } from 'node:fs';
await esbuild.build({
    entryPoints: ['src/cord.ts'],
    outfile: 'dist/cord.mjs',
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: ['node20'],
    banner: { js: '#!/usr/bin/env node' },
    logLevel: 'info',
});
chmodSync('dist/cord.mjs', 0o755);
console.log('✓ @flouviahq/cli compilado en dist/cord.mjs');
