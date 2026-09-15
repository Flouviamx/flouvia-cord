// /api/cron/integraciones — recoge la cola de sincronización con CRMs y limpia trabajos viejos.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, withSystemTx } from '../../../lib/db';
import { reqContext } from '../../../lib/context';
import { processOrgSync, purgeOldSyncJobs } from '../../../lib/integraciones/sync';

const MAX_ORGS = 200;

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    const orgIds = await reqContext.run({ userId: null, cronScope: true }, async () => {
        const [rows] = await withSystemTx(sql`
            select org_id from integracion_sync
             where (status in ('queued', 'running') and run_at <= now())
                or (status in ('succeeded', 'failed') and finished_at < now() - interval '14 days')
             group by org_id
             order by min(run_at)
             limit ${MAX_ORGS}`);
        return rows.map((r) => String(r.org_id));
    });

    let procesados = 0;
    for (const orgId of orgIds) {
        procesados += await reqContext.run({ userId: null, orgId }, async () => {
            await purgeOldSyncJobs(orgId);
            return processOrgSync(orgId, 50);
        });
    }
    return new Response(JSON.stringify({ ok: true, organizaciones: orgIds.length, trabajos: procesados }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
    });
};
