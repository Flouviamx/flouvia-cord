import { sql, withOrgTx } from './db';
import { trackServer } from './posthog-server';
import type { EventProps } from './analytics-events';

/** Retry unacknowledged steps on the next visit; stable IDs deduplicate races. */
export async function emitSetupSteps(
    orgId: string,
    steps: EventProps<'setup_step_completed'>[],
    isSandbox: boolean,
    isDemo: boolean,
): Promise<void> {
    for (const step of steps) {
        try {
            const delivered = await trackServer('setup_step_completed', orgId, step, isSandbox, isDemo);
            if (!delivered) continue;
            // Mark only this acknowledged step. A failure here is safe: replay
            // uses the same event_id, never a new analytics event.
            await withOrgTx(orgId, sql`update orgs set setup_steps_emitted = (
                select coalesce(array_agg(distinct v), '{}') from unnest(
                    coalesce(setup_steps_emitted, '{}'::text[]) || ${[step.task_id]}::text[]
                ) v
            ) where id = ${orgId}`);
        } catch { /* Leave this step pending without starving the other steps. */ }
    }
}
