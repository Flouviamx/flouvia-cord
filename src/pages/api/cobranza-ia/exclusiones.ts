// /api/cobranza-ia/exclusiones — "no le escribas a este cliente / esta cotización".
//   POST   { cliente_id? , cotizacion_id?, motivo? }
//   DELETE { id }
// Requiere permiso 'cobranza'.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';
import { requirePerm } from '../../../lib/queries';
import { requireEntitlement } from '../../../lib/org-entitlements';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobranza');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const entitlementDenied = await requireEntitlement(orgId, 'collections_ai');
    if (entitlementDenied) return entitlementDenied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const clienteId = body.cliente_id ? String(body.cliente_id) : null;
    const cotizacionId = body.cotizacion_id ? String(body.cotizacion_id) : null;
    const motivo = body.motivo ? String(body.motivo).trim().slice(0, 200) : null;
    if (!clienteId && !cotizacionId) {
        return json({ error: 'Indica un cliente o una cotización' }, 400);
    }

    // Pertenencia explícita: sin esto un id de OTRA org pasaría el insert (las FK
    // apuntan a las tablas globales, no a "las de esta org").
    if (clienteId) {
        const [[c]] = await withOrgTx(orgId, sql`select id from clientes where id = ${clienteId} and org_id = ${orgId}`);
        if (!c) return json({ error: 'Cliente no encontrado' }, 404);
    }
    if (cotizacionId) {
        const [[c]] = await withOrgTx(orgId, sql`select id from cotizaciones where id = ${cotizacionId} and org_id = ${orgId}`);
        if (!c) return json({ error: 'Cotización no encontrada' }, 404);
    }

    const uid = currentUserId();
    const [[row]] = await withOrgTx(orgId, sql`
        insert into cobranza_exclusiones (org_id, cliente_id, cotizacion_id, motivo, created_by)
        values (${orgId}, ${clienteId}, ${cotizacionId}, ${motivo}, ${uid ?? null})
        on conflict do nothing
        returning id`);
    if (!row) return json({ ok: true, duplicada: true });

    await logAudit(orgId, {
        accion: 'cobranza_ia.exclusion_agregada',
        entidad: clienteId ? 'cliente' : 'cotizacion',
        entidad_id: (clienteId ?? cotizacionId)!,
        detalle: motivo ?? '', ip: reqIp(request),
    });
    return json({ ok: true, id: row.id });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobranza');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'Falta el id' }, 400);

    const [[row]] = await withOrgTx(orgId, sql`
        delete from cobranza_exclusiones where id = ${id} and org_id = ${orgId} returning id`);
    if (!row) return json({ error: 'No encontrada' }, 404);

    await logAudit(orgId, {
        accion: 'cobranza_ia.exclusion_quitada', entidad: 'org', entidad_id: orgId,
        detalle: id, ip: reqIp(request),
    });
    return json({ ok: true });
};
