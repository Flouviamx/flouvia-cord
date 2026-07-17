// /api/cedulas — índice de Cédulas Presupuestales (planeación financiera).
//   GET   → lista todas las cédulas de la org
//   POST  { tipo, nombre, periodos: string[] } → crea (siembra plantilla si `tipo`
//           tiene una, ver CEDULA_TEMPLATES) → { id }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../lib/db';
import { requirePerm, getCedulas, createCedula } from '../../lib/queries';
import { applyTemplate, CEDULA_TEMPLATES } from '../../lib/cedulas';

const TIPOS = new Set(['ventas', 'produccion', 'compras_mp', 'mano_obra', 'cif', 'cobranza', 'custom']);

export const GET: APIRoute = async () => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const cedulas = await getCedulas(orgId);
    return json({ cedulas, templates: Object.entries(CEDULA_TEMPLATES).map(([tipo, t]) => ({ tipo, nombre: t.nombre })) });
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const tipo = String(body.tipo ?? '').trim();
    if (!TIPOS.has(tipo)) return json({ error: 'Tipo de cédula inválido' }, 400);
    const nombre = String(body.nombre ?? '').trim().slice(0, 120) || (CEDULA_TEMPLATES[tipo]?.nombre ?? 'Cédula sin nombre');
    const periodos = Array.isArray(body.periodos)
        ? body.periodos.map((p: unknown) => String(p ?? '').trim().slice(0, 40)).filter(Boolean).slice(0, 36)
        : [];
    if (!periodos.length) return json({ error: 'Agrega al menos un periodo' }, 400);

    const orgId = await getActiveOrgId();
    const id = await createCedula(orgId, { tipo, nombre, periodos });
    if (body.template !== false) await applyTemplate(orgId, id, tipo);

    await logAudit(orgId, { accion: 'cedula.creada', entidad: 'cedula', entidad_id: id, detalle: `Cédula "${nombre}" (${tipo})`, ip: reqIp(request) });
    return json({ id });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
