-- BEGIN cli-listen
-- Sesión de `cord listen`: un endpoint efímero de la sandbox cuyos eventos no
-- salen por HTTP (Cord no puede llegar a localhost); el CLI los recoge firmados.
alter table webhooks add column if not exists cli_hasta timestamptz;
create index if not exists idx_webhooks_cli on webhooks(cli_hasta) where cli_hasta is not null;
-- END cli-listen
