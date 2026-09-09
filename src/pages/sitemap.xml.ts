// Sitemap XML de las páginas públicas y estáticas de Cord (ES + EN), más
// blog/soporte/roadmap (Content Collections + roadmap-data.ts). Cada host recibe
// solo sus propias URLs y los pares hreflang se crean únicamente cuando ambos
// contenidos existen; los slugs no se asumen idénticos entre idiomas.
export const prerender = false;

import { getCollection } from 'astro:content';
import { FEATURES } from '../lib/producto';
import { SOLUCIONES } from '../lib/solucion';
import { DEV_PAGES } from '../lib/desarrolladores';
import { roadmapData } from '../lib/roadmap-data';

const SITE = 'https://cordhq.app';
const DEV_SITE = 'https://dev.cordhq.app';
const DOCS_SITE = 'https://docs.cordhq.app';

const STATIC_PATHS = [
    { path: '/', priority: '1.0', changefreq: 'weekly' },
    { path: '/precios', priority: '0.9', changefreq: 'weekly' },
    { path: '/como-funciona', priority: '0.7', changefreq: 'monthly' },
    { path: '/elements', priority: '0.6', changefreq: 'monthly' },
    { path: '/roadmap', priority: '0.5', changefreq: 'weekly' },
    { path: '/blog', priority: '0.6', changefreq: 'weekly' },
    { path: '/soporte', priority: '0.5', changefreq: 'weekly' },
    { path: '/soluciones/empresas', priority: '0.7', changefreq: 'monthly' },
    { path: '/soluciones/startups', priority: '0.7', changefreq: 'monthly' },
    { path: '/casos-de-uso/saas', priority: '0.6', changefreq: 'monthly' },
    { path: '/casos-de-uso/agencias', priority: '0.6', changefreq: 'monthly' },
    { path: '/casos-de-uso/comercializadoras', priority: '0.6', changefreq: 'monthly' },
    { path: '/casos-de-uso/software-factory', priority: '0.6', changefreq: 'monthly' },
    { path: '/comparar/facturacion', priority: '0.6', changefreq: 'monthly' },
    { path: '/desarrolladores/status', priority: '0.3', changefreq: 'daily' },
    { path: '/privacidad', priority: '0.2', changefreq: 'yearly' },
    { path: '/terminos', priority: '0.2', changefreq: 'yearly' },
];

const PRODUCT_PATHS = FEATURES.map((f) => ({ path: `/producto/${f.slug}`, priority: '0.7', changefreq: 'monthly' }));
const SOLUTION_PATHS = SOLUCIONES.map((s) => ({ path: `/soluciones/${s.slug}`, priority: '0.7', changefreq: 'monthly' })).filter(
    (s) => !STATIC_PATHS.some((p) => p.path === s.path)
);
// 'elements' vive en /elements (STATIC_PATHS), no en /desarrolladores/elements (301) — se excluye.
const DEV_PATHS = DEV_PAGES.filter((d) => d.slug !== 'elements').map((d) => ({ path: `/desarrolladores/${d.slug}`, priority: '0.5', changefreq: 'monthly' }));
const ROADMAP_PATHS = roadmapData.map((r) => ({ path: `/roadmap/${r.slug}`, priority: '0.4', changefreq: 'monthly' }));

const ALL_PATHS = [...STATIC_PATHS, ...PRODUCT_PATHS, ...SOLUTION_PATHS, ...DEV_PATHS, ...ROADMAP_PATHS];
const ES_ONLY_PATHS = new Set([
    '/casos-de-uso/saas',
    '/casos-de-uso/agencias',
    '/casos-de-uso/comercializadoras',
    '/casos-de-uso/software-factory',
]);

// path/en-prefix par (mismo slug, mismo patrón de ruta en ambos idiomas)
const urlEntry = (path: string, priority: string, changefreq: string) => {
    const es = `${SITE}${path}`;
    const en = `${SITE}/en${path === '/' ? '' : path}`;
    return pairEntry(es, en, priority, changefreq);
};

// par explícito ES/EN cuando la ruta no sigue el patrón /en/ prefix (soporte→support)
const pairEntry = (es: string, en: string, priority: string, changefreq: string) => `  <url>
    <loc>${es}</loc>
    <xhtml:link rel="alternate" hreflang="es" href="${es}" />
    <xhtml:link rel="alternate" hreflang="en" href="${en}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${es}" />
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>
  <url>
    <loc>${en}</loc>
    <xhtml:link rel="alternate" hreflang="es" href="${es}" />
    <xhtml:link rel="alternate" hreflang="en" href="${en}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${es}" />
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;

const singleEntry = (loc: string, lang: 'es' | 'en', priority: string, changefreq: string) => `  <url>
    <loc>${loc}</loc>
    <xhtml:link rel="alternate" hreflang="${lang}" href="${loc}" />
    ${lang === 'es' ? `<xhtml:link rel="alternate" hreflang="x-default" href="${loc}" />` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;

export async function GET({ url }: { url: URL }) {
    const blogEntries = await getCollection('blog');
    const blogEsSlugs = new Set(blogEntries.filter((e) => e.id.startsWith('es/')).map((e) => e.id.replace(/^es\//, '')));
    const blogEnSlugs = new Set(blogEntries.filter((e) => e.id.startsWith('en/')).map((e) => e.id.replace(/^en\//, '')));
    const blogSlugs = [...new Set([...blogEsSlugs, ...blogEnSlugs])];
    const blogXml = blogSlugs.map((slug) => {
        if (blogEsSlugs.has(slug) && blogEnSlugs.has(slug)) {
            return pairEntry(`${SITE}/blog/${slug}`, `${SITE}/en/blog/${slug}`, '0.5', 'monthly');
        }
        return blogEsSlugs.has(slug)
            ? singleEntry(`${SITE}/blog/${slug}`, 'es', '0.5', 'monthly')
            : singleEntry(`${SITE}/en/blog/${slug}`, 'en', '0.5', 'monthly');
    }).join('\n');

    const supportEntries = await getCollection('support');
    const supportEsSlugs = new Set(supportEntries.filter((e) => e.id.startsWith('es/')).map((e) => e.id.replace(/^es\//, '')));
    const supportEnSlugs = new Set(supportEntries.filter((e) => e.id.startsWith('en/')).map((e) => e.id.replace(/^en\//, '')));
    const supportSlugs = [...new Set([...supportEsSlugs, ...supportEnSlugs])];
    const supportXml = supportSlugs.map((slug) => {
        if (supportEsSlugs.has(slug) && supportEnSlugs.has(slug)) {
            return pairEntry(`${SITE}/soporte/${slug}`, `${SITE}/en/support/${slug}`, '0.4', 'monthly');
        }
        return supportEsSlugs.has(slug)
            ? singleEntry(`${SITE}/soporte/${slug}`, 'es', '0.4', 'monthly')
            : singleEntry(`${SITE}/en/support/${slug}`, 'en', '0.4', 'monthly');
    }).join('\n');

    // dev.cordhq.app — EN vive en /dev-blog/en/* (rutas reales, ver
    // src/pages/dev-blog/en/*.astro), así que se empareja hreflang igual que
    // blog/soporte. Todo post tiene ambos idiomas hoy (verificado: mismos
    // nombres de archivo en content/dev-blog/es y /en); si algún día no fuera
    // 1:1, aquí se rompería silenciosamente — mismo riesgo que blog/soporte.
    const devHome = pairEntry(`${DEV_SITE}/dev-blog`, `${DEV_SITE}/dev-blog/en`, '0.6', 'weekly');
    const devBlogListing = pairEntry(`${DEV_SITE}/dev-blog/blog`, `${DEV_SITE}/dev-blog/en/blog`, '0.5', 'weekly');
    const devBlogEntries = await getCollection('devBlog');
    const devBlogSlugs = [...new Set(devBlogEntries.map((e) => e.id.replace(/^(es|en)\//, '')))];
    const devBlogXml = devBlogSlugs
        .map((slug) => pairEntry(`${DEV_SITE}/dev-blog/${slug}`, `${DEV_SITE}/dev-blog/en/${slug}`, '0.5', 'monthly'))
        .join('\n');

    // docs.cordhq.app — a diferencia de blog/soporte, ES y EN NO son 1:1 (hay páginas
    // ES sin contraparte EN todavía). Solo se empareja hreflang cuando el par EN
    // realmente existe; si no, se emite una sola entrada ES (sin alternate "en" roto).
    const docsEntries = await getCollection('docs');
    const docsEnPaths = new Set(
        docsEntries.filter((e) => e.id.startsWith('en/')).map((e) => e.id.replace(/^en\//, ''))
    );
    const docsEsPaths = [...new Set(
        docsEntries.filter((e) => e.id.startsWith('es/')).map((e) => e.id.replace(/^es\//, ''))
    )];
    const docsXml = docsEsPaths
        .map((path) => {
            const es = path === 'resumen' ? `${DOCS_SITE}/docs` : `${DOCS_SITE}/docs/${path}`;
            if (docsEnPaths.has(path)) {
                const en = path === 'resumen' ? `${DOCS_SITE}/en/docs` : `${DOCS_SITE}/en/docs/${path}`;
                return pairEntry(es, en, '0.4', 'monthly');
            }
            return singleEntry(es, 'es', '0.4', 'monthly');
        })
        .join('\n');

    const host = url.hostname.toLowerCase();
    let entries = '';
    if (host === 'docs.cordhq.app') {
        entries = docsXml;
    } else if (host === 'dev.cordhq.app') {
        entries = `${devHome}\n${devBlogListing}\n${devBlogXml}`;
    } else if (host === 'cordhq.app' || host === 'www.cordhq.app' || host === 'localhost' || host === '127.0.0.1') {
        const staticXml = ALL_PATHS.map((p) => {
            if (p.path === '/soporte') {
                return pairEntry(`${SITE}/soporte`, `${SITE}/en/support`, p.priority, p.changefreq);
            }
            if (ES_ONLY_PATHS.has(p.path)) {
                return singleEntry(`${SITE}${p.path}`, 'es', p.priority, p.changefreq);
            }
            return urlEntry(p.path, p.priority, p.changefreq);
        }).join('\n');
        entries = `${staticXml}\n${blogXml}\n${supportXml}`;
    }

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
</urlset>
`;
    return new Response(body, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
}
