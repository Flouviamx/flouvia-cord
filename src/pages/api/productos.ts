// /api/productos — CRUD del catálogo de la org activa.
//   POST   { sku?, nombre, unidad?, precio, activo? }        → { id }
//   PATCH  { id, ...mismos campos }                          → { ok }
//   DELETE { id }                                            → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../lib/queries';
import { createProduct, deleteProduct, updateProduct } from '../../lib/actions/products';
import { outcomeResponse, sessionContext } from '../../lib/actions/http';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('productos'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    return outcomeResponse(await createProduct(await sessionContext(request), body));
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('productos'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);
    return outcomeResponse(await updateProduct(await sessionContext(request), String(body.id), body));
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('productos'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);
    return outcomeResponse(await deleteProduct(await sessionContext(request), String(body.id)));
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
