-- BEGIN webhooks-api-owner
alter table webhooks add column if not exists created_by_key uuid references api_keys(id) on delete set null;
create index if not exists idx_webhooks_org_key on webhooks(org_id, created_by_key) where created_by_key is not null;
-- END webhooks-api-owner
