import { INCLUDED } from './billing';
import { sql } from './db';
import { OPS_PAGE_SIZE, opsPageOffset } from './ops-pagination';
import type { PlanId } from './precios';

const planFor = (value: string): PlanId => Object.prototype.hasOwnProperty.call(INCLUDED, value) ? value as PlanId : 'free';

function quotaCase(dimension: 'ia' | 'api' | 'cfdi'): string {
  const branches = Object.entries(INCLUDED).map(([plan, limits]) => {
    const limit = limits[dimension];
    return `when '${plan}' then ${limit === null ? 'null' : Number(limit)}`;
  });
  return `(case coalesce(o.plan,'free') ${branches.join(' ')} else ${INCLUDED.free[dimension]} end)`;
}

export async function getOpsUsagePage(period: string, selectedOrg: string, query: string, page: number) {
  return sql.query(`
    with page_orgs as (
      select o.id,o.nombre,coalesce(o.plan,'free') plan,o.subscription_status,
             count(*) over()::int total_count
      from orgs o left join users owner on owner.id=o.owner_id
      where ($1='' or o.id=nullif($1,'')::uuid)
        and ($2='' or lower(o.nombre) like lower($3) or lower(coalesce(owner.email,'')) like lower($3))
      order by o.nombre,o.id
      limit $4 offset $5
    ),
    api_stats as (
      select r.org_id,count(*)::int api_24h,
             count(*) filter (where r.status>=400)::int api_errors_24h,
             coalesce(avg(r.duracion_ms),0)::int api_latency_24h
      from api_requests r where r.created_at>=now()-interval '24 hours'
        and r.org_id in (select id from page_orgs) group by r.org_id
    ),
    webhook_stats as (
      select w.org_id,count(*)::int webhook_24h,
             count(*) filter (where not w.ok)::int webhook_failures_24h
      from webhook_deliveries w where w.created_at>=now()-interval '24 hours'
        and w.org_id in (select id from page_orgs) group by w.org_id
    ),
    external_stats as (
      select e.org_id,
             coalesce(sum(e.units) filter (where e.provider='resend' and e.status='success'),0)::int emails_30d,
             coalesce(sum(e.input_tokens+e.output_tokens) filter (where e.provider='anthropic'),0)::bigint ai_tokens_30d,
             coalesce(sum(e.units) filter (where e.provider='anthropic' and e.status='success'),0)::int ai_calls_30d
      from external_usage_events e where e.created_at>=now()-interval '30 days'
        and e.org_id in (select id from page_orgs) group by e.org_id
    ),
    payment_stats as (
      select c.org_id,count(*)::int payments_30d,coalesce(sum(c.monto),0) payment_volume_30d
      from cotizacion_cobros c where c.paid_at>=now()-interval '30 days'
        and c.org_id in (select id from page_orgs) group by c.org_id
    )
    select po.*,coalesce(up.ia,0)::int ia,coalesce(up.cfdi,0)::int cfdi,
           coalesce(up.api,0)::int api,coalesce(up.usuarios,0)::int usuarios,
           coalesce(a.api_24h,0) api_24h,coalesce(a.api_errors_24h,0) api_errors_24h,
           coalesce(a.api_latency_24h,0) api_latency_24h,
           coalesce(w.webhook_24h,0) webhook_24h,coalesce(w.webhook_failures_24h,0) webhook_failures_24h,
           coalesce(e.emails_30d,0) emails_30d,coalesce(e.ai_tokens_30d,0) ai_tokens_30d,
           coalesce(e.ai_calls_30d,0) ai_calls_30d,coalesce(p.payments_30d,0) payments_30d,
           coalesce(p.payment_volume_30d,0) payment_volume_30d
    from page_orgs po
    left join uso_periodo up on up.org_id=po.id and up.periodo=$6
    left join api_stats a on a.org_id=po.id
    left join webhook_stats w on w.org_id=po.id
    left join external_stats e on e.org_id=po.id
    left join payment_stats p on p.org_id=po.id
    order by po.nombre,po.id`, [selectedOrg, query, `%${query}%`, OPS_PAGE_SIZE, opsPageOffset(page), period]);
}

export async function getOpsUsageAlerts(period: string, selectedOrg: string, query: string) {
  const iaLimit = quotaCase('ia');
  const apiLimit = quotaCase('api');
  const cfdiLimit = quotaCase('cfdi');
  return sql.query(`
    with api_stats as (
      select org_id,count(*)::int requests,count(*) filter (where status>=400)::int errors
      from api_requests where created_at>=now()-interval '24 hours' group by org_id
    ), webhook_stats as (
      select org_id,count(*)::int deliveries,count(*) filter (where not ok)::int failures
      from webhook_deliveries where created_at>=now()-interval '24 hours' group by org_id
    )
    select o.id,o.nombre,coalesce(o.plan,'free') plan,
           coalesce(up.ia,0)::int ia,coalesce(up.api,0)::int api,coalesce(up.cfdi,0)::int cfdi,
           coalesce(a.requests,0) api_24h,coalesce(a.errors,0) api_errors_24h,
           coalesce(w.deliveries,0) webhook_24h,coalesce(w.failures,0) webhook_failures_24h
    from orgs o
    left join users owner on owner.id=o.owner_id
    left join uso_periodo up on up.org_id=o.id and up.periodo=$1
    left join api_stats a on a.org_id=o.id
    left join webhook_stats w on w.org_id=o.id
    where ($2='' or o.id=nullif($2,'')::uuid)
      and ($3='' or lower(o.nombre) like lower($4) or lower(coalesce(owner.email,'')) like lower($4))
      and (
        (${iaLimit} is not null and coalesce(up.ia,0)>=greatest(1,${iaLimit}*.8))
        or (${apiLimit} is not null and coalesce(up.api,0)>=greatest(1,${apiLimit}*.8))
        or ((${cfdiLimit}=0 and coalesce(up.cfdi,0)>0) or (${cfdiLimit}>0 and coalesce(up.cfdi,0)>=${cfdiLimit}*.8))
        or (coalesce(a.requests,0)>=10 and coalesce(a.errors,0)::numeric/nullif(a.requests,0)>=.2)
        or (coalesce(w.deliveries,0)>=10 and coalesce(w.failures,0)::numeric/nullif(w.deliveries,0)>=.25)
      )
    order by greatest(
      case when ${iaLimit} is null or ${iaLimit}=0 then 0 else coalesce(up.ia,0)::numeric/${iaLimit} end,
      case when ${apiLimit} is null or ${apiLimit}=0 then 0 else coalesce(up.api,0)::numeric/${apiLimit} end,
      case when ${cfdiLimit}=0 then case when coalesce(up.cfdi,0)>0 then 1 else 0 end else coalesce(up.cfdi,0)::numeric/${cfdiLimit} end,
      case when coalesce(a.requests,0)>=10 then coalesce(a.errors,0)::numeric/nullif(a.requests,0) else 0 end,
      case when coalesce(w.deliveries,0)>=10 then coalesce(w.failures,0)::numeric/nullif(w.deliveries,0) else 0 end
    ) desc,o.created_at desc
    limit 50`, [period, selectedOrg, query, `%${query}%`]);
}

export async function getOpsUsageSummary(period: string, selectedOrg: string) {
  const [rows] = await Promise.all([
    sql.query(`
      select
        (select coalesce(sum(ia),0)::bigint from uso_periodo where periodo=$1 and ($2='' or org_id=nullif($2,'')::uuid)) ia,
        (select coalesce(sum(api),0)::bigint from uso_periodo where periodo=$1 and ($2='' or org_id=nullif($2,'')::uuid)) api,
        (select coalesce(sum(cfdi),0)::bigint from uso_periodo where periodo=$1 and ($2='' or org_id=nullif($2,'')::uuid)) cfdi,
        (select count(*)::bigint from api_requests where created_at>=now()-interval '24 hours' and ($2='' or org_id=nullif($2,'')::uuid)) api_24h,
        (select count(*)::bigint from webhook_deliveries where created_at>=now()-interval '24 hours' and ($2='' or org_id=nullif($2,'')::uuid)) webhook_24h,
        (select count(*)::bigint from webhook_deliveries where created_at>=now()-interval '24 hours' and not ok and ($2='' or org_id=nullif($2,'')::uuid)) webhook_failures_24h,
        (select count(*)::bigint from cotizacion_cobros where paid_at>=now()-interval '30 days' and ($2='' or org_id=nullif($2,'')::uuid)) payments_30d,
        (select coalesce(sum(monto),0) from cotizacion_cobros where paid_at>=now()-interval '30 days' and ($2='' or org_id=nullif($2,'')::uuid)) payment_volume_30d,
        pg_database_size(current_database())::bigint database_bytes`, [period, selectedOrg]),
  ]);
  return rows[0] || {};
}

export function usagePlan(value: string): PlanId {
  return planFor(value);
}
