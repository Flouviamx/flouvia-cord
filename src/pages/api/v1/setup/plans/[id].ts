// GET /api/v1/setup/plans/{id} — estado de una propuesta: el CLI lo consulta
// mientras la persona la revisa en el navegador.
export const prerender = false;

import { withApiAuth } from '../../../../../lib/apikey';
import { sql, withOrgTx } from '../../../../../lib/db';
import { isUuid } from '../../../../../lib/actions/outcome';

export const GET = withApiAuth('read', async ({ params, request }, auth) => {
    const id = String(params.id ?? '');
    if (!isUuid(id)) return json({ error: 'Propuesta no encontrada', code: 'not_found' }, 404);
    const [[org]] = await withOrgTx(auth.orgId, sql`select sandbox_of from orgs where id = ${auth.orgId}`);
    const orgId = String(org?.sandbox_of || auth.orgId);
    const [[row]] = await withOrgTx(orgId, sql`
        select id, estado, resultado, created_at, aplicado_at, expira_at
          from setup_plans where id = ${id} and org_id = ${orgId}`);
    if (!row) return json({ error: 'Propuesta no encontrada', code: 'not_found' }, 404);
    return json({
        data: {
            object: 'setup_plan', id: row.id, estado: row.estado,
            review_url: new URL(`/app/setup/${row.id}`, request.url).href,
            resultado: row.resultado ?? null,
            created_at: row.created_at, aplicado_at: row.aplicado_at, expira_at: row.expira_at,
        },
    });
});

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
