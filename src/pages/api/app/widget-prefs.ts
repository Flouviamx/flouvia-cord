// /api/app/widget-prefs — persiste el layout de un grid de widgets para el
// usuario actual, en org_members.widget_prefs (ver db/schema.sql, sección
// "Layout de widgets por usuario"). Consumido por WidgetGrid.astro:
//   PUT  { key, prefs: { order, hidden, sizes, rev, at } } → { ok: true }
//   POST (mismo shape) — variante para navigator.sendBeacon() en pagehide,
//        que solo puede mandar POST.
//
// ⚠️ RLS sobre org_members no protege (el driver conecta con el rol dueño de
// la BD): el `and user_id = ${userId}` del UPDATE es la única barrera real.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';
import { isGridKey } from '../../../lib/widget-catalog';

const MAX_PAYLOAD_BYTES = 8 * 1024;
const MAX_ENTRIES = 200;
const ID_RE = /^[a-z0-9-]{1,48}$/;

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function sanitizePrefs(input: unknown): { order: string[]; hidden: string[]; sizes: Record<string, 'sm' | 'lg'>; rev: number; at: number } | null {
    if (!input || typeof input !== 'object') return null;
    const raw = input as Record<string, unknown>;

    const order = Array.isArray(raw.order) ? raw.order.filter((v): v is string => typeof v === 'string' && ID_RE.test(v)).slice(0, MAX_ENTRIES) : [];
    const hidden = Array.isArray(raw.hidden) ? raw.hidden.filter((v): v is string => typeof v === 'string' && ID_RE.test(v)).slice(0, MAX_ENTRIES) : [];

    const sizes: Record<string, 'sm' | 'lg'> = {};
    if (raw.sizes && typeof raw.sizes === 'object') {
        for (const [id, value] of Object.entries(raw.sizes as Record<string, unknown>)) {
            if (ID_RE.test(id) && (value === 'sm' || value === 'lg')) sizes[id] = value;
            if (Object.keys(sizes).length >= MAX_ENTRIES) break;
        }
    }

    const at = Number(raw.at);
    const rev = Number(raw.rev);
    return { order, hidden, sizes, rev: Number.isFinite(rev) ? rev : 0, at: Number.isFinite(at) ? at : 0 };
}

const handler: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    // Sin sesión de usuario real (M2M/API key, o middleware no aplicado) no hay
    // "mi layout" que guardar — el cliente sigue con localStorage sin más.
    if (!userId) return json({ error: 'Sin sesión' }, 401);

    const raw = await request.text();
    if (raw.length > MAX_PAYLOAD_BYTES) return json({ error: 'Payload demasiado grande' }, 400);

    let body: any;
    try { body = JSON.parse(raw); } catch { return json({ error: 'JSON inválido' }, 400); }

    if (!isGridKey(body?.key)) return json({ error: 'Grid inválido' }, 400);
    const prefs = sanitizePrefs(body?.prefs);
    if (!prefs) return json({ error: 'Preferencias inválidas' }, 400);

    const orgId = await getActiveOrgId();
    const patch = JSON.stringify({ [body.key]: prefs });
    const [rows] = await withOrgTx(orgId, sql`
        update org_members
        set widget_prefs = widget_prefs || ${patch}::jsonb, widget_prefs_at = now()
        where org_id = ${orgId} and user_id = ${userId} and estado = 'activo'
        returning id`);
    if (!rows.length) return json({ error: 'Membresía no encontrada' }, 404);

    return json({ ok: true });
};

export const PUT: APIRoute = handler;
export const POST: APIRoute = handler; // navigator.sendBeacon() solo puede mandar POST
