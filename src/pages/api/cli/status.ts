// GET /api/cli/status — el panel de desarrolladores del onboarding se marca solo:
// terminal conectada, primera llamada a la API y webhooks escuchando. Lee la
// cuenta real y su sandbox, donde viven las llaves y peticiones de prueba.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, sql, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;
    const active = await getActiveOrgId();
    const [[row]] = await withOrgTx(active, sql`
        select coalesce(sandbox_of, id) as real_id,
               case when sandbox_of is null then (select s.id from orgs s where s.sandbox_of = orgs.id limit 1) else id end as sandbox_id
          from orgs where id = ${active}`);
    const realId = String(row?.real_id ?? active);
    const sandboxId = row?.sandbox_id ? String(row.sandbox_id) : null;

    const cliKeys = (orgId: string) => withOrgTx(orgId, sql`
        select id from api_keys where org_id = ${orgId} and nombre like 'CLI · %' and revoked_at is null`);
    const [ownKeys] = await cliKeys(realId);
    const [sandboxKeys] = sandboxId ? await cliKeys(sandboxId) : [[]];
    const keyIds = [...ownKeys, ...sandboxKeys].map((k: any) => String(k.id));
    let sandbox: any = {};
    if (sandboxId) {
        // La terminal llama a /me y a los simuladores: la primera llamada cuenta solo si viene del código del negocio.
        [[sandbox]] = await withOrgTx(sandboxId, sql`
            select exists(select 1 from api_requests where org_id = ${sandboxId} and status < 400
                            and (key_id is null or not (key_id = any(${keyIds}::uuid[])))) as api,
                   exists(select 1 from webhooks where org_id = ${sandboxId} and cli_hasta > now()) as listen`);
    }
    return new Response(JSON.stringify({
        login: keyIds.length > 0,
        api: !!sandbox?.api,
        listen: !!sandbox?.listen,
    }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
};
