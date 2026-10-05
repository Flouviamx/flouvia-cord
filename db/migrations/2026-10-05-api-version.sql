-- BEGIN api-version
-- Versión de la API fijada al crear cada llave y cada endpoint de webhook
-- (src/lib/api-versions.ts). null = la versión base, 2026-10-01.
alter table api_keys add column if not exists api_version text;
alter table webhooks add column if not exists api_version text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'api_keys_api_version_format') then
    alter table api_keys add constraint api_keys_api_version_format check (api_version is null or api_version ~ '^\d{4}-\d{2}-\d{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'webhooks_api_version_format') then
    alter table webhooks add constraint webhooks_api_version_format check (api_version is null or api_version ~ '^\d{4}-\d{2}-\d{2}$');
  end if;
end $$;
-- END api-version
