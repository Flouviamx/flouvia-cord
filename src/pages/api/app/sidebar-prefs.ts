// /api/app/sidebar-prefs — guarda los fijados y los grupos plegados de la
// sidebar para el usuario actual, en org_members.widget_prefs['cord.sidebar.v1']
// (mismo almacén y mismo patrón que /api/app/widget-prefs):
//   PUT { pins: [{ href, label }], collapsed: [groupId] } → { ok: true }
//
// Antes vivían en localStorage: no te seguían a otro equipo y se compartían
// entre organizaciones aunque un fijado apunte a datos de una sola. Por miembro
// (org, user) quedan donde pertenecen.
//
// ⚠️ RLS sobre org_members no protege (el driver conecta con el rol dueño de
// la BD): el `and user_id = ${userId}` del UPDATE es la única barrera real.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';
import { SIDEBAR_PREFS_KEY, sanitizeSidebarPrefs } from '../../../lib/sidebar-nav';

const MAX_PAYLOAD_BYTES = 8 * 1024;

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const PUT: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    if (!userId) return json({ error: 'Sin sesión' }, 401);

    const raw = await request.text();
    if (raw.length > MAX_PAYLOAD_BYTES) return json({ error: 'Payload demasiado grande' }, 400);

    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: 'JSON inválido' }, 400); }

    const { pins, collapsed } = sanitizeSidebarPrefs(body);
    const orgId = await getActiveOrgId();
    const patch = JSON.stringify({ [SIDEBAR_PREFS_KEY]: { pins: pins ?? [], collapsed, at: Date.now() } });
    const [rows] = await withOrgTx(orgId, sql`
        update org_members
        set widget_prefs = widget_prefs || ${patch}::jsonb, widget_prefs_at = now()
        where org_id = ${orgId} and user_id = ${userId} and estado = 'activo'
        returning id`);
    if (!rows.length) return json({ error: 'Membresía no encontrada' }, 404);

    return json({ ok: true });
};
