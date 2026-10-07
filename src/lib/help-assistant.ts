// Cord AI del panel de Ayuda: responde dudas de USO de Cord con el material del
// Centro de ayuda. Lo paga Cord (no consume la cuota de IA del plan del negocio),
// así que el diseño entero es para gastar lo mínimo sin dejar de servir:
//
// - Claude Haiku 5.5 fijo ($0.10 / $0.50 por millón), sin pensamiento y con
//   esfuerzo bajo: es una consulta corta sobre un material dado, no razonamiento.
// - El prompt de sistema (reglas + FAQ + índice de artículos) es IDÉNTICO entre
//   peticiones del mismo idioma y va cacheado: lo que cambia (artículos elegidos,
//   historial y pregunta) va DESPUÉS del punto de caché.
// - Solo viajan los 3 artículos más relevantes, recortados, y los últimos turnos.
// - Respuesta corta (max_tokens acotado) y topes por persona y globales en la ruta.
//
// No ve datos de la cuenta ni ejecuta acciones. Si falla o declina, la ruta lo
// dice y el panel responde con la búsqueda local; nunca muestra el error crudo.

import Anthropic from '@anthropic-ai/sdk';
import { getAppRuntimeI18n } from '../i18n/app';
import { rankDocs } from './help-search';
import { log } from './log';
import { DEFAULT_AI_MODEL } from './ai-model';

// El default de Cord, NO aiModel(): un override de AI_MODEL no debe encarecer la
// ayuda, que paga Cord.
export const HELP_AI_MODEL = DEFAULT_AI_MODEL;
const MAX_OUTPUT_TOKENS = 450;
const ARTICLES_PER_QUESTION = 3;
const ARTICLE_CHARS = 2200;
export const MAX_QUESTION_CHARS = 500;
export const MAX_HISTORY_TURNS = 6;
const MAX_TURN_CHARS = 700;

export type Locale = 'es' | 'en';
export type HelpArticle = { title: string; description: string; category: string; url: string; body: string };
export type HelpTurn = { role: 'user' | 'assistant'; text: string };
export type HelpAnswer =
    | { ok: true; text: string; links: { title: string; url: string }[]; usage: Anthropic.Usage }
    | { ok: false; reason: 'unavailable' | 'declined' };

const API_KEY = import.meta.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
let client: Anthropic | null = null;

// Markdown → texto llano compacto: menos tokens y nada de sintaxis que el modelo
// pueda copiar a una burbuja que se pinta como texto.
export function plainArticle(md: string, max = ARTICLE_CHARS): string {
    const txt = String(md || '')
        .replace(/\x60{3}[\s\S]*?\x60{3}/g, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^#{1,6}\s*/gm, '')
        .replace(/[*_\x60>|]/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return txt.length > max ? txt.slice(0, max).replace(/\s+\S*$/, '') + '…' : txt;
}

// Prompt de sistema por idioma. Debe ser byte a byte estable entre peticiones
// (nada de fechas ni ids): es el prefijo que se cachea.
const systemCache = new Map<Locale, string>();
export function buildSystemPrompt(locale: Locale, articles: HelpArticle[]): string {
    const hit = systemCache.get(locale);
    if (hit) return hit;
    const lang = locale === 'en' ? 'English' : 'Spanish (Mexico)';
    const faq = (getAppRuntimeI18n(locale).faq || []) as { q: string; a: string }[];
    const prompt = [
        'You are Cord AI, the help assistant inside Cord. Cord takes a business from proposal to payment: quotes, a public link where the client reviews, signs and pays, invoicing (CFDI in Mexico, Verifactu in Spain, commercial invoices elsewhere), collections, payouts, a public API and integrations.',
        '',
        'Answer questions about how to use Cord using only the Help Center material in this prompt and the articles attached to each question. When the material does not cover something, say so plainly and suggest contacting support; do not guess features, prices, limits or steps. You cannot see the user\'s account or data and cannot take actions in it; if asked, say so in one sentence and explain how they can do it themselves.',
        '',
        `Reply in ${lang}. Be brief: usually two to five sentences, or a short numbered list when there are steps. Plain text only: no Markdown headings, bold, tables or links, because the app shows the related articles under your answer. Name screens the way the app does (for example "Ajustes › Cobros"). Do not include internal or system XML tags in your response.`,
        '',
        '<faq>',
        ...faq.map((f) => `Q: ${f.q}\nA: ${f.a}`),
        '</faq>',
        '',
        '<help_center_index>',
        ...articles.map((a) => `- ${a.title} (${a.category}): ${a.description}`),
        '</help_center_index>',
    ].join('\n');
    systemCache.set(locale, prompt);
    return prompt;
}

export function sanitizeHistory(raw: unknown): HelpTurn[] {
    if (!Array.isArray(raw)) return [];
    const turns = raw
        .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string' && t.text.trim())
        .map((t) => ({ role: t.role as HelpTurn['role'], text: String(t.text).trim().slice(0, MAX_TURN_CHARS) }))
        .slice(-MAX_HISTORY_TURNS);
    // La API exige empezar por "user": se descartan respuestas huérfanas al frente.
    while (turns.length && turns[0].role !== 'user') turns.shift();
    return turns;
}

export function buildMessages(question: string, history: HelpTurn[], context: HelpArticle[]): Anthropic.MessageParam[] {
    const attached = context.length
        ? '<articles>\n' + context.map((a) => `<article title="${a.title.replace(/"/g, "'")}">\n${plainArticle(a.body)}\n</article>`).join('\n') + '\n</articles>\n\n'
        : '';
    return [
        ...history.map((t) => ({ role: t.role, content: t.text }) as Anthropic.MessageParam),
        { role: 'user', content: `${attached}<question>${question}</question>` },
    ];
}

// Artículos que acompañan a la pregunta. Con historial, una pregunta suelta
// ("¿y en Estados Unidos?") pierde el tema: se busca también con la anterior.
export function pickContext(question: string, history: HelpTurn[], articles: HelpArticle[]): HelpArticle[] {
    const lastUser = [...history].reverse().find((t) => t.role === 'user')?.text ?? '';
    return rankDocs(`${question} ${lastUser}`, articles, (a) => ({ title: a.title, body: `${a.description} ${a.category} ${a.body}` }), 0.34, ARTICLES_PER_QUESTION);
}

// La petición completa, pura (sin red) para poder verificar su forma: modelo,
// sin pensamiento, esfuerzo bajo, salida acotada y el sistema cacheado.
export function buildHelpRequest(input: { question: string; history: HelpTurn[]; locale: Locale; articles: HelpArticle[]; context: HelpArticle[] }): Anthropic.MessageCreateParamsNonStreaming {
    return {
        model: HELP_AI_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        thinking: { type: 'disabled' },
        output_config: { effort: 'low' },
        system: [{ type: 'text', text: buildSystemPrompt(input.locale, input.articles), cache_control: { type: 'ephemeral' } }],
        messages: buildMessages(input.question, input.history, input.context),
    };
}

export async function askHelpAssistant(input: { question: string; history?: unknown; locale: Locale; articles: HelpArticle[] }): Promise<HelpAnswer> {
    const question = String(input.question || '').trim().slice(0, MAX_QUESTION_CHARS);
    if (!question || !API_KEY) return { ok: false, reason: 'unavailable' };
    client ??= new Anthropic({ apiKey: API_KEY, maxRetries: 1, timeout: 20_000 });

    const history = sanitizeHistory(input.history);
    const context = pickContext(question, history, input.articles);

    try {
        const res = await client.messages.create(buildHelpRequest({ question, history, locale: input.locale, articles: input.articles, context }));
        log.info('help-ai', {
            route: 'ayuda/ia',
            in: res.usage.input_tokens,
            out: res.usage.output_tokens,
            cacheRead: res.usage.cache_read_input_tokens ?? 0,
            cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
            stop: res.stop_reason,
        });
        if (res.stop_reason === 'refusal') return { ok: false, reason: 'declined' };
        const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
        if (!text) return { ok: false, reason: 'unavailable' };
        return { ok: true, text, links: context.slice(0, 2).map((a) => ({ title: a.title, url: a.url })), usage: res.usage };
    } catch (err) {
        if (err instanceof Anthropic.RateLimitError) log.warn('help-ai rate limited', { route: 'ayuda/ia' });
        else log.error('help-ai falló', { route: 'ayuda/ia', err });
        return { ok: false, reason: 'unavailable' };
    }
}
