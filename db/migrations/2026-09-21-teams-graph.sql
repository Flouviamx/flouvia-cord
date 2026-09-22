-- "Conectar con Microsoft": la persona autoriza con su cuenta de trabajo y elige
-- equipo y canal. Microsoft solo permite publicar en un canal a nombre de un
-- usuario, así que se guarda el token de esa persona, cifrado. La URL del flujo de
-- Power Automate (teams_webhook_url) sigue funcionando como alternativa.
alter table orgs add column if not exists teams_graph_access_enc text;
alter table orgs add column if not exists teams_graph_refresh_enc text;
alter table orgs add column if not exists teams_graph_expira timestamptz;
alter table orgs add column if not exists teams_graph_usuario text;
alter table orgs add column if not exists teams_graph_estado text;
alter table orgs add column if not exists teams_team_id text;
alter table orgs add column if not exists teams_team_nombre text;
alter table orgs add column if not exists teams_channel_id text;
alter table orgs add column if not exists teams_channel_nombre text;

alter table integracion_oauth_estados drop constraint if exists integracion_oauth_estados_proveedor_check;
alter table integracion_oauth_estados add constraint integracion_oauth_estados_proveedor_check
  check (proveedor in ('hubspot', 'mercadopago', 'slack', 'teams'));
