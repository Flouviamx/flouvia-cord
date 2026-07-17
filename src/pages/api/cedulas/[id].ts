// /api/cedulas/[id] — una cédula presupuestal.
//   GET    → cédula + filas + valores CALCULADOS (input y fórmula resueltos) +
//            catálogo de las demás cédulas de la org (para armar referencias
//            cruzadas en el editor de fórmulas)
//   PATCH  { action: 'add_fila' | 'set_valor' | 'delete_fila' | 'rename', ... }
//   DELETE → borra la cédula completa
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { requirePerm, getCedula, getCedulas, deleteCedula, renameCedula, deleteCedulaFila, upsertCedulaValor, addCedulaFila } from '../../../lib/queries';
import { computeCedula, type ComboFormula } from '../../../lib/cedulas';

export const GET: APIRoute = async ({ params }) => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    const id = String(params.id ?? '');
    const orgId = await getActiveOrgId();

    const computed = await computeCedula(orgId, id);
    if (!computed) return json({ error: 'Cédula no encontrada' }, 404);

    // Catálogo ligero de las demás cédulas (para el picker de referencias
    // cruzadas al armar una fórmula) — solo id/concepto por fila, sin recalcular.
    const lista = await getCedulas(orgId);
    const otras = [];
    for (const c of lista) {
        if (c.id === id) continue;
        const full = await getCedula(orgId, c.id);
        if (!full) continue;
        otras.push({
            id: full.id, tipo: full.tipo, nombre: full.nombre,
            filas: full.filas.map((f) => ({ id: f.id, concepto: f.concepto, tipo: f.tipo })),
        });
    }

    return json({
        cedula: {
            id: computed.cedula.id, tipo: computed.cedula.tipo, nombre: computed.cedula.nombre,
            periodos: computed.cedula.periodos,
            filas: computed.cedula.filas,
        },
        valores: computed.valores,
        otras,
    });
};

export const PATCH: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    const id = String(params.id ?? '');
    const orgId = await getActiveOrgId();
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const action = String(body.action ?? '');

    if (action === 'rename') {
        const nombre = String(body.nombre ?? '').trim().slice(0, 120);
        if (!nombre) return json({ error: 'Falta el nombre' }, 400);
        await renameCedula(orgId, id, nombre);
        return json({ ok: true });
    }

    if (action === 'add_fila') {
        const concepto = String(body.concepto ?? '').trim().slice(0, 160);
        const tipo = body.tipo === 'formula' ? 'formula' : 'input';
        if (!concepto) return json({ error: 'Falta el concepto' }, 400);
        let formula: ComboFormula | null = null;
        if (tipo === 'formula') {
            const terms = Array.isArray(body.formula?.terms) ? body.formula.terms : [];
            const cleanTerms = terms
                .map((t: any) => ({ fila_id: String(t.fila_id ?? ''), cedula_id: t.cedula_id ? String(t.cedula_id) : null, coef: Number(t.coef) || 0 }))
                .filter((t: any) => t.fila_id && t.coef !== 0);
            if (!cleanTerms.length) return json({ error: 'La fórmula necesita al menos una referencia con coeficiente' }, 400);
            formula = { op: 'combo', terms: cleanTerms };
        }
        const filaId = await addCedulaFila(orgId, id, { concepto, tipo, formula, orden: Number(body.orden) || 999 });
        await logAudit(orgId, { accion: 'cedula.fila_agregada', entidad: 'cedula', entidad_id: id, detalle: concepto, ip: reqIp(request) });
        return json({ id: filaId });
    }

    if (action === 'delete_fila') {
        const filaId = String(body.fila_id ?? '');
        if (!filaId) return json({ error: 'Falta fila_id' }, 400);
        await deleteCedulaFila(orgId, id, filaId);
        return json({ ok: true });
    }

    if (action === 'set_valor') {
        const filaId = String(body.fila_id ?? '');
        const periodoIdx = Number(body.periodo_idx);
        const valor = Number(body.valor);
        if (!filaId || !Number.isFinite(periodoIdx) || periodoIdx < 0) return json({ error: 'Parámetros inválidos' }, 400);
        if (!Number.isFinite(valor)) return json({ error: 'Valor inválido' }, 400);
        // Solo filas 'input' aceptan valores tecleados — evita pisar una fórmula.
        const full = await getCedula(orgId, id);
        const fila = full?.filas.find((f) => f.id === filaId);
        if (!fila) return json({ error: 'Fila no encontrada' }, 404);
        if (fila.tipo !== 'input') return json({ error: 'Esta fila es calculada — no se puede editar directamente' }, 400);
        await upsertCedulaValor(orgId, filaId, id, periodoIdx, valor);
        return json({ ok: true });
    }

    return json({ error: 'Acción desconocida' }, 400);
};

export const DELETE: APIRoute = async ({ params, request }) => {
    const denied = await requirePerm('analitica'); if (denied) return denied;
    const id = String(params.id ?? '');
    const orgId = await getActiveOrgId();
    const full = await getCedula(orgId, id);
    await deleteCedula(orgId, id);
    if (full) await logAudit(orgId, { accion: 'cedula.eliminada', entidad: 'cedula', entidad_id: id, detalle: `Cédula "${full.nombre}" eliminada`, ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
