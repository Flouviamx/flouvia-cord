import { sql, withOrgTx } from '../db';
import { log } from '../log';

export const MAX_WORKFLOW_DEPTH = 3;

export interface QueuedEvent {
    id: string;
    type: string;
    depth: number;
    actor: string;
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
