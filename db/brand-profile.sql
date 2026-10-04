-- Additive, idempotent migration. Existing identities retain their current layout.
alter table orgs add column if not exists brand_profile jsonb not null default '{}'::jsonb;
