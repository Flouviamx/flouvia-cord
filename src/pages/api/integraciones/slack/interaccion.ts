// POST /api/integraciones/slack/interaccion — botones de los mensajes de Cord
// (aprobar o rechazar una solicitud). Se responde de inmediato y la decisión
// llega por `response_url`.
export const prerender = false;

import type { APIRoute } from 'astro';
import { after } from '../../../../lib/after';
import { reqContext } from '../../../../lib/context';
import { contextoDeEquipo, decidir, firmaSlackValida, signingSecret } from '../../../../lib/integraciones/slack-app';

export const POST: APIRoute = async ({ request }) => {
    const cuerpo = await request.text();
    if (cuerpo.length > 64 * 1024) return new Response('Payload too large', { status: 413 });
    if (!firmaSlackValida(signingSecret(), request.headers.get('x-slack-request-timestamp'), cuerpo, request.headers.get('x-slack-signature'))) {
        return new Response('Invalid signature', { status: 401 });
    }
    let payload: any;
    try { payload = JSON.parse(new URLSearchParams(cuerpo).get('payload') ?? ''); } catch { return new Response('Bad request', { status: 400 }); }
    if (payload?.type === 'block_actions') {
        const ctx = await contextoDeEquipo(String(payload?.team?.id ?? ''));
        if (ctx) after(reqContext.run({ userId: null, orgId: ctx.orgId, actor: 'slack' }, () => decidir(ctx, payload)));
    }
    return new Response('', { status: 200 });
};
