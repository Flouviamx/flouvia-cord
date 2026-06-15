// /api/org/prefs — preferencias en jsonb que no caben en el guardado genérico:
//   PATCH { notif_prefs?, integraciones?, slack_webhook_url? } → { ok }
// notif_prefs: { [evento]: { email?:bool, slack?:bool, whatsapp?:bool } }
// integraciones: { [id]: bool }   (toggle de conectores — maqueta que persiste)
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';

// Eventos y canales válidos (whitelist — evita basura en el jsonb).
const EVENTOS = new Set(['quote_viewed', 'quote_approved', 'quote_rejected', 'quote_paid', 'quote_expiring', 'payment_overdue', 'team_join']);
const CANALES = new Set(['email', 'slack', 'whatsapp']);
const INTEGR = new Set(['shopify', 'woo', 'meli', 'zapier', 'contpaqi', 'slack']);

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

function sanitizeIntegr(input: unknown): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    if (!input || typeof input !== 'object') return out;
    for (const [id, v] of Object.entries(input as Record<string, unknown>)) {
        if (INTEGR.has(id)) out[id] = Boolean(v);
    }
    return out;
}

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const orgId = await getActiveOrgId();
    const [actual] = await sql`select notif_prefs, integraciones, slack_webhook_url from orgs where id = ${orgId}`;

    const notif = body.notif_prefs !== undefined ? sanitizeNotif(body.notif_prefs) : actual.notif_prefs;
    const integr = body.integraciones !== undefined ? sanitizeIntegr(body.integraciones) : actual.integraciones;
    const slack = body.slack_webhook_url !== undefined
        ? (String(body.slack_webhook_url).trim() === '' ? null
            : (/^https:\/\/hooks\.slack\.com\//.test(String(body.slack_webhook_url).trim()) ? String(body.slack_webhook_url).trim() : actual.slack_webhook_url))
        : actual.slack_webhook_url;

    await sql`update orgs set notif_prefs = ${JSON.stringify(notif)}::jsonb,
                              integraciones = ${JSON.stringify(integr)}::jsonb,
                              slack_webhook_url = ${slack}
              where id = ${orgId}`;
    await logAudit(orgId, { accion: 'org.preferencias', entidad: 'org', entidad_id: orgId, detalle: 'Actualizó notificaciones/integraciones', ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
