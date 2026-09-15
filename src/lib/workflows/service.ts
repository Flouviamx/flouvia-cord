import { sql, withOrgTx } from '../db';
import { after } from '../after';
import { assertResourceCapacity, parsedResourceLimit, ResourceLimitReachedError } from '../org-entitlements';
import { type ActionContext, type ActionOutcome, auditAction, done, isUuid } from '../actions/outcome';
import type { Lang } from './catalog';
import { sanitizeDefinition, validateForPublish } from './definition';

import { WORKFLOW_TEMPLATES } from './templates';

export { WORKFLOW_TEMPLATES };

const NO_ENCONTRADO = done(404, { error: 'Workflow no encontrado', code: 'not_found' });

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
    if (!isUuid(id)) return NO_ENCONTRADO;
    const nombre = typeof input.nombre === 'string' ? input.nombre.trim().slice(0, 120) : '';
    if (!nombre) return done(400, { error: 'Ponle un nombre al workflow.', code: 'invalid_request' });
    const definicion = sanitizeDefinition(input.definicion);
    const [rows] = await withOrgTx(ctx.orgId, sql`
        update workflows
           set nombre = ${nombre}, definicion = ${JSON.stringify(definicion)}::jsonb, updated_by = ${ctx.userId ?? null}, updated_at = now()
         where id = ${id} and org_id = ${ctx.orgId}
        returning id`);
    if (!rows.length) return NO_ENCONTRADO;
    return done(200, { ok: true, definicion });
}

export async function publishWorkflow(ctx: ActionContext, id: string, lang: Lang): Promise<ActionOutcome> {
    const wf = await getWorkflow(ctx.orgId, id);
    if (!wf) return NO_ENCONTRADO;
    const definicion = sanitizeDefinition(wf.definicion);
    const issues = validateForPublish(definicion, lang);
    if (issues.length) return done(422, { error: issues[0].message, code: 'invalid_workflow', issues });
    if (wf.estado !== 'active') {
        const limited = await capacityError(ctx.orgId);
        if (limited) return limited;
    }
    try {
        await withOrgTx(ctx.orgId, sql`
            update workflows
               set publicado = ${JSON.stringify(definicion)}::jsonb, trigger_publicado = ${definicion.trigger},
                   version = version + 1, estado = 'active', published_at = now(),
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
    if (!wf) return NO_ENCONTRADO;
    if (!wf.publicado) return done(409, { error: 'Publica el workflow antes de pausarlo o reanudarlo.', code: 'invalid_state' });
    const target = paused ? 'paused' : 'active';
    if (wf.estado === target) return done(200, { ok: true, estado: target });
    if (!paused) {
        const limited = await capacityError(ctx.orgId);
        if (limited) return limited;
    }
    try {
        await withOrgTx(ctx.orgId, sql`
            update workflows set estado = ${target}, updated_by = ${ctx.userId ?? null}, updated_at = now()
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
    if (!wf) return NO_ENCONTRADO;
    const nombre = `${String(wf.nombre).slice(0, 100)} (${lang === 'en' ? 'copy' : 'copia'})`;
    const [[row]] = await withOrgTx(ctx.orgId, sql`
        insert into workflows (org_id, nombre, definicion, created_by, updated_by)
        values (${ctx.orgId}, ${nombre}, ${JSON.stringify(sanitizeDefinition(wf.definicion))}::jsonb, ${ctx.userId ?? null}, ${ctx.userId ?? null})
        returning id`);
    await auditAction(ctx, 'workflow.creado', 'workflow', row.id as string, nombre);
    return done(200, { id: row.id });
}

export async function deleteWorkflow(ctx: ActionContext, id: string): Promise<ActionOutcome> {
    if (!isUuid(id)) return NO_ENCONTRADO;
    const [rows] = await withOrgTx(ctx.orgId, sql`delete from workflows where id = ${id} and org_id = ${ctx.orgId} returning nombre`);
    if (!rows.length) return NO_ENCONTRADO;
    await auditAction(ctx, 'workflow.eliminado', 'workflow', id, String(rows[0].nombre));
    return done(200, { ok: true });
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
    return rows;
}

export async function retryWorkflowRun(ctx: ActionContext, runId: string): Promise<ActionOutcome> {
    if (!isUuid(runId)) return done(404, { error: 'Ejecución no encontrada', code: 'not_found' });
    const [rows] = await withOrgTx(ctx.orgId, sql`
        update workflow_runs
           set status = 'queued', attempts = 0, error = null, run_at = now(), locked_until = null, finished_at = null, updated_at = now()
         where id = ${runId} and org_id = ${ctx.orgId} and status = 'failed'
        returning id, workflow_id`);
    if (!rows.length) return done(409, { error: 'Solo se pueden reintentar ejecuciones fallidas.', code: 'invalid_state' });
    await auditAction(ctx, 'workflow.reintento', 'workflow', String(rows[0].workflow_id), runId);
    after(import('./engine').then((m) => m.processOrgRuns(ctx.orgId)));
    return done(200, { ok: true });
}

export async function cancelWorkflowRun(ctx: ActionContext, runId: string): Promise<ActionOutcome> {
    if (!isUuid(runId)) return done(404, { error: 'Ejecución no encontrada', code: 'not_found' });
    const [rows] = await withOrgTx(ctx.orgId, sql`
        update workflow_runs
           set status = 'canceled', locked_until = null, finished_at = now(), updated_at = now()
         where id = ${runId} and org_id = ${ctx.orgId} and status in ('queued', 'waiting')
        returning id, workflow_id`);
    if (!rows.length) return done(409, { error: 'Solo se pueden cancelar ejecuciones pendientes o en espera.', code: 'invalid_state' });
    await auditAction(ctx, 'workflow.cancelacion', 'workflow', String(rows[0].workflow_id), runId);
    return done(200, { ok: true });
}

async function capacityError(orgId: string): Promise<ActionOutcome | null> {
    try {
        await assertResourceCapacity(orgId, 'active_workflows');
        return null;
    } catch (error) {
        if (error instanceof ResourceLimitReachedError) return limitOutcome(error.limit);
        return done(503, { error: 'No pudimos verificar los límites de tu plan. Intenta de nuevo.', code: 'subscription_verification_unavailable' });
    }
}

const limitOutcome = (limit: number) => done(402, {
    error: `Tu plan permite ${limit} workflow${limit === 1 ? '' : 's'} activo${limit === 1 ? '' : 's'}. Pausa uno o sube de plan para publicar este.`,
    code: 'plan_limit_reached', resource: 'active_workflows', limit,
});
