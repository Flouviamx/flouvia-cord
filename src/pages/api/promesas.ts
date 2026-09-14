// /api/promesas — promesas de pago (compromiso del cliente para una fecha).
//   POST   { cotizacion_id, fecha_promesa, monto?, nota? }     → { id }
//   PATCH  { id, estado }   estado ∈ pendiente|cumplida|incumplida → { ok }
//   DELETE { id }                                              → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../lib/queries';
import { createPromise, deletePromise, setPromiseState } from '../../lib/actions/promises';
import { outcomeResponse, sessionContext } from '../../lib/actions/http';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobranza'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    return outcomeResponse(await createPromise(await sessionContext(request), body));
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobranza'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);
    return outcomeResponse(await setPromiseState(await sessionContext(request), String(body.id), String(body.estado ?? '').trim()));
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobranza'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body.id) return json({ error: 'Falta id' }, 400);
    return outcomeResponse(await deletePromise(await sessionContext(request), String(body.id)));
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
