// /api/keys — API keys de la org (Developers). REALES, con hash sha-256.
//   POST   { nombre, type, scope?, permissions?, allowed_ips?, expires_in_days? } → { ok, secret }
//   POST   { action: 'roll', id, grace_hours }                                     → { ok, secret }
//   PATCH  { id, nombre?, permissions?, allowed_ips? }                             → { ok }
//   DELETE { id }                                                                  → { ok } (revoca; no borra)
// En DB sólo vive el hash; la clave en claro se muestra UNA vez.
export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash, randomBytes } from 'node:crypto';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../lib/db';
import { currentUserId } from '../../lib/context';
import { requirePerm } from '../../lib/queries';
import { apiKeyLimit, planLabel } from '../../lib/permissions';
import { trackServer } from '../../lib/posthog-server';
import { getEntitlementContext } from '../../lib/org-entitlements';
import { isUuid } from '../../lib/actions/outcome';
import { LATEST_API_VERSION } from '../../lib/api-versions';
import {
    parsePermissions, parseAllowedIps, scopeFor, RESOURCE_IDS,
    KEY_EXPIRY_DAYS, ROLL_GRACE_HOURS, type KeyPermissions,
} from '../../lib/api-key-policy';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function newSecret(prefixStr: 'sk' | 'rk' | 'pk', mode: 'live' | 'test') {
    const secret = `${prefixStr}_${mode}_${randomBytes(24).toString('hex')}`;
    return { secret, prefix: secret.slice(0, 16), last4: secret.slice(-4), hash: sha256(secret) };
}

function permissionsSummary(p: KeyPermissions): string {
    return RESOURCE_IDS.filter((id) => p[id] !== 'none').map((id) => `${id}:${p[id]}`).join(', ');
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (body?.action === 'roll') return roll(request, body);

    const nombre = String(body.nombre ?? '').trim().slice(0, 60) || 'Sin nombre';
    const kind = body.type === 'publishable' ? 'publishable' : body.type === 'restricted' ? 'restricted' : 'secret';
    let mode = body.mode === 'test' ? 'test' : 'live';

    let permissions: KeyPermissions | null = null;
    if (kind === 'restricted') {
        const parsed = parsePermissions(body.permissions);
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        permissions = parsed.value;
    }
    let allowedIps: string[] | null = null;
    if (kind !== 'publishable') {
        const parsed = parseAllowedIps(body.allowed_ips);
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        allowedIps = parsed.value;
    }
    const days = body.expires_in_days == null || body.expires_in_days === '' ? null : Number(body.expires_in_days);
    if (days !== null && !(KEY_EXPIRY_DAYS as readonly number[]).includes(days)) {
        return json({ error: `El vencimiento debe ser ${KEY_EXPIRY_DAYS.join(', ')} días o ninguno.` }, 400);
    }
    const scope = kind === 'publishable' ? 'write' : permissions ? scopeFor(permissions) : (body.scope === 'write' ? 'write' : 'read');

    const orgId = await getActiveOrgId();
    const [entitlements, [[planResult]]] = await Promise.all([
        getEntitlementContext(orgId),
        withOrgTx(orgId, sql`select (sandbox_of is not null) as is_sandbox, is_demo from orgs where id = ${orgId}`),
    ]);
    const plan = entitlements.effectivePlan;
    // En el ENTORNO DE PRUEBA (org sandbox) solo se generan llaves de prueba.
    if (planResult?.is_sandbox) mode = 'test';
    const limite = apiKeyLimit(plan as string);

    const prefixStr = kind === 'publishable' ? 'pk' : kind === 'restricted' ? 'rk' : 'sk';
    const { secret, prefix, last4, hash } = newSecret(prefixStr, mode as 'live' | 'test');
    const type = kind === 'publishable' ? 'publishable' : 'secret';

    let row: any;
    try {
        const [, inserted] = await withOrgTx(
            orgId,
            sql`select pg_advisory_xact_lock(hashtextextended(${'api_keys:' + orgId}, 0))`,
            sql`
                insert into api_keys (org_id, nombre, prefix, last4, hash, scope, mode, type, created_by, api_version, permissions, allowed_ips, expires_at)
                select ${orgId}, ${nombre}, ${prefix}, ${last4}, ${hash}, ${scope}, ${mode}, ${type}, ${currentUserId()}, ${LATEST_API_VERSION},
                       ${permissions ? JSON.stringify(permissions) : null}::jsonb, ${allowedIps}::text[],
                       case when ${days}::int is null then null else now() + make_interval(days => ${days}::int) end
                 where (select count(*) from api_keys
                         where org_id = ${orgId} and revoked_at is null and oauth_client_id is null and replaced_by is null
                           and (expires_at is null or expires_at > now())) < ${limite}
                returning id`,
        );
        [row] = inserted;
    } catch {
        return json({ error: 'No se pudo crear la llave. Intenta de nuevo.' }, 500);
    }
    if (!row) {
        return json({ error: `Tu plan ${planLabel(plan as string)} permite ${limite} claves activas. Revoca una o sube de plan.` }, 403);
    }

    const extras = [
        permissions ? `permisos ${permissionsSummary(permissions)}` : null,
        allowedIps ? `${allowedIps.length} IP permitidas` : null,
        days ? `vence en ${days} días` : null,
    ].filter(Boolean).join('; ');
    await logAudit(orgId, {
        accion: 'apikey.creada', entidad: 'api_key', entidad_id: row.id as string,
        detalle: `Creó la llave "${nombre}" (${prefixStr}_${mode})${extras ? ` — ${extras}` : ''}`, ip: reqIp(request),
    });
    await trackServer('api_key_created', orgId, { key_scope: scope, mode, type }, !!planResult?.is_sandbox, !!planResult?.is_demo);
    return json({ ok: true, id: row.id, secret });
};

// Rotar: llave nueva con la misma configuración; la vieja vive `grace_hours` y
// deja de contar contra el límite de inmediato. Los webhooks de integración que
// creó la llave vieja pasan a la nueva.
async function roll(request: Request, body: any): Promise<Response> {
    const id = String(body.id ?? '');
    if (!isUuid(id)) return json({ error: 'Llave no encontrada' }, 404);
    const grace = Number(body.grace_hours ?? 0);
    if (!(ROLL_GRACE_HOURS as readonly number[]).includes(grace)) {
        return json({ error: `La gracia debe ser ${ROLL_GRACE_HOURS.join(', ')} horas.` }, 400);
    }
    const orgId = await getActiveOrgId();
    const [[old]] = await withOrgTx(orgId, sql`
        select id, nombre, mode, type, permissions from api_keys
         where id = ${id} and org_id = ${orgId} and revoked_at is null and replaced_by is null
           and oauth_client_id is null and (expires_at is null or expires_at > now())`);
    if (!old) return json({ error: 'Esa llave ya no está activa o no se puede rotar.' }, 404);

    const prefixStr = old.type === 'publishable' ? 'pk' : old.permissions ? 'rk' : 'sk';
    const { secret, prefix, last4, hash } = newSecret(prefixStr, old.mode === 'test' ? 'test' : 'live');
    const [, [rolled]] = await withOrgTx(
        orgId,
        sql`select pg_advisory_xact_lock(hashtextextended(${'api_keys:' + orgId}, 0))`,
        sql`
            with old as (
                select * from api_keys
                 where id = ${id} and org_id = ${orgId} and revoked_at is null and replaced_by is null
                   and oauth_client_id is null and (expires_at is null or expires_at > now())
                 for update
            ), nueva as (
                insert into api_keys (org_id, nombre, prefix, last4, hash, scope, mode, type, created_by, api_version, permissions, allowed_ips, expires_at)
                select org_id, nombre, ${prefix}, ${last4}, ${hash}, scope, mode, type, ${currentUserId()}, api_version, permissions, allowed_ips,
                       case when expires_at is null then null else now() + (expires_at - created_at) end
                  from old
                returning id
            ), moved as (
                update webhooks set created_by_key = (select id from nueva)
                 where org_id = ${orgId} and created_by_key = ${id} and exists (select 1 from nueva)
            )
            update api_keys k
               set replaced_by = (select id from nueva),
                   revoked_at = case when ${grace}::int = 0 then now() else null end,
                   expires_at = case when ${grace}::int = 0 then k.expires_at
                                     else least(coalesce(k.expires_at, 'infinity'::timestamptz), now() + make_interval(hours => ${grace}::int)) end
              from old
             where k.id = old.id
            returning (select id from nueva) as new_id`,
    );
    if (!rolled?.new_id) return json({ error: 'Esa llave ya no está activa o no se puede rotar.' }, 409);

    await logAudit(orgId, {
        accion: 'apikey.rotada', entidad: 'api_key', entidad_id: id, ip: reqIp(request),
        detalle: `Rotó la llave "${old.nombre}"; la anterior ${grace === 0 ? 'quedó revocada' : `sigue activa ${grace} h`}`,
    });
    return json({ ok: true, id: rolled.new_id, secret });
}

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!isUuid(id)) return json({ error: 'Llave no encontrada' }, 404);

    const orgId = await getActiveOrgId();
    const [[key]] = await withOrgTx(orgId, sql`
        select id, nombre, type, permissions from api_keys
         where id = ${id} and org_id = ${orgId} and revoked_at is null and oauth_client_id is null`);
    if (!key) return json({ error: 'Llave no encontrada' }, 404);

    const changes: string[] = [];
    let nombre: string | null = null;
    if (body.nombre !== undefined) {
        nombre = String(body.nombre ?? '').trim().slice(0, 60) || null;
        if (!nombre) return json({ error: 'El nombre no puede quedar vacío.' }, 400);
        if (nombre !== key.nombre) changes.push(`nombre "${nombre}"`);
    }
    let permissions: KeyPermissions | null = null;
    if (body.permissions !== undefined) {
        // El prefijo rk_ dice qué es la llave: una secreta no se vuelve restringida ni al revés.
        if (!key.permissions) return json({ error: 'Solo las llaves restringidas tienen permisos por recurso.' }, 400);
        const parsed = parsePermissions(body.permissions);
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        permissions = parsed.value;
        changes.push(`permisos ${permissionsSummary(permissions)}`);
    }
    let ipsTouched = false;
    let allowedIps: string[] | null = null;
    if (body.allowed_ips !== undefined) {
        if (key.type !== 'secret') return json({ error: 'Las Publishable Keys se limitan por dominio, no por IP.' }, 400);
        const parsed = parseAllowedIps(body.allowed_ips);
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        allowedIps = parsed.value;
        ipsTouched = true;
        changes.push(allowedIps ? `IPs permitidas: ${allowedIps.join(', ')}` : 'sin restricción de IP');
    }
    if (!changes.length) return json({ ok: true });

    await withOrgTx(orgId, sql`
        update api_keys set
            nombre = coalesce(${nombre}, nombre),
            permissions = coalesce(${permissions ? JSON.stringify(permissions) : null}::jsonb, permissions),
            scope = coalesce(${permissions ? scopeFor(permissions) : null}::text, scope),
            allowed_ips = case when ${ipsTouched} then ${allowedIps}::text[] else allowed_ips end
         where id = ${id} and org_id = ${orgId} and revoked_at is null`);
    await logAudit(orgId, {
        accion: 'apikey.editada', entidad: 'api_key', entidad_id: id, ip: reqIp(request),
        detalle: `Editó la llave "${key.nombre}": ${changes.join('; ')}`,
    });
    return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'Falta el id de la llave' }, 400);
    if (!isUuid(id)) return json({ error: 'Llave no encontrada' }, 404);

    const orgId = await getActiveOrgId();
    await withOrgTx(orgId,
        sql`update api_keys set revoked_at = now() where id = ${id} and org_id = ${orgId} and revoked_at is null`,
        sql`update oauth_grants set revoked_at = now() where api_key_id = ${id} and org_id = ${orgId} and revoked_at is null`,
        sql`update webhooks set activo = false where org_id = ${orgId} and created_by_key = ${id}`);
    await logAudit(orgId, { accion: 'apikey.revocada', entidad: 'api_key', entidad_id: id, detalle: 'Revocó una API key', ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
