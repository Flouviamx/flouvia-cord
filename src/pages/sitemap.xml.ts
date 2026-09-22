// Sitemap por host: cordhq.app, docs.cordhq.app y dev.cordhq.app reciben solo sus
// URLs. Los pares hreflang se emiten únicamente cuando las dos versiones existen y
// lastmod solo cuando el contenido declara una fecha real.
export const prerender = false;

import { getCollection } from 'astro:content';
import { FEATURES } from '../lib/producto';
import { SOLUCIONES } from '../lib/solucion';
import { DEV_PAGES } from '../lib/desarrolladores';
import { roadmapData } from '../lib/roadmap-data';
import { INTEGRATION_PAGES } from '../lib/integraciones-landing';
import { SUPPORT_CATEGORIES } from '../lib/support-categories';
import { DEV_SITE, DOCS_SITE, SITE } from '../lib/seo/entities';

type Entry = { es?: string; en?: string; lastmod?: string };

const ES_ONLY = new Set(['/casos-de-uso/saas', '/casos-de-uso/agencias', '/casos-de-uso/comercializadoras', '/casos-de-uso/software-factory']);

const STATIC_PATHS = [
    '/',
    '/precios',
    '/como-funciona',
    '/integraciones',
    '/elements',
    '/roadmap',
    '/blog',
    '/contacto/ventas',
    '/soluciones/empresas',
    '/soluciones/startups',
    '/casos-de-uso/saas',
    '/casos-de-uso/agencias',
    '/casos-de-uso/comercializadoras',
    '/casos-de-uso/software-factory',
    '/comparar/facturacion',
    '/desarrolladores/status',
    '/privacidad',
    '/terminos',
];

const paired = (path: string): Entry => {
    if (ES_ONLY.has(path)) return { es: `${SITE}${path}` };
    return { es: `${SITE}${path === '/' ? '/' : path}`, en: `${SITE}/en${path === '/' ? '' : path}` };
};

const isoDay = (value?: string) => {
    if (!value) return undefined;
    const normalized = value.trim().replace(/\./g, '-');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? new Date(`${normalized}T00:00:00Z`) : new Date(normalized);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
};

const newest = (...dates: (string | undefined)[]) => dates.filter(Boolean).sort().at(-1);

const urlXml = (loc: string, entry: Entry) => {
    const alternates = entry.es && entry.en
        ? [
            `    <xhtml:link rel="alternate" hreflang="es" href="${entry.es}" />`,
            `    <xhtml:link rel="alternate" hreflang="en" href="${entry.en}" />`,
            `    <xhtml:link rel="alternate" hreflang="x-default" href="${entry.es}" />`,
        ].join('\n')
        : '';
    return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        alternates,
        entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : '',
        '  </url>',
    ].filter(Boolean).join('\n');
};

const render = (entries: Entry[]) => entries
    .flatMap((entry) => [entry.es, entry.en].filter(Boolean).map((loc) => urlXml(loc as string, entry)))
    .join('\n');

async function apexEntries(): Promise<Entry[]> {
    const entries: Entry[] = STATIC_PATHS.map(paired);
    entries.push({ es: `${SITE}/soporte`, en: `${SITE}/en/support` });
    entries.push(...FEATURES.map((f) => paired(`/producto/${f.slug}`)));
    entries.push(...SOLUCIONES.filter((s) => !STATIC_PATHS.includes(`/soluciones/${s.slug}`)).map((s) => paired(`/soluciones/${s.slug}`)));
    entries.push(...DEV_PAGES.filter((d) => d.slug !== 'elements').map((d) => paired(`/desarrolladores/${d.slug}`)));
    entries.push(...roadmapData.map((r) => paired(`/roadmap/${r.slug}`)));
    entries.push(...INTEGRATION_PAGES.map((p) => paired(`/integraciones/${p.slug}`)));
    entries.push(...SUPPORT_CATEGORIES.map((c) => ({ es: `${SITE}/soporte/categoria/${c.slug}`, en: `${SITE}/en/support/category/${c.slug}` })));

    const blog = await getCollection('blog');
    const blogBySlug = new Map<string, { es?: (typeof blog)[number]; en?: (typeof blog)[number] }>();
    for (const post of blog) {
        const [lang, ...rest] = post.id.split('/');
        const slug = rest.join('/');
        const slot = blogBySlug.get(slug) ?? {};
        slot[lang as 'es' | 'en'] = post;
        blogBySlug.set(slug, slot);
    }
    for (const [slug, { es, en }] of blogBySlug) {
        const dates = [es, en].flatMap((p) => p ? [isoDay(p.data.lastUpdated), isoDay(p.data.publishedAt), isoDay(p.data.date)] : []);
        entries.push({
            es: es ? `${SITE}/blog/${slug}` : undefined,
            en: en ? `${SITE}/en/blog/${slug}` : undefined,
            lastmod: newest(...dates),
        });
    }

    const support = await getCollection('support');
    const supportSlugs = new Map<string, Set<string>>();
    for (const article of support) {
        const [lang, ...rest] = article.id.split('/');
        const slug = rest.join('/');
        supportSlugs.set(slug, (supportSlugs.get(slug) ?? new Set()).add(lang));
    }
    for (const [slug, langs] of supportSlugs) {
        entries.push({
            es: langs.has('es') ? `${SITE}/soporte/${slug}` : undefined,
            en: langs.has('en') ? `${SITE}/en/support/${slug}` : undefined,
        });
    }
    return entries;
}

async function docsEntries(): Promise<Entry[]> {
    const docs = await getCollection('docs');
    const bySlug = new Map<string, { es?: string; en?: string; dates: (string | undefined)[] }>();
    for (const doc of docs) {
        const [lang, ...rest] = doc.id.split('/');
        const slug = rest.join('/');
        const path = slug === 'resumen' ? '/docs' : `/docs/${slug}`;
        const slot = bySlug.get(slug) ?? { dates: [] };
        slot[lang as 'es' | 'en'] = lang === 'en' ? `${DOCS_SITE}/en${path}` : `${DOCS_SITE}${path}`;
        slot.dates.push(isoDay(doc.data.lastUpdated));
        bySlug.set(slug, slot);
    }
    return [...bySlug.values()].map((s) => ({ es: s.es, en: s.en, lastmod: newest(...s.dates) }));
}

async function devEntries(): Promise<Entry[]> {
    const posts = await getCollection('devBlog');
    const bySlug = new Map<string, { langs: Set<string>; dates: (string | undefined)[] }>();
    for (const post of posts) {
        const [lang, ...rest] = post.id.split('/');
        const slug = rest.join('/');
        const slot = bySlug.get(slug) ?? { langs: new Set(), dates: [] };
        slot.langs.add(lang);
        slot.dates.push(isoDay(post.data.date));
        bySlug.set(slug, slot);
    }
    const latest = newest(...[...bySlug.values()].flatMap((s) => s.dates));
    return [
        { es: `${DEV_SITE}/dev-blog`, en: `${DEV_SITE}/dev-blog/en`, lastmod: latest },
        { es: `${DEV_SITE}/dev-blog/blog`, en: `${DEV_SITE}/dev-blog/en/blog`, lastmod: latest },
        ...[...bySlug.entries()].map(([slug, s]) => ({
            es: s.langs.has('es') ? `${DEV_SITE}/dev-blog/${slug}` : undefined,
            en: s.langs.has('en') ? `${DEV_SITE}/dev-blog/en/${slug}` : undefined,
            lastmod: newest(...s.dates),
        })),
    ];
}

export async function GET({ url }: { url: URL }) {
    const host = url.hostname.toLowerCase();
    let entries: Entry[] = [];
    if (host === 'docs.cordhq.app') entries = await docsEntries();
    else if (host === 'dev.cordhq.app') entries = await devEntries();
    else if (host === 'cordhq.app' || host === 'www.cordhq.app' || host === 'localhost' || host === '127.0.0.1') entries = await apexEntries();

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${render(entries)}
</urlset>
`;
    return new Response(body, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        },
    });
}
