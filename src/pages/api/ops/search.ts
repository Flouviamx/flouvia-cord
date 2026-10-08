// Búsqueda global de la paleta ⌘K de Ops. Solo lectura, en el carril de Ops,
// con topes por grupo. Un UUID pegado se resuelve exacto en las cuatro tablas
// que Ops tiene ficha o lista; un texto busca por nombre, correo, folio y
// número de factura. Nunca devuelve tokens, hashes ni datos de pago.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, withOpsTx } from '../../../lib/db';
import { log } from '../../../lib/log';
import { escapeLike, normalizeOpsSearch } from '../../../lib/ops-pagination';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PER_GROUP = 5;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

type Result = { group: string; label: string; sub: string; href: string };

export const GET: APIRoute = async ({ url, locals }) => {
    if (!locals.opsOperator) return json({ error: 'No autenticado' }, 401);
    const q = normalizeOpsSearch(url.searchParams.get('q'));
    if (q.length < 2) return json({ results: [] });

    const exact = UUID.test(q) ? q.toLowerCase() : null;
    // `%` y `_` del operador se escapan: buscan el carácter, no un comodín.
    const escaped = escapeLike(q.toLowerCase());
    const contains = `%${escaped}%`;
    const prefix = `${escaped}%`;

    try {
        const [orgs, users, quotes, invoices] = await withOpsTx(
            sql`select o.id, o.nombre, o.country_code, coalesce(o.plan, 'free') plan, u.email owner_email
                from orgs o left join users u on u.id = o.owner_id
                where (${exact}::uuid is not null and o.id = ${exact}::uuid)
                   or (${exact}::uuid is null and lower(o.nombre) like ${contains})
                order by (lower(o.nombre) like ${prefix}) desc, o.created_at desc
                limit ${PER_GROUP}`,
            sql`select u.id, u.email, nullif(trim(concat_ws(' ', u.first_name, u.last_name)), '') as name, u.suspended_at
                from users u
                where (${exact}::uuid is not null and u.id = ${exact}::uuid)
                   or (${exact}::uuid is null and (lower(u.email) like ${contains}
                       or lower(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) like ${contains}))
                order by (lower(u.email) like ${prefix}) desc, u.created_at desc
                limit ${PER_GROUP}`,
            sql`select q.id, q.folio, q.status, q.org_id, o.nombre org_nombre
                from cotizaciones q join orgs o on o.id = q.org_id
                where (${exact}::uuid is not null and q.id = ${exact}::uuid)
                   or (${exact}::uuid is null and lower(q.folio) like ${prefix})
                order by q.created_at desc
                limit ${PER_GROUP}`,
            sql`select d.id, d.invoice_number, d.lifecycle, d.org_id, o.nombre org_nombre
                from documentos_fiscales d join orgs o on o.id = d.org_id
                where (${exact}::uuid is not null and d.id = ${exact}::uuid)
                   or (${exact}::uuid is null and lower(d.invoice_number) like ${prefix})
                order by d.created_at desc
                limit ${PER_GROUP}`,
        );
        const results: Result[] = [
            ...orgs.map((o: any) => ({ group: 'Organizaciones', label: o.nombre, sub: [o.owner_email, o.country_code, o.plan].filter(Boolean).join(' · '), href: `/ops/organizations/${o.id}` })),
            ...users.map((u: any) => ({ group: 'Usuarios', label: u.name || u.email, sub: u.name ? `${u.email}${u.suspended_at ? ' · suspendida' : ''}` : (u.suspended_at ? 'Suspendida' : 'Cuenta'), href: `/ops/users/${u.id}` })),
            ...quotes.map((q: any) => ({ group: 'Cotizaciones', label: q.folio, sub: `${q.org_nombre} · ${q.status}`, href: `/ops/organizations/${q.org_id}` })),
            ...invoices.map((d: any) => ({ group: 'Facturas', label: d.invoice_number || 'Factura sin número', sub: `${d.org_nombre} · ${d.lifecycle}`, href: d.invoice_number ? `/ops/invoices?q=${encodeURIComponent(d.invoice_number)}` : `/ops/organizations/${d.org_id}` })),
        ];
        return json({ results });
    } catch (error) {
        log.error('error no controlado', { route: 'ops/search', err: error });
        return json({ error: 'No se pudo buscar.' }, 500);
    }
};
