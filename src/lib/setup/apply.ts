// Aplica un plan aprobado por una persona. No tiene lógica propia de escritura:
// llama a los mismos manejadores que usa Ajustes, dentro de la sesión de quien
// aprueba, así que hereda sus permisos, validaciones, topes del plan, bitácora y
// el historial de configuración (deshacer). Solo corre desde una sesión web: el
// CLI y los agentes proponen, nunca aplican.
import type { APIRoute } from 'astro';
import { sql, withOrgTx, logAudit, reqIp } from '../db';
import { currentUserId } from '../context';
import { sanitizeReviewed, type SetupProposal, type Descartado } from './plan';
import { PATCH as orgPatch } from '../../pages/api/org';
import { POST as impuestoPost } from '../../pages/api/impuestos';
import { POST as productosImport } from '../../pages/api/productos/import';
import { POST as plantillaPost } from '../../pages/api/plantillas';

export interface SectionResult { seccion: 'perfil' | 'impuestos' | 'productos' | 'plantillas'; ok: boolean; detalle: string }

export type ApplyResult =
    | { ok: true; resultado: SectionResult[]; descartado: Descartado[] }
    | { ok: false; status: number; error: string };

const FORWARDED = ['x-real-ip', 'x-vercel-forwarded-for', 'x-forwarded-for', 'user-agent', 'origin'];

async function call(handler: APIRoute, original: Request, path: string, method: string, body: unknown) {
    const headers = new Headers({ 'content-type': 'application/json' });
    for (const h of FORWARDED) { const v = original.headers.get(h); if (v) headers.set(h, v); }
    const request = new Request(new URL(path, original.url), { method, headers, body: JSON.stringify(body) });
    const res = await handler({ request } as Parameters<APIRoute>[0]);
    let data: any = null;
    try { data = await res.json(); } catch { /* sin cuerpo */ }
    return { ok: res.ok, status: res.status, data };
}

export async function applySetup(orgId: string, planId: string, editada: unknown, request: Request): Promise<ApplyResult> {
    const [[plan], [org], impuestos] = await withOrgTx(orgId,
        sql`select estado, propuesta, expira_at from setup_plans where id = ${planId} and org_id = ${orgId}`,
        sql`select country_code from orgs where id = ${orgId}`,
        sql`select kind, tasa from impuestos where org_id = ${orgId}`);
    if (!plan) return { ok: false, status: 404, error: 'Esa propuesta no existe.' };
    if (plan.estado !== 'propuesto') return { ok: false, status: 409, error: plan.estado === 'aplicado' ? 'Esta propuesta ya se aplicó.' : 'Esta propuesta ya no se puede aplicar.' };
    if (new Date(plan.expira_at).getTime() < Date.now()) return { ok: false, status: 410, error: 'La propuesta venció. Genera una nueva.' };

    // Se re-sanea lo que mandó el navegador; el logo solo puede ser el que Cord descargó.
    const guardada = plan.propuesta as SetupProposal;
    const { propuesta: p, descartado } = sanitizeReviewed(editada ?? guardada, {
        country: String(org?.country_code || 'MX'),
        impuestosActuales: impuestos.map((t: any) => ({ kind: String(t.kind), tasa: Number(t.tasa) })),
        logoDataUrl: guardada?.marca?.logo_url ?? null,
    });

    // Solo una se queda con el plan: dos pestañas aprobando a la vez no aplican dos veces.
    const [[claimed]] = await withOrgTx(orgId, sql`
        update setup_plans set estado = 'aplicado', aplicado_por = ${currentUserId()}, aplicado_at = now(), updated_at = now()
         where id = ${planId} and org_id = ${orgId} and estado = 'propuesto'
        returning id`);
    if (!claimed) return { ok: false, status: 409, error: 'Esta propuesta ya se aplicó.' };

    const resultado: SectionResult[] = [];
    const orgBody = { ...p.perfil, ...p.marca, ...p.cotizaciones };
    if (Object.keys(orgBody).length) {
        const r = await call(orgPatch, request, '/api/org', 'PATCH', orgBody);
        resultado.push({ seccion: 'perfil', ok: r.ok, detalle: r.ok ? `${Object.keys(orgBody).length} ajustes` : String(r.data?.error || `Error ${r.status}`) });
    }
    if (p.impuestos.length) {
        let creados = 0; let error = '';
        for (const t of p.impuestos) {
            const r = await call(impuestoPost, request, '/api/impuestos', 'POST', { nombre: t.nombre, kind: t.kind, tasa: t.tasa });
            if (r.ok) creados++; else error = String(r.data?.error || `Error ${r.status}`);
        }
        resultado.push({ seccion: 'impuestos', ok: creados > 0, detalle: error && !creados ? error : `${creados} de ${p.impuestos.length}` });
    }
    if (p.productos.length) {
        const r = await call(productosImport, request, '/api/productos/import', 'POST', { rows: p.productos, upsert: true });
        const nuevos = Number(r.data?.created ?? 0), actualizados = Number(r.data?.updated ?? 0);
        resultado.push({
            seccion: 'productos', ok: r.ok || nuevos + actualizados > 0,
            detalle: r.ok ? `${nuevos} nuevos, ${actualizados} actualizados` : String(r.data?.error || `Error ${r.status}`),
        });
    }
    if (p.plantillas.length) {
        let creadas = 0; let error = '';
        for (const pl of p.plantillas) {
            const r = await call(plantillaPost, request, '/api/plantillas', 'POST', pl);
            if (r.ok) creadas++; else error = String(r.data?.error || `Error ${r.status}`);
        }
        resultado.push({ seccion: 'plantillas', ok: creadas > 0, detalle: error && !creadas ? error : `${creadas} de ${p.plantillas.length}` });
    }

    const algunoOk = resultado.some((r) => r.ok);
    await withOrgTx(orgId, sql`
        update setup_plans set resultado = ${JSON.stringify(resultado)}::jsonb,
               estado = ${algunoOk || !resultado.length ? 'aplicado' : 'fallido'}, updated_at = now()
         where id = ${planId} and org_id = ${orgId}`);
    await logAudit(orgId, {
        accion: 'setup.aplicado', entidad: 'setup_plan', entidad_id: planId, ip: reqIp(request),
        detalle: resultado.map((r) => `${r.seccion}: ${r.ok ? 'ok' : 'error'} (${r.detalle})`).join('; ') || 'Sin cambios',
    });
    return { ok: true, resultado, descartado };
}

export async function discardSetup(orgId: string, planId: string): Promise<boolean> {
    const [[row]] = await withOrgTx(orgId, sql`
        update setup_plans set estado = 'descartado', updated_at = now()
         where id = ${planId} and org_id = ${orgId} and estado in ('generando', 'propuesto')
        returning id`);
    return !!row;
}

export async function getSetupPlan(orgId: string, planId: string) {
    const [[row]] = await withOrgTx(orgId, sql`
        select id, origen, estado, entrada, propuesta, descartado, resultado, created_at, aplicado_at, expira_at
          from setup_plans where id = ${planId} and org_id = ${orgId}`);
    return row ?? null;
}
