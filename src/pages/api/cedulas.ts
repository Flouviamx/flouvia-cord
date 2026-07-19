// /api/cedulas — índice de Cédulas Presupuestales (planeación financiera).
//   GET   → lista todas las cédulas de la org + info de plan (freemium)
//   POST  { tipo, nombre, periodos: string[] }        → crea (siembra plantilla) → { id }
//   POST  { duplicar_de: id, nombre? }                → duplica una cédula → { id }
//   POST  { plan_completo: true, periodos, incluirProduccion? } → wizard: crea la
//          cascada Ventas → Cobranza → Efectivo cableada y sembrada (Pro+) → { id, ids }
//
// Gate FREEMIUM (jul 2026): las cédulas básicas están en TODOS los planes con
// límite de cantidad (cedulasLimit: free 1 · starter 3 · pro+ ilimitadas). El
// wizard de plan completo es Pro+ (requirePresupuestosPlan).
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../lib/db';
import { requirePerm, requirePresupuestosPlan, getCedulas, createCedula, getOrgPlan } from '../../lib/queries';
import { applyTemplate, duplicateCedula, createPlanCompleto, CEDULA_TEMPLATES } from '../../lib/cedulas';
import { cedulasLimit, planTienePresupuestos, planLabel } from '../../lib/permissions';

const TIPOS = new Set(['ventas', 'ventas_factores', 'produccion', 'compras_mp', 'mano_obra', 'cif', 'cobranza', 'efectivo', 'custom']);

export const GET: APIRoute = async () => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const [cedulas, plan] = await Promise.all([getCedulas(orgId), getOrgPlan()]);
    const limit = cedulasLimit(plan);
    return json({
        cedulas,
        templates: Object.entries(CEDULA_TEMPLATES).map(([tipo, t]) => ({ tipo, nombre: t.nombre })),
        plan: {
            isPro: planTienePresupuestos(plan),
            label: planLabel(plan),
            limit: Number.isFinite(limit) ? limit : null, // null = ilimitadas
            used: cedulas.length,
        },
    });
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const orgId = await getActiveOrgId();
    const plan = await getOrgPlan();
    const limit = cedulasLimit(plan);

    // ── Wizard "Plan financiero completo" (Pro+) ─────────────────────────
    if (body.plan_completo === true) {
        const planDenied = await requirePresupuestosPlan(); if (planDenied) return planDenied;
        const periodos = cleanPeriodos(body.periodos);
        if (periodos.length < 3) return json({ error: 'El plan completo necesita al menos 3 periodos (la cobranza se escalona a 3 meses).' }, 400);
        const { ventasId, ids } = await createPlanCompleto(orgId, periodos, { incluirProduccion: body.incluirProduccion === true });
        await logAudit(orgId, { accion: 'cedula.plan_completo', entidad: 'cedula', entidad_id: ventasId, detalle: `Plan financiero completo (${ids.length} cédulas)`, ip: reqIp(request) });
        return json({ id: ventasId, ids });
    }

    // ── Límite freemium (aplica a crear y duplicar) ──────────────────────
    if (Number.isFinite(limit)) {
        const existentes = await getCedulas(orgId);
        if (existentes.length >= limit) {
            return json({
                error: `Tu plan ${planLabel(plan)} incluye ${limit} cédula${limit === 1 ? '' : 's'}. Sube a Profesional para cédulas ilimitadas, el plan completo en un clic y Presupuesto vs. Real.`,
                code: 'limit',
            }, 402);
        }
    }

    // ── Duplicar ─────────────────────────────────────────────────────────
    if (body.duplicar_de) {
        const nuevoId = await duplicateCedula(orgId, String(body.duplicar_de), body.nombre ? String(body.nombre) : undefined);
        if (!nuevoId) return json({ error: 'Cédula no encontrada' }, 404);
        await logAudit(orgId, { accion: 'cedula.duplicada', entidad: 'cedula', entidad_id: nuevoId, detalle: `Duplicada de ${body.duplicar_de}`, ip: reqIp(request) });
        return json({ id: nuevoId });
    }

    // ── Crear con plantilla ──────────────────────────────────────────────
    const tipo = String(body.tipo ?? '').trim();
    if (!TIPOS.has(tipo)) return json({ error: 'Tipo de cédula inválido' }, 400);
    const nombre = String(body.nombre ?? '').trim().slice(0, 120) || (CEDULA_TEMPLATES[tipo]?.nombre ?? 'Cédula sin nombre');
    const periodos = cleanPeriodos(body.periodos);
    if (!periodos.length) return json({ error: 'Agrega al menos un periodo' }, 400);

    const id = await createCedula(orgId, { tipo, nombre, periodos });
    if (body.template !== false) await applyTemplate(orgId, id, tipo);

    await logAudit(orgId, { accion: 'cedula.creada', entidad: 'cedula', entidad_id: id, detalle: `Cédula "${nombre}" (${tipo})`, ip: reqIp(request) });
    return json({ id });
};

function cleanPeriodos(raw: unknown): string[] {
    return Array.isArray(raw)
        ? raw.map((p: unknown) => String(p ?? '').trim().slice(0, 40)).filter(Boolean).slice(0, 36)
        : [];
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
