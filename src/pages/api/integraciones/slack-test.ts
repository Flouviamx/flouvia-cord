// /api/integraciones/slack-test — envía un mensaje de prueba al Slack conectado.
// Sesión + permiso 'ajustes'. Usa el slack_webhook_url ya guardado en la org.
//   POST → { ok, status } | { error }
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { postToSlack } from '../../../lib/slack';
import { currentLocale } from '../../../lib/context';
import { t } from '../../../i18n/app';

export const POST: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const L = currentLocale();
    const orgId = await getActiveOrgId();
    const [orgRows] = await withOrgTx(orgId, sql`select slack_webhook_url from orgs where id = ${orgId}`);
    const o = orgRows[0];
    const url = o?.slack_webhook_url as string | null;
    if (!url) return json({ error: t(L, 'slack.test.sin_webhook') }, 400);

    const r = await postToSlack(url, 'ping', {
        folio: t(L, 'slack.test.folio'), cliente: t(L, 'slack.test.cliente'),
        total: 12500, link: null, lang: L,
    });
    if (!r.ok) return json({ error: t(L, 'slack.test.rechazo') }, 400);
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
