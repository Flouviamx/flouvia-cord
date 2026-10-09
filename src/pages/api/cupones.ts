// /api/cupones — cupones de descuento de la organización (Ajustes › Cupones).
//   GET                                                           → { cupones }
//   POST   { codigo, nombre?, tipo, valor, moneda?, vigente_desde?, vigente_hasta?,
//            max_usos?, max_usos_por_cliente?, activo? }          → { cupon }
//   PATCH  { id, nombre?, vigente_desde?, vigente_hasta?, max_usos?,
//            max_usos_por_cliente?, activo? }                      → { cupon }
//   DELETE { id }                                                 → { ok }
//
// Requiere permiso 'ajustes'. El código, el tipo, el valor y la divisa no se
// editan después de crear el cupón (como en Stripe): un documento que ya lo
// lleva conserva su importe, y cambiarlo por debajo haría que dos documentos
// con el mismo código descontaran cosas distintas. Para otro valor, otro cupón.
// Un cupón con usos no se borra: se desactiva, y su historial se conserva.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../lib/db';
import { requirePerm } from '../../lib/queries';
import { currentUserId } from '../../lib/context';
import { listOfferedCurrencies, normalizeCurrency } from '../../lib/currency';
import { cuponDesdeFila, listarCupones, validarCuponInput } from '../../lib/cupones';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    return json({ cupones: await listarCupones(await getActiveOrgId()) });
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const orgId = await getActiveOrgId();
    const [[org]] = await withOrgTx(orgId, sql`select moneda from orgs where id = ${orgId}`);
    const v = validarCuponInput(body ?? {}, listOfferedCurrencies(normalizeCurrency(org?.moneda)));
    if (!v.ok) return json({ error: v.error }, 400);
    const c = v.value;
    try {
        const [[row]] = await withOrgTx(orgId, sql`
            insert into cupones (org_id, codigo, nombre, tipo, valor, moneda, vigente_desde, vigente_hasta,
                                 max_usos, max_usos_por_cliente, activo, created_by)
            values (${orgId}, ${c.codigo}, ${c.nombre}, ${c.tipo}, ${c.valor}, ${c.moneda},
                    ${c.vigente_desde}::date, ${c.vigente_hasta}::date, ${c.max_usos}, ${c.max_usos_por_cliente},
                    ${c.activo}, ${currentUserId() || null})
            returning *`);
        await logAudit(orgId, { accion: 'cupon.creado', entidad: 'cupon', entidad_id: String(row.id), detalle: c.codigo, ip: reqIp(request) });
        return json({ cupon: cuponDesdeFila(row) });
    } catch (error: any) {
        // Índice único (org_id, codigo): el mismo código dos veces confundiría
        // a quien lo teclea y a quien lo audita.
        if (String(error?.code) === '23505' || /uq_cupones_org_codigo/.test(String(error?.message))) {
            return json({ error: 'Ya tienes un cupón con ese código.', code: 'coupon_code_taken' }, 409);
        }
        throw error;
    }
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body?.id ?? '');
    if (!UUID_RE.test(id)) return json({ error: 'Cupón no encontrado' }, 404);
    const orgId = await getActiveOrgId();
    const [[actual]] = await withOrgTx(orgId, sql`select * from cupones where id = ${id} and org_id = ${orgId}`);
    if (!actual) return json({ error: 'Cupón no encontrado' }, 404);
    const previo = cuponDesdeFila(actual);
    // Se valida el cupón COMPLETO resultante: así una vigencia nueva no puede
    // terminar antes de empezar, ni un tope quedar en cero.
    const v = validarCuponInput({
        ...previo,
        ...(body.nombre !== undefined ? { nombre: body.nombre } : {}),
        ...(body.vigente_desde !== undefined ? { vigente_desde: body.vigente_desde } : {}),
        ...(body.vigente_hasta !== undefined ? { vigente_hasta: body.vigente_hasta } : {}),
        ...(body.max_usos !== undefined ? { max_usos: body.max_usos } : {}),
        ...(body.max_usos_por_cliente !== undefined ? { max_usos_por_cliente: body.max_usos_por_cliente } : {}),
        ...(body.activo !== undefined ? { activo: body.activo === true } : {}),
    }, previo.moneda ? [previo.moneda] : []);
    if (!v.ok) return json({ error: v.error }, 400);
    const c = v.value;
    const [[row]] = await withOrgTx(orgId, sql`
        update cupones set
            nombre = ${c.nombre}, vigente_desde = ${c.vigente_desde}::date, vigente_hasta = ${c.vigente_hasta}::date,
            max_usos = ${c.max_usos}, max_usos_por_cliente = ${c.max_usos_por_cliente}, activo = ${c.activo},
            updated_at = now()
        where id = ${id} and org_id = ${orgId}
        returning *`);
    if (!row) return json({ error: 'Cupón no encontrado' }, 404);
    await logAudit(orgId, {
        accion: c.activo === previo.activo ? 'cupon.actualizado' : (c.activo ? 'cupon.activado' : 'cupon.desactivado'),
        entidad: 'cupon', entidad_id: id, detalle: previo.codigo, ip: reqIp(request),
    });
    return json({ cupon: cuponDesdeFila(row) });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const id = String(body?.id ?? '');
    if (!UUID_RE.test(id)) return json({ error: 'Cupón no encontrado' }, 404);
    const orgId = await getActiveOrgId();
    const [rows] = await withOrgTx(orgId, sql`
        delete from cupones c
         where c.id = ${id} and c.org_id = ${orgId} and c.usos = 0
           and not exists (select 1 from cupon_redenciones r where r.cupon_id = c.id and r.org_id = ${orgId})
        returning codigo`);
    if (!rows.length) {
        return json({ error: 'Este cupón ya se usó: desactívalo para que no se aplique en documentos nuevos y conserva su historial.', code: 'coupon_in_use' }, 409);
    }
    await logAudit(orgId, { accion: 'cupon.eliminado', entidad: 'cupon', entidad_id: id, detalle: String(rows[0].codigo), ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
