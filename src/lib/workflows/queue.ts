import { sql, withOrgTx } from '../db';
import { log } from '../log';

export const MAX_WORKFLOW_DEPTH = 3;

export interface QueuedEvent {
    id: string;
    type: string;
    depth: number;
    actor: string;
}

/**
 * Encola la ejecución de UN workflow programado. El encolado normal empareja
 * por tipo de disparador; aquí eso dispararía todos los programados de la org a
 * la vez, cada uno fuera de su horario.
 */
export async function enqueueScheduledRun(
    orgId: string, workflowId: string, version: number, publicado: unknown, eventId: string,
): Promise<boolean> {
    try {
        const [rows] = await withOrgTx(orgId, sql`
            insert into workflow_runs (org_id, workflow_id, version, publicado, event_id, depth)
            select ${orgId}, w.id, ${version}, ${JSON.stringify(publicado)}::jsonb, ${eventId}, 0
              from workflows w
             where w.id = ${workflowId} and w.org_id = ${orgId} and w.estado = 'active'
            on conflict (workflow_id, event_id) do nothing
            returning id`);
        return rows.length > 0;
    } catch (err) {
        log.error('no se pudo encolar un workflow programado', { route: 'workflows/queue', orgId, err });
        return false;
    }
}

export async function enqueueWorkflowRuns(orgId: string, event: QueuedEvent): Promise<number> {
    if (event.depth >= MAX_WORKFLOW_DEPTH) return 0;
    try {
        const [rows] = await withOrgTx(orgId, sql`
            with ranked as (
                select w.id, w.version, w.publicado, w.trigger_publicado,
                       row_number() over (order by w.created_at asc, w.id asc) as position,
                       cord_resource_limit(cord_effective_plan(${orgId}::uuid), 'active_workflows') as allowance
                  from workflows w
                 where w.org_id = ${orgId} and w.estado = 'active'
            )
            insert into workflow_runs (org_id, workflow_id, version, publicado, event_id, depth)
            select ${orgId}, r.id, r.version, r.publicado, ${event.id}, ${event.depth}
              from ranked r
             where r.trigger_publicado = ${event.type}
               and (r.allowance is null or r.position <= r.allowance)
               and ${event.actor} <> ('workflow:' || r.id::text)
            on conflict (workflow_id, event_id) do nothing
            returning id`);
        return rows.length;
    } catch (err) {
        log.error('no se pudieron encolar workflows', { route: 'workflows/queue', orgId, err });
        return 0;
    }
}
