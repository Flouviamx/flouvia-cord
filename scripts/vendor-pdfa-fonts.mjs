// Regenera src/lib/pdf/fonts/liberation.ts a partir de las fuentes Liberation
// ORIGINALES (sin modificar). Solo hace falta correrlo si se cambia de versión.
//
//   node scripts/vendor-pdfa-fonts.mjs <carpeta del módulo go-fonts/liberation>
//
// Procedencia: el módulo Go `github.com/go-fonts/liberation@v0.3.3`, que empaqueta
// los TTF de Liberation 2.1.4 tal cual los publica el proyecto
// (https://github.com/liberationfonts/liberation-fonts) bajo la SIL Open Font
// License 1.1. Se descarga de https://proxy.golang.org/github.com/go-fonts/liberation/@v/v0.3.3.zip
// (go.sum h1:tM/T2vEOhjia6v5krQu8SDDegfH1SfXVRUNNKpq0Usk=). Los SHA-256 de abajo
// fijan los archivos exactos: otro binario no se vendoriza.
//
// Se guardan comprimidos (deflate) y en base64 dentro de un módulo TS porque
// es la única forma que funciona igual en Vite (SSR y Vercel), en vitest y en
// los checks con Node plano. El subconjunto por documento ocurre en runtime
// (lib/pdf/truetype.ts): el archivo vendorizado es la fuente sin tocar.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const FONTS = {
    'sans.regular': ['liberationsansregular/LiberationSans-Regular.ttf', '597589a852868f782c68e25112bab7785b34bc726f6160dca1519198c6e8c762'],
    'sans.bold': ['liberationsansbold/LiberationSans-Bold.ttf', 'cf445da2ab82045d7c8a00a5d9c29a6e90b0579705e28b1f3e02d5b3a0a91ab8'],
    'serif.regular': ['liberationserifregular/LiberationSerif-Regular.ttf', 'a82e5f4350d6b66d44d1c77f718d7c658a23ae6097c115748f5ab58c0723af59'],
    'serif.bold': ['liberationserifbold/LiberationSerif-Bold.ttf', '1226cecb60336d5ab5401c8ecb608cd93fe2576df85ec1f2410eac524878323c'],
};
const LICENSE = ['LICENSE-SIL', 'f45cc618951fffe1470140692086f7ca8a46ba81fe147cf8416bd63fb4849c61'];

const dir = process.argv[2];
if (!dir) {
    console.error('Uso: node scripts/vendor-pdfa-fonts.mjs <carpeta de github.com/go-fonts/liberation@v0.3.3>');
    process.exit(1);
}
const sha = (b) => createHash('sha256').update(b).digest('hex');
const read = ([file, expected]) => {
    const bytes = readFileSync(join(dir, file));
    if (sha(bytes) !== expected) throw new Error(`${file}: SHA-256 distinto al fijado; no se vendoriza.`);
    return bytes;
};

const out = new URL('../src/lib/pdf/fonts/', import.meta.url);
mkdirSync(out, { recursive: true });
const entries = Object.entries(FONTS).map(([key, spec]) => [key, deflateSync(read(spec), { level: 9 }).toString('base64'), spec[1]]);
const body = [
    '// GENERADO por scripts/vendor-pdfa-fonts.mjs — no editar a mano.',
    '//',
    '// Liberation Sans y Liberation Serif 2.1.4, Regular y Bold, sin modificar,',
    '// comprimidas con deflate y en base64. Copyright (c) 2012 Red Hat, Inc. y',
    '// (c) 2010 Google Corporation; SIL Open Font License 1.1 (ver',
    '// LICENSE-Liberation.txt junto a este archivo). Métricas de avance iguales a',
    '// Arial/Helvetica y Times: el layout del escritor PDF no cambia.',
    '//',
    '// SHA-256 de cada TTF original:',
    ...entries.map(([key, , hash]) => `//   ${key}: ${hash}`),
    '',
    'export const LIBERATION_DEFLATE_BASE64 = {',
    ...entries.map(([key, b64]) => `    '${key}': '${b64}',`),
    '} as const;',
    '',
].join('\n');
writeFileSync(new URL('liberation.ts', out), body);
writeFileSync(new URL('LICENSE-Liberation.txt', out), read(LICENSE));
console.log('vendor-pdfa-fonts: escrito src/lib/pdf/fonts/liberation.ts');
