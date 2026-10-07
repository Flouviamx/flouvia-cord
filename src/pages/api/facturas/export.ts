// Exporta la vista de facturas como CSV con un techo explícito. La consulta es
// directa para no perder filas que compartan el mismo created_at en el borde de
// una página keyset.
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../../lib/queries';
import { getActiveOrgId, sql, withOrgTx } from '../../../lib/db';
import { isISODate } from '../../../lib/rango';

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
        // Calendario real: "2026-02-31" pasaba la regex y reventaba el ::date.
        return isISODate(value) ? value : null;
    };
    const desde = dateParam('desde');
    const hasta = dateParam('hasta');
    const q = url.searchParams.get('q')?.trim().slice(0, 80);
    const busqueda = q ? `%${q}%` : null;

    const [allRows] = await withOrgTx(orgId, sql`
        select d.invoice_number, coalesce(cl.empresa, cq.empresa) as empresa,
               d.lifecycle, d.status, d.created_at, d.due_date::text as due_day, d.currency,
               (select zona_horaria from orgs where id = ${orgId}) as zona_horaria,
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
    // El driver devuelve `timestamptz` como Date: `String(date).slice(0, 10)`
    // escribía "Wed Oct 07" en la columna. La fecha de alta se expresa en la
    // zona de la organización (regla 24) y el vencimiento, que es un DATE,
    // viaja como texto desde Postgres para que ninguna zona lo corra un día.
    const zone = validZone(rows[0]?.zona_horaria as string | undefined);
    const day = (value: unknown) => {
        const date = value instanceof Date ? value : new Date(String(value ?? ''));
        if (!Number.isFinite(date.getTime())) return '';
        return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    };
    const body = rows.map((f) => [
        f.invoice_number || '', f.empresa || '', f.lifecycle, f.status,
        day(f.created_at), (f.due_day as string) || '', f.currency || '',
        Number(f.total || 0), Number(f.amount_paid || 0), Number(f.amount_remaining ?? f.total ?? 0),
    ]);
    const csv = [header, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const today = day(new Date());

    return new Response(`\uFEFF${csv}`, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="facturas-${today}.csv"`,
            'Cache-Control': 'private, no-store',
            ...(hasMore ? { 'X-Cord-Export-Truncated': 'true' } : {}),
        },
    });
};

function validZone(zone: string | undefined): string {
    if (!zone) return 'UTC';
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); return zone; } catch { return 'UTC'; }
}

function csvCell(value: unknown) {
    const raw = String(value ?? '');
    // Evita que Excel/Sheets evalúen como fórmula un folio o nombre controlado
    // por el usuario. Los importes numéricos conservan sus signos legítimos.
    const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
