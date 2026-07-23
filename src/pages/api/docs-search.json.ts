import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  try {
    const allDocs = await getCollection('docs');

    const searchIndex = allDocs.map((doc) => {
      const lang = doc.id.startsWith('en/') ? 'en' : 'es';
      const cleanSlug = doc.slug ? doc.slug.replace(/^(en|es)\//, '') : '';
      const url = lang === 'en' ? `/en/docs/${cleanSlug}` : `/docs/${cleanSlug}`;

      return {
        title: doc.data?.title || 'No Title',
        description: doc.data?.description || '',
        body: doc.body || '',
        url: url,
        lang: lang
      };
    });
    console.log("Found", allDocs.length, "docs");

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

