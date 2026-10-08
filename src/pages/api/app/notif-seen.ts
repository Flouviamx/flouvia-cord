// /api/app/notif-seen — "leído hasta" de la campana para el usuario actual, en
// org_members.widget_prefs['cord.notif.v1'] (mismo almacén y patrón que
// /api/app/widget-prefs y /api/app/sidebar-prefs):
//   PUT { seen: <ms epoch> } → { ok: true }
//
// Antes vivía en localStorage: marcar como leído en el celular no se reflejaba
// en la computadora, y el punto rojo volvía a salir.
//
// ⚠️ RLS sobre org_members no protege (el driver conecta con el rol dueño de
// la BD): el `and user_id = ${userId}` del UPDATE es la única barrera real.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';
import { NOTIF_PREFS_KEY } from '../../../lib/notificaciones';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const PUT: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    if (!userId) return json({ error: 'Sin sesión' }, 401);

    const raw = await request.text();
    if (raw.length > 512) return json({ error: 'Payload demasiado grande' }, 400);
    let body: any;
    try { body = JSON.parse(raw); } catch { return json({ error: 'JSON inválido' }, 400); }

    // Nunca en el futuro: un reloj adelantado en el navegador escondería avisos
    // que todavía no existen.
    const seen = Math.floor(Math.min(Number(body?.seen), Date.now()));
    if (!Number.isFinite(seen) || seen <= 0) return json({ error: 'Marca inválida' }, 400);

    const orgId = await getActiveOrgId();
    // Solo avanza: dos pestañas no pueden regresar la marca a un punto anterior.
    const [rows] = await withOrgTx(orgId, sql`
        update org_members
        set widget_prefs = widget_prefs || jsonb_build_object(${NOTIF_PREFS_KEY}::text, jsonb_build_object('seen',
                greatest(${seen}::bigint, coalesce((widget_prefs -> ${NOTIF_PREFS_KEY}::text ->> 'seen')::bigint, 0)))),
            widget_prefs_at = now()
        where org_id = ${orgId} and user_id = ${userId} and estado = 'activo'
        returning id`);
    if (!rows.length) return json({ error: 'Membresía no encontrada' }, 404);

    return json({ ok: true });
};
