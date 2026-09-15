#!/usr/bin/env node
// Contrato de los diccionarios de i18n (`src/i18n/app.ts` y `src/i18n/ui.ts`).
// Regla 36 de docs/estandares-ingenieria.md.
//
// Falla si:
//   1. una clave existe en un idioma y no en el otro — `t()` cae al español en
//      silencio y una cuenta en inglés lee texto en español sin que nada avise;
//   2. una clave no tiene consumidor — nadie la lee (regla 15 aplicada al copy).
//      En sep 2026 se juntaron 466 claves muertas en app.ts y 36 en ui.ts: cada
//      pantalla rediseñada dejaba su vocabulario anterior, y un texto muerto se
//      sigue traduciendo y corrigiendo como si alguien lo viera.
//
// Una clave está viva si aparece como string literal fuera del diccionario, o si
// la cubre una clave armada en tiempo de ejecución: una plantilla con dos puntos
// o guion bajo en su parte fija (`set.eq.perm.${k}.label`) o una concatenación
// (`'cfo.' + id`). Esas se convierten en patrón y protegen a todas las claves
// que encajan. Si un rediseño arma claves de otra forma, el fallo lo dirá aquí
// antes de que la pantalla muestre la clave cruda.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const DICTIONARIES = [
    { file: 'src/i18n/app.ts', open: 'export const appStrings = {' },
    { file: 'src/i18n/ui.ts', open: 'export const ui = {' },
];
const SCAN_DIRS = ['src', 'scripts', 'test', 'packages/elements/src', 'public'];
const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.astro', '.mdx', '.md', '.json', '.html']);

function parseDictionary({ file, open }) {
    const text = readFileSync(join(root, file), 'utf8');
    const start = text.indexOf(open);
    const end = text.indexOf('} as const;', start);
    if (start < 0 || end < 0) throw new Error(`${file}: no se encontró el diccionario (${open} … } as const;)`);
    const lines = text.slice(start, end).split('\n');
    const keys = { es: [], en: [] };
    let lang = null;
    for (const line of lines) {
        const section = line.match(/^\s+(es|en): ?\{\s*$/);
        if (section) { lang = section[1]; continue; }
        const entry = line.match(/^\s+(["'])([^"']+)\1:\s/);
        if (entry && lang) keys[lang].push(entry[2]);
    }
    if (!keys.es.length || !keys.en.length) throw new Error(`${file}: no se leyeron claves de es/en`);
    // Lo que va después del diccionario (helpers de runtime) sí es consumidor.
    return { file, keys, tail: text.slice(end) };
}

function sourceFiles(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) sourceFiles(path, out);
        else if (SCAN_EXTS.has(extname(name))) out.push(path);
    }
    return out;
}

const dictionaries = DICTIONARIES.map(parseDictionary);
const dictionaryFiles = new Set(dictionaries.map((d) => join(root, d.file)));

let corpus = dictionaries.map((d) => d.tail).join('\n');
for (const dir of SCAN_DIRS) {
    for (const path of sourceFiles(join(root, dir))) {
        if (!dictionaryFiles.has(path)) corpus += '\n' + readFileSync(path, 'utf8');
    }
}

const literals = new Set();
for (const m of corpus.matchAll(/(["'`])([A-Za-z0-9_.\-]+)\1/g)) literals.add(m[2]);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SEGMENT = '[A-Za-z0-9_.\\-]+';
const patterns = new Map();
for (const m of corpus.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
    if (!m[1].includes('${')) continue;
    const parts = m[1].split(/\$\{(?:[^{}]|\{[^{}]*\})*\}/);
    const fixed = parts.join('');
    if (!/^[A-Za-z0-9_.\-]*$/.test(fixed) || !/[a-z]/.test(fixed) || !/[._]/.test(fixed)) continue;
    patterns.set(m[1], new RegExp(`^${parts.map(escape).join(SEGMENT)}$`));
}
for (const m of corpus.matchAll(/(["'])([a-z][A-Za-z0-9_\-]*\.[A-Za-z0-9_.\-]*)\1\s*\+/g)) {
    patterns.set(`'${m[2]}' + …`, new RegExp(`^${escape(m[2])}${SEGMENT}$`));
}
const isConsumed = (key) => literals.has(key) || [...patterns.values()].some((re) => re.test(key));

const problems = [];
for (const { file, keys } of dictionaries) {
    const es = new Set(keys.es);
    const en = new Set(keys.en);
    const onlyEs = keys.es.filter((k) => !en.has(k));
    const onlyEn = keys.en.filter((k) => !es.has(k));
    if (onlyEs.length) problems.push(`${file}: sin traducción al inglés (${onlyEs.length}): ${onlyEs.join(', ')}`);
    if (onlyEn.length) problems.push(`${file}: solo existen en inglés (${onlyEn.length}): ${onlyEn.join(', ')}`);
    for (const lang of ['es', 'en']) {
        const dupes = keys[lang].filter((k, i) => keys[lang].indexOf(k) !== i);
        if (dupes.length) problems.push(`${file} (${lang}): claves duplicadas: ${[...new Set(dupes)].join(', ')}`);
    }
    const orphans = [...es].filter((k) => !isConsumed(k));
    if (orphans.length) problems.push(`${file}: claves sin consumidor (${orphans.length}) — bórralas en es y en: ${orphans.join(', ')}`);
}

if (problems.length) {
    console.error('security:i18n FALLÓ\n  - ' + problems.join('\n  - '));
    process.exit(1);
}
const total = dictionaries.map((d) => `${d.file} ${d.keys.es.length}`).join(', ');
console.log(`security:i18n (paridad es/en y claves con consumidor) OK — ${total}`);
