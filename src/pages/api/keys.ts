// /api/keys — API keys de la org (Developers). REALES, con hash sha-256.
//   POST   { nombre, scope? }  → { ok, secret }   (la clave en claro va UNA vez)
//   DELETE { id }              → { ok }            (revoca; no borra el registro)
// En DB sólo vive el hash; después sólo se ve prefix + last4.
export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash, randomBytes } from 'node:crypto';
import { sql, getActiveOrgId, logAudit, reqIp } from '../../lib/db';
import { requirePerm } from '../../lib/queries';
import { planTieneApi } from '../../lib/permissions';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const nombre = String(body.nombre ?? '').trim().slice(0, 60) || 'Sin nombre';
    const scope = body.scope === 'write' ? 'write' : 'read';
    const mode = body.mode === 'test' ? 'test' : 'live';

    const orgId = await getActiveOrgId();

    // Gating por plan: la API pública en VIVO es feature del plan Negocio. Las
    // llaves de PRUEBA (sk_test_) son libres para que cualquiera integre primero.
    if (mode === 'live') {
        const [{ plan }] = await sql`select coalesce(plan,'free') as plan from orgs where id = ${orgId}`;
        if (!planTieneApi(plan as string)) {
            return json({ error: 'Las llaves en vivo requieren el plan Negocio. Usa una llave de prueba (sk_test_) o actualiza tu plan.' }, 403);
        }
    }

    // sk_(live|test)_ + 48 hex. prefix visible = sk_xxxx_ + 8, last4 = últimos 4.
    const raw = randomBytes(24).toString('hex');         // 48 hex chars
    const secret = `sk_${mode}_${raw}`;
    const prefix = secret.slice(0, 16);
    const last4 = secret.slice(-4);
    const hash = sha256(secret);

    let row: any;
    try {
        [row] = await sql`
            insert into api_keys (org_id, nombre, prefix, last4, hash, scope, mode, created_by)
            values (${orgId}, ${nombre}, ${prefix}, ${last4}, ${hash}, ${scope}, ${mode}, ${reqIp(request)})
            returning id`;
    } catch (e: any) {
        return json({ error: 'No se pudo crear la llave. ¿Corriste la migración (npm run db:migrate)?' }, 500);
    }

    await logAudit(orgId, { accion: 'apikey.creada', entidad: 'api_key', entidad_id: row.id as string, detalle: `Creó la API key "${nombre}" (${mode})`, ip: reqIp(request) });
    return json({ ok: true, id: row.id, secret });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'Falta el id de la llave' }, 400);

    const orgId = await getActiveOrgId();
    await sql`update api_keys set revoked_at = now() where id = ${id} and org_id = ${orgId} and revoked_at is null`;
    await logAudit(orgId, { accion: 'apikey.revocada', entidad: 'api_key', entidad_id: id, detalle: 'Revocó una API key', ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
