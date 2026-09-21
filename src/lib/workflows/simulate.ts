// Prueba de un workflow SIN ejecutar sus acciones.
//
// Hasta aquí la única forma de saber si un workflow hacía lo que uno creía era
// publicarlo y esperar a que le pasara a un cliente real. Esto recorre el
// borrador con el ÚLTIMO evento real de su disparador y devuelve, paso por
// paso, qué habría pasado y con qué texto exacto.
//
// Dos decisiones que sostienen que la prueba sirva de algo:
//
//  - Las CONSULTAS sí se ejecutan. Solo leen, y son justo el dato que decide la
//    rama: simularlas con ceros haría que la prueba dijera que no se cumple una
//    condición que en vivo sí se cumple.
//  - Las ACCIONES nunca se ejecutan. Se devuelve el texto ya renderizado — el
//    asunto y el cuerpo que habría recibido el cliente —, que es lo que la
//    persona necesita revisar antes de soltar el workflow.

import { sql, withOrgTx, type DbRow } from '../db';
import { findAction, findTrigger, type Lang, type WorkflowField } from './catalog';
import { findDataset } from './datasets';
import { runDataset } from './datasets-run';
import { buildValuesForSimulation, displayValues, producedFields } from './engine';
import { evaluateConditions, renderTemplate, sanitizeDefinition, type Step } from './definition';

export interface SimStep {
    stepId: string;
    tipo: Step['type'];
    titulo: string;
    resultado: 'si' | 'no' | 'ok' | 'esperaria' | 'omitido';
    detalle?: string;
    /** Texto que la acción habría mandado, ya con las variables sustituidas. */
    salida?: { label: string; valor: string }[];
}

export interface SimResult {
    ok: boolean;
    /** null = el disparador todavía no ha ocurrido nunca en esta cuenta. */
    evento: { tipo: string; fecha: string } | null;
    pasos: SimStep[];
}

const MAX_SIM_STEPS = 60;

export async function simulateWorkflow(orgId: string, definicion: unknown, lang: Lang, locale: string): Promise<SimResult> {
    const def = sanitizeDefinition(definicion);
    const trigger = findTrigger(def.trigger);
    if (!trigger) return { ok: false, evento: null, pasos: [] };

    const [[event]] = await withOrgTx(orgId, sql`
        select type, object, object_id, data, actor, created_at
          from domain_events
         where org_id = ${orgId} and type = ${def.trigger}
         order by created_at desc
         limit 1`);
    if (!event) return { ok: false, evento: null, pasos: [] };

    const datos: Record<string, unknown> = {};
    const pasos: SimStep[] = [];
    const campos = (): WorkflowField[] => [...trigger.fields, ...producedFields(def.steps)];
    const crudos = async () => ({ ...await buildValuesForSimulation(orgId, event as DbRow), ...datos });

    const walk = async (steps: Step[]) => {
        for (const step of steps) {
            if (pasos.length >= MAX_SIM_STEPS) return;

            if (step.type === 'query') {
                const ds = findDataset(step.dataset);
                if (!ds) { pasos.push({ stepId: step.id, tipo: 'query', titulo: '', resultado: 'omitido' }); continue; }
                const salida = await runDataset(ds.key, orgId, {
                    dias: Number(step.params.dias ?? ds.params[0]?.default ?? 7),
                    clienteId: clientIdFor(event as DbRow),
                });
                for (const [k, v] of Object.entries(salida ?? {})) datos[k] = v;
                const mostrados = displayValues(datos, campos(), locale);
                pasos.push({
                    stepId: step.id, tipo: 'query', titulo: ds.label[lang], resultado: 'ok',
                    salida: ds.outputs.map((o) => ({ label: o.label[lang], valor: String(mostrados[o.key] ?? '—') })),
                });
                continue;
            }

            if (step.type === 'wait') {
                pasos.push({ stepId: step.id, tipo: 'wait', titulo: '', resultado: 'esperaria', detalle: String(step.days) });
                continue;
            }

            if (step.type === 'condition' || step.type === 'wait_until') {
                const values = await crudos();
                const cumple = evaluateConditions({ ...step, type: 'condition' }, values, campos());
                pasos.push({
                    stepId: step.id, tipo: step.type, titulo: '',
                    resultado: cumple ? 'si' : 'no',
                    ...(step.type === 'wait_until' ? { detalle: String(step.days) } : {}),
                });
                await walk(cumple ? step.then : step.else);
                continue;
            }

            const accion = findAction(step.action);
            if (!accion) { pasos.push({ stepId: step.id, tipo: 'action', titulo: '', resultado: 'omitido' }); continue; }
            const values = displayValues(await crudos(), campos(), locale);
            const salida = accion.params
                .filter((p) => p.kind === 'template' || p.kind === 'template_long')
                .map((p) => ({ label: p.label[lang], valor: renderTemplate(String(step.params[p.key] ?? ''), values) }))
                .filter((x) => x.valor.trim());
            pasos.push({ stepId: step.id, tipo: 'action', titulo: accion.label[lang], resultado: 'ok', salida });
        }
    };

    await walk(def.steps);
    return {
        ok: true,
        evento: { tipo: String(event.type), fecha: new Date(event.created_at as string).toISOString() },
        pasos,
    };
}

function clientIdFor(event: DbRow): string | null {
    const data = (event.data && typeof event.data === 'object' ? event.data : {}) as Record<string, unknown>;
    const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
    return event.object === 'client' ? uuid(event.object_id) : uuid(data.cliente_id);
}
