// GET /api/search?q= — buscador global para el menú de comandos (Cmd+K).
// Devuelve cotizaciones (por folio o cliente), clientes y productos de la org.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../lib/db';

export const GET: APIRoute = async ({ url }) => {
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2) return json({ cotizaciones: [], clientes: [], productos: [] });

    const orgId = await getActiveOrgId();
    const like = `%${q}%`;

    const [cots, clis, prods] = await withOrgTx(orgId,
        sql`select c.id, c.folio, c.status, coalesce(cl.empresa, 'Sin cliente') as cliente
            from cotizaciones c left join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId} and (c.folio ilike ${like} or cl.empresa ilike ${like})
            order by c.created_at desc limit 6`,
        sql`select id, empresa from clientes
            where org_id = ${orgId} and (empresa ilike ${like} or rfc ilike ${like})
            order by empresa limit 6`,
        sql`select id, nombre, sku from productos
            where org_id = ${orgId} and (nombre ilike ${like} or sku ilike ${like})
            order by nombre limit 6`
    );

    return json({
        cotizaciones: cots.map((c) => ({ id: c.id, folio: c.folio, cliente: c.cliente, status: c.status })),
        clientes: clis.map((c) => ({ id: c.id, empresa: c.empresa })),
        productos: prods.map((p) => ({ id: p.id, nombre: p.nombre, sku: (p.sku as string) ?? '' })),
    });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
