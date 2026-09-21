import { sql, withOrgTx } from '../db';
import { after } from '../after';
import { currentLocale } from '../context';
import { t } from '../../i18n/app';
import { assertResourceCapacity, parsedResourceLimit, ResourceLimitReachedError } from '../org-entitlements';
import { type ActionContext, type ActionOutcome, auditAction, done, isUuid } from '../actions/outcome';
import type { Lang } from './catalog';
import { sanitizeDefinition, validateForPublish } from './definition';
import { workflowErrorText } from './errors';
import { SCHEDULE_TRIGGER } from './catalog';
import { nextScheduleAt } from './schedule';

import { WORKFLOW_TEMPLATES } from './templates';

export { WORKFLOW_TEMPLATES };

// Los mensajes que sí lee una persona salen del diccionario (regla 36): la app
// interna sirve español e inglés y un error de workflow no es la excepción.
const L = () => currentLocale();
const msg = (key: string) => t(L(), key as any);

const NO_ENCONTRADO = () => done(404, { error: msg('wf.svc.no_encontrado'), code: 'not_found' });

export async function listWorkflows(orgId: string) {
    const [rows] = await withOrgTx(orgId, sql`
        select w.id, w.nombre, w.estado, w.definicion->>'trigger' as trigger_borrador, w.trigger_publicado,
               w.version, w.updated_at, w.published_at,
               coalesce(r.total, 0) as runs_30d, coalesce(r.fallidas, 0) as fallidas_30d, r.ultima
          from workflows w
          left join lateral (
            select count(*)::int as total,
                   count(*) filter (where status = 'failed')::int as fallidas,
                   max(created_at) as ultima
              from workflow_runs
             where org_id = w.org_id and workflow_id = w.id and created_at > now() - interval '30 days'
          ) r on true
         where w.org_id = ${orgId}
         order by w.updated_at desc
         limit 200`);
    return rows;
}

export async function getWorkflow(orgId: string, id: string) {
    if (!isUuid(id)) return null;
    const [[row]] = await withOrgTx(orgId, sql`
        select id, nombre, estado, definicion, publicado, trigger_publicado, version, updated_at, published_at
          from workflows where id = ${id} and org_id = ${orgId}`);
    return row ?? null;
}

export async function createWorkflow(ctx: ActionContext, input: { plantilla?: unknown; lang: Lang }): Promise<ActionOutcome> {
    const template = WORKFLOW_TEMPLATES.find((t) => t.key === input.plantilla);
    const nombre = template ? template.nombre[input.lang] : (input.lang === 'en' ? 'Untitled workflow' : 'Workflow sin título');
    const definicion = sanitizeDefinition(template ? template.definicion(input.lang) : { trigger: null, steps: [] });
    const [[row]] = await withOrgTx(ctx.orgId, sql`
        insert into workflows (org_id, nombre, definicion, created_by, updated_by)
        values (${ctx.orgId}, ${nombre}, ${JSON.stringify(definicion)}::jsonb, ${ctx.userId ?? null}, ${ctx.userId ?? null})
        returning id`);
    await auditAction(ctx, 'workflow.creado', 'workflow', row.id as string, nombre);
    return done(200, { id: row.id });
}

export async function saveWorkflowDraft(ctx: ActionContext, id: string, input: { nombre?: unknown; definicion?: unknown }): Promise<ActionOutcome> {
    if (!isUuid(id)) return NO_ENCONTRADO();
    const nombre = typeof input.nombre === 'string' ? input.nombre.trim().slice(0, 120) : '';
    if (!nombre) return done(400, { error: msg('wf.svc.sin_nombre'), code: 'invalid_request' });
    const definicion = sanitizeDefinition(input.definicion);
    const [rows] = await withOrgTx(ctx.orgId, sql`
        update workflows
           set nombre = ${nombre}, definicion = ${JSON.stringify(definicion)}::jsonb, updated_by = ${ctx.userId ?? null}, updated_at = now()
         where id = ${id} and org_id = ${ctx.orgId}
        returning id`);
    if (!rows.length) return NO_ENCONTRADO();
    return done(200, { ok: true, definicion });
}

export async function publishWorkflow(ctx: ActionContext, id: string, lang: Lang): Promise<ActionOutcome> {
    const wf = await getWorkflow(ctx.orgId, id);
    if (!wf) return NO_ENCONTRADO();
    const definicion = sanitizeDefinition(wf.definicion);
    const issues = validateForPublish(definicion, lang);
    if (issues.length) return done(422, { error: issues[0].message, code: 'invalid_workflow', issues });
    if (wf.estado !== 'active') {
        const limited = await capacityError(ctx.orgId);
        if (limited) return limited;
    }
    // Un programado nace con su próximo tic calculado en la zona del negocio;
    // el resto no tiene next_run_at y publicar lo limpia por si venía de serlo.
    const proximo = await nextTickFor(ctx.orgId, definicion);
    try {
        await withOrgTx(ctx.orgId, sql`
            update workflows
               set publicado = ${JSON.stringify(definicion)}::jsonb, trigger_publicado = ${definicion.trigger},
                   version = version + 1, estado = 'active', published_at = now(),
                   next_run_at = ${proximo},
                   updated_by = ${ctx.userId ?? null}, updated_at = now()
             where id = ${id} and org_id = ${ctx.orgId}`);
    } catch (error) {
        const limit = parsedResourceLimit(error);
        if (limit) return limitOutcome(limit.limit);
        throw error;
    }
    await auditAction(ctx, 'workflow.publicado', 'workflow', id, String(wf.nombre));
    return done(200, { ok: true, estado: 'active', version: Number(wf.version) + 1 });
}

export async function setWorkflowPaused(ctx: ActionContext, id: string, paused: boolean): Promise<ActionOutcome> {
    const wf = await getWorkflow(ctx.orgId, id);
    if (!wf) return NO_ENCONTRADO();
    if (!wf.publicado) return done(409, { error: msg('wf.svc.publica_primero'), code: 'invalid_state' });
    const target = paused ? 'paused' : 'active';
    if (wf.estado === target) return done(200, { ok: true, estado: target });
    if (!paused) {
        const limited = await capacityError(ctx.orgId);
        if (limited) return limited;
    }
    // Pausar borra el próximo tic; reanudar lo recalcula desde ahora, para que
    // un programado pausado dos meses no dispare el tic que se quedó atrás.
    const proximo = paused ? null : await nextTickFor(ctx.orgId, sanitizeDefinition(wf.publicado));
    try {
        await withOrgTx(ctx.orgId, sql`
            update workflows set estado = ${target}, next_run_at = ${proximo},
                   updated_by = ${ctx.userId ?? null}, updated_at = now()
             where id = ${id} and org_id = ${ctx.orgId}`);
    } catch (error) {
        const limit = parsedResourceLimit(error);
        if (limit) return limitOutcome(limit.limit);
        throw error;
    }
    await auditAction(ctx, paused ? 'workflow.pausado' : 'workflow.reanudado', 'workflow', id, String(wf.nombre));
    return done(200, { ok: true, estado: target });
}

export async function duplicateWorkflow(ctx: ActionContext, id: string, lang: Lang): Promise<ActionOutcome> {
    const wf = await getWorkflow(ctx.orgId, id);
    if (!wf) return NO_ENCONTRADO();
    const nombre = `${String(wf.nombre).slice(0, 100)} (${lang === 'en' ? 'copy' : 'copia'})`;
    const [[row]] = await withOrgTx(ctx.orgId, sql`
        insert into workflows (org_id, nombre, definicion, created_by, updated_by)
        values (${ctx.orgId}, ${nombre}, ${JSON.stringify(sanitizeDefinition(wf.definicion))}::jsonb, ${ctx.userId ?? null}, ${ctx.userId ?? null})
        returning id`);
    await auditAction(ctx, 'workflow.creado', 'workflow', row.id as string, nombre);
    return done(200, { id: row.id });
}

export async function deleteWorkflow(ctx: ActionContext, id: string): Promise<ActionOutcome> {
    if (!isUuid(id)) return NO_ENCONTRADO();
    const [rows] = await withOrgTx(ctx.orgId, sql`delete from workflows where id = ${id} and org_id = ${ctx.orgId} returning nombre`);
    if (!rows.length) return NO_ENCONTRADO();
    await auditAction(ctx, 'workflow.eliminado', 'workflow', id, String(rows[0].nombre));
    return done(200, { ok: true });
}

export interface WorkflowHealth {
    dias: number;
    total: number;
    exitosas: number;
    fallidas: number;
    esperando: number;
    /** Causas de fallo, de la más frecuente a la menos. */
    causas: { code: string; mensaje: string; n: number; ultima: string; workflow: string }[];
}

/**
 * Salud de las automatizaciones de la organización. Agrupar por CAUSA solo es
 * posible porque el error se guarda como código (regla 36): con la frase ya
 * escrita habría que parsear texto, y un cambio de redacción partiría el conteo
 * en dos causas que son la misma.
 */
export async function workflowHealth(orgId: string, dias = 30): Promise<WorkflowHealth> {
    const ventana = Math.min(90, Math.max(1, Math.floor(dias)));
    const [[tot], causas] = await withOrgTx(orgId,
        sql`select count(*)::int as total,
                   count(*) filter (where status = 'succeeded')::int as exitosas,
                   count(*) filter (where status = 'failed')::int as fallidas,
                   count(*) filter (where status in ('queued', 'waiting', 'running'))::int as esperando
              from workflow_runs
             where org_id = ${orgId} and created_at > now() - (${ventana} * interval '1 day')`,
        sql`select r.error as code, count(*)::int as n, max(r.finished_at) as ultima,
                   (array_agg(w.nombre order by r.finished_at desc nulls last))[1] as workflow
              from workflow_runs r
              join workflows w on w.id = r.workflow_id and w.org_id = r.org_id
             where r.org_id = ${orgId} and r.status = 'failed' and r.error is not null
               and r.created_at > now() - (${ventana} * interval '1 day')
             group by r.error
             order by count(*) desc, max(r.finished_at) desc
             limit 5`);

    const lang = L();
    return {
        dias: ventana,
        total: Number(tot?.total ?? 0),
        exitosas: Number(tot?.exitosas ?? 0),
        fallidas: Number(tot?.fallidas ?? 0),
        esperando: Number(tot?.esperando ?? 0),
        causas: causas.map((c) => ({
            code: String(c.code),
            mensaje: workflowErrorText(lang, c.code) ?? String(c.code),
            n: Number(c.n),
            ultima: c.ultima ? new Date(c.ultima as string).toISOString() : '',
            workflow: String(c.workflow ?? ''),
        })),
    };
}

export async function listWorkflowRuns(orgId: string, workflowId: string, limit = 50) {
    if (!isUuid(workflowId)) return [];
    const [rows] = await withOrgTx(orgId, sql`
        select r.id, r.status, r.version, r.attempts, r.error, r.log, r.run_at, r.created_at, r.finished_at, r.publicado,
               e.type as event_type, e.data as event_data, e.actor as event_actor
          from workflow_runs r
          join domain_events e on e.id = r.event_id and e.org_id = r.org_id
         where r.org_id = ${orgId} and r.workflow_id = ${workflowId}
         order by r.created_at desc
         limit ${Math.min(200, Math.max(1, limit))}`);
    const lang = L();
    return rows.map((r) => ({
        ...r,
        error: workflowErrorText(lang, r.error),
        log: Array.isArray(r.log)
            ? (r.log as { detalle?: unknown; resultado?: string }[]).map((entry) => (
                entry?.resultado === 'error' ? { ...entry, detalle: workflowErrorText(lang, entry.detalle) } : entry
            ))
            : r.log,
    }));
}

export async function retryWorkflowRun(ctx: ActionContext, runId: string): Promise<ActionOutcome> {
    if (!isUuid(runId)) return done(404, { error: msg('wf.svc.run_no_encontrada'), code: 'not_found' });
    const [rows] = await withOrgTx(ctx.orgId, sql`
        update workflow_runs
           set status = 'queued', attempts = 0, error = null, run_at = now(), locked_until = null, finished_at = null, updated_at = now()
         where id = ${runId} and org_id = ${ctx.orgId} and status = 'failed'
        returning id, workflow_id`);
    if (!rows.length) return done(409, { error: msg('wf.svc.solo_fallidas'), code: 'invalid_state' });
    await auditAction(ctx, 'workflow.reintento', 'workflow', String(rows[0].workflow_id), runId);
    after(import('./engine').then((m) => m.processOrgRuns(ctx.orgId)));
    return done(200, { ok: true });
}

export async function cancelWorkflowRun(ctx: ActionContext, runId: string): Promise<ActionOutcome> {
    if (!isUuid(runId)) return done(404, { error: msg('wf.svc.run_no_encontrada'), code: 'not_found' });
    const [rows] = await withOrgTx(ctx.orgId, sql`
        update workflow_runs
           set status = 'canceled', locked_until = null, finished_at = now(), updated_at = now()
         where id = ${runId} and org_id = ${ctx.orgId} and status in ('queued', 'waiting')
        returning id, workflow_id`);
    if (!rows.length) return done(409, { error: msg('wf.svc.solo_pendientes'), code: 'invalid_state' });
    await auditAction(ctx, 'workflow.cancelacion', 'workflow', String(rows[0].workflow_id), runId);
    return done(200, { ok: true });
}

/** Próximo tic de un workflow programado, en la zona horaria de la organización. */
async function nextTickFor(orgId: string, definicion: { trigger: string | null; schedule?: unknown }): Promise<string | null> {
    if (definicion.trigger !== SCHEDULE_TRIGGER || !definicion.schedule) return null;
    const [[org]] = await withOrgTx(orgId, sql`select coalesce(zona_horaria, 'America/Mexico_City') as zona from orgs where id = ${orgId}`);
    const siguiente = nextScheduleAt(definicion.schedule as any, String(org?.zona ?? 'America/Mexico_City'));
    return siguiente ? siguiente.toISOString() : null;
}

async function capacityError(orgId: string): Promise<ActionOutcome | null> {
    try {
        await assertResourceCapacity(orgId, 'active_workflows');
        return null;
    } catch (error) {
        if (error instanceof ResourceLimitReachedError) return limitOutcome(error.limit);
        return done(503, { error: msg('wf.svc.limite_no_verificable'), code: 'subscription_verification_unavailable' });
    }
}

const limitOutcome = (limit: number) => done(402, {
    error: msg(limit === 1 ? 'wf.svc.limite_uno' : 'wf.svc.limite_varios').replace('{n}', String(limit)),
    code: 'plan_limit_reached', resource: 'active_workflows', limit,
});
