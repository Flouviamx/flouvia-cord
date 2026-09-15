// /api/cron/workflows — recoge las esperas y reintentos de Cord Workflows que ya
// vencieron. El barrido cross-org solo descubre organizaciones; cada una se
// procesa en su propio carril.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, withSystemTx } from '../../../lib/db';
import { reqContext } from '../../../lib/context';
import { processOrgRuns } from '../../../lib/workflows/engine';

const MAX_ORGS = 200;

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    const orgIds = await reqContext.run({ userId: null, cronScope: true }, async () => {
        const [rows] = await withSystemTx(sql`
            select org_id from workflow_runs
             where status in ('queued', 'waiting', 'running') and run_at <= now()
             group by org_id
             order by min(run_at)
             limit ${MAX_ORGS}`);
        return rows.map((r) => String(r.org_id));
    });

    let procesadas = 0;
    for (const orgId of orgIds) {
        procesadas += await reqContext.run({ userId: null, orgId }, () => processOrgRuns(orgId, 50));
    }
    return new Response(JSON.stringify({ ok: true, organizaciones: orgIds.length, ejecuciones: procesadas }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
    });
};
