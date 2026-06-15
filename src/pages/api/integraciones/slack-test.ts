// /api/integraciones/slack-test — envía un mensaje de prueba al Slack conectado.
// Sesión + permiso 'ajustes'. Usa el slack_webhook_url ya guardado en la org.
//   POST → { ok, status } | { error }
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { postToSlack } from '../../../lib/slack';

export const POST: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [o] = await sql`select slack_webhook_url from orgs where id = ${orgId}`;
    const url = o?.slack_webhook_url as string | null;
    if (!url) return json({ error: 'No hay un webhook de Slack conectado. Pega la URL y guarda primero.' }, 400);

    const r = await postToSlack(url, 'ping', { folio: 'COT-PRUEBA', cliente: 'Cliente de prueba', total: 12500, link: null });
    if (!r.ok) return json({ error: `Slack respondió ${r.status || 'sin conexión'}. Revisa la URL del webhook.` }, 400);
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
