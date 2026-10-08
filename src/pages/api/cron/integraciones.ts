// /api/cron/integraciones — recoge la cola de sincronización con CRMs y limpia trabajos viejos.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, withSystemTx } from '../../../lib/db';
import { reqContext } from '../../../lib/context';
import { log } from '../../../lib/log';
import { processOrgSync, purgeOldSyncJobs } from '../../../lib/integraciones/sync';
import { sincronizarPagos } from '../../../lib/integraciones/contabilidad/pagos';
import type { ProveedorConta } from '../../../lib/integraciones/contabilidad/config';
import { cronPeriod, runCronOnce } from '../../../lib/cron-runs';

const MAX_ORGS = 200;

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;
    // Una vez al día. Los trabajos de la cola ya se reclaman con lease, pero el
    // refresh token de Xero es de un solo uso: dos barridos simultáneos de pagos
    // podían quemarlo.
    return runCronOnce(request, '/api/cron/integraciones', cronPeriod('dia'), () => run());
};

async function run(): Promise<Response> {
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
    let fallidas = 0;
    for (const orgId of orgIds) {
        try {
            procesados += await reqContext.run({ userId: null, orgId }, async () => {
                await purgeOldSyncJobs(orgId);
                return processOrgSync(orgId, 50);
            });
        } catch (err) {
            // Una organización que truena no aborta la cola de las demás (ni el
            // barrido de pagos de abajo).
            fallidas++;
            log.error('no se pudo procesar la cola de sincronización de una organización', { route: 'cron/integraciones', orgId, err });
        }
    }
    // Pagos que el contador registró en QuickBooks o Xero: el barrido descubre
    // qué organizaciones tienen contabilidad y el trabajo vuelve a su carril.
    const contas = await reqContext.run({ userId: null, cronScope: true }, async () => {
        const [rows] = await withSystemTx(sql`
            select org_id, proveedor from integracion_conexiones
             where proveedor in ('quickbooks', 'xero') and estado = 'activa'
             limit ${MAX_ORGS}`);
        return rows.map((r) => ({ orgId: String(r.org_id), proveedor: String(r.proveedor) as ProveedorConta }));
    });
    let pagos = 0;
    for (const c of contas) {
        const r = await reqContext.run({ userId: null, orgId: c.orgId }, () => sincronizarPagos(c.orgId, c.proveedor)).catch(() => null);
        pagos += (r?.recibidos ?? 0) + (r?.enviados ?? 0);
    }

    return new Response(JSON.stringify({ ok: true, organizaciones: orgIds.length, trabajos: procesados, fallidas, pagos }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
    });
}
