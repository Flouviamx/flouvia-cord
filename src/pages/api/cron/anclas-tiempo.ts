// /api/cron/anclas-tiempo — emite los eventos de TIEMPO RELATIVO que los
// workflows necesitan para adelantarse a una fecha: "3 días antes de que venza
// la factura", "una semana antes de que caduque la cotización".
//
// Sin esto, un workflow solo podía reaccionar a algo que YA pasó
// (`quote.expired`, `invoice.overdue`) o esperar N días DESPUÉS de un evento
// (paso de espera). Lo de antes del vencimiento no era expresable: la fecha
// límite no es un evento, es un dato que se acerca.
//
// Forma del contrato: el evento se emite UNA VEZ AL DÍA por documento vivo y
// lleva la distancia en días (`dias_para_vencer` / `dias_vencida`). El día
// exacto lo elige el autor con una condición normal del editor, en vez de que
// Cord invente una cadencia fija. Solo se emite para organizaciones que tienen
// un workflow ACTIVO escuchando ese disparador: si nadie escucha, la tabla de
// eventos no se llena de avisos que nadie lee.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, withOrgTx, withSystemTx } from '../../../lib/db';
import { reqContext } from '../../../lib/context';
import { recordDomainEvent } from '../../../lib/domain-events';
import { log } from '../../../lib/log';

const MAX_ORGS = 200;
const MAX_DOCS = 200;
/** Ventanas que se anuncian. Más allá el aviso deja de ser accionable. */
const QUOTE_DAYS_AHEAD = 30;
const INVOICE_DAYS_AHEAD = 30;
const INVOICE_DAYS_PAST = 90;

const ANCHORS = ['quote.expiring', 'invoice.due_soon', 'invoice.past_due'] as const;
type Anchor = typeof ANCHORS[number];

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    // Barrido cross-org: solo descubre a quién escuchar (regla 30). El trabajo
    // por organización vuelve a withOrgTx con su propio org_id.
    const escuchan = await reqContext.run({ userId: null, cronScope: true }, async () => {
        const [rows] = await withSystemTx(sql`
            select w.org_id, w.trigger_publicado as trigger
              from workflows w
              join orgs o on o.id = w.org_id
             where w.estado = 'active'
               and w.trigger_publicado = any(${[...ANCHORS]}::text[])
               and o.sandbox_of is null
               and o.owner_id::text <> '00000000-0000-0000-0000-000000000000'
             group by w.org_id, w.trigger_publicado
             limit ${MAX_ORGS * ANCHORS.length}`);
        return rows.map((r) => ({ orgId: String(r.org_id), trigger: String(r.trigger) as Anchor }));
    });

    const porOrg = new Map<string, Set<Anchor>>();
    for (const row of escuchan) {
        if (!porOrg.has(row.orgId)) porOrg.set(row.orgId, new Set());
        porOrg.get(row.orgId)!.add(row.trigger);
    }

    let emitidos = 0;
    for (const [orgId, triggers] of porOrg) {
        emitidos += await reqContext.run({ userId: null, orgId }, async () => {
            let n = 0;
            try {
                if (triggers.has('quote.expiring')) n += await emitQuoteExpiring(orgId);
                if (triggers.has('invoice.due_soon')) n += await emitInvoice(orgId, 'invoice.due_soon');
                if (triggers.has('invoice.past_due')) n += await emitInvoice(orgId, 'invoice.past_due');
            } catch (err) {
                log.error('no se pudieron emitir las anclas de tiempo', { route: 'cron/anclas-tiempo', orgId, err });
            }
            return n;
        });
    }

    return new Response(JSON.stringify({ ok: true, organizaciones: porOrg.size, eventos: emitidos }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
    });
};

/**
 * La dedup es del DÍA, no del cron: `not exists` contra las últimas 20 horas.
 * Si el cron corre dos veces (reintento de la plataforma, disparo manual), el
 * documento no vuelve a anunciarse; si un día no corre, mañana se retoma con la
 * distancia actualizada en vez de perderse.
 */
async function emitQuoteExpiring(orgId: string): Promise<number> {
    const [rows] = await withOrgTx(orgId, sql`
        select c.id, c.folio, c.total, c.base_currency, c.status, c.vigencia,
               (c.vigencia - current_date) as dias, cl.empresa
          from cotizaciones c
          left join clientes cl on cl.id = c.cliente_id and cl.org_id = c.org_id
         where c.org_id = ${orgId}
           and c.status in ('sent', 'viewed')
           and c.vigencia is not null
           and (c.vigencia - current_date) between 1 and ${QUOTE_DAYS_AHEAD}
           and not exists (
             select 1 from domain_events e
              where e.org_id = c.org_id and e.type = 'quote.expiring'
                and e.object_id = c.id and e.created_at > now() - interval '20 hours')
         order by c.vigencia
         limit ${MAX_DOCS}`);

    let n = 0;
    for (const r of rows) {
        const id = await recordDomainEvent(orgId, 'quote.expiring', {
            id: r.id,
            folio: r.folio,
            cliente: r.empresa ?? null,
            total: Number(r.total ?? 0),
            moneda: (r.base_currency as string) || null,
            status: r.status,
            dias_para_vencer: Number(r.dias),
            vence: String(r.vigencia).slice(0, 10),
        }, 'system');
        if (id) n++;
    }
    return n;
}

async function emitInvoice(orgId: string, type: 'invoice.due_soon' | 'invoice.past_due'): Promise<number> {
    const soon = type === 'invoice.due_soon';
    const [rows] = await withOrgTx(orgId, sql`
        select d.id, d.invoice_number, d.total, d.amount_remaining, d.currency, d.country_code,
               d.lifecycle, d.due_date, (d.due_date - current_date) as dias,
               coalesce(cl.empresa, cq.empresa) as empresa
          from documentos_fiscales d
          left join clientes cl on cl.id = d.cliente_id and cl.org_id = d.org_id
          left join cotizaciones c on c.id = d.cotizacion_id and c.org_id = d.org_id
          left join clientes cq on cq.id = c.cliente_id and cq.org_id = c.org_id
         where d.org_id = ${orgId}
           and d.lifecycle = 'open'
           and d.due_date is not null
           and d.amount_remaining > 0
           and ((${soon}::boolean and (d.due_date - current_date) between 1 and ${INVOICE_DAYS_AHEAD})
                or (not ${soon}::boolean and (current_date - d.due_date) between 1 and ${INVOICE_DAYS_PAST}))
           and not exists (
             select 1 from domain_events e
              where e.org_id = d.org_id and e.type = ${type}
                and e.object_id = d.id and e.created_at > now() - interval '20 hours')
         order by d.due_date
         limit ${MAX_DOCS}`);

    let n = 0;
    for (const r of rows) {
        const dias = Number(r.dias);
        const id = await recordDomainEvent(orgId, type, {
            id: r.id,
            numero: r.invoice_number ?? null,
            cliente: r.empresa ?? null,
            total: Number(r.total ?? 0),
            saldo: Number(r.amount_remaining ?? 0),
            moneda: (r.currency as string) || null,
            pais: r.country_code ?? null,
            estado: r.lifecycle,
            vence: String(r.due_date).slice(0, 10),
            ...(soon ? { dias_para_vencer: dias } : { dias_vencida: -dias }),
        }, 'system');
        if (id) n++;
    }
    return n;
}
