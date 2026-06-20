// /api/webhooks — gestión de endpoints salientes de la org (Developers).
//   GET    ?deliveries=<webhookId>      → { deliveries: [...] }  (log de entregas)
//   POST   { url, eventos? }            → { id, secret }   (secret en claro UNA vez)
//   POST   { action:'test', id }        → { ok, status, error }  (envía evento de prueba)
//   POST   { action:'redeliver', deliveryId } → { ok, status, error }  (replay)
//   PATCH  { id, activo?, eventos?, url? } → { ok }
//   DELETE { id }                        → { ok }
// El secret firma cada entrega (HMAC-sha256). Requiere permiso 'ajustes' + plan API.
export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { sql, getActiveOrgId, logAudit, reqIp } from '../../lib/db';
import { requirePerm, getWebhookDeliveries } from '../../lib/queries';
import { webhookLimit, planLabel } from '../../lib/permissions';
import { WEBHOOK_EVENT_IDS, sendTestEvent, redeliver } from '../../lib/webhooks';

export const GET: APIRoute = async ({ request, url }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const webhookId = url.searchParams.get('deliveries');
    if (!webhookId) return json({ error: 'Falta el parámetro deliveries' }, 400);
    const deliveries = await getWebhookDeliveries(webhookId);
    return json({ deliveries });
};

function cleanEventos(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return [...new Set(v.map(String).filter((e) => WEBHOOK_EVENT_IDS.includes(e)))];
}

function validUrl(u: string): boolean {
    try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; }
    catch { return false; }
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const orgIdForAction = await getActiveOrgId();

    // Acción: enviar evento de PRUEBA a un endpoint existente.
    if (body.action === 'test') {
        const id = String(body.id ?? '');
        if (!id) return json({ error: 'Falta id' }, 400);
        const r = await sendTestEvent(orgIdForAction, id);
        await logAudit(orgIdForAction, { accion: 'webhook.prueba', entidad: 'webhook', entidad_id: id, detalle: `Envío de prueba (${r.ok ? 'ok' : r.error})`, ip: reqIp(request) });
        return json(r);
    }

    // Acción: re-entregar (replay) una entrega pasada.
    if (body.action === 'redeliver') {
        const deliveryId = String(body.deliveryId ?? '');
        if (!deliveryId) return json({ error: 'Falta deliveryId' }, 400);
        const r = await redeliver(orgIdForAction, deliveryId);
        await logAudit(orgIdForAction, { accion: 'webhook.replay', entidad: 'webhook_delivery', entidad_id: deliveryId, detalle: `Reintento (${r.ok ? 'ok' : r.error})`, ip: reqIp(request) });
        return json(r);
    }

    const url = String(body.url ?? '').trim();
    if (!validUrl(url)) return json({ error: 'La URL no es válida (debe empezar con https://)' }, 400);

    const orgId = await getActiveOrgId();
    // Límite por plan (free también tiene, pero poquito). Contamos los existentes.
    const [{ plan }] = await sql`select coalesce(plan,'free') as plan from orgs where id = ${orgId}`;
    let usados = 0;
    try { const [c] = await sql`select count(*)::int as n from webhooks where org_id = ${orgId}`; usados = (c?.n as number) ?? 0; }
    catch { return json({ error: 'No se pudo crear. ¿Corriste la migración (npm run db:migrate)?' }, 500); }
    const limite = webhookLimit(plan as string);
    if (usados >= limite) {
        return json({ error: `Tu plan ${planLabel(plan as string)} permite ${limite} webhook${limite === 1 ? '' : 's'}. Elimina uno o sube de plan para agregar más.` }, 403);
    }

    const eventos = cleanEventos(body.eventos);
    const secret = `whsec_${randomBytes(24).toString('hex')}`;

    let row: any;
    try {
        [row] = await sql`
            insert into webhooks (org_id, url, eventos, secret)
            values (${orgId}, ${url}, ${JSON.stringify(eventos)}::jsonb, ${secret})
            returning id`;
    } catch {
        return json({ error: 'No se pudo crear. ¿Corriste la migración (npm run db:migrate)?' }, 500);
    }
    await logAudit(orgId, { accion: 'webhook.creado', entidad: 'webhook', entidad_id: row.id as string, detalle: url, ip: reqIp(request) });
    return json({ id: row.id, secret });
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'Falta id' }, 400);

    const orgId = await getActiveOrgId();
    if (typeof body.activo === 'boolean') {
        await sql`update webhooks set activo = ${body.activo} where id = ${id} and org_id = ${orgId}`;
    }
    if (Array.isArray(body.eventos)) {
        await sql`update webhooks set eventos = ${JSON.stringify(cleanEventos(body.eventos))}::jsonb where id = ${id} and org_id = ${orgId}`;
    }
    if (typeof body.url === 'string') {
        if (!validUrl(body.url)) return json({ error: 'La URL no es válida' }, 400);
        await sql`update webhooks set url = ${body.url.trim()} where id = ${id} and org_id = ${orgId}`;
    }
    return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'Falta id' }, 400);

    const orgId = await getActiveOrgId();
    const rows = await sql`delete from webhooks where id = ${id} and org_id = ${orgId} returning url`;
    if (!rows.length) return json({ error: 'Webhook no encontrado' }, 404);
    await logAudit(orgId, { accion: 'webhook.eliminado', entidad: 'webhook', entidad_id: id, detalle: rows[0].url as string, ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
