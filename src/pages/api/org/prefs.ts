// /api/org/prefs — preferencias en jsonb que no caben en el guardado genérico:
//   PATCH { notif_prefs?, slack_webhook_url? } → { ok }
// notif_prefs: { [evento]: { email?:bool, slack?:bool } } — la consulta
// src/lib/notify.ts antes de mandar cada correo/post a Slack (ver historial).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';

// Eventos y canales válidos (whitelist — evita basura en el jsonb).
const EVENTOS = new Set(['quote_viewed', 'quote_approved', 'quote_rejected', 'quote_paid', 'quote_expiring', 'payment_overdue', 'team_join']);
const CANALES = new Set(['email', 'slack']);

function sanitizeNotif(input: unknown): Record<string, Record<string, boolean>> {
    const out: Record<string, Record<string, boolean>> = {};
    if (!input || typeof input !== 'object') return out;
    for (const [ev, canales] of Object.entries(input as Record<string, unknown>)) {
        if (!EVENTOS.has(ev) || !canales || typeof canales !== 'object') continue;
        const row: Record<string, boolean> = {};
        for (const [c, v] of Object.entries(canales as Record<string, unknown>)) {
            if (CANALES.has(c)) row[c] = Boolean(v);
        }
        out[ev] = row;
    }
    return out;
}

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const orgId = await getActiveOrgId();
    const [actualRows] = await withOrgTx(orgId, sql`select notif_prefs, slack_webhook_url from orgs where id = ${orgId}`);
    const actual = actualRows[0];

    const notif = body.notif_prefs !== undefined ? sanitizeNotif(body.notif_prefs) : actual.notif_prefs;

    // Slack: vacío = desconectar; URL válida = guardar; URL inválida = ERROR claro
    // (antes se ignoraba en silencio, así que "guardar" no hacía nada y parecía roto).
    let slack = actual.slack_webhook_url;
    if (body.slack_webhook_url !== undefined) {
        const raw = String(body.slack_webhook_url).trim();
        if (raw === '') slack = null;
        else if (/^https:\/\/hooks\.slack\.com\//.test(raw)) slack = raw;
        else return json({ error: 'La URL de Slack debe empezar con https://hooks.slack.com/' }, 400);
    }

    await withOrgTx(orgId, sql`update orgs set notif_prefs = ${JSON.stringify(notif)}::jsonb,
                              slack_webhook_url = ${slack}
              where id = ${orgId}`);
    await logAudit(orgId, { accion: 'org.preferencias', entidad: 'org', entidad_id: orgId, detalle: 'Actualizó notificaciones/integraciones', ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
