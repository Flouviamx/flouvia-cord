import { neon } from '@neondatabase/serverless';

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL no configurada');
const sql = neon(dbUrl);

await sql.query(`
  create table if not exists build_positions (
    position_id text primary key check (position_id ~ '^([0][1-9]|10)$'),
    tier text not null,
    amount_cents int not null check (amount_cents > 0),
    currency text not null default 'mxn' check (currency = 'mxn'),
    status text not null default 'available' check (status in ('available','reserved','paid')),
    request_id uuid unique,
    hold_token uuid unique,
    hold_expires_at timestamptz,
    stripe_payment_intent_id text unique,
    paid_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )
`);

// Estas columnas deben existir ANTES del seed: tras la primera migración ya
// son NOT NULL, y PostgreSQL valida la fila propuesta incluso en ON CONFLICT.
await sql.query("alter table build_positions add column if not exists auction_status text not null default 'open'");
await sql.query('alter table build_positions add column if not exists starting_offer_cents int');
await sql.query('alter table build_positions add column if not exists min_increment_cents int');
await sql.query('alter table build_positions add column if not exists bid_deposit_cents int');
await sql.query('alter table build_positions add column if not exists current_offer_cents int');
await sql.query('alter table build_positions add column if not exists current_bid_id uuid');
await sql.query('alter table build_positions add column if not exists current_brand_name text');
await sql.query('alter table build_positions add column if not exists current_logo_url text');
await sql.query('alter table build_positions add column if not exists current_website_url text');
await sql.query('alter table build_positions add column if not exists bid_count int not null default 0');

await sql.query(`
  insert into build_positions (position_id, tier, amount_cents, starting_offer_cents, min_increment_cents, bid_deposit_cents) values
    ('01', 'Presenting Partner', 5000000, 5000000, 250000, 500000),
    ('02', 'Flow Partner', 2000000, 2000000, 100000, 200000),
    ('03', 'Flow Partner', 2000000, 2000000, 100000, 200000),
    ('04', 'Flow Partner', 2000000, 2000000, 100000, 200000),
    ('05', 'Flow Partner', 750000, 750000, 50000, 100000),
    ('06', 'Founding Partner', 750000, 750000, 50000, 100000),
    ('07', 'Founding Partner', 750000, 750000, 50000, 100000),
    ('08', 'Founding Partner', 750000, 750000, 50000, 100000),
    ('09', 'Founding Partner', 750000, 750000, 50000, 100000),
    ('10', 'Founding Partner', 750000, 750000, 50000, 100000)
  on conflict (position_id) do update
  set tier = excluded.tier, amount_cents = excluded.amount_cents, updated_at = now()
`);

await sql.query('create index if not exists idx_build_positions_status on build_positions(status, hold_expires_at)');
await sql.query(`
  create table if not exists build_auction (
    id text primary key default 'cord-flow-2026',
    status text not null default 'live' check (status in ('draft','live','closed','cancelled')),
    starts_at timestamptz not null default now(),
    ends_at timestamptz not null default (now() + interval '7 days'),
    hard_ends_at timestamptz not null default (now() + interval '14 days'),
    anti_snipe_minutes int not null default 10 check (anti_snipe_minutes between 0 and 60),
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    check (ends_at > starts_at), check (hard_ends_at >= ends_at)
  )
`);
await sql.query("insert into build_auction (id) values ('cord-flow-2026') on conflict (id) do nothing");
await sql.query('alter table build_auction drop column if exists deposit_percent');
await sql.query("alter table build_positions add column if not exists auction_status text not null default 'open'");
await sql.query('alter table build_positions add column if not exists starting_offer_cents int');
await sql.query('alter table build_positions add column if not exists min_increment_cents int');
await sql.query('alter table build_positions add column if not exists bid_deposit_cents int');
await sql.query('alter table build_positions add column if not exists current_offer_cents int');
await sql.query('alter table build_positions add column if not exists current_bid_id uuid');
await sql.query('alter table build_positions add column if not exists current_brand_name text');
await sql.query('alter table build_positions add column if not exists current_logo_url text');
await sql.query('alter table build_positions add column if not exists current_website_url text');
await sql.query('alter table build_positions add column if not exists bid_count int not null default 0');
await sql.query(`update build_positions set
    starting_offer_cents = coalesce(starting_offer_cents, amount_cents),
    min_increment_cents = coalesce(min_increment_cents, case when position_id = '01' then 250000 when position_id in ('02','03','04') then 100000 else 50000 end),
    bid_deposit_cents = coalesce(bid_deposit_cents, case when position_id = '01' then 500000 when position_id in ('02','03','04') then 200000 else 100000 end),
    auction_status = case when status = 'paid' then 'closed' else auction_status end`);
await sql.query('alter table build_positions alter column starting_offer_cents set not null');
await sql.query('alter table build_positions alter column min_increment_cents set not null');
await sql.query('alter table build_positions alter column bid_deposit_cents set not null');
await sql.query('alter table build_positions drop constraint if exists build_positions_auction_status_check');
await sql.query("alter table build_positions add constraint build_positions_auction_status_check check (auction_status in ('open','closed','paused'))");
await sql.query('alter table build_positions drop constraint if exists build_positions_starting_offer_check');
await sql.query('alter table build_positions add constraint build_positions_starting_offer_check check (starting_offer_cents > 0)');
await sql.query('alter table build_positions drop constraint if exists build_positions_min_increment_check');
await sql.query('alter table build_positions add constraint build_positions_min_increment_check check (min_increment_cents > 0)');
await sql.query('alter table build_positions drop constraint if exists build_positions_bid_deposit_check');
await sql.query('alter table build_positions add constraint build_positions_bid_deposit_check check (bid_deposit_cents > 0)');
await sql.query(`
  create table if not exists build_bids (
    id uuid primary key, auction_id text not null references build_auction(id),
    position_id text not null references build_positions(position_id), request_id uuid not null unique,
    brand_name text not null check (char_length(brand_name) between 2 and 80), contact_email text not null,
    website_url text, logo_url text, offer_amount_cents int not null check (offer_amount_cents > 0),
    deposit_amount_cents int not null check (deposit_amount_cents > 0), currency text not null default 'mxn' check (currency = 'mxn'),
    status text not null default 'pending' check (status in ('pending','leading','outbid_refunding','outbid','stale_refunding','stale','won','failed','rejected_refunding','rejected')),
    stripe_payment_intent_id text unique, stripe_refund_id text unique,
    balance_payment_intent_id text unique, balance_paid_at timestamptz,
    moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected')),
    terms_version text not null default 'cord-flow-2026-08-29', terms_accepted_at timestamptz not null default now(),
    confirmed_at timestamptz, outbid_at timestamptz, refunded_at timestamptz,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  )
`);
await sql.query("alter table build_bids add column if not exists terms_version text not null default 'cord-flow-2026-08-29'");
await sql.query('alter table build_bids add column if not exists terms_accepted_at timestamptz not null default now()');
await sql.query('alter table build_bids add column if not exists logo_url text');
await sql.query('alter table build_bids add column if not exists balance_payment_intent_id text');
await sql.query('alter table build_bids add column if not exists balance_paid_at timestamptz');
await sql.query('create unique index if not exists idx_build_bids_balance_intent on build_bids(balance_payment_intent_id) where balance_payment_intent_id is not null');
await sql.query('create index if not exists idx_build_bids_position_history on build_bids(position_id, created_at desc)');
await sql.query("create index if not exists idx_build_bids_public_history on build_bids(created_at desc) where status in ('leading','outbid_refunding','outbid','won')");
await sql.query(`
  create or replace function cord_settle_build_bid(p_bid_id uuid, p_payment_intent_id text, p_paid_amount int, p_currency text)
  returns table(outcome text, refund_bid_id uuid, refund_payment_intent_id text) language plpgsql as $$
  declare v_bid build_bids%rowtype; v_pos build_positions%rowtype; v_auction build_auction%rowtype; v_minimum int; v_previous build_bids%rowtype;
  begin
    select * into v_bid from build_bids where id = p_bid_id for update;
    if not found then raise exception 'build bid not found'; end if;
    if v_bid.stripe_payment_intent_id is distinct from p_payment_intent_id or v_bid.deposit_amount_cents <> p_paid_amount or v_bid.currency <> lower(p_currency) then raise exception 'build bid payment mismatch'; end if;
    if v_bid.status in ('leading','won') then return query select 'accepted'::text,null::uuid,null::text; return;
    elsif v_bid.status in ('stale_refunding','stale','rejected_refunding','rejected') then return query select 'stale'::text,v_bid.id,v_bid.stripe_payment_intent_id; return;
    elsif v_bid.status not in ('pending','failed') then return query select 'ignored'::text,null::uuid,null::text; return; end if;
    select * into v_auction from build_auction where id=v_bid.auction_id for update;
    select * into v_pos from build_positions where position_id=v_bid.position_id for update;
    if v_auction.status <> 'live' or v_pos.auction_status <> 'open' or now() > v_auction.ends_at + interval '15 minutes' then
      update build_bids set status='stale_refunding',confirmed_at=now(),updated_at=now() where id=v_bid.id;
      return query select 'stale'::text,v_bid.id,v_bid.stripe_payment_intent_id; return;
    end if;
    v_minimum := case when v_pos.current_bid_id is null then v_pos.starting_offer_cents else v_pos.current_offer_cents+v_pos.min_increment_cents end;
    if v_bid.offer_amount_cents < v_minimum then update build_bids set status='stale_refunding',confirmed_at=now(),updated_at=now() where id=v_bid.id; return query select 'stale'::text,v_bid.id,v_bid.stripe_payment_intent_id; return; end if;
    if v_pos.current_bid_id is not null then select * into v_previous from build_bids where id=v_pos.current_bid_id for update; update build_bids set status='outbid_refunding',outbid_at=now(),updated_at=now() where id=v_previous.id and status='leading'; end if;
    update build_bids set status='leading',confirmed_at=coalesce(confirmed_at,now()),updated_at=now() where id=v_bid.id;
    update build_positions set current_bid_id=v_bid.id,current_offer_cents=v_bid.offer_amount_cents,current_brand_name=v_bid.brand_name,current_logo_url=v_bid.logo_url,current_website_url=v_bid.website_url,bid_count=bid_count+1,updated_at=now() where position_id=v_bid.position_id;
    if v_auction.ends_at-now() <= make_interval(mins=>v_auction.anti_snipe_minutes) and v_auction.ends_at<v_auction.hard_ends_at then update build_auction set ends_at=least(hard_ends_at,now()+make_interval(mins=>anti_snipe_minutes)),updated_at=now() where id=v_auction.id; end if;
    return query select 'accepted'::text,case when v_previous.id is null then null else v_previous.id end,case when v_previous.id is null then null else v_previous.stripe_payment_intent_id end;
  end $$;
`);
await sql.query('revoke all on function cord_settle_build_bid(uuid,text,int,text) from public');
await sql.query(`
  create table if not exists build_scale_entitlements (
    id uuid primary key default gen_random_uuid(), bid_id uuid not null unique references build_bids(id) on delete restrict,
    contact_email text not null, org_id uuid references orgs(id) on delete restrict,
    plan text not null default 'scale' check (plan = 'scale'), duration_months int not null default 6 check (duration_months = 6),
    status text not null default 'pending' check (status in ('pending','active','expired','revoked')),
    starts_at timestamptz, expires_at timestamptz, activated_at timestamptz,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    check ((status = 'active' and org_id is not null and starts_at is not null and expires_at is not null) or status <> 'active')
  )
`);
await sql.query("create index if not exists idx_build_scale_entitlements_org on build_scale_entitlements(org_id, expires_at) where status = 'active'");
await sql.query('alter table build_scale_entitlements enable row level security');
await sql.query('alter table build_scale_entitlements no force row level security');
await sql.query('revoke all on table build_scale_entitlements from public');
await sql.query(`
  create or replace function cord_settle_build_balance(p_bid_id uuid, p_payment_intent_id text, p_paid_amount int, p_currency text)
  returns text language plpgsql as $$
  declare v_bid build_bids%rowtype; v_pos build_positions%rowtype; v_auction build_auction%rowtype; v_expected int;
  begin
    select * into v_bid from build_bids where id=p_bid_id for update;
    if not found then raise exception 'build winning bid not found'; end if;
    select * into v_auction from build_auction where id=v_bid.auction_id for update;
    select * into v_pos from build_positions where position_id=v_bid.position_id for update;
    v_expected := v_bid.offer_amount_cents-v_bid.deposit_amount_cents;
    if v_bid.balance_payment_intent_id is distinct from p_payment_intent_id or v_expected<>p_paid_amount or v_bid.currency<>lower(p_currency) then raise exception 'build balance payment mismatch'; end if;
    if v_bid.status='won' then return 'accepted'; end if;
    if v_auction.status<>'closed' or v_bid.status<>'leading' or v_pos.current_bid_id is distinct from v_bid.id then raise exception 'build bid is not the closed auction winner'; end if;
    update build_bids set status='won',balance_paid_at=now(),updated_at=now() where id=v_bid.id;
    update build_positions set status='paid',auction_status='closed',paid_at=now(),updated_at=now() where position_id=v_bid.position_id and current_bid_id=v_bid.id;
    insert into build_scale_entitlements(bid_id,contact_email) values(v_bid.id,lower(v_bid.contact_email)) on conflict(bid_id) do nothing;
    return 'accepted';
  end $$;
`);
await sql.query(`
  create or replace function cord_activate_build_scale(p_bid_id uuid,p_org_id uuid)
  returns table(starts_at timestamptz,expires_at timestamptz) language plpgsql volatile security definer set search_path=public,pg_temp as $$
  declare v_entitlement build_scale_entitlements%rowtype; v_now timestamptz:=now();
  begin
    select * into v_entitlement from build_scale_entitlements where bid_id=p_bid_id for update;
    if not found then raise exception 'build scale entitlement not found'; end if;
    if v_entitlement.status='active' then return query select v_entitlement.starts_at,v_entitlement.expires_at; return; end if;
    if v_entitlement.status<>'pending' then raise exception 'build scale entitlement unavailable'; end if;
    if not exists(select 1 from users u left join org_members m on m.user_id=u.id and m.org_id=p_org_id and m.estado='activo' join orgs o on o.id=p_org_id where lower(u.email)=lower(v_entitlement.contact_email) and (o.owner_id=u.id or m.user_id is not null)) then raise exception 'build entitlement email does not belong to organization'; end if;
    update build_scale_entitlements set org_id=p_org_id,status='active',starts_at=v_now,expires_at=v_now+interval '6 months',activated_at=v_now,updated_at=v_now where id=v_entitlement.id returning build_scale_entitlements.starts_at,build_scale_entitlements.expires_at into starts_at,expires_at;
    return next;
  end $$;
`);
await sql.query('revoke all on function cord_settle_build_balance(uuid,text,int,text) from public');
await sql.query('revoke all on function cord_activate_build_scale(uuid,uuid) from public');
await sql.query(`
  create or replace function cord_effective_plan(p_org uuid)
  returns text language sql stable security definer set search_path=public,pg_temp as $$
    with requested as (select coalesce(sandbox_of,id) as billing_org_id from orgs where id=p_org),
    billing as (
      select r.billing_org_id,
        case when lower(coalesce(o.plan,'free')) in ('business','negocio') then 'pro' when lower(coalesce(o.plan,'free')) in ('free','starter','pro','scale','developer') then lower(coalesce(o.plan,'free')) else 'free' end as stored_plan,
        o.subscription_status,o.current_period_end,o.billing_paid_through,
        case when lower(coalesce(o.billing_paid_plan,'free')) in ('business','negocio') then 'pro' when lower(coalesce(o.billing_paid_plan,'free')) in ('free','starter','pro','scale','developer') then lower(coalesce(o.billing_paid_plan,'free')) else 'free' end as paid_plan,
        o.stripe_subscription_id,o.stripe_customer_id
      from requested r join orgs o on o.id=r.billing_org_id
    ), access as (
      select billing_org_id,case when stored_plan<>'free' and subscription_status='active' and current_period_end is not null and current_period_end>now() and billing_paid_through is not null and billing_paid_through>=current_period_end and (case paid_plan when 'developer' then 4 when 'scale' then 3 when 'pro' then 2 when 'starter' then 1 else 0 end)>=(case stored_plan when 'developer' then 4 when 'scale' then 3 when 'pro' then 2 when 'starter' then 1 else 0 end) and stripe_subscription_id is not null and stripe_customer_id is not null then stored_plan else 'free' end as paid_access from billing
    ), effective as (
      select paid_access,case when exists(select 1 from build_scale_entitlements e where e.org_id=access.billing_org_id and e.status='active' and e.starts_at<=now() and e.expires_at>now()) then 'scale' else 'free' end as promo_access from access
    )
    select case when (case paid_access when 'developer' then 4 when 'scale' then 3 when 'pro' then 2 when 'starter' then 1 else 0 end)>=(case promo_access when 'developer' then 4 when 'scale' then 3 when 'pro' then 2 when 'starter' then 1 else 0 end) then paid_access else promo_access end from effective
  $$;
`);
await sql.query('revoke all on function cord_effective_plan(uuid) from public');
const rows = await sql`select count(*)::int as total from build_positions`;
process.stdout.write(`build_positions=${rows[0].total}\n`);
