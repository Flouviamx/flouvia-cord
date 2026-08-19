import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  try {
    const allDocs = await getCollection('docs');

    const searchIndex = allDocs.map((doc) => {
      const lang = doc.id.startsWith('en/') ? 'en' : 'es';
      // El id de la colección es `${lang}/${slug}` (así lo resuelve
      // /docs/[...slug].astro con getEntry). `doc.slug` no existe en Astro 7:
      // era undefined, así que TODAS las URLs del índice quedaban en /docs/.
      const cleanSlug = doc.id.replace(/^(en|es)\//, '');
      const url = lang === 'en' ? `/en/docs/${cleanSlug}` : `/docs/${cleanSlug}`;

      return {
        title: doc.data?.title || 'No Title',
        description: doc.data?.description || '',
        body: doc.body || '',
        url: url,
        lang: lang
      };
    });

    return new Response(JSON.stringify(searchIndex), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400'
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

