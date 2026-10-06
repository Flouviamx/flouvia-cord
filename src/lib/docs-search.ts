// Búsqueda en la documentación para agentes (tool buscar_documentacion del MCP).
// El índice es el mismo que usa el buscador de docs.cordhq.app; se lee por HTTP
// porque astro:content solo existe dentro del build, y se guarda una hora.
export interface DocEntry { title: string; description: string; body: string; url: string; lang: 'es' | 'en' }
export interface DocHit { titulo: string; url: string; descripcion: string; extracto: string }

const DOCS_ORIGIN = 'https://docs.cordhq.app';
const TTL_MS = 60 * 60 * 1000;
let cache: { at: number; entries: DocEntry[] } | null = null;

export async function loadDocsIndex(origin: string, fetcher: typeof fetch = fetch): Promise<DocEntry[]> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.entries;
    const res = await fetcher(new URL('/api/docs-search.json', origin), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`docs index ${res.status}`);
    const raw = await res.json();
    const entries = (Array.isArray(raw) ? raw : []).filter((d: any) => typeof d?.url === 'string').map((d: any) => ({
        title: String(d.title ?? ''), description: String(d.description ?? ''), body: plainText(String(d.body ?? '')),
        url: String(d.url), lang: d.lang === 'en' ? 'en' as const : 'es' as const,
    }));
    cache = { at: Date.now(), entries };
    return entries;
}

export function resetDocsCache() { cache = null; }

/** MDX a texto: sin frontmatter, etiquetas, imports ni marcas de formato. */
export function plainText(mdx: string): string {
    return mdx
        .replace(/^---[\s\S]*?---/, ' ')
        .replace(/^import .*$/gm, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[#*>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function terms(query: string): string[] {
    return [...new Set(fold(query).split(/[^a-z0-9_.-]+/).filter((t) => t.length > 1))].slice(0, 12);
}

function excerpt(body: string, words: string[], size = 420): string {
    const folded = fold(body);
    const at = words.map((w) => folded.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
    const start = Math.max(0, at - 120);
    const text = body.slice(start, start + size).trim();
    return (start > 0 ? '…' : '') + text + (start + size < body.length ? '…' : '');
}

export function searchDocs(entries: DocEntry[], query: string, lang: 'es' | 'en', limit = 5): DocHit[] {
    const words = terms(query);
    if (!words.length) return [];
    const scored = entries.filter((d) => d.lang === lang).map((d) => {
        const title = fold(d.title), desc = fold(d.description), body = fold(d.body), url = fold(d.url);
        let score = 0;
        for (const w of words) {
            if (title.includes(w)) score += 8;
            if (url.includes(w)) score += 4;
            if (desc.includes(w)) score += 3;
            const hits = body.split(w).length - 1;
            if (hits) score += Math.min(6, 1 + Math.log2(hits + 1));
        }
        if (words.every((w) => body.includes(w) || title.includes(w))) score += 5;
        return { d, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.min(10, Math.max(1, limit)));
    return scored.map(({ d }) => ({
        titulo: d.title, url: DOCS_ORIGIN + d.url, descripcion: d.description, extracto: excerpt(d.body, words),
    }));
}
