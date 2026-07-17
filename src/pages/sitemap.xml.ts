// Sitemap XML de las páginas públicas y estáticas de Cord (ES + EN), más
// blog/soporte/roadmap (Content Collections + roadmap-data.ts) — jul 2026,
// auditoría SEO/AI-SEO. Los slugs de blog/soporte son idénticos entre
// es/ y en/ (verificado: mismos nombres de archivo), así que se pueden
// emparejar 1:1 para hreflang.
export const prerender = true;

import { getCollection } from 'astro:content';
import { FEATURES } from '../lib/producto';
import { SOLUCIONES } from '../lib/solucion';
import { DEV_PAGES } from '../lib/desarrolladores';
import { roadmapData } from '../lib/roadmap-data';

const SITE = 'https://cordhq.app';

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

export async function GET() {
    const blogEntries = await getCollection('blog');
    const blogSlugs = [...new Set(blogEntries.map((e) => e.id.replace(/^(es|en)\//, '')))];
    const blogXml = blogSlugs
        .map((slug) => pairEntry(`${SITE}/blog/${slug}`, `${SITE}/en/blog/${slug}`, '0.5', 'monthly'))
        .join('\n');

    const supportEntries = await getCollection('support');
    const supportSlugs = [...new Set(supportEntries.map((e) => e.id.replace(/^(es|en)\//, '')))];
    const supportXml = supportSlugs
        .map((slug) => pairEntry(`${SITE}/soporte/${slug}`, `${SITE}/en/support/${slug}`, '0.4', 'monthly'))
        .join('\n');

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${ALL_PATHS.map((p) => urlEntry(p.path, p.priority, p.changefreq)).join('\n')}
${blogXml}
${supportXml}
</urlset>
`;
    return new Response(body, {
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
}
