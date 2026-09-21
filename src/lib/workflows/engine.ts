import { sql, withOrgTx, type DbRow } from '../db';
import { reqContext } from '../context';
import { log } from '../log';
import { siteOrigin, sendEmail, sendClientQuoteMessage, sendClientInvoiceMessage } from '../email';
import { postSlackText } from '../slack';
import { postTeamsText } from '../teams';
import { sendWhatsAppTemplate, WHATSAPP_MAX_VARS } from '../whatsapp';
import { strictRateLimit } from '../ratelimit';
import { createTask } from '../actions/tasks';
import { decideApprovalRequest, expireQuote } from '../actions/quotes';
import { safeFetch } from '../ssrf';
import { cancelUsage, reserveUsage } from '../billing';
import { addHubSpotNote, HubSpotActionError } from '../integraciones/hubspot/actions';
import { HubSpotApiError } from '../integraciones/hubspot/client';
import { HubSpotAuthError } from '../integraciones/hubspot/oauth';
import { findTrigger, isPublicHttpsUrl, type Lang, type WorkflowField } from './catalog';
import { datasetOutputs, findDataset } from './datasets';
import { runDataset } from './datasets-run';
import { wfError } from './errors';
import {
    evaluateConditions, exitBranch, isValidPath, nextSibling, renderTemplate, sanitizeDefinition, stepAt, templateVariables,
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
    /** Valores que produjo la propia ejecución: consultas y plazos de espera. */
    datos?: unknown;
}

interface LogEntry {
    step: string;
    tipo: Step['type'];
    resultado: 'ok' | 'error' | 'si' | 'no' | 'esperando' | 'vencido';
    detalle?: string;
    at: string;
}

/** Cada cuánto se vuelve a revisar una espera condicionada. */
const POLL_MINUTES = 60;
const DEADLINE_KEY = '__vence';

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
            returning r.id, r.org_id, r.workflow_id, r.publicado, r.event_id, r.depth, r.attempts, r.cursor, r.log, r.datos`);
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
    // Lo que la propia ejecución ya produjo: resultados de consultas y el
    // vencimiento de las esperas condicionadas. Sobrevive a una espera de días
    // porque vive en su columna, no en memoria.
    const datos: Record<string, unknown> = (run.datos && typeof run.datos === 'object' ? { ...(run.datos as Record<string, unknown>) } : {});

    const [[event]] = await withOrgTx(orgId, sql`
        select type, object, object_id, data, actor from domain_events where id = ${run.event_id} and org_id = ${orgId}`);
    if (!event) return finish(run, 'canceled', entries, path, wfError('evento_ausente'));

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
    if (!wf) return finish(run, 'canceled', entries, path, wfError('workflow_ausente'));
    if (!wf.permitido) return finish(run, 'canceled', entries, path, wfError('plan_workflow'));
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
            const campos = () => [...(trigger?.fields ?? []), ...producedFields(def.steps)];

            if (step.type === 'query') {
                const def2 = findDataset(step.dataset);
                if (!def2) {
                    entries.push({ step: step.id, tipo: 'query', resultado: 'error', detalle: wfError('consulta_retirada'), at });
                    return finish(run, 'failed', entries, path, wfError('consulta_retirada'));
                }
                const clienteId = clientIdFor(event);
                const salida = await runDataset(def2.key, orgId, {
                    dias: Number(step.params.dias ?? def2.params[0]?.default ?? 7),
                    clienteId,
                });
                for (const [k, v] of Object.entries(salida ?? {})) datos[k] = v;
                entries.push({ step: step.id, tipo: 'query', resultado: 'ok', detalle: def2.key, at });
                path = nextSibling(path);
                await saveProgress(run, entries, path, datos);
                continue;
            }

            if (step.type === 'wait_until') {
                const values = { ...await buildValues(orgId, event, true), ...datos };
                const cumplida = evaluateConditions({ ...step, type: 'condition' }, values, campos());
                if (cumplida) {
                    entries.push({ step: step.id, tipo: 'wait_until', resultado: 'si', at });
                    path = [...path, 'then', 0];
                    await saveProgress(run, entries, path, datos);
                    continue;
                }
                // El plazo se fija la PRIMERA vez que se llega al paso y se
                // guarda: recalcularlo en cada revisión lo correría hacia
                // adelante para siempre y la espera no vencería nunca.
                const limites = (datos[DEADLINE_KEY] && typeof datos[DEADLINE_KEY] === 'object' ? datos[DEADLINE_KEY] : {}) as Record<string, string>;
                const vence = limites[step.id] ?? new Date(Date.now() + step.days * 86400000).toISOString();
                limites[step.id] = vence;
                datos[DEADLINE_KEY] = limites;
                if (Date.parse(vence) <= Date.now()) {
                    entries.push({ step: step.id, tipo: 'wait_until', resultado: 'vencido', at });
                    path = [...path, 'else', 0];
                    await saveProgress(run, entries, path, datos);
                    continue;
                }
                entries.push({ step: step.id, tipo: 'wait_until', resultado: 'esperando', detalle: vence.slice(0, 10), at });
                await withOrgTx(orgId, sql`
                    update workflow_runs
                       set status = 'waiting', cursor = ${JSON.stringify(path)}::jsonb, log = ${JSON.stringify(entries.slice(-MAX_LOG))}::jsonb,
                           datos = ${JSON.stringify(datos)}::jsonb,
                           run_at = least(${vence}::timestamptz, now() + (${POLL_MINUTES} * interval '1 minute')),
                           locked_until = null, updated_at = now()
                     where id = ${run.id} and org_id = ${orgId}`);
                return;
            }

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
                const values = { ...await buildValues(orgId, event, trigger?.fields.some((x) => x.live) ?? false), ...datos };
                const passed = evaluateConditions(step, values, campos());
                entries.push({ step: step.id, tipo: 'condition', resultado: passed ? 'si' : 'no', at });
                path = [...path, passed ? 'then' : 'else', 0];
                await saveProgress(run, entries, path, datos);
                continue;
            }
            let detalle: string;
            try {
                const used = new Set(Object.values(step.params).flatMap((v) => (typeof v === 'string' ? templateVariables(v) : [])));
                const needsLive = (trigger?.fields ?? []).some((x) => x.live && used.has(x.key));
                const crudos = { ...await buildValues(orgId, event, needsLive), ...datos };
                const values = displayValues(crudos, campos(), await orgLocale(orgId));
                detalle = await runActionWithRetry(step, { orgId, event, values, workflowId: run.workflow_id, nombre });
            } catch (err) {
                const message = err instanceof WorkflowStepError ? err.message : wfError('interno');
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
            await saveProgress(run, entries, path, datos).catch(() => saveProgress(run, entries, path, datos));
        }
        return finish(run, 'failed', entries, path, wfError('max_pasos'));
    });
}

async function saveProgress(run: RunRow, entries: LogEntry[], path: Path, datos: Record<string, unknown> = {}) {
    await withOrgTx(run.org_id, sql`
        update workflow_runs
           set cursor = ${JSON.stringify(path)}::jsonb, log = ${JSON.stringify(entries.slice(-MAX_LOG))}::jsonb,
               datos = ${JSON.stringify(datos)}::jsonb,
               locked_until = now() + interval '5 minutes', run_at = now() + interval '5 minutes', updated_at = now()
         where id = ${run.id} and org_id = ${run.org_id}`);
}

/** Campos que las consultas del workflow dejan disponibles, en orden de definición. */
export function producedFields(steps: Step[]): WorkflowField[] {
    const out: WorkflowField[] = [];
    const walk = (list: Step[]) => {
        for (const s of list) {
            if (s.type === 'query') out.push(...datasetOutputs(s.dataset));
            else if (s.type === 'condition' || s.type === 'wait_until') { walk(s.then); walk(s.else); }
        }
    };
    walk(steps);
    return out;
}

/** Teléfono del cliente del documento del evento. */
async function clientPhoneFor(orgId: string, event: DbRow, quoteId: string | null, invoiceId: string | null): Promise<string | null> {
    const clienteId = clientIdFor(event);
    if (clienteId) {
        const [[cl]] = await withOrgTx(orgId, sql`select telefono from clientes where id = ${clienteId} and org_id = ${orgId}`);
        if (cl?.telefono) return String(cl.telefono);
    }
    if (quoteId) {
        const [[row]] = await withOrgTx(orgId, sql`
            select cl.telefono from cotizaciones c
              join clientes cl on cl.id = c.cliente_id and cl.org_id = c.org_id
             where c.id = ${quoteId} and c.org_id = ${orgId}`);
        if (row?.telefono) return String(row.telefono);
    }
    if (invoiceId) {
        const [[row]] = await withOrgTx(orgId, sql`
            select coalesce(cl.telefono, cq.telefono) as telefono
              from documentos_fiscales d
              left join clientes cl on cl.id = d.cliente_id and cl.org_id = d.org_id
              left join cotizaciones c on c.id = d.cotizacion_id and c.org_id = d.org_id
              left join clientes cq on cq.id = c.cliente_id and cq.org_id = c.org_id
             where d.id = ${invoiceId} and d.org_id = ${orgId}`);
        if (row?.telefono) return String(row.telefono);
    }
    return null;
}

/** Cliente del evento, para las consultas que preguntan por él. */
function clientIdFor(event: DbRow): string | null {
    const data = (event.data && typeof event.data === 'object' ? event.data : {}) as Record<string, unknown>;
    const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
    return event.object === 'client' ? uuid(event.object_id) : uuid(data.cliente_id);
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

/**
 * Valores del evento tal como los ve una ejecución real, con los campos vivos
 * consultados. Lo usa la prueba del editor: un segundo constructor de valores
 * sería un segundo comportamiento que se separa del primero sin avisar.
 */
export const buildValuesForSimulation = (orgId: string, event: DbRow) => buildValues(orgId, event, true);

async function buildValues(orgId: string, event: DbRow, live: boolean): Promise<Record<string, unknown>> {
    const values: Record<string, unknown> = Object.create(null);
    const data = (event.data && typeof event.data === 'object' ? event.data : {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(data)) values[k] = v;
    values.actor_tipo = actorTipo(String(event.actor ?? ''));
    // Los datos del negocio se leen del evento SOLO si no los trae ya: un
    // evento nunca debería traerlos, pero si lo hiciera, mandan los de la
    // organización — son suyos, no del payload.
    for (const [k, v] of Object.entries(await orgValues(orgId))) values[k] = v;
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

async function orgLocale(orgId: string): Promise<string> {
    const [[org]] = await withOrgTx(orgId, sql`select idioma from orgs where id = ${orgId}`);
    return String(org?.idioma ?? 'es-MX');
}

/** Datos del negocio que cualquier plantilla puede usar. */
async function orgValues(orgId: string): Promise<Record<string, unknown>> {
    const [[org]] = await withOrgTx(orgId, sql`
        select nombre, email_contacto, telefono, moneda,
               coalesce(zona_horaria, 'America/Mexico_City') as zona,
               coalesce(idioma, 'es-MX') as idioma
          from orgs where id = ${orgId}`);
    if (!org) return {};
    // "Hoy" es el hoy del negocio, no el del servidor: en Tokio el corte diario
    // cae un día antes si se usa la fecha UTC (regla 24).
    let hoy = new Date().toISOString().slice(0, 10);
    try {
        hoy = new Intl.DateTimeFormat('en-CA', { timeZone: String(org.zona), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch { /* zona inválida: se queda la fecha UTC */ }
    return {
        negocio: org.nombre ?? '',
        negocio_correo: org.email_contacto ?? '',
        negocio_telefono: org.telefono ?? '',
        negocio_moneda: org.moneda ?? '',
        hoy,
    };
}

/** Idioma de la organización para lo que van a LEER personas: correos y avisos. */
async function orgLang(orgId: string): Promise<Lang> {
    return (await orgLocale(orgId)).toLowerCase().startsWith('en') ? 'en' : 'es';
}

export function displayValues(values: Record<string, unknown>, fields: WorkflowField[], locale: string): Record<string, unknown> {
    const lang: Lang = locale.startsWith('en') ? 'en' : 'es';
    let numbers: Intl.NumberFormat;
    try { numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }); } catch { numbers = new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: 2 }); }
    const out: Record<string, unknown> = Object.create(null);
    for (const [k, v] of Object.entries(values)) out[k] = v;
    for (const field of fields) {
        const v = out[field.key];
        if (field.type === 'enum') {
            const option = field.options?.find((o) => o.value === v);
            if (option) out[field.key] = option.label[lang];
        } else if (field.type === 'number' && v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))) {
            out[field.key] = numbers.format(Number(v));
        } else if (field.type === 'boolean' && typeof v === 'boolean') {
            out[field.key] = v ? (lang === 'en' ? 'Yes' : 'Sí') : 'No';
        }
    }
    return out;
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
    const data = (event.data && typeof event.data === 'object' ? event.data : {}) as Record<string, unknown>;
    const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
    // El objeto sobre el que se actúa se resuelve del evento, nunca de un
    // parámetro del autor: un id escrito a mano sería un carril para tocar el
    // documento de otra organización.
    const quoteId = event.object === 'quote' && event.type !== 'quote.deleted' ? uuid(event.object_id) : uuid(data.cotizacion_id);
    const invoiceId = event.object === 'invoice' ? uuid(event.object_id) : null;

    if (step.action === 'create_task') {
        const rl = await strictRateLimit(`wf-task:${orgId}`, 120, 3600);
        if (!rl.ok) throw new WorkflowStepError(wfError('limite_tareas'), true);
        const titulo = oneLine(renderTemplate(String(p.titulo ?? ''), values)).slice(0, 200);
        if (!titulo) throw new WorkflowStepError(wfError('tarea_titulo'), true);
        const dias = typeof p.dias === 'number' ? p.dias : null;
        const due = dias === null ? null : new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
        const outcome = await createTask(
            { orgId, origin: siteOrigin(), actor: `workflow:${input.workflowId}` },
            { titulo, due_date: due, cotizacion_id: quoteId },
        );
        if (outcome.status !== 200) throw new WorkflowStepError(wfError('tarea_fallo'), true);
        return titulo;
    }

    if (step.action === 'notify_team') {
        const rl = await strictRateLimit(`wf-email:${orgId}`, 30, 3600);
        if (!rl.ok) throw new WorkflowStepError(wfError('limite_correos'), true);
        const [rows] = p.destinatarios === 'all'
            ? await withOrgTx(orgId, sql`
                select distinct u.email from org_members m join users u on u.id = m.user_id
                 where m.org_id = ${orgId} and m.estado = 'activo' and u.email is not null
                 limit 25`)
            : await withOrgTx(orgId, sql`
                select u.email from orgs o join users u on u.id = o.owner_id where o.id = ${orgId}`);
        const recipients = rows.map((r) => String(r.email)).filter(Boolean);
        if (!recipients.length) throw new WorkflowStepError(wfError('sin_destinatarios'), true);
        const subject = oneLine(renderTemplate(String(p.asunto ?? ''), values)).slice(0, 150) || input.nombre;
        const body = renderTemplate(String(p.mensaje ?? ''), values, escapeHtml).replace(/\n/g, '<br>');
        const link = `${siteOrigin()}/app/workflows/${input.workflowId}`;
        const lang = await orgLang(orgId);
        const footer = lang === 'en' ? ['Sent by the', 'workflow in Cord.'] : ['Enviado por el workflow', 'de Cord.'];
        const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#050505">`
            + `<p>${body}</p>`
            + `<p style="margin-top:28px;font-size:12px;color:#6b7280">${footer[0]} <a href="${escapeHtml(link)}" style="color:#0a192f">${escapeHtml(input.nombre)}</a> ${footer[1]}</p></div>`;
        let sent = 0;
        for (const to of recipients) {
            const r = await sendEmail({ to, subject, html, orgId, operation: 'workflow_notify' });
            if (r.sent) sent++;
        }
        if (!sent) throw new WorkflowStepError(wfError('correo_no_disponible'));
        return `${sent}`;
    }

    if (step.action === 'send_client_email') {
        if (!quoteId && !invoiceId) throw new WorkflowStepError(wfError(invoiceId === null && event.object === 'invoice' ? 'sin_factura' : 'sin_cotizacion'), true);
        const rl = await strictRateLimit(`wf-client:${orgId}`, 60, 3600);
        if (!rl.ok) throw new WorkflowStepError(wfError('limite_cliente'), true);
        const asunto = oneLine(renderTemplate(String(p.asunto ?? ''), values)).slice(0, 150) || input.nombre;
        const mensaje = renderTemplate(String(p.mensaje ?? ''), values).slice(0, 2000);
        if (!mensaje.trim()) throw new WorkflowStepError(wfError('mensaje_vacio'), true);
        // El correo al cliente consume la cuota de envíos del plan, igual que
        // mandar la cotización a mano: si no, un workflow sería la puerta de
        // atrás para saltarse el tope del plan Gratis.
        const usage = await reserveUsage(orgId, 'envios', 1);
        if (!usage.ok) throw new WorkflowStepError(wfError('cuota_envios'), true);
        const msg = { asunto, mensaje, locale: await orgLang(orgId) };
        const result = invoiceId
            ? await sendClientInvoiceMessage(orgId, invoiceId, msg)
            : await sendClientQuoteMessage(orgId, quoteId as string, msg);
        if (!result.sent) {
            if (usage.id) await cancelUsage(orgId, usage.id);
            if (result.reason === 'sin_correo') throw new WorkflowStepError(wfError('cliente_sin_correo'), true);
            if (result.reason === 'sin_documento') throw new WorkflowStepError(wfError(invoiceId ? 'sin_factura' : 'sin_cotizacion'), true);
            throw new WorkflowStepError(wfError('correo_cliente_fallo'));
        }
        return asunto;
    }

    if (step.action === 'expire_quote') {
        if (!quoteId) throw new WorkflowStepError(wfError('sin_cotizacion'), true);
        const outcome = await expireQuote({ orgId, origin: siteOrigin(), actor: `workflow:${input.workflowId}` }, quoteId);
        if (outcome.status === 409 || outcome.status === 404) throw new WorkflowStepError(wfError('cotizacion_estado'), true);
        if (outcome.status !== 200) throw new WorkflowStepError(wfError('interno'));
        return 'expired';
    }

    if (step.action === 'approve_quote_request') {
        if (!quoteId) throw new WorkflowStepError(wfError('sin_cotizacion'), true);
        const outcome = await decideApprovalRequest({ orgId, origin: siteOrigin(), actor: `workflow:${input.workflowId}` }, quoteId, true);
        if (outcome.status === 402 || outcome.status === 403) throw new WorkflowStepError(wfError('aprobacion_plan'), true);
        if (outcome.status === 409 || outcome.status === 404) throw new WorkflowStepError(wfError('aprobacion_ausente'), true);
        if (outcome.status !== 200) throw new WorkflowStepError(wfError('interno'));
        return 'approved';
    }

    if (step.action === 'void_invoice') {
        if (!invoiceId) throw new WorkflowStepError(wfError('sin_factura'), true);
        const motivo = oneLine(renderTemplate(String(p.motivo ?? ''), values)).slice(0, 200) || undefined;
        const { voidInvoice } = await import('../fiscal/invoices');
        const result = await voidInvoice(orgId, invoiceId, motivo);
        // Una factura con pagos aplicados exige nota de crédito, y la anulación
        // de un CFDI puede quedar pendiente de la respuesta del SAT. Ninguna de
        // las dos se reintenta sola: el mensaje del proveedor no viaja (regla 14).
        if (!result.ok) throw new WorkflowStepError(wfError('factura_no_anulable'), true);
        if (result.pending) return 'pending';
        if (!result.reused) {
            const { dispatchInvoiceEvent } = await import('../webhooks');
            await dispatchInvoiceEvent(orgId, invoiceId, 'invoice.voided');
        }
        return 'void';
    }

    if (step.action === 'http_webhook') {
        const url = String(p.url ?? '').trim();
        if (!isPublicHttpsUrl(url)) throw new WorkflowStepError(wfError('url_invalida'), true);
        const rl = await strictRateLimit(`wf-http:${orgId}`, 120, 3600);
        if (!rl.ok) throw new WorkflowStepError(wfError('limite_http'), true);
        const mensaje = renderTemplate(String(p.mensaje ?? ''), values).slice(0, 1000);
        const body = JSON.stringify({
            workflow: input.nombre,
            workflow_id: input.workflowId,
            evento: event.type,
            objeto: event.object,
            objeto_id: event.object_id ?? null,
            enviado_en: new Date().toISOString(),
            ...(mensaje.trim() ? { mensaje } : {}),
            datos: values,
        });
        const res = await safeFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Cord-Workflows/1.0' },
            body,
        }, { timeoutMs: 8000, maxBodyBytes: 2048 });
        if (!res.ok) throw new WorkflowStepError(wfError('http_rechazo'));
        return String(res.status);
    }

    if (step.action === 'slack_message') {
        const [[org]] = await withOrgTx(orgId, sql`select slack_webhook_url from orgs where id = ${orgId}`);
        const url = (org?.slack_webhook_url as string) || '';
        if (!url) throw new WorkflowStepError(wfError('slack_sin_conexion'), true);
        const rl = await strictRateLimit(`wf-slack:${orgId}`, 120, 3600);
        if (!rl.ok) throw new WorkflowStepError(wfError('limite_slack'), true);
        const text = renderTemplate(String(p.mensaje ?? ''), values, escapeSlack).slice(0, 3000);
        if (!text.trim()) throw new WorkflowStepError(wfError('mensaje_vacio'), true);
        const r = await postSlackText(url, text);
        if (!r.ok) throw new WorkflowStepError(wfError('slack_rechazo'));
        return 'slack';
    }

    if (step.action === 'whatsapp_client') {
        // El teléfono sale del cliente del documento, nunca de un campo del
        // paso: un número escrito a mano le escribiría a un desconocido.
        const telefono = await clientPhoneFor(orgId, event, quoteId, invoiceId);
        if (!telefono) throw new WorkflowStepError(wfError('wa_sin_telefono'), true);
        const rl = await strictRateLimit(`wf-wa:${orgId}`, 60, 3600);
        if (!rl.ok) throw new WorkflowStepError(wfError('limite_wa'), true);
        const vars: string[] = [];
        for (let i = 1; i <= WHATSAPP_MAX_VARS; i++) {
            const bruto = String(p[`var${i}`] ?? '').trim();
            if (bruto) vars.push(oneLine(renderTemplate(bruto, values)));
        }
        const r = await sendWhatsAppTemplate(orgId, telefono, vars);
        if (!r.ok) {
            if (r.reason === 'sin_config') throw new WorkflowStepError(wfError('wa_sin_conexion'), true);
            if (r.reason === 'numero') throw new WorkflowStepError(wfError('wa_sin_telefono'), true);
            if (r.reason === 'plantilla') throw new WorkflowStepError(wfError('wa_plantilla'), true);
            throw new WorkflowStepError(wfError('wa_rechazo'));
        }
        return 'whatsapp';
    }

    if (step.action === 'teams_message') {
        const [[org]] = await withOrgTx(orgId, sql`select teams_webhook_url from orgs where id = ${orgId}`);
        const url = (org?.teams_webhook_url as string) || '';
        if (!url) throw new WorkflowStepError(wfError('teams_sin_conexion'), true);
        const rl = await strictRateLimit(`wf-teams:${orgId}`, 120, 3600);
        if (!rl.ok) throw new WorkflowStepError(wfError('limite_teams'), true);
        // La tarjeta de Teams es JSON, no markdown: el texto viaja en un campo
        // y no hay escape que hacer más allá de acotarlo.
        const text = renderTemplate(String(p.mensaje ?? ''), values).slice(0, 3000);
        if (!text.trim()) throw new WorkflowStepError(wfError('mensaje_vacio'), true);
        const r = await postTeamsText(url, text);
        if (!r.ok) throw new WorkflowStepError(wfError('teams_rechazo'));
        return 'teams';
    }

    if (step.action === 'hubspot_note') {
        const rl = await strictRateLimit(`wf-hubspot:${orgId}`, 120, 3600);
        if (!rl.ok) throw new WorkflowStepError(wfError('limite_hubspot'), true);
        const body = renderTemplate(String(p.mensaje ?? ''), values, escapeHtml).replace(/\n/g, '<br>').slice(0, 5000);
        if (!body.trim()) throw new WorkflowStepError(wfError('nota_vacia'), true);
        const clientId = event.object === 'client' ? uuid(event.object_id) : uuid(data.cliente_id);
        try {
            return await addHubSpotNote(orgId, { quoteId, clientId }, body);
        } catch (err) {
            // El texto de HubSpot no se guarda: viene en español fijo y la fila
            // del run vive para siempre. Se clasifica en tres códigos.
            if (err instanceof HubSpotAuthError) throw new WorkflowStepError(wfError('hubspot_conexion'), err.revoked);
            if (err instanceof HubSpotActionError) throw new WorkflowStepError(wfError('hubspot_datos'), err.final);
            if (err instanceof HubSpotApiError) throw new WorkflowStepError(wfError(err.retryable ? 'hubspot_temporal' : 'hubspot_datos'), !err.retryable);
            throw err;
        }
    }

    throw new WorkflowStepError(wfError('accion_retirada'), true);
}
