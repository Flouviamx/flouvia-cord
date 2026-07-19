// /api/analisis — índice de herramientas de análisis (proyecto VPN / inventario EOQ).
//   GET   → lista todos los análisis guardados de la org
//   POST  { tipo, nombre, inputs } → crea → { id }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../lib/db';
import { requirePerm, getAnalisisList, createAnalisis } from '../../lib/queries';
import { sanitizeInputs, TIPOS_ANALISIS } from '../../lib/analisis';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const analisis = await getAnalisisList(orgId);
    return json({ analisis });
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const tipo = String(body.tipo ?? '').trim();
    if (!TIPOS_ANALISIS.has(tipo)) return json({ error: 'Tipo de análisis inválido' }, 400);
    const nombre = String(body.nombre ?? '').trim().slice(0, 120) || 'Análisis sin nombre';
    // Solo persistimos los campos numéricos conocidos del tipo (no jsonb arbitrario).
    const inputs = sanitizeInputs(tipo, body.inputs);

    const orgId = await getActiveOrgId();
    const id = await createAnalisis(orgId, { tipo, nombre, inputs });
    await logAudit(orgId, { accion: 'analisis.creado', entidad: 'analisis', entidad_id: id, detalle: `${nombre} (${tipo})`, ip: reqIp(request) });
    return json({ id });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
