// /api/kits/[id] — un kit de cotización.
//   GET    → kit + renglones (para el editor de Ajustes/Productos › Kits)
//   PATCH  { action: 'rename' | 'add_item' | 'remove_item', ... }
//   DELETE → borra el kit completo (cascade limpia sus renglones)
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { requirePerm, getKit, renameKit, deleteKit, addKitItem, removeKitItem } from '../../../lib/queries';

export const GET: APIRoute = async ({ params }) => {
    const denied = await requirePerm('productos'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const kit = await getKit(orgId, String(params.id ?? ''));
    if (!kit) return json({ error: 'Kit no encontrado' }, 404);
    return json({ kit });
};

export const PATCH: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('productos'); if (denied) return denied;
    const id = String(params.id ?? '');
    const orgId = await getActiveOrgId();
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const action = String(body.action ?? '');

    if (action === 'rename') {
        const actual = await getKit(orgId, id);
        if (!actual) return json({ error: 'Kit no encontrado' }, 404);
        const nombre = body.nombre !== undefined ? String(body.nombre).trim().slice(0, 120) : actual.nombre;
        if (!nombre) return json({ error: 'El nombre del kit es obligatorio' }, 400);
        const descripcion = body.descripcion !== undefined ? String(body.descripcion).trim().slice(0, 300) : actual.descripcion;
        const activo = body.activo !== undefined ? Boolean(body.activo) : actual.activo;
        let precioCombo = actual.precioCombo;
        if (body.precio_combo !== undefined) {
            const parsed = parsePrecioCombo(body.precio_combo);
            if (parsed === 'invalid') return json({ error: 'El precio de combo debe ser mayor a $0' }, 400);
            precioCombo = parsed;
        }
        await renameKit(orgId, id, { nombre, descripcion, activo, precioCombo });
        return json({ ok: true });
    }

    if (action === 'add_item') {
        const descripcion = String(body.descripcion ?? '').trim().slice(0, 200);
        const cantidad = Math.max(0.01, Number(body.cantidad) || 1);
        const productoId = body.producto_id ? String(body.producto_id) : null;
        if (!descripcion) return json({ error: 'Falta la descripción del renglón' }, 400);
        try {
            const itemId = await addKitItem(orgId, id, { productoId, descripcion, cantidad, orden: Number(body.orden) || 999 });
            return json({ id: itemId });
        } catch {
            return json({ error: 'Kit no encontrado' }, 404);
        }
    }

    if (action === 'remove_item') {
        const itemId = String(body.item_id ?? '');
        if (!itemId) return json({ error: 'Falta item_id' }, 400);
        await removeKitItem(orgId, id, itemId);
        return json({ ok: true });
    }

    return json({ error: 'Acción inválida' }, 400);
};

export const DELETE: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('productos'); if (denied) return denied;
    const id = String(params.id ?? '');
    const orgId = await getActiveOrgId();
    const actual = await getKit(orgId, id);
    if (!actual) return json({ error: 'Kit no encontrado' }, 404);
    await deleteKit(orgId, id);
    await logAudit(orgId, { accion: 'kit.eliminado', entidad: 'kit', entidad_id: id, detalle: actual.nombre, ip: reqIp(request) });
    return json({ ok: true });
};

// null/'' = sin precio de combo; un número > 0 = precio de combo válido;
// cualquier otra cosa (negativo, 0, texto no numérico) = inválido.
function parsePrecioCombo(raw: unknown): number | null | 'invalid' {
    if (raw === undefined || raw === null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 'invalid';
    return Math.round(n * 100) / 100;
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
