#!/usr/bin/env node
// Presupuesto de tamaño por entrypoint (gzip -9, que es lo que descarga quien
// instala el paquete o carga embed.js). Falla si alguno lo rebasa: crecer es una
// decisión que se toma subiendo el número aquí, no algo que pasa solo.
// Correr tras `npm run build`.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

// Oct 2026: el receptor fiscal valida el identificador de los doce mercados
// ofrecidos con su dígito verificador (validateTaxId), no solo RFC/NIF/EIN.
// Entra en todo bundle que monta el Fiscal Element (~1.6 KB gzip); headless
// además exporta los motivos en español e inglés (~0.9 KB más).
const BUDGET_KB = {
    'index.mjs': 15.5,
    'headless.mjs': 14.25,
    'react.mjs': 26.5,
    'vue.mjs': 15,
    'framer.mjs': 23,
    'webflow.mjs': 7,
    'webflow.js': 7,
    'embed.js': 7,
    'server.mjs': 3.2,
};

let failed = false;
for (const [file, kb] of Object.entries(BUDGET_KB)) {
    const gz = gzipSync(readFileSync(path.join(dist, file)), { level: 9 }).length;
    const over = gz > kb * 1024;
    if (over) failed = true;
    console.log(`${over ? '✗' : '✓'} ${file.padEnd(14)} ${(gz / 1024).toFixed(1).padStart(5)} KB / ${kb} KB`);
}
if (failed) {
    console.error('\nUn entrypoint rebasó su presupuesto. Reduce el bundle o sube el límite en scripts/size-budget.mjs con una razón en el commit.');
    process.exit(1);
}
