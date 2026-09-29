// POST /api/integraciones/slack/eventos — Events API de Slack (link_shared).
// Sin sesión: la credencial es la firma con el signing secret.
export const prerender = false;

import type { APIRoute } from 'astro';
import { after } from '../../../../lib/after';
import { reqContext } from '../../../../lib/context';
import { contextoDeEquipo, firmaSlackValida, signingSecret, vistaPrevia } from '../../../../lib/integraciones/slack-app';

const MAX = 64 * 1024;

export const POST: APIRoute = async ({ request }) => {
    const cuerpo = await request.text();
    if (cuerpo.length > MAX) return new Response('Payload too large', { status: 413 });
    if (!firmaSlackValida(signingSecret(), request.headers.get('x-slack-request-timestamp'), cuerpo, request.headers.get('x-slack-signature'))) {
        return new Response('Invalid signature', { status: 401 });
    }
    let data: any;
    try { data = JSON.parse(cuerpo); } catch { return new Response('Bad request', { status: 400 }); }
    if (data?.type === 'url_verification') {
        return new Response(JSON.stringify({ challenge: String(data.challenge ?? '') }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (data?.type === 'event_callback' && data?.event?.type === 'link_shared') {
        const ctx = await contextoDeEquipo(String(data.team_id ?? ''));
        if (ctx) after(reqContext.run({ userId: null, orgId: ctx.orgId, actor: 'slack' }, () => vistaPrevia(ctx, data.event)));
    }
    return new Response('', { status: 200 });
};
