import { getCollection } from 'astro:content';

export const prerender = true;

// Índice ligero de los artículos del Centro de ayuda. Lo consumen el buscador de
// /soporte y el panel de Ayuda de la app (que vive bajo sesión): por eso la ruta
// está en PUBLIC_API_EXACT del middleware — sin eso el prerender corría el
// middleware sin sesión y el archivo publicado era `{"error":"No autenticado"}`.
// `url` sale ya resuelta por idioma: el id de la colección trae el prefijo de
// carpeta (`es/…`, `en/…`) y la ruta pública no (`/soporte/…`, `/en/support/…`).
// Palabras del cuerpo para que una búsqueda encuentre el artículo aunque el
// término no esté en el título ("clabe" vive en el cuerpo de "Actualizar tu
// cuenta de depósito"). Únicas, normalizadas y acotadas: el índice se descarga.
const keywords = (md: string) => {
    const words = (md || '')
        // \x60 = comilla invertida: escrita literal desalinea el escáner de
        // scripts/i18n-check.mjs, que la lee como inicio de template literal.
        .replace(/\x60{3}[\s\S]*?\x60{3}/g, ' ')
        .replace(/[#>*_\x60\[\]()|-]/g, ' ')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9ñ]+/)
        .filter((w) => w.length > 3);
    return Array.from(new Set(words)).slice(0, 160).join(' ');
};

export async function GET() {
    const supportEntries = await getCollection('support');

    const index = supportEntries.map((entry) => {
        const lang = entry.id.startsWith('en/') ? 'en' : 'es';
        const slug = entry.id.replace(/^(es|en)\//, '');
        return {
            id: entry.id,
            lang,
            title: entry.data.title,
            description: entry.data.description,
            category: entry.data.category,
            keywords: keywords(entry.body ?? ''),
            url: lang === 'en' ? `/en/support/${slug}` : `/soporte/${slug}`,
        };
    });

    return new Response(JSON.stringify(index), {
        status: 200,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}
