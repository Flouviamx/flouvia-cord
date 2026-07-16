#!/usr/bin/env node
// Anti-deriva de la API pública: importa cada entrypoint desde dist/ y compara
// sus exports reales contra el snapshot committeado (api-report.json). Falla
// si divergen — exactamente el bug que mordió al SDK una vez (dist exportaba
// 11 cosas, types/react.d.ts solo declaraba 1). Correr tras `npm run build`.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const reportPath = path.join(dir, '..', 'api-report.json');

const ENTRYPOINTS = {
    '.': '../dist/index.mjs',
    './react': '../dist/react.mjs',
    './vue': '../dist/vue.mjs',
    './framer': '../dist/framer.mjs',
    './server': '../dist/server.mjs',
};

async function exportsOf(relPath) {
    const mod = await import(relPath);
    return Object.keys(mod).sort();
}

async function main() {
    const actual = {};
    for (const [entry, relPath] of Object.entries(ENTRYPOINTS)) {
        actual[entry] = await exportsOf(relPath);
    }

    const write = process.argv.includes('--write');
    if (write) {
        writeReport(actual);
        console.log('✓ api-report.json actualizado.');
        return;
    }

    let expected;
    try {
        expected = JSON.parse(readFileSync(reportPath, 'utf8'));
    } catch {
        console.error(`✗ No existe ${reportPath}. Corre \`node scripts/check-exports.mjs --write\` para crearlo.`);
        process.exit(1);
    }

    let drifted = false;
    for (const entry of Object.keys(ENTRYPOINTS)) {
        const exp = expected[entry] || [];
        const act = actual[entry] || [];
        const missing = exp.filter((k) => !act.includes(k)); // se borró un export sin querer
        const added = act.filter((k) => !exp.includes(k)); // se agregó un export sin declararlo
        if (missing.length || added.length) {
            drifted = true;
            console.error(`✗ "${entry}" divergió de api-report.json:`);
            if (missing.length) console.error(`    faltan (existían, ya no): ${missing.join(', ')}`);
            if (added.length) console.error(`    nuevos (no snapshoteados): ${added.join(', ')}`);
        }
    }

    if (drifted) {
        console.error('\nSi el cambio es intencional, corre `node scripts/check-exports.mjs --write` y committea api-report.json junto con tu cambio.');
        process.exit(1);
    }
    console.log('✓ Exports reales == api-report.json en los ' + Object.keys(ENTRYPOINTS).length + ' entrypoints.');
}

function writeReport(actual) {
    writeFileSync(reportPath, JSON.stringify(actual, null, 2) + '\n');
}

main().catch((err) => {
    console.error('✗ check-exports falló:', err);
    process.exit(1);
});
