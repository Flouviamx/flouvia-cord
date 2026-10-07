// llms-full.txt: toda la documentación en un solo archivo de texto para asistentes
// de IA. Sale del mismo contenido que docs.cordhq.app al compilar, así que no
// puede quedarse atrás de las docs.
import { docsPath } from './docs-search';

export interface DocForLlm { id: string; title: string; description: string; body: string; lastUpdated?: string }

/** MDX a Markdown legible: sin imports ni etiquetas JSX, con los bloques de código intactos. */
export function mdxToMarkdown(mdx: string): string {
    return mdx.split(/(```[\s\S]*?```)/g).map((part) => {
        if (part.startsWith('```')) return part;
        return part
            .replace(/^import .*$/gm, '')
            .replace(/<header[\s\S]*?<\/header>/g, '')
            .replace(/<\/?[A-Za-z][^>]*>/g, '')
            .replace(/\n{3,}/g, '\n\n');
    }).join('').trim();
}

export function buildLlmsFull(docs: DocForLlm[], lang: 'es' | 'en'): string {
    const origin = 'https://docs.cordhq.app';
    const updatedLabel = lang === 'en' ? 'Last updated' : 'Última actualización';
    const head = lang === 'en'
        ? '# Cord documentation (full text)\n\n> Every page of docs.cordhq.app in one file, generated at build time. Index and integration rules: https://cordhq.app/llms.txt. OpenAPI: https://cordhq.app/openapi.json.\n'
        : '# Documentación de Cord (texto completo)\n\n> Todas las páginas de docs.cordhq.app en un solo archivo, generado al compilar. Índice y reglas de integración: https://cordhq.app/llms.txt. OpenAPI: https://cordhq.app/openapi.json.\n';
    const pages = [...docs]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((d) => {
            const slug = d.id.replace(/^(en|es)\//, '').replace(/\/index$/, '');
            // La portada (resumen) vive en la raíz: /docs/resumen responde con un 301.
            const meta = [`URL: ${origin}${docsPath(lang, slug)}`, ...(d.lastUpdated ? [`${updatedLabel}: ${d.lastUpdated}`] : [])].join('\n');
            return `\n---\n\n# ${d.title}\n\n${meta}\n${d.description ? `\n${d.description}\n` : ''}\n${mdxToMarkdown(d.body)}\n`;
        });
    return head + pages.join('');
}
