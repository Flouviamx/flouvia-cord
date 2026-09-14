// /api/clientes — CRUD del directorio de clientes de la org activa.
//   POST   { empresa, contacto?, email?, telefono?, rfc?, terminos?, limite?, country_code?, direccion_*? }   → { id }
//   PATCH  { id, ...mismos campos }                                              → { ok }
//   DELETE { id }                                                                → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../lib/queries';
import { createClient, deleteClient, updateClient } from '../../lib/actions/clients';
import { outcomeResponse, sessionContext } from '../../lib/actions/http';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('clientes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    return outcomeResponse(await createClient(await sessionContext(request), body));
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('clientes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);
    return outcomeResponse(await updateClient(await sessionContext(request), String(body.id), body));
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('clientes'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);
    return outcomeResponse(await deleteClient(await sessionContext(request), String(body.id)));
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
