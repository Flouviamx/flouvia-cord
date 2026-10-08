// Contrato de la navegación de docs.cordhq.app. Corre en `npm run security:docs`.
//
// La navegación sale de un solo árbol, src/lib/docs-nav.ts (DOCS_NAV). Antes el
// sidebar estaba escrito a mano en DocsLayout.astro y una página podía publicarse
// sin que ningún camino de navegación llegara a ella (pagos/mejoras-confiabilidad
// lo estuvo). Nada de eso rompe el build, así que lo verifica este script:
//
//   R1  todo id de la colección `docs` (es/ y en/) está en DOCS_NAV o en
//       DOCS_NAV_EXCLUDED con su motivo — una página huérfana es una página que
//       solo encuentra el buscador;
//   R2  todo slug de DOCS_NAV existe en ES y en EN (las páginas .astro de
//       DOCS_NAV_ASTRO_PAGES se verifican como archivo de ruta, no de colección);
//   R3  todo enlace /docs/... o /en/docs/... dentro de un MDX apunta a un slug
//       que existe en ese idioma;
//   R4  un MDX en en/ no enlaza a /docs/ (español): el lector cambia de idioma
//       sin pedirlo;
//   R5  ningún enlace usa ?lang= — el idioma vive en la ruta (/en), y el
//       parámetro solo sobrevive como redirect heredado.
//
// Los bloques de código (```) se ignoran: un ejemplo puede mostrar una ruta sin
// que sea un enlace del artículo.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CONTENT = join(ROOT, 'src/content/docs');
const LANGS = ['es', 'en'];

const nav = await import(new URL('../src/lib/docs-nav.ts', import.meta.url).href);
const { DOCS_NAV, DOCS_NAV_EXCLUDED, DOCS_NAV_ASTRO_PAGES, flattenAll } = nav;

const failures = [];
const fail = (rule, msg) => failures.push(`${rule}  ${msg}`);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.mdx?$/.test(name)) out.push(full);
  }
  return out;
}

// id de la colección por idioma: ruta relativa sin extensión (`pagos/condiciones`).
const files = {};
const ids = {};
for (const lang of LANGS) {
  files[lang] = walk(join(CONTENT, lang));
  ids[lang] = new Set(files[lang].map((f) => relative(join(CONTENT, lang), f).replace(/\.mdx?$/, '')));
}

const astroPageExists = (lang, slug) => {
  const base = lang === 'en' ? 'src/pages/en/docs' : 'src/pages/docs';
  return existsSync(join(ROOT, base, `${slug}.astro`)) || existsSync(join(ROOT, base, slug, 'index.astro'));
};
const slugExists = (lang, slug) =>
  slug === '' || ids[lang].has(slug) || (DOCS_NAV_ASTRO_PAGES.includes(slug) && astroPageExists(lang, slug));

// ── Estructura del árbol ────────────────────────────────────────────────────
const flat = flattenAll();
const navSlugs = new Set();
for (const entry of flat) {
  if (navSlugs.has(entry.slug)) fail('R2', `slug duplicado en DOCS_NAV: ${entry.slug}`);
  navSlugs.add(entry.slug);
}
const sectionIds = new Set();
for (const section of DOCS_NAV) {
  if (sectionIds.has(section.id)) fail('R2', `id de sección duplicado: ${section.id}`);
  sectionIds.add(section.id);
  if (!navSlugs.has(section.home)) fail('R2', `la portada de "${section.id}" (${section.home}) no está en el árbol`);
}
for (const entry of flat) {
  const owner = DOCS_NAV.find((s) => s.prefixes.some((p) => entry.slug === p || entry.slug.startsWith(`${p}/`)));
  if (owner?.id !== entry.section.id) {
    fail('R2', `${entry.slug} vive en la sección "${entry.section.id}" pero sus prefijos lo asignan a "${owner?.id ?? 'ninguna'}"`);
  }
}

// ── R1: toda página de la colección es alcanzable ───────────────────────────
for (const lang of LANGS) {
  for (const id of ids[lang]) {
    if (!navSlugs.has(id) && !(id in DOCS_NAV_EXCLUDED)) {
      fail('R1', `${lang}/${id} no está en DOCS_NAV ni en DOCS_NAV_EXCLUDED (página huérfana)`);
    }
  }
}
for (const id of Object.keys(DOCS_NAV_EXCLUDED)) {
  if (navSlugs.has(id)) fail('R1', `${id} está en DOCS_NAV y también en DOCS_NAV_EXCLUDED`);
}

// ── R2: todo slug del árbol existe en los dos idiomas ───────────────────────
for (const slug of navSlugs) {
  for (const lang of LANGS) {
    if (DOCS_NAV_ASTRO_PAGES.includes(slug)) {
      if (!astroPageExists(lang, slug)) fail('R2', `${slug} (.astro) no existe en ${lang}`);
    } else if (!ids[lang].has(slug)) {
      fail('R2', `${slug} está en DOCS_NAV pero no existe src/content/docs/${lang}/${slug}.mdx`);
    }
  }
}

// ── R3–R5: enlaces dentro de los MDX ────────────────────────────────────────
// Un enlace interno a docs: markdown `](...)`, `href="..."`/`href={'...'}`, con o
// sin el host de docs/cordhq.app.
const LINK = /(?:\]\(|href=\{?\s*["'`])\s*((?:https?:\/\/(?:docs\.|www\.)?cordhq\.app)?\/[^\s)"'`]*)/g;

for (const lang of LANGS) {
  for (const file of files[lang]) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '));
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      for (const match of line.matchAll(LINK)) {
        const raw = match[1];
        const where = `${rel}:${i + 1}`;
        if (/[?&]lang=/.test(raw)) fail('R5', `${where} usa ?lang= en ${raw}`);
        const path = raw.replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
        const m = /^\/(en\/)?docs(?:\/(.*))?$/.exec(path);
        if (!m) continue;
        const target = m[1] ? 'en' : 'es';
        const slug = m[2] ?? '';
        if (lang === 'en' && target === 'es') fail('R4', `${where} enlaza a la versión en español: ${raw}`);
        if (!slugExists(target, slug)) fail('R3', `${where} enlaza a un slug inexistente en ${target}: ${raw}`);
      }
    });
  }
}

if (failures.length) {
  console.error(`docs-nav-check: ${failures.length} problema(s)\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`docs-nav-check: OK — ${navSlugs.size} páginas en ${DOCS_NAV.length} secciones; ${ids.es.size} es / ${ids.en.size} en; enlaces internos verificados.`);
