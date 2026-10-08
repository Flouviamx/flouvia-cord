import { sql, withOpsTx } from './db';
import { OPS_PAGE_SIZE, escapeLike, opsPageOffset } from './ops-pagination';
import type { OrgFilters, UserFilters } from './ops-filters';
import { OPS_ALLOWED_EMAILS } from './ops-auth';

// Las cláusulas se arman con fragmentos FIJOS de este archivo; los valores del
// operador viajan siempre como parámetros ($n). Los filtros ya llegan validados
// contra listas cerradas por ops-filters.ts.
type Clause = { where: string; params: unknown[] };

function orgClause(f: OrgFilters): Clause {
  const params: unknown[] = [];
  const parts: string[] = [];
  const p = (value: unknown) => { params.push(value); return `$${params.length}`; };
  if (f.q) { const v = p(`%${escapeLike(f.q)}%`); parts.push(`(lower(o.nombre) like lower(${v}) or lower(coalesce(owner.email,'')) like lower(${v}))`); }
  if (f.plan) parts.push(`coalesce(o.plan,'free') = ${p(f.plan)}`);
  if (f.country) parts.push(`o.country_code = ${p(f.country)}`);
  if (f.subscription === 'none') parts.push(`o.subscription_status is null`);
  else if (f.subscription) parts.push(`o.subscription_status = ${p(f.subscription)}`);
  if (f.charges === 'on') parts.push(`coalesce(o.stripe_charges_enabled,false)`);
  if (f.charges === 'off') parts.push(`not coalesce(o.stripe_charges_enabled,false)`);
  return { where: parts.length ? `where ${parts.join(' and ')}` : '', params };
}

const orgOrder = (sort: OrgFilters['sort'], a: string) =>
  sort === 'name' ? `lower(${a}.nombre) asc, ${a}.id asc`
  : sort === 'oldest' ? `${a}.created_at asc, ${a}.id asc`
  : `${a}.created_at desc, ${a}.id desc`;

function userClause(f: UserFilters): Clause {
  const params: unknown[] = [];
  const parts: string[] = [];
  const p = (value: unknown) => { params.push(value); return `$${params.length}`; };
  if (f.q) {
    const v = p(`%${escapeLike(f.q)}%`);
    parts.push(`(lower(u.email) like lower(${v}) or lower(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')) like lower(${v}))`);
  }
  if (f.state === 'active') parts.push(`u.suspended_at is null and (u.locked_until is null or u.locked_until <= now())`);
  if (f.state === 'suspended') parts.push(`u.suspended_at is not null`);
  if (f.state === 'locked') parts.push(`u.locked_until > now()`);
  if (f.state === 'unverified') parts.push(`u.email_verified_at is null`);
  const hasPasskey = `exists(select 1 from passkeys pk where pk.user_id = u.id)`;
  if (f.mfa === 'with') parts.push(`(u.totp_enabled or ${hasPasskey})`);
  if (f.mfa === 'without') parts.push(`(not coalesce(u.totp_enabled,false) and not ${hasPasskey})`);
  return { where: parts.length ? `where ${parts.join(' and ')}` : '', params };
}

const userOrder = (sort: UserFilters['sort'], a: string) =>
  sort === 'email' ? `lower(${a}.email) asc, ${a}.id asc`
  : sort === 'oldest' ? `${a}.created_at asc, ${a}.id asc`
  : `${a}.created_at desc, ${a}.id desc`;

function usersPageSql(f: UserFilters, limit: number, offset: number) {
  const c = userClause(f);
  const n = c.params.length;
  return sql.query(`
    with page_users as (
      select u.id,u.email,u.first_name,u.last_name,u.created_at,u.email_verified_at,u.totp_enabled,
             u.locked_until,u.suspended_at,u.suspended_reason
      from users u
      ${c.where}
      order by ${userOrder(f.sort, 'u')}
      limit $${n + 1} offset $${n + 2}
    ),
    passkey_stats as (
      select p.user_id,count(*)::int passkeys
      from passkeys p where p.user_id in (select id from page_users) group by p.user_id
    ),
    session_stats as (
      select s.user_id,
             count(*) filter (where s.revoked_at is null and s.expires_at>now())::int active_sessions,
             max(s.last_used_at) last_seen
      from sessions s where s.user_id in (select id from page_users) group by s.user_id
    ),
    membership_stats as (
      select m.user_id,count(*) filter (where m.estado='activo')::int organizations
      from org_members m where m.user_id in (select id from page_users) group by m.user_id
    )
    select pu.*,
           exists(select 1 from ops_operators oo where oo.user_id=pu.id and oo.active) is_operator,
           coalesce(ps.passkeys,0) passkeys,
           coalesce(ss.active_sessions,0) active_sessions,ss.last_seen,
           coalesce(ms.organizations,0) organizations
    from page_users pu
    left join passkey_stats ps on ps.user_id=pu.id
    left join session_stats ss on ss.user_id=pu.id
    left join membership_stats ms on ms.user_id=pu.id
    order by ${userOrder(f.sort, 'pu')}`, [...c.params, limit, offset]);
}

/** Totales del filtro completo, no de la página visible. */
function usersStatsSql(f: UserFilters) {
  const c = userClause(f);
  return sql.query(`
    select count(*)::int total,
           count(*) filter (where u.totp_enabled or exists(select 1 from passkeys pk where pk.user_id = u.id))::int with_mfa,
           count(*) filter (where u.email_verified_at is null)::int unverified,
           count(*) filter (where exists(select 1 from sessions s where s.user_id = u.id and s.last_used_at >= now() - interval '24 hours'))::int active_24h
    from users u ${c.where}`, c.params);
}

export async function getOpsUsersPage(filters: UserFilters, page: number) {
  const [rows, stats] = await withOpsTx(
    usersPageSql(filters, OPS_PAGE_SIZE, opsPageOffset(page)),
    usersStatsSql(filters),
  );
  return { rows, stats: (stats[0] || {}) as Record<string, number> };
}

function orgsPageSql(f: OrgFilters, limit: number, offset: number) {
  const c = orgClause(f);
  const n = c.params.length;
  return sql.query(`
    with page_orgs as (
      select o.id,o.nombre,o.plan,o.country_code,o.moneda,o.created_at,o.subscription_status,
             o.stripe_charges_enabled,o.onboarded_at,o.owner_id,owner.email owner_email
      from orgs o left join users owner on owner.id=o.owner_id
      ${c.where}
      order by ${orgOrder(f.sort, 'o')}
      limit $${n + 1} offset $${n + 2}
    ),
    member_stats as (
      select m.org_id,
             count(*) filter (where m.estado='activo')::int members,
             bool_or(lower(u.email) = any($${n + 3}::text[])) protected_member
      from org_members m left join users u on u.id=m.user_id
      where m.org_id in (select id from page_orgs) group by m.org_id
    ),
    client_stats as (
      select c.org_id,count(*)::int clients from clientes c
      where c.org_id in (select id from page_orgs) group by c.org_id
    ),
    product_stats as (
      select p.org_id,count(*)::int products from productos p
      where p.org_id in (select id from page_orgs) group by p.org_id
    ),
    -- El cierre se suma solo en la divisa de la organización (regla 21): una
    -- cotización en USD no se mezcla con las de MXN en un mismo número.
    quote_stats as (
      select q.org_id,count(*)::int quotes,
             count(*) filter (where q.created_at>=now()-interval '30 days')::int quotes_30d,
             coalesce(sum(q.total) filter (where q.status in ('approved','paid','invoiced')
               and coalesce(q.moneda,po.moneda)=po.moneda),0) closed_value,
             max(q.created_at) last_quote
      from cotizaciones q join page_orgs po on po.id=q.org_id group by q.org_id
    ),
    activity_stats as (
      select e.org_id,max(e.created_at) last_event,
             count(*) filter (where e.created_at>=now()-interval '7 days')::int events_7d
      from domain_events e where e.org_id in (select id from page_orgs) group by e.org_id
    )
    select po.*,
           (lower(coalesce(po.owner_email,'')) = any($${n + 3}::text[])
             or coalesce(ms.protected_member,false)) protected,
           coalesce(ms.members,0) members,coalesce(cs.clients,0) clients,
           coalesce(ps.products,0) products,coalesce(qs.quotes,0) quotes,
           coalesce(qs.closed_value,0) closed_value,coalesce(qs.quotes_30d,0) quotes_30d,
           act.last_event,coalesce(act.events_7d,0) events_7d
    from page_orgs po
    left join member_stats ms on ms.org_id=po.id
    left join client_stats cs on cs.org_id=po.id
    left join product_stats ps on ps.org_id=po.id
    left join quote_stats qs on qs.org_id=po.id
    left join activity_stats act on act.org_id=po.id
    order by ${orgOrder(f.sort, 'po')}`,
    [...c.params, limit, offset, [...OPS_ALLOWED_EMAILS]]);
}

/** Totales del filtro completo, no de la página visible. */
function orgsStatsSql(f: OrgFilters) {
  const c = orgClause(f);
  return sql.query(`
    with filtered as (
      select o.id, o.stripe_charges_enabled from orgs o left join users owner on owner.id=o.owner_id ${c.where}
    )
    select (select count(*)::int from filtered) total,
           (select count(*)::int from filtered where coalesce(stripe_charges_enabled,false)) charges,
           (select count(distinct e.org_id)::int from domain_events e
             where e.created_at >= now() - interval '7 days' and e.org_id in (select id from filtered)) active_7d`, c.params);
}

export async function getOpsOrganizationsPage(filters: OrgFilters, page: number) {
  const [rows, stats] = await withOpsTx(
    orgsPageSql(filters, OPS_PAGE_SIZE, opsPageOffset(page)),
    orgsStatsSql(filters),
  );
  return { rows, stats: (stats[0] || {}) as Record<string, number> };
}

/** Tope de filas de una exportación: una hoja, no un respaldo de la base. */
export const OPS_EXPORT_LIMIT = 10_000;

// Se pide una fila de más: si llega, la exportación quedó recortada y se dice.
export const opsOrganizationsExportSql = (filters: OrgFilters) => orgsPageSql(filters, OPS_EXPORT_LIMIT + 1, 0);
export const opsUsersExportSql = (filters: UserFilters) => usersPageSql(filters, OPS_EXPORT_LIMIT + 1, 0);
