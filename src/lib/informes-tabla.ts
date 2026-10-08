// Informes "tabla" (estilo Shopify): KPIs comparados contra el periodo anterior,
// una gráfica y la tabla completa, exportable a CSV.
//
// Contratos compartidos con el resto de la analítica (src/lib/report-scope.ts):
// importes en la divisa del negocio con la mejor tasa real disponible, días en su
// zona horaria y, sin tasa, el importe queda fuera y se dice. Etiquetas: la capa
// de datos devuelve CLAVES de i18n (`inf.t.*`); la superficie las traduce.
import { sql, withOrgTx, getActiveOrgId } from './db';
import { cached } from './cache';
import { STATUS_GANADA, STATUS_SALIO } from './metrics';
import { compareRangeFor, type Rango } from './rango';
import { getReportScope, quoteFx, documentFx, currencyFx, dayStart, dayEnd, scopeNote, type ReportScope } from './report-scope';

export type ColFormat = 'money' | 'number' | 'pct' | 'date' | 'text' | 'days';
export type TablaCol = { key: string; label: string; format: ColFormat };
export type TablaRow = Record<string, string | number | null> & { _href?: string | null };
export type TablaKpi = { key: string; label: string; format: ColFormat; value: number | null; prev: number | null };
export type TablaChart =
    | { kind: 'bar' | 'line'; label: string; format: ColFormat; items: { label: string; value: number; href?: string }[] }
    | { kind: 'hbar'; label: string; format: ColFormat; items: { label: string; value: number; href?: string }[] };
export type TablaReport = {
    kpis: TablaKpi[];
    chart: TablaChart | null;
    columns: TablaCol[];
    rows: TablaRow[];
    /** Fila de totales por columna (null = no se suma, p. ej. un porcentaje). */
    totals: Record<string, number | null> | null;
    /** Mapa de calor (cohortes): columnas cuyo valor 0–100 colorea la celda. */
    heat?: string[];
    granularity?: 'day' | 'week' | 'month';
    moneda: ReturnType<typeof scopeNote>;
    rango: { desde: string; hasta: string; compare: { desde: string; hasta: string } | null };
};

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const nullableNum = (v: unknown) => (v === null || v === undefined ? null : num(v));
const iso = (v: unknown) => (v ? (typeof v === 'string' ? v : new Date(v as Date).toISOString()).slice(0, 10) : null);

/**
 * Dinero que ENTRÓ: una fila por pago, de los dos rieles.
 *   1. cobros de cotización pagados (anticipos, cuotas, igualas), con su reembolso;
 *   2. pagos aplicados a facturas que no vienen de un cobro (cobro_id null: si
 *      vinieran, ya están en 1 — misma convención que Cord Ops);
 *   3. cotizaciones marcadas pagadas sin ningún cobro ni pago de factura registrado
 *      (cobro registrado a mano).
 * Se usa en Pagos recibidos, Ventas en el tiempo y el "cobrado" del dashboard.
 */
export function pagosSql(S: ReportScope, orgId: string, ini: unknown, fin: unknown) {
    const fxc = quoteFx(S, 'c');
    return sql`(
        select co.paid_at as fecha, c.folio, coalesce(cl.empresa, 'Sin cliente') as empresa,
               coalesce(co.payment_method, 'tarjeta') as metodo,
               co.monto * ${fxc} as monto,
               coalesce(co.reembolsado_cents, 0) / 100.0 * ${fxc} as reembolsado,
               'cotizacion' as origen, c.id as ref_id
          from cotizacion_cobros co
          join cotizaciones c on c.id = co.cotizacion_id
          left join clientes cl on cl.id = c.cliente_id
         where co.org_id = ${orgId} and co.status = 'pagado'
           and co.paid_at >= ${ini} and co.paid_at < ${fin}
        union all
        select dp.aplicado_at, d.invoice_number, coalesce(cl.empresa, 'Sin cliente'),
               dp.metodo, dp.monto * ${currencyFx(S, 'dp.currency')}, 0::numeric,
               'factura', d.id
          from documento_pagos dp
          join documentos_fiscales d on d.id = dp.documento_id
          left join clientes cl on cl.id = d.cliente_id
         where dp.org_id = ${orgId} and dp.cobro_id is null
           and dp.aplicado_at >= ${ini} and dp.aplicado_at < ${fin}
        union all
        select c.paid_at, c.folio, coalesce(cl.empresa, 'Sin cliente'),
               coalesce(c.payment_method, 'manual'), c.total * ${fxc}, 0::numeric,
               'cotizacion', c.id
          from cotizaciones c
          left join clientes cl on cl.id = c.cliente_id
         where c.org_id = ${orgId} and c.paid_at >= ${ini} and c.paid_at < ${fin}
           and not exists (select 1 from cotizacion_cobros x where x.cotizacion_id = c.id and x.status = 'pagado')
           and not exists (select 1 from documentos_fiscales d2 join documento_pagos p2 on p2.documento_id = d2.id
                            where d2.cotizacion_id = c.id)
    )`;
}

function rangeOf(r: Rango) {
    const cmp = compareRangeFor(r, '0000-01-01');
    return { desde: r.desde, hasta: r.hasta, compare: cmp ? { desde: cmp.desde, hasta: cmp.hasta } : null };
}

/** Granularidad automática: día hasta un mes, semana hasta ~4 meses, mes después. */
export function autoGranularity(desde: string, hasta: string): 'day' | 'week' | 'month' {
    const days = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000 + 1;
    return days <= 31 ? 'day' : days <= 124 ? 'week' : 'month';
}

// ── Ventas en el tiempo ───────────────────────────────────────────────────────
async function ventasTotals(S: ReportScope, orgId: string, desde: string, hasta: string) {
    const fx = quoteFx(S);
    const ini = dayStart(S, desde), fin = dayEnd(S, hasta);
    const [[t], [p]] = await withOrgTx(orgId,
        sql`select
                count(*) filter (where c.status = any(${STATUS_GANADA}) and coalesce(c.approved_at, c.created_at) >= ${ini}
                    and coalesce(c.approved_at, c.created_at) < ${fin} and ${fx} is not null) as ventas,
                coalesce(sum(c.total * ${fx}) filter (where c.status = any(${STATUS_GANADA}) and coalesce(c.approved_at, c.created_at) >= ${ini}
                    and coalesce(c.approved_at, c.created_at) < ${fin}), 0) as vendido,
                count(*) filter (where c.status = any(${STATUS_SALIO}) and c.created_at >= ${ini} and c.created_at < ${fin}) as cotizaciones
            from cotizaciones c where c.org_id = ${orgId}`,
        sql`select coalesce(sum(p.monto - p.reembolsado), 0) as cobrado from ${pagosSql(S, orgId, ini, fin)} p`,
    );
    const ventas = num(t?.ventas), vendido = num(t?.vendido);
    return { ventas, vendido, ticket: ventas ? vendido / ventas : null, cobrado: num(p?.cobrado), cotizaciones: num(t?.cotizaciones) };
}

export async function getVentasTiempo(r: Rango, g?: 'day' | 'week' | 'month'): Promise<TablaReport> {
    const orgId = await getActiveOrgId();
    const gran = g ?? autoGranularity(r.desde, r.hasta);
    return cached(`inf-ventas:${orgId}:${r.desde}:${r.hasta}:${gran}`, 60, async () => {
        const S = await getReportScope(orgId);
        const rango = rangeOf(r);
        const fx = quoteFx(S);
        const ini = dayStart(S, r.desde), fin = dayEnd(S, r.hasta);
        const step = sql.unsafe(`'1 ${gran}'::interval`);
        const unit = sql.unsafe(`'${gran}'`);
        const [rows] = await withOrgTx(orgId, sql`
            with b as (
                select generate_series(date_trunc(${unit}, ${r.desde}::date), date_trunc(${unit}, ${r.hasta}::date), ${step})::date as bucket
            ), creadas as (
                select date_trunc(${unit}, c.created_at at time zone ${S.tz})::date as bucket,
                       count(*) as n, sum(c.total * ${fx}) as monto
                  from cotizaciones c
                 where c.org_id = ${orgId} and c.status = any(${STATUS_SALIO}) and c.created_at >= ${ini} and c.created_at < ${fin}
                 group by 1
            ), ganadas as (
                select date_trunc(${unit}, coalesce(c.approved_at, c.created_at) at time zone ${S.tz})::date as bucket,
                       count(*) filter (where ${fx} is not null) as n, sum(c.total * ${fx}) as monto
                  from cotizaciones c
                 where c.org_id = ${orgId} and c.status = any(${STATUS_GANADA})
                   and coalesce(c.approved_at, c.created_at) >= ${ini} and coalesce(c.approved_at, c.created_at) < ${fin}
                 group by 1
            ), pagos as (
                select date_trunc(${unit}, p.fecha at time zone ${S.tz})::date as bucket, sum(p.monto - p.reembolsado) as monto
                  from ${pagosSql(S, orgId, ini, fin)} p group by 1
            )
            select to_char(b.bucket, 'YYYY-MM-DD') as periodo,
                   coalesce(cr.n, 0) as cotizaciones, coalesce(cr.monto, 0) as cotizado,
                   coalesce(ga.n, 0) as ventas, coalesce(ga.monto, 0) as vendido,
                   coalesce(pa.monto, 0) as cobrado
              from b
              left join creadas cr on cr.bucket = b.bucket
              left join ganadas ga on ga.bucket = b.bucket
              left join pagos pa on pa.bucket = b.bucket
             order by b.bucket`);
        const [cur, prev] = await Promise.all([
            ventasTotals(S, orgId, r.desde, r.hasta),
            rango.compare ? ventasTotals(S, orgId, rango.compare.desde, rango.compare.hasta) : Promise.resolve(null),
        ]);
        const out: TablaRow[] = rows.map((row) => {
            const ventas = num(row.ventas), vendido = num(row.vendido);
            return {
                periodo: row.periodo as string, cotizaciones: num(row.cotizaciones), cotizado: num(row.cotizado),
                ventas, vendido, ticket: ventas ? vendido / ventas : null, cobrado: num(row.cobrado),
            };
        });
        return {
            kpis: [
                { key: 'vendido', label: 'inf.t.vendido', format: 'money', value: cur.vendido, prev: prev?.vendido ?? null },
                { key: 'ventas', label: 'inf.t.ventas', format: 'number', value: cur.ventas, prev: prev?.ventas ?? null },
                { key: 'ticket', label: 'inf.t.ticket', format: 'money', value: cur.ticket, prev: prev?.ticket ?? null },
                { key: 'cobrado', label: 'inf.t.cobrado', format: 'money', value: cur.cobrado, prev: prev?.cobrado ?? null },
            ],
            chart: { kind: out.length > 45 ? 'line' : 'bar', label: 'inf.t.vendido', format: 'money', items: out.map((row) => ({ label: String(row.periodo), value: num(row.vendido) })) },
            columns: [
                { key: 'periodo', label: 'inf.t.periodo', format: 'date' },
                { key: 'cotizaciones', label: 'inf.t.cotizaciones', format: 'number' },
                { key: 'cotizado', label: 'inf.t.cotizado', format: 'money' },
                { key: 'ventas', label: 'inf.t.ventas', format: 'number' },
                { key: 'vendido', label: 'inf.t.vendido', format: 'money' },
                { key: 'ticket', label: 'inf.t.ticket', format: 'money' },
                { key: 'cobrado', label: 'inf.t.cobrado', format: 'money' },
            ],
            rows: out,
            totals: {
                cotizaciones: cur.cotizaciones, cotizado: out.reduce((s, x) => s + num(x.cotizado), 0),
                ventas: cur.ventas, vendido: cur.vendido, ticket: cur.ticket, cobrado: cur.cobrado,
            },
            granularity: gran,
            moneda: scopeNote(S),
            rango,
        };
    });
}

// ── Ventas por cliente ────────────────────────────────────────────────────────
async function clienteTotals(S: ReportScope, orgId: string, desde: string, hasta: string) {
    const fx = quoteFx(S);
    const ini = dayStart(S, desde), fin = dayEnd(S, hasta);
    const [[t]] = await withOrgTx(orgId, sql`
        select count(distinct c.cliente_id) as clientes,
               coalesce(sum(c.total * ${fx}), 0) as vendido,
               count(*) filter (where ${fx} is not null) as ventas,
               count(distinct c.cliente_id) filter (where exists (
                   select 1 from cotizaciones o where o.cliente_id = c.cliente_id and o.status = any(${STATUS_GANADA})
                      and coalesce(o.approved_at, o.created_at) < ${ini})) as recurrentes
          from cotizaciones c
         where c.org_id = ${orgId} and c.cliente_id is not null and c.status = any(${STATUS_GANADA})
           and coalesce(c.approved_at, c.created_at) >= ${ini} and coalesce(c.approved_at, c.created_at) < ${fin}`);
    const clientes = num(t?.clientes), ventas = num(t?.ventas), vendido = num(t?.vendido);
    return {
        clientes, vendido, ticket: ventas ? vendido / ventas : null,
        recurrencia: clientes ? Math.round((num(t?.recurrentes) / clientes) * 100) : null,
    };
}

export async function getVentasCliente(r: Rango): Promise<TablaReport> {
    const orgId = await getActiveOrgId();
    return cached(`inf-vcliente:${orgId}:${r.desde}:${r.hasta}`, 60, async () => {
        const S = await getReportScope(orgId);
        const rango = rangeOf(r);
        const fx = quoteFx(S);
        const ini = dayStart(S, r.desde), fin = dayEnd(S, r.hasta);
        const ganada = sql`c.status = any(${STATUS_GANADA}) and coalesce(c.approved_at, c.created_at) >= ${ini} and coalesce(c.approved_at, c.created_at) < ${fin}`;
        // Saldo pendiente HOY (no del rango): la misma cartera que Cobranza.
        const [rows] = await withOrgTx(orgId, sql`
            with saldo as (
                select r.cliente_id, sum(r.saldo * (case when r.origen = 'cotizacion' then ${quoteFx(S, 'q')} else ${documentFx(S, 'd')} end)) as saldo
                  from cuentas_por_cobrar r
                  left join cotizaciones q on r.origen = 'cotizacion' and q.id = r.ref_id and q.org_id = ${orgId}
                  left join documentos_fiscales d on r.origen = 'factura' and d.id = r.ref_id and d.org_id = ${orgId}
                 where r.org_id = ${orgId} and r.saldo > 0 and r.cliente_id is not null
                 group by r.cliente_id
            )
            select cl.id, cl.empresa,
                   count(c.id) filter (where c.status = any(${STATUS_SALIO}) and c.created_at >= ${ini} and c.created_at < ${fin}) as cotizaciones,
                   count(c.id) filter (where ${ganada} and ${fx} is not null) as ventas,
                   coalesce(sum(c.total * ${fx}) filter (where ${ganada}), 0) as vendido,
                   max(coalesce(c.approved_at, c.created_at)) filter (where c.status = any(${STATUS_GANADA})) as ultima_venta,
                   min(c.created_at) as cliente_desde,
                   coalesce(max(s.saldo), 0) as saldo
              from clientes cl
              join cotizaciones c on c.cliente_id = cl.id and c.org_id = ${orgId}
              left join saldo s on s.cliente_id = cl.id
             where cl.org_id = ${orgId}
             group by cl.id, cl.empresa
            having count(c.id) filter (where c.status = any(${STATUS_SALIO}) and c.created_at >= ${ini} and c.created_at < ${fin}) > 0
                or count(c.id) filter (where ${ganada}) > 0
             order by vendido desc, cotizaciones desc
             limit 500`);
        const [cur, prev] = await Promise.all([
            clienteTotals(S, orgId, r.desde, r.hasta),
            rango.compare ? clienteTotals(S, orgId, rango.compare.desde, rango.compare.hasta) : Promise.resolve(null),
        ]);
        const out: TablaRow[] = rows.map((row) => {
            const ventas = num(row.ventas), vendido = num(row.vendido);
            return {
                _href: `/app/clientes/${row.id}`,
                cliente: row.empresa as string, cotizaciones: num(row.cotizaciones), ventas, vendido,
                ticket: ventas ? vendido / ventas : null, ultima: iso(row.ultima_venta), desde: iso(row.cliente_desde), saldo: num(row.saldo),
            };
        });
        return {
            kpis: [
                { key: 'clientes', label: 'inf.t.clientes_compraron', format: 'number', value: cur.clientes, prev: prev?.clientes ?? null },
                { key: 'vendido', label: 'inf.t.vendido', format: 'money', value: cur.vendido, prev: prev?.vendido ?? null },
                { key: 'ticket', label: 'inf.t.ticket', format: 'money', value: cur.ticket, prev: prev?.ticket ?? null },
                { key: 'recurrencia', label: 'inf.t.recurrencia', format: 'pct', value: cur.recurrencia, prev: prev?.recurrencia ?? null },
            ],
            chart: { kind: 'hbar', label: 'inf.t.vendido', format: 'money', items: out.filter((x) => num(x.vendido) > 0).slice(0, 8).map((x) => ({ label: String(x.cliente), value: num(x.vendido), href: x._href ?? undefined })) },
            columns: [
                { key: 'cliente', label: 'inf.t.cliente', format: 'text' },
                { key: 'cotizaciones', label: 'inf.t.cotizaciones', format: 'number' },
                { key: 'ventas', label: 'inf.t.ventas', format: 'number' },
                { key: 'vendido', label: 'inf.t.vendido', format: 'money' },
                { key: 'ticket', label: 'inf.t.ticket', format: 'money' },
                { key: 'ultima', label: 'inf.t.ultima_venta', format: 'date' },
                { key: 'desde', label: 'inf.t.cliente_desde', format: 'date' },
                { key: 'saldo', label: 'inf.t.saldo_hoy', format: 'money' },
            ],
            rows: out,
            totals: {
                cotizaciones: out.reduce((s, x) => s + num(x.cotizaciones), 0), ventas: out.reduce((s, x) => s + num(x.ventas), 0),
                vendido: cur.vendido, ticket: cur.ticket, saldo: out.reduce((s, x) => s + num(x.saldo), 0),
            },
            moneda: scopeNote(S),
            rango,
        };
    });
}

// ── Ventas por producto (con margen) ──────────────────────────────────────────
async function productoTotals(S: ReportScope, orgId: string, desde: string, hasta: string) {
    const fx = quoteFx(S);
    const ini = dayStart(S, desde), fin = dayEnd(S, hasta);
    const precio = sql`coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad`;
    const [[t]] = await withOrgTx(orgId, sql`
        select coalesce(sum(it.cantidad), 0) as unidades,
               coalesce(sum(${precio} * ${fx}), 0) as vendido,
               coalesce(sum(${precio} * ${fx}) filter (where it.costo_unitario > 0), 0) as vendido_con_costo,
               coalesce(sum(it.costo_unitario * it.cantidad * ${fx}) filter (where it.costo_unitario > 0), 0) as costo
          from cotizacion_items it
          join cotizaciones c on c.id = it.cotizacion_id
         where c.org_id = ${orgId} and c.status = any(${STATUS_GANADA}) and coalesce(it.aprobado, true)
           and coalesce(c.approved_at, c.created_at) >= ${ini} and coalesce(c.approved_at, c.created_at) < ${fin}`);
    const conCosto = num(t?.vendido_con_costo), costo = num(t?.costo);
    return {
        unidades: num(t?.unidades), vendido: num(t?.vendido),
        margen: conCosto ? conCosto - costo : null,
        margenPct: conCosto ? Math.round(((conCosto - costo) / conCosto) * 100) : null,
    };
}

export async function getVentasProducto(r: Rango): Promise<TablaReport> {
    const orgId = await getActiveOrgId();
    return cached(`inf-vproducto:${orgId}:${r.desde}:${r.hasta}`, 60, async () => {
        const S = await getReportScope(orgId);
        const rango = rangeOf(r);
        const fx = quoteFx(S);
        const ini = dayStart(S, r.desde), fin = dayEnd(S, r.hasta);
        const precio = sql`coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad`;
        const enRango = sql`coalesce(c.approved_at, c.created_at) >= ${ini} and coalesce(c.approved_at, c.created_at) < ${fin}`;
        // El margen solo se calcula sobre líneas con costo capturado (snapshot al
        // cotizar): un costo 0 es "no lo sé", no "me salió gratis".
        const [rows] = await withOrgTx(orgId, sql`
            select it.producto_id, coalesce(p.nombre, it.descripcion) as nombre, max(p.sku) as sku,
                   coalesce(sum(it.cantidad) filter (where c.status = any(${STATUS_GANADA}) and ${enRango}), 0) as unidades,
                   count(distinct c.id) filter (where c.status = any(${STATUS_GANADA}) and ${enRango}) as ventas,
                   coalesce(sum(${precio} * ${fx}) filter (where c.status = any(${STATUS_GANADA}) and ${enRango}), 0) as vendido,
                   coalesce(sum(${precio} * ${fx}) filter (where c.status = any(${STATUS_GANADA}) and ${enRango} and it.costo_unitario > 0), 0) as vendido_con_costo,
                   coalesce(sum(it.costo_unitario * it.cantidad * ${fx}) filter (where c.status = any(${STATUS_GANADA}) and ${enRango} and it.costo_unitario > 0), 0) as costo,
                   count(distinct c.id) filter (where c.status = any(${STATUS_SALIO}) and c.created_at >= ${ini} and c.created_at < ${fin}) as cotizadas,
                   count(distinct c.id) filter (where c.status = any(${STATUS_GANADA}) and c.created_at >= ${ini} and c.created_at < ${fin}) as ganadas_cohorte
              from cotizacion_items it
              join cotizaciones c on c.id = it.cotizacion_id
              left join productos p on p.id = it.producto_id
             where c.org_id = ${orgId} and coalesce(it.aprobado, true)
               and ((c.status = any(${STATUS_GANADA}) and ${enRango}) or (c.created_at >= ${ini} and c.created_at < ${fin}))
             group by it.producto_id, coalesce(p.nombre, it.descripcion)
             order by vendido desc, unidades desc
             limit 500`);
        const [cur, prev] = await Promise.all([
            productoTotals(S, orgId, r.desde, r.hasta),
            rango.compare ? productoTotals(S, orgId, rango.compare.desde, rango.compare.hasta) : Promise.resolve(null),
        ]);
        const out: TablaRow[] = rows.map((row) => {
            const conCosto = num(row.vendido_con_costo), costo = num(row.costo), cotizadas = num(row.cotizadas);
            return {
                _href: row.producto_id ? `/app/productos/${row.producto_id}` : null,
                producto: row.nombre as string, sku: (row.sku as string) || '', unidades: num(row.unidades),
                ventas: num(row.ventas), vendido: num(row.vendido),
                margen: conCosto ? conCosto - costo : null,
                margen_pct: conCosto ? Math.round(((conCosto - costo) / conCosto) * 100) : null,
                cierre: cotizadas ? Math.round((num(row.ganadas_cohorte) / cotizadas) * 100) : null,
            };
        });
        return {
            kpis: [
                { key: 'unidades', label: 'inf.t.unidades', format: 'number', value: cur.unidades, prev: prev?.unidades ?? null },
                { key: 'vendido', label: 'inf.t.vendido', format: 'money', value: cur.vendido, prev: prev?.vendido ?? null },
                { key: 'margen', label: 'inf.t.margen', format: 'money', value: cur.margen, prev: prev?.margen ?? null },
                { key: 'margen_pct', label: 'inf.t.margen_pct', format: 'pct', value: cur.margenPct, prev: prev?.margenPct ?? null },
            ],
            chart: { kind: 'hbar', label: 'inf.t.vendido', format: 'money', items: out.filter((x) => num(x.vendido) > 0).slice(0, 8).map((x) => ({ label: String(x.producto), value: num(x.vendido), href: x._href ?? undefined })) },
            columns: [
                { key: 'producto', label: 'inf.t.producto', format: 'text' },
                { key: 'sku', label: 'inf.t.sku', format: 'text' },
                { key: 'unidades', label: 'inf.t.unidades', format: 'number' },
                { key: 'ventas', label: 'inf.t.ventas', format: 'number' },
                { key: 'vendido', label: 'inf.t.vendido', format: 'money' },
                { key: 'margen', label: 'inf.t.margen', format: 'money' },
                { key: 'margen_pct', label: 'inf.t.margen_pct', format: 'pct' },
                { key: 'cierre', label: 'inf.t.tasa_cierre', format: 'pct' },
            ],
            rows: out,
            totals: { unidades: cur.unidades, ventas: null, vendido: cur.vendido, margen: cur.margen, margen_pct: cur.margenPct, cierre: null },
            moneda: scopeNote(S),
            rango,
        };
    });
}

// ── Pagos recibidos ───────────────────────────────────────────────────────────
async function pagosTotals(S: ReportScope, orgId: string, desde: string, hasta: string) {
    const [[t]] = await withOrgTx(orgId, sql`
        select count(*) filter (where p.monto is not null) as pagos,
               coalesce(sum(p.monto), 0) as bruto, coalesce(sum(p.reembolsado), 0) as reembolsado
          from ${pagosSql(S, orgId, dayStart(S, desde), dayEnd(S, hasta))} p`);
    const bruto = num(t?.bruto), reembolsado = num(t?.reembolsado);
    return { pagos: num(t?.pagos), bruto, reembolsado, neto: bruto - reembolsado };
}

export async function getPagosRecibidos(r: Rango): Promise<TablaReport> {
    const orgId = await getActiveOrgId();
    return cached(`inf-pagos:${orgId}:${r.desde}:${r.hasta}`, 60, async () => {
        const S = await getReportScope(orgId);
        const rango = rangeOf(r);
        const [rows] = await withOrgTx(orgId, sql`
            select p.* from ${pagosSql(S, orgId, dayStart(S, r.desde), dayEnd(S, r.hasta))} p
             order by p.fecha desc limit 1000`);
        const [cur, prev] = await Promise.all([
            pagosTotals(S, orgId, r.desde, r.hasta),
            rango.compare ? pagosTotals(S, orgId, rango.compare.desde, rango.compare.hasta) : Promise.resolve(null),
        ]);
        const porMetodo = new Map<string, number>();
        const out: TablaRow[] = rows.map((row) => {
            const metodo = String(row.metodo || 'manual');
            const monto = nullableNum(row.monto), reembolsado = num(row.reembolsado);
            if (monto !== null) porMetodo.set(metodo, (porMetodo.get(metodo) ?? 0) + monto - reembolsado);
            return {
                _href: row.origen === 'factura' ? `/app/facturas/${row.ref_id}` : `/app/cotizaciones/${row.ref_id}`,
                fecha: iso(row.fecha), folio: (row.folio as string) || '—', cliente: row.empresa as string,
                metodo, monto, reembolsado, neto: monto === null ? null : monto - reembolsado,
            };
        });
        return {
            kpis: [
                { key: 'neto', label: 'inf.t.cobrado_neto', format: 'money', value: cur.neto, prev: prev?.neto ?? null },
                { key: 'bruto', label: 'inf.t.cobrado_bruto', format: 'money', value: cur.bruto, prev: prev?.bruto ?? null },
                { key: 'reembolsado', label: 'inf.t.reembolsado', format: 'money', value: cur.reembolsado, prev: prev?.reembolsado ?? null },
                { key: 'pagos', label: 'inf.t.pagos', format: 'number', value: cur.pagos, prev: prev?.pagos ?? null },
            ],
            chart: { kind: 'hbar', label: 'inf.t.cobrado_neto', format: 'money', items: [...porMetodo.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label: `metodo:${label}`, value })) },
            columns: [
                { key: 'fecha', label: 'inf.t.fecha', format: 'date' },
                { key: 'folio', label: 'inf.t.folio', format: 'text' },
                { key: 'cliente', label: 'inf.t.cliente', format: 'text' },
                { key: 'metodo', label: 'inf.t.metodo', format: 'text' },
                { key: 'monto', label: 'inf.t.monto', format: 'money' },
                { key: 'reembolsado', label: 'inf.t.reembolsado', format: 'money' },
                { key: 'neto', label: 'inf.t.neto', format: 'money' },
            ],
            rows: out,
            totals: { monto: cur.bruto, reembolsado: cur.reembolsado, neto: cur.neto },
            moneda: scopeNote(S),
            rango,
        };
    });
}

// ── Impuestos facturados ──────────────────────────────────────────────────────
// De las facturas EMITIDAS (no de cotizaciones): es el dato que el negocio declara.
async function impuestosTotals(S: ReportScope, orgId: string, desde: string, hasta: string) {
    const fx = documentFx(S, 'd');
    const [[t]] = await withOrgTx(orgId, sql`
        select count(*) as facturas,
               coalesce(sum(coalesce(d.subtotal, d.total - coalesce(d.tax_total, 0)) * ${fx}), 0) as subtotal,
               coalesce(sum(coalesce(d.tax_total, 0) * ${fx}), 0) as impuestos,
               coalesce(sum(coalesce(d.retencion_total, 0) * ${fx}), 0) as retenciones
          from documentos_fiscales d
         where d.org_id = ${orgId} and d.status = 'issued' and d.lifecycle not in ('draft', 'void')
           and d.credit_note_of is null and d.issued_at >= ${dayStart(S, desde)} and d.issued_at < ${dayEnd(S, hasta)}`);
    return { facturas: num(t?.facturas), subtotal: num(t?.subtotal), impuestos: num(t?.impuestos), retenciones: num(t?.retenciones) };
}

export async function getImpuestos(r: Rango): Promise<TablaReport> {
    const orgId = await getActiveOrgId();
    return cached(`inf-impuestos:${orgId}:${r.desde}:${r.hasta}`, 60, async () => {
        const S = await getReportScope(orgId);
        const rango = rangeOf(r);
        const fx = documentFx(S, 'd');
        const [rows] = await withOrgTx(orgId, sql`
            select to_char(date_trunc('month', d.issued_at at time zone ${S.tz}), 'YYYY-MM-DD') as periodo,
                   count(*) as facturas,
                   coalesce(sum(coalesce(d.subtotal, d.total - coalesce(d.tax_total, 0)) * ${fx}), 0) as subtotal,
                   coalesce(sum(coalesce(d.tax_total, 0) * ${fx}), 0) as impuestos,
                   coalesce(sum(coalesce(d.retencion_total, 0) * ${fx}), 0) as retenciones,
                   coalesce(sum(d.total * ${fx}), 0) as total
              from documentos_fiscales d
             where d.org_id = ${orgId} and d.status = 'issued' and d.lifecycle not in ('draft', 'void')
               and d.credit_note_of is null
               and d.issued_at >= ${dayStart(S, r.desde)} and d.issued_at < ${dayEnd(S, r.hasta)}
             group by 1 order by 1`);
        const [cur, prev] = await Promise.all([
            impuestosTotals(S, orgId, r.desde, r.hasta),
            rango.compare ? impuestosTotals(S, orgId, rango.compare.desde, rango.compare.hasta) : Promise.resolve(null),
        ]);
        const out: TablaRow[] = rows.map((row) => ({
            periodo: row.periodo as string, facturas: num(row.facturas), subtotal: num(row.subtotal),
            impuestos: num(row.impuestos), retenciones: num(row.retenciones), total: num(row.total),
        }));
        return {
            kpis: [
                { key: 'impuestos', label: 'inf.t.impuestos', format: 'money', value: cur.impuestos, prev: prev?.impuestos ?? null },
                { key: 'retenciones', label: 'inf.t.retenciones', format: 'money', value: cur.retenciones, prev: prev?.retenciones ?? null },
                { key: 'subtotal', label: 'inf.t.subtotal', format: 'money', value: cur.subtotal, prev: prev?.subtotal ?? null },
                { key: 'facturas', label: 'inf.t.facturas', format: 'number', value: cur.facturas, prev: prev?.facturas ?? null },
            ],
            chart: { kind: 'bar', label: 'inf.t.impuestos', format: 'money', items: out.map((x) => ({ label: String(x.periodo), value: num(x.impuestos) })) },
            columns: [
                { key: 'periodo', label: 'inf.t.mes', format: 'date' },
                { key: 'facturas', label: 'inf.t.facturas', format: 'number' },
                { key: 'subtotal', label: 'inf.t.subtotal', format: 'money' },
                { key: 'impuestos', label: 'inf.t.impuestos', format: 'money' },
                { key: 'retenciones', label: 'inf.t.retenciones', format: 'money' },
                { key: 'total', label: 'inf.t.total', format: 'money' },
            ],
            rows: out,
            totals: { facturas: cur.facturas, subtotal: cur.subtotal, impuestos: cur.impuestos, retenciones: cur.retenciones, total: out.reduce((s, x) => s + num(x.total), 0) },
            granularity: 'month',
            moneda: scopeNote(S),
            rango,
        };
    });
}

// ── Recompra por cohorte ──────────────────────────────────────────────────────
// Cohorte = mes de la PRIMERA venta de cada cliente (últimos 12 meses). Cada celda
// dice qué % de esa cohorte volvió a comprar N meses después.
export const COHORT_MONTHS = 6;
export async function getRecompra(): Promise<TablaReport> {
    const orgId = await getActiveOrgId();
    return cached(`inf-recompra:${orgId}`, 300, async () => {
        const S = await getReportScope(orgId);
        const [rows] = await withOrgTx(orgId, sql`
            with ventas as (
                select c.cliente_id, date_trunc('month', coalesce(c.approved_at, c.created_at) at time zone ${S.tz})::date as mes
                  from cotizaciones c
                 where c.org_id = ${orgId} and c.cliente_id is not null and c.status = any(${STATUS_GANADA})
                 group by 1, 2
            ), primera as (
                select cliente_id, min(mes) as cohorte from ventas group by 1
            )
            select to_char(p.cohorte, 'YYYY-MM-DD') as cohorte,
                   count(distinct p.cliente_id) as clientes,
                   ${sql.unsafe(Array.from({ length: COHORT_MONTHS }, (_, i) => `count(distinct v.cliente_id) filter (where v.mes = (p.cohorte + interval '${i + 1} month')::date) as m${i + 1}`).join(',\n                   '))}
              from primera p
              left join ventas v on v.cliente_id = p.cliente_id and v.mes > p.cohorte
             where p.cohorte >= (date_trunc('month', ${S.hoy}::date) - interval '11 months')::date
             group by p.cohorte
             order by p.cohorte`);
        const mesesDesde = (cohorte: string) => {
            const [y, m] = S.hoy.split('-').map(Number);
            const [cy, cm] = cohorte.split('-').map(Number);
            return (y - cy) * 12 + (m - cm);
        };
        const out: TablaRow[] = rows.map((row) => {
            const clientes = num(row.clientes);
            const edad = mesesDesde(row.cohorte as string);
            const cells: Record<string, number | null> = {};
            // Un mes que todavía no termina de ocurrir para esa cohorte no es 0%: es "aún no".
            for (let i = 1; i <= COHORT_MONTHS; i++) cells[`m${i}`] = i > edad ? null : clientes ? Math.round((num(row[`m${i}`]) / clientes) * 100) : 0;
            return { cohorte: row.cohorte as string, clientes, ...cells };
        });
        const totalClientes = out.reduce((s, x) => s + num(x.clientes), 0);
        const volvieron1 = rows.reduce((s, x) => s + num(x.m1), 0);
        const elegibles1 = out.filter((x) => x.m1 !== null).reduce((s, x) => s + num(x.clientes), 0);
        return {
            kpis: [
                { key: 'nuevos', label: 'inf.t.clientes_nuevos', format: 'number', value: totalClientes, prev: null },
                { key: 'm1', label: 'inf.t.recompra_m1', format: 'pct', value: elegibles1 ? Math.round((volvieron1 / elegibles1) * 100) : null, prev: null },
            ],
            chart: null,
            columns: [
                { key: 'cohorte', label: 'inf.t.cohorte', format: 'date' },
                { key: 'clientes', label: 'inf.t.clientes', format: 'number' },
                ...Array.from({ length: COHORT_MONTHS }, (_, i) => ({ key: `m${i + 1}`, label: `inf.t.mes_n:${i + 1}`, format: 'pct' as ColFormat })),
            ],
            rows: out,
            totals: null,
            heat: Array.from({ length: COHORT_MONTHS }, (_, i) => `m${i + 1}`),
            granularity: 'month',
            moneda: scopeNote(S),
            rango: { desde: '', hasta: S.hoy, compare: null },
        };
    });
}

// ── Ventas por vendedor ───────────────────────────────────────────────────────
async function vendedorTotals(S: ReportScope, orgId: string, desde: string, hasta: string) {
    const fx = quoteFx(S);
    const ini = dayStart(S, desde), fin = dayEnd(S, hasta);
    const [[t]] = await withOrgTx(orgId, sql`
        select count(distinct c.creado_por) filter (where c.status = any(${STATUS_GANADA})) as vendedores,
               coalesce(sum(c.total * ${fx}) filter (where c.status = any(${STATUS_GANADA})), 0) as vendido,
               count(*) filter (where c.status = any(${STATUS_GANADA}) and ${fx} is not null) as ventas
          from cotizaciones c
         where c.org_id = ${orgId} and c.creado_por is not null
           and coalesce(c.approved_at, c.created_at) >= ${ini} and coalesce(c.approved_at, c.created_at) < ${fin}`);
    const ventas = num(t?.ventas), vendido = num(t?.vendido);
    return { vendedores: num(t?.vendedores), vendido, ventas, ticket: ventas ? vendido / ventas : null };
}

export async function getVentasVendedor(r: Rango): Promise<TablaReport> {
    const orgId = await getActiveOrgId();
    return cached(`inf-vendedor:${orgId}:${r.desde}:${r.hasta}`, 60, async () => {
        const S = await getReportScope(orgId);
        const rango = rangeOf(r);
        const fx = quoteFx(S);
        const ini = dayStart(S, r.desde), fin = dayEnd(S, r.hasta);
        const ganada = sql`c.status = any(${STATUS_GANADA}) and coalesce(c.approved_at, c.created_at) >= ${ini} and coalesce(c.approved_at, c.created_at) < ${fin}`;
        const creada = sql`c.status = any(${STATUS_SALIO}) and c.created_at >= ${ini} and c.created_at < ${fin}`;
        const [rows] = await withOrgTx(orgId, sql`
            select m.user_id, coalesce(m.nombre, m.email, 'Sin nombre') as nombre,
                   count(c.id) filter (where ${creada}) as enviadas,
                   count(c.id) filter (where ${creada} and c.status = any(${STATUS_GANADA})) as ganadas_cohorte,
                   count(c.id) filter (where ${ganada} and ${fx} is not null) as ventas,
                   coalesce(sum(c.total * ${fx}) filter (where ${ganada}), 0) as vendido,
                   avg(extract(epoch from (c.approved_at - c.created_at)) / 86400) filter (where ${ganada} and c.approved_at is not null) as dias
              from org_members m
              left join cotizaciones c on c.creado_por = m.user_id::text and c.org_id = ${orgId}
             where m.org_id = ${orgId} and m.estado = 'activo' and m.user_id is not null
             group by m.user_id, coalesce(m.nombre, m.email, 'Sin nombre')
             order by vendido desc, enviadas desc`);
        const [cur, prev] = await Promise.all([
            vendedorTotals(S, orgId, r.desde, r.hasta),
            rango.compare ? vendedorTotals(S, orgId, rango.compare.desde, rango.compare.hasta) : Promise.resolve(null),
        ]);
        const out: TablaRow[] = rows.map((row) => {
            const enviadas = num(row.enviadas), ventas = num(row.ventas), vendido = num(row.vendido);
            return {
                vendedor: row.nombre as string, enviadas, ventas, vendido,
                tasa: enviadas ? Math.round((num(row.ganadas_cohorte) / enviadas) * 100) : null,
                ticket: ventas ? vendido / ventas : null,
                dias: row.dias === null || row.dias === undefined ? null : Math.round(num(row.dias) * 10) / 10,
            };
        });
        return {
            kpis: [
                { key: 'vendido', label: 'inf.t.vendido', format: 'money', value: cur.vendido, prev: prev?.vendido ?? null },
                { key: 'ventas', label: 'inf.t.ventas', format: 'number', value: cur.ventas, prev: prev?.ventas ?? null },
                { key: 'ticket', label: 'inf.t.ticket', format: 'money', value: cur.ticket, prev: prev?.ticket ?? null },
                { key: 'vendedores', label: 'inf.t.vendedores_con_ventas', format: 'number', value: cur.vendedores, prev: prev?.vendedores ?? null },
            ],
            chart: { kind: 'hbar', label: 'inf.t.vendido', format: 'money', items: out.filter((x) => num(x.vendido) > 0).slice(0, 8).map((x) => ({ label: String(x.vendedor), value: num(x.vendido) })) },
            columns: [
                { key: 'vendedor', label: 'inf.t.vendedor', format: 'text' },
                { key: 'enviadas', label: 'inf.t.enviadas', format: 'number' },
                { key: 'ventas', label: 'inf.t.ventas', format: 'number' },
                { key: 'vendido', label: 'inf.t.vendido', format: 'money' },
                { key: 'tasa', label: 'inf.t.tasa_cierre', format: 'pct' },
                { key: 'ticket', label: 'inf.t.ticket', format: 'money' },
                { key: 'dias', label: 'inf.t.dias_cierre', format: 'days' },
            ],
            rows: out,
            totals: {
                enviadas: out.reduce((s, x) => s + num(x.enviadas), 0), ventas: out.reduce((s, x) => s + num(x.ventas), 0),
                vendido: out.reduce((s, x) => s + num(x.vendido), 0), tasa: null, ticket: null, dias: null,
            },
            moneda: scopeNote(S),
            rango,
        };
    });
}
