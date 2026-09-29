// POST /api/integraciones/slack/comando — el comando /cord. Slack espera la
// respuesta en menos de 3 segundos; es una búsqueda indexada y nada más.
export const prerender = false;

import type { APIRoute } from 'astro';
import { reqContext } from '../../../../lib/context';
import { rateLimit } from '../../../../lib/ratelimit';
import { comando, contextoDeEquipo, firmaSlackValida, signingSecret } from '../../../../lib/integraciones/slack-app';

const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
    const cuerpo = await request.text();
    if (cuerpo.length > 8192) return new Response('Payload too large', { status: 413 });
    if (!firmaSlackValida(signingSecret(), request.headers.get('x-slack-request-timestamp'), cuerpo, request.headers.get('x-slack-signature'))) {
        return new Response('Invalid signature', { status: 401 });
    }
    const f = new URLSearchParams(cuerpo);
    const teamId = f.get('team_id') ?? '';
    const rl = await rateLimit(`slack-comando:${teamId}`, 60, 60);
    if (!rl.ok) return json({ response_type: 'ephemeral', text: 'Demasiadas búsquedas seguidas. Espera un momento.' });
    const ctx = await contextoDeEquipo(teamId);
    const respuesta = ctx
        ? await reqContext.run({ userId: null, orgId: ctx.orgId, actor: 'slack' }, () => comando(ctx, f.get('text') ?? ''))
        : await comando(null, '', 'es');
    return json(respuesta);
};
