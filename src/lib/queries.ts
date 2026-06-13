// src/lib/queries.ts
// Capa de datos REAL sobre Neon. Devuelve exactamente los mismos shapes que
// src/lib/mock.ts para que las páginas sólo cambien el import + un `await`.
// Re-exporta los helpers puros y STATUS_META del mock (no se duplican).

import { sql, getActiveOrgId } from './db';
import {
    STATUS_META, IVA, money, lineTotal, quoteSubtotal, quoteIva, quoteTotal,
    type QuoteStatus, type MockItem, type MockEvent, type MockQuote,
} from './mock';

export { STATUS_META, IVA, money, lineTotal, quoteSubtotal, quoteIva, quoteTotal };
export type { QuoteStatus, MockItem, MockEvent, MockQuote };

// ── Formatters (Postgres → display, igual que el mock hardcodeaba) ──────────
const num = (v: unknown) => Number(v ?? 0);

const initials = (nombre: string) =>
    nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '—';

const TERM_LABEL: Record<string, MockQuote['terminos']> = {
    contado: 'Contado', net30: 'Net 30', net60: 'Net 60',
};
const termLabel = (t: string | null) => TERM_LABEL[t ?? 'contado'] ?? 'Contado';

const fmtDate = (d: string | Date | null) => {
    if (!d) return '—';
    const date = typeof d === 'string' ? new Date(d) : d;
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
        .format(date).replace('.', '');
};

const fmtRelative = (d: string | Date) => {
    const date = typeof d === 'string' ? new Date(d) : d;
    const now = new Date();
    const hhmm = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    const sameDay = date.toDateString() === now.toDateString();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    const isYest = date.toDateString() === yest.toDateString();
    if (sameDay) return `hoy, ${hhmm}`;
    if (isYest) return `ayer, ${hhmm}`;
    const md = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(date).replace('.', '');
    return `${md}, ${hhmm}`;
};

// ── ORG ─────────────────────────────────────────────────────────────────────
const PLAN_LABEL: Record<string, string> = { free: 'Gratis', basico: 'Básico', pro: 'Profesional' };

export async function getOrg() {
    const orgId = await getActiveOrgId();
    const [o] = await sql`select * from orgs where id = ${orgId}`;
    return {
        id: orgId,
        nombre: o.nombre as string,
        inicial: initials(o.nombre),
        rfc: (o.rfc as string) ?? '',
        razonSocial: (o.razon_social as string) ?? '',
        email: (o.email_contacto as string) ?? '',
        telefono: (o.telefono as string) ?? '',
        direccion: (o.direccion as string) ?? '',
        plan: PLAN_LABEL[o.plan] ?? 'Gratis',
        prefix: o.quote_prefix as string,
        moneda: o.moneda as string,
        ivaPct: num(o.iva_pct),
        logoUrl: (o.logo_url as string) ?? '',
        colorMarca: (o.color_marca as string) || '#0a192f',
        pdfMensaje: (o.pdf_mensaje as string) ?? '',
        pdfCondiciones: (o.pdf_condiciones as string) ?? '',
        pdfMostrarLista: (o.pdf_mostrar_lista as boolean) ?? true,
        pdfTemplate: (o.pdf_template as string) || 'clasico',
    };
}

// ── PRODUCTOS ────────────────────────────────────────────────────────────────
export async function getProductos() {
    const orgId = await getActiveOrgId();
    const rows = await sql`select * from productos where org_id = ${orgId} order by activo desc, nombre`;
    return rows.map(p => ({
        id: p.id as string,
        sku: (p.sku as string) ?? '',
        nombre: p.nombre as string,
        unidad: p.unidad as string,
        precio: num(p.precio_lista),
        activo: p.activo as boolean,
    }));
}

// ── CLIENTES ──────────────────────────────────────────────────────────────────
export async function getClientes() {
    const orgId = await getActiveOrgId();
    const rows = await sql`select * from clientes where org_id = ${orgId} order by empresa`;
    return rows.map(c => ({
        id: c.id as string,
        empresa: c.empresa as string,
        contacto: (c.contacto as string) ?? '',
        email: (c.email as string) ?? '',
        rfc: (c.rfc as string) ?? '',
        terminos: termLabel(c.terminos_default as string),
        limite: num(c.limite_credito),
        inicial: initials(c.empresa),
    }));
}

// ── COTIZACIONES ──────────────────────────────────────────────────────────────
function rowToQuote(c: any, items: any[], eventos: any[]): MockQuote {
    return {
        id: c.id,
        folio: c.folio,
        cliente: c.empresa ?? 'Sin cliente',
        clienteInicial: initials(c.empresa ?? '—'),
        status: c.status as QuoteStatus,
        terminos: termLabel(c.terminos),
        vigencia: fmtDate(c.vigencia),
        creada: fmtDate(c.created_at),
        token: c.public_token,
        notas: c.notas ?? undefined,
        total: num(c.total),
        items: items.map((it): MockItem => ({
            descripcion: it.descripcion,
            cantidad: num(it.cantidad),
            unidad: it.unidad ?? 'pieza',
            precioLista: num(it.precio_unitario),
            precioNegociado: it.precio_negociado === null ? null : num(it.precio_negociado),
        })),
        eventos: eventos.map((e): MockEvent => ({
            tipo: e.tipo,
            detalle: e.detalle ?? '',
            cuando: fmtRelative(e.created_at),
        })),
    };
}

// Lista (sin items/eventos detallados — sólo lo que la tabla necesita).
export async function getCotizaciones(): Promise<MockQuote[]> {
    const orgId = await getActiveOrgId();
    const rows = await sql`
        select c.*, cl.empresa, cl.terminos_default,
               coalesce(c.terminos, cl.terminos_default) as terminos
        from cotizaciones c
        left join clientes cl on cl.id = c.cliente_id
        where c.org_id = ${orgId}
        order by c.created_at desc`;
    return rows.map(c => rowToQuote(c, [], []));
}

export async function getCotizacion(id: string): Promise<MockQuote | null> {
    const orgId = await getActiveOrgId();
    const rows = await sql`
        select c.*, cl.empresa, coalesce(c.terminos, cl.terminos_default) as terminos
        from cotizaciones c left join clientes cl on cl.id = c.cliente_id
        where c.id = ${id} and c.org_id = ${orgId}`;
    if (!rows.length) return null;
    const items = await sql`select * from cotizacion_items where cotizacion_id = ${id} order by orden`;
    const eventos = await sql`select * from eventos where cotizacion_id = ${id} order by created_at desc`;
    return rowToQuote(rows[0], items, eventos);
}

// Link público — NO filtra por org (el token es el secreto). Devuelve también
// el nombre/marca de la org emisora para renderizar /q.
export async function getCotizacionByToken(token: string) {
    const rows = await sql`
        select c.*, cl.empresa, coalesce(c.terminos, cl.terminos_default) as terminos,
               o.nombre as org_nombre, o.rfc as org_rfc, o.color_marca as org_color,
               o.pdf_mensaje as org_pdf_mensaje, o.iva_pct as org_iva_pct
        from cotizaciones c
        left join clientes cl on cl.id = c.cliente_id
        join orgs o on o.id = c.org_id
        where c.public_token = ${token}`;
    if (!rows.length) return null;
    const items = await sql`select * from cotizacion_items where cotizacion_id = ${rows[0].id} order by orden`;
    const quote = rowToQuote(rows[0], items, []);
    return {
        quote,
        org: {
            nombre: rows[0].org_nombre as string,
            inicial: initials(rows[0].org_nombre),
            rfc: (rows[0].org_rfc as string) ?? '',
            colorMarca: (rows[0].org_color as string) || '#0a192f',
            pdfMensaje: (rows[0].org_pdf_mensaje as string) ?? '',
            ivaPct: num(rows[0].org_iva_pct) || 16,
        },
    };
}

// Marca un evento 'viewed' la primera vez que el cliente abre el link.
export async function markViewed(token: string) {
    const rows = await sql`select id, org_id, status from cotizaciones where public_token = ${token}`;
    if (!rows.length) return;
    const c = rows[0];
    await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
              values (${c.org_id}, ${c.id}, 'viewed', 'El cliente abrió el link')`;
    if (c.status === 'sent') {
        await sql`update cotizaciones set status = 'viewed' where id = ${c.id}`;
    }
}

// ── ANALÍTICA (/app/analitica) ────────────────────────────────────────────────
// Agregados reales sobre cotizaciones + items. Aprovecha precio_unitario (lista)
// vs precio_negociado para el análisis de margen cedido.
export async function getAnalytics() {
    const orgId = await getActiveOrgId();

    // 1) Embudo + KPIs globales
    const [k] = await sql`
        select
            count(*) filter (where status in ('sent','viewed','approved','paid','invoiced')) as enviadas,
            count(*) filter (where status in ('viewed','approved','paid','invoiced')) as vistas,
            count(*) filter (where status in ('approved','paid','invoiced')) as aprobadas,
            count(*) filter (where status in ('paid','invoiced')) as pagadas,
            coalesce(sum(total) filter (where status in ('approved','paid','invoiced')),0) as cerrado_total,
            coalesce(avg(extract(epoch from (approved_at - created_at))/86400)
                     filter (where status in ('approved','paid','invoiced') and approved_at is not null),0) as dias_cierre
        from cotizaciones where org_id = ${orgId}`;

    // 2) Cotizado vs cerrado por mes (últimos 6)
    const meses = await sql`
        select to_char(date_trunc('month', created_at),'YYYY-MM') as ym,
               coalesce(sum(total),0) as cotizado,
               coalesce(sum(total) filter (where status in ('approved','paid','invoiced')),0) as cerrado
        from cotizaciones
        where org_id = ${orgId} and created_at >= date_trunc('month', now()) - interval '5 months'
        group by 1 order by 1`;

    // 3) Margen: precio de lista vs negociado (cotizaciones no-borrador)
    const [marg] = await sql`
        select coalesce(sum(it.precio_unitario * it.cantidad),0) as lista_total,
               coalesce(sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad),0) as nego_total
        from cotizacion_items it
        join cotizaciones c on c.id = it.cotizacion_id
        where c.org_id = ${orgId} and c.status <> 'draft'`;

    // 4) Top clientes por monto cerrado
    const clientes = await sql`
        select cl.empresa,
               coalesce(sum(c.total) filter (where c.status in ('approved','paid','invoiced')),0) as cerrado,
               count(*) as cotizaciones,
               count(*) filter (where c.status in ('approved','paid','invoiced')) as aprobadas
        from cotizaciones c join clientes cl on cl.id = c.cliente_id
        where c.org_id = ${orgId}
        group by cl.empresa
        order by cerrado desc, cotizaciones desc
        limit 6`;

    // 5) Top productos por importe cotizado
    const productos = await sql`
        select coalesce(p.nombre, it.descripcion) as nombre,
               coalesce(sum(it.cantidad),0) as cantidad,
               coalesce(sum(coalesce(it.precio_negociado, it.precio_unitario) * it.cantidad),0) as importe,
               count(distinct c.id) as cotizaciones
        from cotizacion_items it
        join cotizaciones c on c.id = it.cotizacion_id
        left join productos p on p.id = it.producto_id
        where c.org_id = ${orgId} and c.status <> 'draft'
        group by coalesce(p.nombre, it.descripcion)
        order by importe desc
        limit 6`;

    const enviadas = num(k.enviadas), aprobadas = num(k.aprobadas);
    const listaTotal = num(marg.lista_total), negoTotal = num(marg.nego_total);
    const cerradoN = aprobadas;

    return {
        funnel: {
            enviadas, vistas: num(k.vistas), aprobadas, pagadas: num(k.pagadas),
        },
        kpis: {
            cerradoTotal: num(k.cerrado_total),
            tasaCierre: enviadas ? Math.round((aprobadas / enviadas) * 100) : 0,
            ticketPromedio: cerradoN ? num(k.cerrado_total) / cerradoN : 0,
            diasCierre: Math.round(num(k.dias_cierre) * 10) / 10,
        },
        meses: meses.map(m => ({ ym: m.ym as string, cotizado: num(m.cotizado), cerrado: num(m.cerrado) })),
        margen: {
            listaTotal, negoTotal,
            cedido: Math.max(0, listaTotal - negoTotal),
            pct: listaTotal > 0 ? ((listaTotal - negoTotal) / listaTotal) * 100 : 0,
        },
        clientes: clientes.map(c => ({
            empresa: c.empresa as string,
            cerrado: num(c.cerrado),
            cotizaciones: num(c.cotizaciones),
            aprobadas: num(c.aprobadas),
            tasa: num(c.cotizaciones) ? Math.round((num(c.aprobadas) / num(c.cotizaciones)) * 100) : 0,
        })),
        productos: productos.map(p => ({
            nombre: p.nombre as string,
            cantidad: num(p.cantidad),
            importe: num(p.importe),
            cotizaciones: num(p.cotizaciones),
        })),
    };
}

// ── DASHBOARD KPIs ────────────────────────────────────────────────────────────
export async function getDashboard() {
    const quotes = await getCotizaciones();
    const porCerrar = quotes
        .filter(q => ['sent', 'viewed'].includes(q.status))
        .reduce((s, q) => s + (q.total ?? 0), 0);
    const cerradoMes = quotes
        .filter(q => ['approved', 'paid', 'invoiced'].includes(q.status))
        .reduce((s, q) => s + (q.total ?? 0), 0);
    const aprobadas = quotes.filter(q => ['approved', 'paid', 'invoiced'].includes(q.status)).length;
    const cerrables = quotes.filter(q => !['draft'].includes(q.status)).length;
    const tasaCierre = cerrables ? Math.round((aprobadas / cerrables) * 100) : 0;

    const eventos = await sql`
        select e.tipo, e.detalle, e.created_at, c.folio, c.id as cotizacion_id
        from eventos e join cotizaciones c on c.id = e.cotizacion_id
        where e.org_id = ${await getActiveOrgId()}
        order by e.created_at desc limit 7`;

    return {
        quotes,
        porCerrar, cerradoMes, tasaCierre,
        abiertas: quotes.filter(q => ['sent', 'viewed'].includes(q.status)).length,
        feed: eventos.map(e => ({
            tipo: e.tipo as string,
            detalle: e.detalle as string,
            cuando: fmtRelative(e.created_at as string),
            folio: e.folio as string,
            id: e.cotizacion_id as string,
        })),
    };
}
