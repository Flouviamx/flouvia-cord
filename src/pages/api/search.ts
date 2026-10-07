// GET /api/search?q= — buscador global para el menú de comandos (Cmd+K).
// Devuelve cotizaciones (por folio o cliente), facturas (por folio o cliente),
// clientes y productos de la org. Cotizaciones y facturas llevan su contexto ya
// formateado (estado · monto en SU divisa) para distinguir "F-102 Acme" de otra.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../lib/db';
import { currentLocale } from '../../lib/context';
import { t } from '../../i18n/app';
import { moneyIn } from '../../lib/fmt-server';
import { normalizeCurrency } from '../../lib/currency';
import { getMyMembership } from '../../lib/queries';
import { memberCan } from '../../lib/permissions';

const QUOTE_STATUSES = ['draft', 'sent', 'viewed', 'approved', 'rejected', 'expired', 'paid', 'invoiced'];
const INVOICE_LIFECYCLES = ['draft', 'open', 'paid', 'void', 'uncollectible'];

export const GET: APIRoute = async ({ url }) => {
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2) return json({ cotizaciones: [], facturas: [], clientes: [], productos: [] });

    const L = currentLocale();
    const orgId = await getActiveOrgId();
    // Las facturas se ven con el permiso de Cobranza, igual que su lista: el
    // buscador no puede ser la puerta trasera para leer folios y clientes.
    const verFacturas = memberCan(await getMyMembership(), 'cobranza');
    const like = `%${q}%`;

    const [cots, clis, prods, facs] = await withOrgTx(orgId,
        sql`select c.id, c.folio, c.status, c.total, c.base_currency, coalesce(cl.empresa, '') as cliente
            from cotizaciones c left join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId} and (c.folio ilike ${like} or cl.empresa ilike ${like})
            order by c.created_at desc limit 6`,
        sql`select id, empresa from clientes
            where org_id = ${orgId} and (empresa ilike ${like} or rfc ilike ${like})
            order by empresa limit 6`,
        sql`select id, nombre, sku from productos
            where org_id = ${orgId} and (nombre ilike ${like} or sku ilike ${like})
            order by nombre limit 6`,
        sql`select d.id, d.invoice_number, d.lifecycle, d.total, d.currency, coalesce(cl.empresa, '') as cliente
            from documentos_fiscales d left join clientes cl on cl.id = d.cliente_id
            where d.org_id = ${orgId} and ${verFacturas}
              and d.credit_note_of is null
              and (d.invoice_number ilike ${like} or cl.empresa ilike ${like})
            order by d.created_at desc limit 6`,
    );

    const sinCliente = t(L, 'notif.sin_cliente');
    const context = (estado: string, total: unknown, currency: unknown) => {
        const n = Number(total);
        return Number.isFinite(n) ? `${estado} · ${moneyIn(n, normalizeCurrency(currency))}` : estado;
    };

    return json({
        cotizaciones: cots.map((c) => ({
            id: c.id, folio: c.folio, cliente: c.cliente || sinCliente, status: c.status,
            sub: context(
                QUOTE_STATUSES.includes(c.status) ? t(L, `cmdk.st.${c.status}` as any) : String(c.status),
                c.total, c.base_currency),
        })),
        facturas: facs.map((d) => ({
            id: d.id, folio: d.invoice_number || '—', cliente: d.cliente || sinCliente,
            sub: context(
                INVOICE_LIFECYCLES.includes(d.lifecycle) ? t(L, `cmdk.fac.${d.lifecycle}` as any) : String(d.lifecycle),
                d.total, d.currency),
        })),
        clientes: clis.map((c) => ({ id: c.id, empresa: c.empresa })),
        productos: prods.map((p) => ({ id: p.id, nombre: p.nombre, sku: (p.sku as string) ?? '' })),
    });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
