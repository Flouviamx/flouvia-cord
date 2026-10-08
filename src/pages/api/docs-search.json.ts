import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { docsPath, docsSection, plainText } from '../../lib/docs-search';
import { API_REFERENCE_PAGE, referenceSearchText } from '../../lib/api-reference';

export const prerender = false;

// Índice del buscador de docs.cordhq.app y de la tool buscar_documentacion del
// MCP (src/lib/docs-search.ts). Forma estable: { title, description, body, url,
// lang } más `section` opcional. `body` es texto plano: sin imports, JSX ni
// atributos de clase, para que Fuse no busque en markup y el JSON pese menos.
export const GET: APIRoute = async () => {
  try {
    const allDocs = await getCollection('docs');

    const searchIndex = allDocs.map((doc) => {
      const lang = doc.id.startsWith('en/') ? 'en' as const : 'es' as const;
      // El id de la colección es `${lang}/${slug}` (así lo resuelve
      // /docs/[...slug].astro con getEntry). `doc.slug` no existe en Astro 7.
      const cleanSlug = doc.id.replace(/^(en|es)\//, '');

      return {
        title: doc.data?.title || 'No Title',
        description: doc.data?.description || '',
        body: plainText(doc.body || ''),
        url: docsPath(lang, cleanSlug),
        lang,
        section: docsSection(cleanSlug, lang),
      };
    });

    // La referencia de la API es una página propia, no una entrada de la colección.
    const reference = referenceSearchText();
    for (const lang of ['es', 'en'] as const) {
      const page = API_REFERENCE_PAGE[lang];
      searchIndex.push({
        title: page.title,
        description: page.description,
        body: reference,
        url: page.url,
        lang,
        section: docsSection('desarrolladores', lang),
      });
    }

    return new Response(JSON.stringify(searchIndex), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400'
      }
    });
  } catch {
    return new Response(JSON.stringify({ error: 'No se pudo armar el índice de la documentación.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
