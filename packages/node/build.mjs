// Build de @flouviahq/node: ESM + CJS sin dependencias. El contrato de webhooks
// y el módulo fiscal se toman del paquete de Elements y se empaquetan aquí.
import * as esbuild from 'esbuild';
import { readdirSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const common = { entryPoints: ['src/index.ts'], bundle: true, sourcemap: true, target: ['node20'], platform: 'neutral', logLevel: 'info' };
await esbuild.build({ ...common, outfile: 'dist/index.mjs', format: 'esm' });
await esbuild.build({ ...common, outfile: 'dist/index.cjs', format: 'cjs' });

function copyCts(dir) {
    for (const f of readdirSync(dir)) {
        const full = join(dir, f);
        if (statSync(full).isDirectory()) copyCts(full);
        else if (f.endsWith('.d.ts')) copyFileSync(full, full.replace(/\.d\.ts$/, '.d.cts'));
    }
}
copyCts('dist/types');
console.log('✓ @flouviahq/node compilado en dist/');
