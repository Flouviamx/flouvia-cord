// Búsqueda en la documentación para agentes (tool buscar_documentacion del MCP).
// El índice es el mismo que usa el buscador de docs.cordhq.app; se lee por HTTP
// porque astro:content solo existe dentro del build, y se guarda una hora.
export interface DocEntry { title: string; description: string; body: string; url: string; lang: 'es' | 'en'; section?: string }
export interface DocHit { titulo: string; url: string; descripcion: string; extracto: string }

const DOCS_ORIGIN = 'https://docs.cordhq.app';
const TTL_MS = 60 * 60 * 1000;
let cache: { at: number; entries: DocEntry[] } | null = null;

export async function loadDocsIndex(origin: string, fetcher: typeof fetch = fetch): Promise<DocEntry[]> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.entries;
    const res = await fetcher(new URL('/api/docs-search.json', origin), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`docs index ${res.status}`);
    const raw = await res.json();
    const entries = (Array.isArray(raw) ? raw : []).filter((d: any) => typeof d?.url === 'string').map((d: any) => {
        const body = String(d.body ?? '');
        return {
            // El índice ya llega en texto plano (una sola línea). Solo un índice
            // viejo con MDX crudo trae saltos de línea y se limpia aquí; limpiar
            // dos veces borraría las etiquetas que viven dentro de los ejemplos.
            title: String(d.title ?? ''), description: String(d.description ?? ''), body: body.includes('\n') ? plainText(body) : body,
            url: String(d.url), lang: d.lang === 'en' ? 'en' as const : 'es' as const,
            ...(typeof d.section === 'string' && d.section ? { section: d.section } : {}),
        };
    });
    cache = { at: Date.now(), entries };
    return entries;
}

export function resetDocsCache() { cache = null; }

const ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rarr: '→', larr: '←', harr: '↔',
    mdash: '—', ndash: '–', hellip: '…', middot: '·', times: '×', check: '✓', copy: '©', reg: '®', trade: '™',
};

function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
        if (name[0] === '#') {
            const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
        }
        return ENTITIES[name.toLowerCase()] ?? ' ';
    });
}

// Una etiqueta JSX/HTML completa, aunque un atributo traiga `>` dentro de comillas
// o de llaves (style="a > b", onClick={() => x}).
const TAG = /<\/?[A-Za-z][^>"'{}]*(?:(?:"[^"]*"|'[^']*'|\{[^{}]*\})[^>"'{}]*)*\/?>/g;

function proseToText(md: string): string {
    // El código en línea se aparta antes de quitar etiquetas: `<cord-cotizador>`
    // es contenido, no markup.
    const inline: string[] = [];
    const text = md.replace(/`([^`\n]+)`/g, (_, code: string) => `\u0000${inline.push(code) - 1}\u0000`)
        // ESM de MDX: solo fuera de los bloques de código, donde sí es ejemplo.
        .replace(/^import\s+(?:[^\n]*?\s+from\s+)?['"][^'"\n]+['"];?[ \t]*$/gm, ' ')
        .replace(/^export\s+(?:const|let|var|function|default|async)\b.*$/gm, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
        // Bloques sin texto legible: se van con su contenido.
        .replace(/<(svg|style|script)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(TAG, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
        .replace(/^[ \t]*>[ \t]?/gm, '')
        .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, ' ')
        .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, ' ')
        .replace(/\|/g, ' ')
        .replace(/(\*\*|__)(?=\S)([^\n]*?\S)\1/g, '$2')
        .replace(/^[ \t]*[-*+][ \t]+/gm, '');
    return decodeEntities(text).replace(/\u0000(\d+)\u0000/g, (_, i: string) => inline[Number(i)] ?? ' ');
}

/**
 * MDX a texto plano para buscar: sin frontmatter, imports, JSX/HTML (ni sus
 * atributos de clase o estilo) ni marcas de formato. Conserva el texto, el de
 * los encabezados y el contenido de los bloques de código, que es lo que un
 * desarrollador busca (`constructEvent`, `<cord-cotizador>`).
 */
export function plainText(mdx: string): string {
    const src = mdx.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
    const out: string[] = [];
    let prose: string[] = [];
    let fence: string | null = null;
    for (const line of src.split(/\r?\n/)) {
        const marker = line.match(/^[ \t]*(`{3,}|~{3,})/)?.[1];
        if (fence === null && marker) {
            out.push(proseToText(prose.join('\n')));
            prose = [];
            fence = marker;
            continue;
        }
        if (fence !== null) {
            if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = null;
            else out.push(line);
            continue;
        }
        prose.push(line);
    }
    out.push(proseToText(prose.join('\n')));
    return out.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Ruta pública de una página de la colección docs. `resumen` es la portada y
 * vive en la raíz (/docs, /en/docs): /docs/resumen responde con un 301.
 */
export function docsPath(lang: 'es' | 'en', slug: string): string {
    const prefix = lang === 'en' ? '/en/docs' : '/docs';
    const clean = slug.replace(/^\/+|\/+$/g, '');
    return clean === '' || clean === 'resumen' ? prefix : `${prefix}/${clean}`;
}

const SECTIONS: Record<string, { es: string; en: string }> = {
    '': { es: 'Empezar', en: 'Get started' },
    resumen: { es: 'Empezar', en: 'Get started' },
    productos: { es: 'Empezar', en: 'Get started' },
    cotizacion: { es: 'Cotizaciones', en: 'Quotes' },
    pagos: { es: 'Pagos', en: 'Payments' },
    cuenta: { es: 'Cuenta', en: 'Account' },
    gestion: { es: 'Gestión', en: 'Management' },
    interaccion: { es: 'Interacción', en: 'Collaboration' },
    automatizacion: { es: 'Automatización', en: 'Automation' },
    operacion: { es: 'Operación', en: 'Operations' },
    desarrolladores: { es: 'Desarrolladores', en: 'Developers' },
};

/** Nombre legible de la sección de una página (primer segmento del slug). */
export function docsSection(slug: string, lang: 'es' | 'en'): string {
    const first = slug.replace(/^\/+/, '').split('/')[0] ?? '';
    const known = SECTIONS[first];
    if (known) return known[lang];
    return first.charAt(0).toUpperCase() + first.slice(1).replace(/-/g, ' ');
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
