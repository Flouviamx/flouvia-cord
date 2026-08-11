// /api/webhooks — gestión de endpoints salientes de la org (Developers).
//   GET    ?deliveries=<webhookId>      → { deliveries: [...] }  (log de entregas)
//   POST   { url, eventos? }            → { id, secret }   (secret en claro UNA vez)
//   POST   { action:'test', id }        → { ok, status, error }  (envía evento de prueba)
//   POST   { action:'redeliver', deliveryId } → { ok, status, error }  (replay)
//   POST   { action:'rotate', id, overlapHours } → { secret }  (nuevo secret en claro UNA vez)
//   PATCH  { id, activo?, eventos?, url?, retryRecent? } → { ok }
//   DELETE { id }                        → { ok }
// El secret firma cada entrega (HMAC-sha256). Requiere permiso 'ajustes' + plan API.
export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../lib/db';
import { requirePerm, getWebhookDeliveries } from '../../lib/queries';
import { webhookLimit, planLabel } from '../../lib/permissions';
import { WEBHOOK_EVENT_IDS, sendTestEvent, redeliver, reenableAndRetryRecent, rotateSecret } from '../../lib/webhooks';
import { validateWebhookUrl } from '../../lib/ssrf';
import { rateLimit, tooMany } from '../../lib/ratelimit';
import { encryptRequiredSecret } from '../../lib/crypto-secret';

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


export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const orgIdForAction = await getActiveOrgId();

    // "Enviar prueba"/"Reintentar" son acciones manuales que hacen a Cord
    // pegarle a una URL de terceros — sin límite, un script (o alguien con la
    // pestaña abierta y el dedo pesado) podría convertir el botón en un
    // generador de tráfico hacia el destino que sea. 20/min por org es de
    // sobra para uso humano normal.
    if (body.action === 'test' || body.action === 'redeliver') {
        const rl = await rateLimit(`whaction:${orgIdForAction}`, 20, 60);
        if (!rl.ok) return tooMany(rl.retryAfter);
    }

    // Acción: enviar evento de PRUEBA a un endpoint existente.
    if (body.action === 'test') {
        const id = String(body.id ?? '');
        if (!id) return json({ error: 'Falta id' }, 400);
        const r = await sendTestEvent(orgIdForAction, id);
        await logAudit(orgIdForAction, { accion: 'webhook.prueba', entidad: 'webhook', entidad_id: id, detalle: `Envío de prueba (${r.ok ? 'ok' : r.error})`, ip: reqIp(request) });
        return json(r);
    }

    // Acción: rotar el secreto de un endpoint (ventana de solape 1h/24h/72h —
    // durante ese tiempo el secreto viejo SIGUE firmando, ver rotateSecret).
    if (body.action === 'rotate') {
        const id = String(body.id ?? '');
        if (!id) return json({ error: 'Falta id' }, 400);
        const overlapHours = [1, 24, 72].includes(Number(body.overlapHours)) ? Number(body.overlapHours) : 24;
        const r = await rotateSecret(orgIdForAction, id, overlapHours);
        if (!r) return json({ error: 'No se pudo rotar el secreto' }, 500);
        await logAudit(orgIdForAction, { accion: 'webhook.secreto_rotado', entidad: 'webhook', entidad_id: id, detalle: `Ventana de solape: ${overlapHours}h`, ip: reqIp(request) });
        return json({ secret: r.secret });
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
    const urlCheck = validateWebhookUrl(url);
    if (!urlCheck.ok) return json({ error: urlCheck.error }, 400);

    const orgId = await getActiveOrgId();
    // Límite por plan (free también tiene, pero poquito). Contamos los existentes.
    const [[planResult]] = await withOrgTx(orgId, sql`select coalesce(plan,'free') as plan from orgs where id = ${orgId}`);
    const plan = planResult?.plan;
    let usados = 0;
    try { const [[c]] = await withOrgTx(orgId, sql`select count(*)::int as n from webhooks where org_id = ${orgId}`); usados = (c?.n as number) ?? 0; }
    catch { return json({ error: 'No se pudo crear. ¿Corriste la migración (npm run db:migrate)?' }, 500); }
    const limite = webhookLimit(plan as string);
    if (usados >= limite) {
        return json({ error: `Tu plan ${planLabel(plan as string)} permite ${limite} webhook${limite === 1 ? '' : 's'}. Elimina uno o sube de plan para agregar más.` }, 403);
    }

    const eventos = cleanEventos(body.eventos);
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    let secretEnc: string;
    try {
        secretEnc = encryptRequiredSecret(secret);
    } catch {
        return json({ error: 'El servicio de cifrado no está disponible' }, 503);
    }

    let row: any;
    try {
        [[row]] = await withOrgTx(orgId, sql`
            insert into webhooks (org_id, url, eventos, secret, secret_enc)
            values (${orgId}, ${url}, ${JSON.stringify(eventos)}::jsonb, null, ${secretEnc})
            returning id`);
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
    const cambios: string[] = [];

    if (typeof body.activo === 'boolean') {
        if (body.activo) {
            // Reactivar da un slate limpio: si venía de una auto-desactivación
            // (5 fallos seguidos), el dueño ya intervino — no debe volver a
            // dispararse a la primera falla nueva con la racha vieja intacta.
            await withOrgTx(orgId, sql`
                update webhooks
                   set activo = true, fallos_consecutivos = 0, deshabilitado_at = null,
                       deshabilitado_motivo = null, aviso_fallos_at = null
                 where id = ${id} and org_id = ${orgId}`);
            // "Reactivar y reintentar": repone SOLO lo fallido en las últimas
            // 24h (nunca el backlog completo — un endpoint caído una semana no
            // debe despertar con miles de eventos viejos disparándose de golpe).
            if (body.retryRecent === true) {
                const r = await reenableAndRetryRecent(orgId, id);
                cambios.push(r.requeued ? `reactivado + ${r.requeued} reintento(s) reencolado(s)` : 'reactivado (sin fallos recientes que reintentar)');
            } else {
                cambios.push('reactivado');
            }
        } else {
            await withOrgTx(orgId, sql`update webhooks set activo = false where id = ${id} and org_id = ${orgId}`);
            cambios.push('pausado');
        }
    }
    if (Array.isArray(body.eventos)) {
        await withOrgTx(orgId, sql`update webhooks set eventos = ${JSON.stringify(cleanEventos(body.eventos))}::jsonb where id = ${id} and org_id = ${orgId}`);
        cambios.push('eventos actualizados');
    }
    if (typeof body.url === 'string') {
        const urlCheck = validateWebhookUrl(body.url.trim());
        if (!urlCheck.ok) return json({ error: urlCheck.error }, 400);
        await withOrgTx(orgId, sql`update webhooks set url = ${body.url.trim()} where id = ${id} and org_id = ${orgId}`);
        cambios.push(`URL → ${body.url.trim()}`);
    }

    // Antes esta ruta no se auditaba (a diferencia de crear/eliminar) — cambiar
    // la URL de un endpoint a un host ajeno no dejaba ningún rastro.
    if (cambios.length) {
        await logAudit(orgId, { accion: 'webhook.actualizado', entidad: 'webhook', entidad_id: id, detalle: cambios.join('; '), ip: reqIp(request) });
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
    const [rows] = await withOrgTx(orgId, sql`delete from webhooks where id = ${id} and org_id = ${orgId} returning url`);
    if (!rows.length) return json({ error: 'Webhook no encontrado' }, 404);
    await logAudit(orgId, { accion: 'webhook.eliminado', entidad: 'webhook', entidad_id: id, detalle: rows[0].url as string, ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
