#!/usr/bin/env node
// Contrato de los diccionarios de i18n, con idiomas declarados por superficie.
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
    { file: 'src/i18n/app.ts', open: 'export const appStrings = {', locales: ['es', 'en'] },
    { file: 'src/i18n/ui.ts', open: 'export const ui = {', locales: ['es', 'en'] },
    { file: 'src/i18n/auth-email.ts', open: 'export const authEmailStrings = {', locales: ['es', 'en', 'pt', 'fr', 'de'] },
];
const SCAN_DIRS = ['src', 'scripts', 'test', 'packages/elements/src', 'public'];
const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.astro', '.mdx', '.md', '.json', '.html']);

function parseDictionary({ file, open, locales }) {
    const text = readFileSync(join(root, file), 'utf8');
    const start = text.indexOf(open);
    const end = text.indexOf('} as const;', start);
    if (start < 0 || end < 0) throw new Error(`${file}: no se encontró el diccionario (${open} … } as const;)`);
    const lines = text.slice(start, end).split('\n');
    const keys = Object.fromEntries(locales.map((locale) => [locale, []]));
    let lang = null;
    for (const line of lines) {
        const section = line.match(/^\s+([a-z]{2,3}): ?\{\s*$/);
        if (section) {
            if (!Object.hasOwn(keys, section[1])) throw new Error(`${file}: idioma sin declarar: ${section[1]}`);
            lang = section[1]; continue;
        }
        const entry = line.match(/^\s+(["'])([^"']+)\1:\s/);
        if (entry && lang) keys[lang].push(entry[2]);
    }
    for (const locale of locales) {
        if (!keys[locale].length) throw new Error(`${file}: no se leyeron claves de ${locale}`);
    }
    // Lo que va después del diccionario (helpers de runtime) sí es consumidor.
    return { file, keys, locales, tail: text.slice(end) };
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
for (const { file, keys, locales } of dictionaries) {
    const es = new Set(keys.es);
    for (const lang of locales) {
        const translated = new Set(keys[lang]);
        const missing = keys.es.filter((k) => !translated.has(k));
        const extra = keys[lang].filter((k) => !es.has(k));
        if (missing.length) problems.push(`${file} (${lang}): sin traducción (${missing.length}): ${missing.join(', ')}`);
        if (extra.length) problems.push(`${file} (${lang}): sin equivalente en español: ${extra.join(', ')}`);
        const dupes = keys[lang].filter((k, i) => keys[lang].indexOf(k) !== i);
        if (dupes.length) problems.push(`${file} (${lang}): claves duplicadas: ${[...new Set(dupes)].join(', ')}`);
    }
    const orphans = [...es].filter((k) => !isConsumed(k));
    if (orphans.length) problems.push(`${file}: claves sin consumidor (${orphans.length}) — bórralas en todos los idiomas: ${orphans.join(', ')}`);
}

if (problems.length) {
    console.error('security:i18n FALLÓ\n  - ' + problems.join('\n  - '));
    process.exit(1);
}
const total = dictionaries.map((d) => `${d.file} ${d.keys.es.length} × ${d.locales.join('/')}`).join(', ');
console.log(`security:i18n (paridad por superficie y claves con consumidor) OK — ${total}`);
