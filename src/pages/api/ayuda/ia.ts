// POST /api/ayuda/ia — Cord AI del panel de Ayuda (ver src/lib/help-assistant.ts).
//   body: { question: string, history?: { role: 'user'|'assistant', text }[] }
//   200 → { text, links: { title, url }[] }
//   503 → { error: 'unavailable' }  (el panel responde con la búsqueda local)
//   429 → tope alcanzado
//
// Requiere sesión (lo exige el middleware para todo /api). La paga Cord, así que
// no reserva cuota del plan del negocio; los topes de abajo son los que acotan
// el gasto: por persona (ráfaga y día) y un techo global diario.
export const prerender = false;

import type { APIRoute } from 'astro';
import { askHelpAssistant, MAX_QUESTION_CHARS } from '../../../lib/help-assistant';
import { helpArticles } from '../../../lib/help-articles';
import { currentLocale, currentUserId } from '../../../lib/context';
import { rateLimit, tooMany } from '../../../lib/ratelimit';

const PER_USER_HOUR = 30;
const PER_USER_DAY = 120;
const GLOBAL_DAY = 5000;

export const POST: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    if (!userId) return json({ error: 'unauthorized' }, 401);

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    if (!question || question.length > MAX_QUESTION_CHARS) return json({ error: 'bad_request' }, 400);

    for (const [key, limit, windowSec] of [
        [`help-ai:user:${userId}:h`, PER_USER_HOUR, 3600],
        [`help-ai:user:${userId}:d`, PER_USER_DAY, 86400],
        ['help-ai:global:d', GLOBAL_DAY, 86400],
    ] as const) {
        const rl = await rateLimit(key, limit, windowSec);
        if (!rl.ok) return tooMany(rl.retryAfter);
    }

    const locale = currentLocale();
    const answer = await askHelpAssistant({ question, history: body?.history, locale, articles: await helpArticles(locale) });
    if (!answer.ok) return json({ error: answer.reason }, 503);
    return json({ text: answer.text, links: answer.links });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
}
