import { sql, withOrgTx, type DbRow } from '../db';
import { reqContext } from '../context';
import { log } from '../log';
import { siteOrigin, sendEmail } from '../email';
import { postSlackText } from '../slack';
import { strictRateLimit } from '../ratelimit';
import { createTask } from '../actions/tasks';
import { addHubSpotNote, HubSpotActionError } from '../integraciones/hubspot/actions';
import { HubSpotApiError } from '../integraciones/hubspot/client';
import { HubSpotAuthError } from '../integraciones/hubspot/oauth';
import { findTrigger } from './catalog';
import {
    evaluateConditions, exitBranch, isValidPath, nextSibling, renderTemplate, sanitizeDefinition, stepAt,
    type Path, type Step, type WorkflowDefinition,
} from './definition';

export const MAX_ATTEMPTS = 3;
const MAX_LOG = 100;
const RUNS_PER_BATCH = 20;
const RETRY_DELAY_MS = 1500;

export class WorkflowStepError extends Error {
    constructor(message: string, readonly final = false) {
        super(message);
    }
}

interface RunRow {
    id: string;
    org_id: string;
    workflow_id: string;
    publicado: WorkflowDefinition;
    event_id: string;
    depth: number;
    attempts: number;
    cursor: unknown;
    log: unknown;
}

interface LogEntry {
    step: string;
    tipo: Step['type'];
    resultado: 'ok' | 'error' | 'si' | 'no' | 'esperando';
    detalle?: string;
    at: string;
}

export async function processOrgRuns(orgId: string, limit = RUNS_PER_BATCH): Promise<number> {
    let runs: DbRow[];
    try {
        [runs] = await withOrgTx(orgId, sql`
            update workflow_runs r
               set status = 'running', locked_until = now() + interval '5 minutes',
                   run_at = now() + interval '5 minutes', updated_at = now()
             where r.id in (
                select id from workflow_runs
                 where org_id = ${orgId} and run_at <= now()
                   and status in ('queued', 'waiting', 'running')
                   and (status <> 'running' or locked_until is null or locked_until <= now())
                 order by run_at
                 limit ${limit}
                 for update skip locked)
            returning r.id, r.org_id, r.workflow_id, r.publicado, r.event_id, r.depth, r.attempts, r.cursor, r.log`);
    } catch (err) {
        log.error('no se pudieron reclamar ejecuciones de workflows', { route: 'workflows/engine', orgId, err });
        return 0;
    }
    for (const run of runs) {
        try {
            await executeRun(run as unknown as RunRow);
        } catch (err) {
            log.error('una ejecución de workflow falló sin control', { route: 'workflows/engine', orgId, err });
        }
    }
    return runs.length;
}

export async function executeRun(run: RunRow): Promise<void> {
    const orgId = run.org_id;
    const entries: LogEntry[] = Array.isArray(run.log) ? (run.log as LogEntry[]).slice(-MAX_LOG) : [];
    const def = sanitizeDefinition(run.publicado);
    let path: Path = isValidPath(run.cursor) ? run.cursor : [0];

    const [[event]] = await withOrgTx(orgId, sql`
        select type, object, object_id, data, actor from domain_events where id = ${run.event_id} and org_id = ${orgId}`);
    if (!event) return finish(run, 'canceled', entries, path, 'El evento que inició esta ejecución ya no existe.');

    const trigger = findTrigger(event.type as string);
    const [[wf]] = await withOrgTx(orgId, sql`
        with ranked as (
            select id, nombre, estado,
                   row_number() over (order by created_at asc, id asc) as position,
                   cord_resource_limit(cord_effective_plan(${orgId}::uuid), 'active_workflows') as allowance
              from workflows
             where org_id = ${orgId} and estado = 'active'
        )
        select nombre, (allowance is null or position <= allowance) as permitido
          from ranked where id = ${run.workflow_id}`);
    if (!wf) return finish(run, 'canceled', entries, path, 'El workflow se pausó o se eliminó antes de terminar esta ejecución.');
    if (!wf.permitido) return finish(run, 'canceled', entries, path, 'Tu plan actual no incluye este workflow activo.');
    const nombre = wf.nombre as string;

    return reqContext.run({ userId: null, orgId, actor: `workflow:${run.workflow_id}`, workflowDepth: run.depth + 1 }, async () => {
        for (let guard = 0; guard < 200; guard++) {
            const step = stepAt(def.steps, path);
            if (!step) {
                const out = exitBranch(path);
                if (!out) return finish(run, 'succeeded', entries, path, null);
                path = out;
                continue;
            }
            const at = new Date().toISOString();
            if (step.type === 'wait') {
                const next = nextSibling(path);
                entries.push({ step: step.id, tipo: 'wait', resultado: 'esperando', detalle: String(step.days), at });
                await withOrgTx(orgId, sql`
                    update workflow_runs
                       set status = 'waiting', cursor = ${JSON.stringify(next)}::jsonb, log = ${JSON.stringify(entries.slice(-MAX_LOG))}::jsonb,
                           run_at = now() + (${step.days} * interval '1 day'), locked_until = null, updated_at = now()
                     where id = ${run.id} and org_id = ${orgId}`);
                return;
            }
            if (step.type === 'condition') {
                const values = await buildValues(orgId, event, trigger?.fields.some((x) => x.live) ?? false);
                const passed = evaluateConditions(step, values, trigger?.fields ?? []);
                entries.push({ step: step.id, tipo: 'condition', resultado: passed ? 'si' : 'no', at });
                path = [...path, passed ? 'then' : 'else', 0];
                await saveProgress(run, entries, path);
                continue;
            }
            let detalle: string;
            try {
                detalle = await runActionWithRetry(step, { orgId, event, values: await buildValues(orgId, event, false), workflowId: run.workflow_id, nombre });
            } catch (err) {
                const message = err instanceof WorkflowStepError ? err.message : 'Error interno al ejecutar la acción.';
                if (!(err instanceof WorkflowStepError)) log.error('fallo inesperado en un paso de workflow', { route: 'workflows/engine', orgId, err });
                entries.push({ step: step.id, tipo: 'action', resultado: 'error', detalle: message, at });
                const attempts = run.attempts + 1;
                if (attempts >= MAX_ATTEMPTS) return finish(run, 'failed', entries, path, message, attempts);
                await withOrgTx(orgId, sql`
                    update workflow_runs
                       set status = 'queued', attempts = ${attempts}, cursor = ${JSON.stringify(path)}::jsonb,
                           log = ${JSON.stringify(entries.slice(-MAX_LOG))}::jsonb, error = ${message},
                           run_at = now() + (${attempts} * interval '1 hour'), locked_until = null, updated_at = now()
                     where id = ${run.id} and org_id = ${orgId}`);
                return;
            }
            entries.push({ step: step.id, tipo: 'action', resultado: 'ok', detalle, at });
            path = nextSibling(path);
            await saveProgress(run, entries, path).catch(() => saveProgress(run, entries, path));
        }
        return finish(run, 'failed', entries, path, 'El workflow excedió el número de pasos permitido.');
    });
}

async function saveProgress(run: RunRow, entries: LogEntry[], path: Path) {
    await withOrgTx(run.org_id, sql`
        update workflow_runs
           set cursor = ${JSON.stringify(path)}::jsonb, log = ${JSON.stringify(entries.slice(-MAX_LOG))}::jsonb,
               locked_until = now() + interval '5 minutes', run_at = now() + interval '5 minutes', updated_at = now()
         where id = ${run.id} and org_id = ${run.org_id}`);
}

async function finish(run: RunRow, status: 'succeeded' | 'failed' | 'canceled', entries: LogEntry[], path: Path, error: string | null, attempts = run.attempts) {
    await withOrgTx(run.org_id, sql`
        update workflow_runs
           set status = ${status}, cursor = ${JSON.stringify(path)}::jsonb, log = ${JSON.stringify(entries.slice(-MAX_LOG))}::jsonb,
               error = ${error}, attempts = ${attempts}, locked_until = null, finished_at = now(), updated_at = now()
         where id = ${run.id} and org_id = ${run.org_id}`);
}

function actorTipo(actor: string): string {
    if (actor === 'client') return 'cliente';
    if (actor.startsWith('user:')) return 'usuario';
    if (actor.startsWith('api:')) return 'api';
    if (actor.startsWith('mcp:')) return 'mcp';
    if (actor.startsWith('workflow:')) return 'workflow';
    return 'sistema';
}

async function buildValues(orgId: string, event: DbRow, live: boolean): Promise<Record<string, unknown>> {
    const values: Record<string, unknown> = Object.create(null);
    const data = (event.data && typeof event.data === 'object' ? event.data : {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(data)) values[k] = v;
    values.actor_tipo = actorTipo(String(event.actor ?? ''));
    if (live && event.object_id) {
        if (event.object === 'quote') {
            const [[q]] = await withOrgTx(orgId, sql`select status from cotizaciones where id = ${event.object_id} and org_id = ${orgId}`);
            values.estado_actual = q?.status ?? null;
        } else if (event.object === 'invoice') {
            const [[d]] = await withOrgTx(orgId, sql`select lifecycle from documentos_fiscales where id = ${event.object_id} and org_id = ${orgId}`);
            values.estado_actual = d?.lifecycle ?? null;
        }
    }
    return values;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const escapeSlack = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ').trim();

interface ActionInput {
    orgId: string;
    event: DbRow;
    values: Record<string, unknown>;
    workflowId: string;
    nombre: string;
}

async function runActionWithRetry(step: Extract<Step, { type: 'action' }>, input: ActionInput): Promise<string> {
    try {
        return await runAction(step, input);
    } catch (err) {
        if (err instanceof WorkflowStepError && err.final) throw err;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return runAction(step, input);
    }
}

async function runAction(step: Extract<Step, { type: 'action' }>, input: ActionInput): Promise<string> {
    const { orgId, event, values } = input;
    const p = step.params;

    if (step.action === 'create_task') {
        const rl = await strictRateLimit(`wf-task:${orgId}`, 120, 3600);
        if (!rl.ok) throw new WorkflowStepError('Se alcanzó el máximo de tareas por hora de los workflows.', true);
        const titulo = oneLine(renderTemplate(String(p.titulo ?? ''), values)).slice(0, 200);
        if (!titulo) throw new WorkflowStepError('El título de la tarea quedó vacío.', true);
        const dias = typeof p.dias === 'number' ? p.dias : null;
        const due = dias === null ? null : new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
        const eventData = (event.data && typeof event.data === 'object' ? event.data : {}) as Record<string, unknown>;
        const refId = typeof eventData.cotizacion_id === 'string' && /^[0-9a-f-]{36}$/i.test(eventData.cotizacion_id) ? eventData.cotizacion_id : null;
        const cotizacionId = event.object === 'quote' ? (event.type !== 'quote.deleted' ? event.object_id : null) : refId;
        const outcome = await createTask(
            { orgId, origin: siteOrigin(), actor: `workflow:${input.workflowId}` },
            { titulo, due_date: due, cotizacion_id: cotizacionId },
        );
        if (outcome.status !== 200) throw new WorkflowStepError(String(outcome.body.error ?? 'No se pudo crear la tarea.'), true);
        return titulo;
    }

    if (step.action === 'notify_team') {
        const rl = await strictRateLimit(`wf-email:${orgId}`, 30, 3600);
        if (!rl.ok) throw new WorkflowStepError('Se alcanzó el máximo de correos por hora de los workflows.', true);
        const [rows] = p.destinatarios === 'all'
            ? await withOrgTx(orgId, sql`
                select distinct u.email from org_members m join users u on u.id = m.user_id
                 where m.org_id = ${orgId} and m.estado = 'activo' and u.email is not null
                 limit 25`)
            : await withOrgTx(orgId, sql`
                select u.email from orgs o join users u on u.id = o.owner_id where o.id = ${orgId}`);
        const recipients = rows.map((r) => String(r.email)).filter(Boolean);
        if (!recipients.length) throw new WorkflowStepError('No hay a quién enviar el correo.', true);
        const subject = oneLine(renderTemplate(String(p.asunto ?? ''), values)).slice(0, 150) || input.nombre;
        const body = renderTemplate(String(p.mensaje ?? ''), values, escapeHtml).replace(/\n/g, '<br>');
        const link = `${siteOrigin()}/app/workflows/${input.workflowId}`;
        const [[org]] = await withOrgTx(orgId, sql`select idioma from orgs where id = ${orgId}`);
        const footer = String(org?.idioma ?? '').startsWith('en') ?['Sent by the', 'workflow in Cord.'] : ['Enviado por el workflow', 'de Cord.'];
        const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#050505">`
            + `<p>${body}</p>`
            + `<p style="margin-top:28px;font-size:12px;color:#6b7280">${footer[0]} <a href="${escapeHtml(link)}" style="color:#0a192f">${escapeHtml(input.nombre)}</a> ${footer[1]}</p></div>`;
        let sent = 0;
        for (const to of recipients) {
            const r = await sendEmail({ to, subject, html, orgId, operation: 'workflow_notify' });
            if (r.sent) sent++;
        }
        if (!sent) throw new WorkflowStepError('El correo no está disponible por ahora.');
        return `${sent}`;
    }

    if (step.action === 'slack_message') {
        const [[org]] = await withOrgTx(orgId, sql`select slack_webhook_url from orgs where id = ${orgId}`);
        const url = (org?.slack_webhook_url as string) || '';
        if (!url) throw new WorkflowStepError('Conecta Slack en Ajustes › Integraciones para usar esta acción.', true);
        const rl = await strictRateLimit(`wf-slack:${orgId}`, 120, 3600);
        if (!rl.ok) throw new WorkflowStepError('Se alcanzó el máximo de mensajes por hora de los workflows.', true);
        const text = renderTemplate(String(p.mensaje ?? ''), values, escapeSlack).slice(0, 3000);
        if (!text.trim()) throw new WorkflowStepError('El mensaje quedó vacío.', true);
        const r = await postSlackText(url, text);
        if (!r.ok) throw new WorkflowStepError('Slack no aceptó el mensaje. Revisa la conexión en Ajustes › Integraciones.');
        return 'slack';
    }

    if (step.action === 'hubspot_note') {
        const rl = await strictRateLimit(`wf-hubspot:${orgId}`, 120, 3600);
        if (!rl.ok) throw new WorkflowStepError('Se alcanzó el máximo de notas por hora en HubSpot.', true);
        const body = renderTemplate(String(p.mensaje ?? ''), values, escapeHtml).replace(/\n/g, '<br>').slice(0, 5000);
        if (!body.trim()) throw new WorkflowStepError('La nota quedó vacía.', true);
        const data = (event.data && typeof event.data === 'object' ? event.data : {}) as Record<string, unknown>;
        const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
        const quoteId = event.object === 'quote' ? uuid(event.object_id) : uuid(data.cotizacion_id);
        const clientId = event.object === 'client' ? uuid(event.object_id) : uuid(data.cliente_id);
        try {
            return await addHubSpotNote(orgId, { quoteId, clientId }, body);
        } catch (err) {
            if (err instanceof HubSpotActionError) throw new WorkflowStepError(err.message, err.final);
            if (err instanceof HubSpotApiError) throw new WorkflowStepError(err.message, !err.retryable);
            if (err instanceof HubSpotAuthError) throw new WorkflowStepError(err.message, err.revoked);
            throw err;
        }
    }

    throw new WorkflowStepError('Esta acción ya no está disponible.', true);
}
