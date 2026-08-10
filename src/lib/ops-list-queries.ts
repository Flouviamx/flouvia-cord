import { sql } from './db';
import { OPS_PAGE_SIZE, opsPageOffset } from './ops-pagination';

export async function getOpsUsersPage(query: string, page: number) {
  return sql.query(`
    with page_users as (
      select u.id,u.email,u.first_name,u.last_name,u.created_at,u.email_verified_at,u.totp_enabled,
             u.locked_until,u.suspended_at,u.suspended_reason,
             count(*) over()::int total_count
      from users u
      where ($1='' or lower(u.email) like lower($2)
        or lower(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')) like lower($2))
      order by u.created_at desc,u.id desc
      limit $3 offset $4
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
    order by pu.created_at desc,pu.id desc`, [query, `%${query}%`, OPS_PAGE_SIZE, opsPageOffset(page)]);
}

export async function getOpsOrganizationsPage(query: string, page: number) {
  return sql.query(`
    with page_orgs as (
      select o.id,o.nombre,o.plan,o.country_code,o.created_at,o.subscription_status,
             o.stripe_charges_enabled,o.onboarded_at,o.owner_id,owner.email owner_email,
             count(*) over()::int total_count
      from orgs o left join users owner on owner.id=o.owner_id
      where ($1='' or lower(o.nombre) like lower($2) or lower(coalesce(owner.email,'')) like lower($2))
      order by o.created_at desc,o.id desc
      limit $3 offset $4
    ),
    member_stats as (
      select m.org_id,
             count(*) filter (where m.estado='activo')::int members,
             bool_or(lower(u.email) in ('andrevalleo13@gmail.com','hola@flouvia.com')) protected_member
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
    quote_stats as (
      select q.org_id,count(*)::int quotes,
             coalesce(sum(q.total) filter (where q.status in ('approved','paid','invoiced')),0) closed_value
      from cotizaciones q where q.org_id in (select id from page_orgs) group by q.org_id
    )
    select po.*,
           (lower(coalesce(po.owner_email,'')) in ('andrevalleo13@gmail.com','hola@flouvia.com')
             or coalesce(ms.protected_member,false)) protected,
           coalesce(ms.members,0) members,coalesce(cs.clients,0) clients,
           coalesce(ps.products,0) products,coalesce(qs.quotes,0) quotes,
           coalesce(qs.closed_value,0) closed_value
    from page_orgs po
    left join member_stats ms on ms.org_id=po.id
    left join client_stats cs on cs.org_id=po.id
    left join product_stats ps on ps.org_id=po.id
    left join quote_stats qs on qs.org_id=po.id
    order by po.created_at desc,po.id desc`, [query, `%${query}%`, OPS_PAGE_SIZE, opsPageOffset(page)]);
}
