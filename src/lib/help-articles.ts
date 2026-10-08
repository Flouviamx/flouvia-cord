// Artículos del Centro de ayuda para Cord AI (servidor). Separado de
// help-assistant.ts para que este sea probable sin el runtime de Astro.
import { getCollection } from 'astro:content';
import type { HelpArticle, Locale } from './help-assistant';

const cache = new Map<Locale, HelpArticle[]>();

export async function helpArticles(locale: Locale): Promise<HelpArticle[]> {
    const hit = cache.get(locale);
    if (hit) return hit;
    const all = await getCollection('support');
    const list = all
        .filter((e) => e.id.startsWith(`${locale}/`))
        .map((e) => {
            const slug = e.id.replace(/^(es|en)\//, '');
            return {
                title: e.data.title,
                description: e.data.description || '',
                category: e.data.category || '',
                url: locale === 'en' ? `/en/support/${slug}` : `/soporte/${slug}`,
                body: e.body ?? '',
            };
        })
        // Orden estable: el índice viaja en el prefijo cacheado del prompt.
        .sort((a, b) => a.url.localeCompare(b.url));
    cache.set(locale, list);
    return list;
}
