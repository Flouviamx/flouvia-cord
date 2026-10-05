#!/usr/bin/env node
// public/embed.js es el build de src/embed-script.ts, no un archivo a mano.
//   node scripts/sync-embed.mjs          → copia dist/embed.js a public/embed.js
//   node scripts/sync-embed.mjs --check  → falla si difieren (CI)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const built = path.join(dir, '..', 'dist', 'embed.js');
const published = path.join(dir, '..', '..', '..', 'public', 'embed.js');
const HEADER = '/* Cord Elements loader. Generado desde packages/elements/src/embed-script.ts; no editar a mano. */\n';

const expected = HEADER + readFileSync(built, 'utf8');
if (process.argv.includes('--check')) {
    let actual = '';
    try { actual = readFileSync(published, 'utf8'); } catch { /* falta */ }
    if (actual !== expected) {
        console.error('✗ public/embed.js no coincide con el build. Corre `npm run build && node scripts/sync-embed.mjs` en packages/elements.');
        process.exit(1);
    }
    console.log('✓ public/embed.js coincide con el build.');
} else {
    writeFileSync(published, expected);
    console.log('✓ public/embed.js actualizado.');
}
