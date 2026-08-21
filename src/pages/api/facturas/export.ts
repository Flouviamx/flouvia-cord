// Exporta la vista de facturas como CSV con un techo explícito. La consulta es
// directa para no perder filas que compartan el mismo created_at en el borde de
// una página keyset.
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../../lib/queries';
import { getActiveOrgId, sql, withOrgTx } from '../../../lib/db';

const MAX_ROWS = 10_000;

export const GET: APIRoute = async ({ url }) => {
    const denied = await requirePerm('cobranza');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const requestedState = String(url.searchParams.get('estado') || '');
    const estado = ['draft', 'open', 'paid', 'void', 'uncollectible', 'overdue'].includes(requestedState)
        ? requestedState : null;
    const clienteRaw = String(url.searchParams.get('cliente') || '');
    const clienteId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clienteRaw)
        ? clienteRaw : null;
    const dateParam = (name: string) => {
        const value = String(url.searchParams.get(name) || '');
        return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
    };
    const desde = dateParam('desde');
    const hasta = dateParam('hasta');
    const q = url.searchParams.get('q')?.trim().slice(0, 80);
    const busqueda = q ? `%${q}%` : null;

    const [allRows] = await withOrgTx(orgId, sql`
        select d.invoice_number, coalesce(cl.empresa, cq.empresa) as empresa,
               d.lifecycle, d.status, d.created_at, d.due_date, d.currency,
               d.total, d.amount_paid, d.amount_remaining
          from documentos_fiscales d
          left join cotizaciones c on c.id = d.cotizacion_id
          left join clientes cl on cl.id = d.cliente_id
          left join clientes cq on cq.id = c.cliente_id
         where d.org_id = ${orgId}
           and (${estado}::text is null
                or (${estado}::text = 'overdue' and d.lifecycle = 'open'
                    and d.due_date is not null and d.due_date < current_date)
                or (${estado}::text <> 'overdue' and d.lifecycle = ${estado}))
           and (${clienteId || null}::uuid is null or d.cliente_id = ${clienteId || null}::uuid)
           and (${desde || null}::date is null or d.created_at >= ${desde || null}::date)
           and (${hasta || null}::date is null or d.created_at < (${hasta || null}::date + interval '1 day'))
           and (${busqueda}::text is null
                or d.invoice_number ilike ${busqueda}
                or d.fiscal_id ilike ${busqueda}
                or c.folio ilike ${busqueda}
                or coalesce(cl.empresa, cq.empresa) ilike ${busqueda})
         order by d.created_at desc, d.id desc
         limit ${MAX_ROWS + 1}`);
    const hasMore = allRows.length > MAX_ROWS;
    const rows = allRows.slice(0, MAX_ROWS);

    const header = ['folio', 'cliente', 'estado', 'estado_fiscal', 'creada', 'vence', 'divisa', 'total', 'pagado', 'saldo'];
    const body = rows.map((f) => [
        f.invoice_number || '', f.empresa || '', f.lifecycle, f.status,
        String(f.created_at || '').slice(0, 10), f.due_date ? String(f.due_date).slice(0, 10) : '', f.currency || '',
        Number(f.total || 0), Number(f.amount_paid || 0), Number(f.amount_remaining ?? f.total ?? 0),
    ]);
    const csv = [header, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const day = new Date().toISOString().slice(0, 10);

    return new Response(`\uFEFF${csv}`, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="facturas-${day}.csv"`,
            'Cache-Control': 'private, no-store',
            ...(hasMore ? { 'X-Cord-Export-Truncated': 'true' } : {}),
        },
    });
};

function csvCell(value: unknown) {
    const raw = String(value ?? '');
    // Evita que Excel/Sheets evalúen como fórmula un folio o nombre controlado
    // por el usuario. Los importes numéricos conservan sus signos legítimos.
    const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
