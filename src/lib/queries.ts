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
        nombre: o.nombre as string,
        inicial: initials(o.nombre),
        rfc: (o.rfc as string) ?? '',
        razonSocial: (o.razon_social as string) ?? '',
        email: '',
        plan: PLAN_LABEL[o.plan] ?? 'Gratis',
        prefix: o.quote_prefix as string,
        moneda: o.moneda as string,
        ivaPct: num(o.iva_pct),
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
               o.nombre as org_nombre, o.rfc as org_rfc
        from cotizaciones c
        left join clientes cl on cl.id = c.cliente_id
        join orgs o on o.id = c.org_id
        where c.public_token = ${token}`;
    if (!rows.length) return null;
    const items = await sql`select * from cotizacion_items where cotizacion_id = ${rows[0].id} order by orden`;
    const quote = rowToQuote(rows[0], items, []);
    return {
        quote,
        org: { nombre: rows[0].org_nombre as string, inicial: initials(rows[0].org_nombre), rfc: (rows[0].org_rfc as string) ?? '' },
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
