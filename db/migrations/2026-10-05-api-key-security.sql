-- BEGIN api-key-security
-- Llaves restringidas (rk_), IPs permitidas, vencimiento y rotación con gracia
-- (src/lib/api-key-policy.ts). permissions = { recurso: none|read|write };
-- null = llave secreta completa. replaced_by marca la llave vieja de una
-- rotación: sigue viva hasta expires_at pero ya no cuenta contra el límite.
alter table api_keys add column if not exists permissions jsonb;
alter table api_keys add column if not exists allowed_ips text[];
alter table api_keys add column if not exists replaced_by uuid references api_keys(id) on delete set null;
create unique index if not exists uq_api_keys_hash on api_keys(hash);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'api_keys_restricted_secret') then
    alter table api_keys add constraint api_keys_restricted_secret check ((permissions is null and allowed_ips is null) or type = 'secret');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'api_keys_permissions_object') then
    alter table api_keys add constraint api_keys_permissions_object check (permissions is null or jsonb_typeof(permissions) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'api_keys_allowed_ips_size') then
    alter table api_keys add constraint api_keys_allowed_ips_size check (allowed_ips is null or cardinality(allowed_ips) between 1 and 20);
  end if;
end $$;
-- END api-key-security
