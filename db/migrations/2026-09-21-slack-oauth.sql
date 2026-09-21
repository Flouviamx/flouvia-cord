-- "Añadir a Slack": la persona elige el canal en Slack y Cord recibe el webhook
-- entrante de ese canal. Se guarda en la misma columna que ya leen las
-- notificaciones y las acciones de workflow (orgs.slack_webhook_url); el canal y
-- el espacio de Slack son solo para decirle a la persona a dónde llegan los avisos.
alter table orgs add column if not exists slack_channel text;
alter table orgs add column if not exists slack_team text;

alter table integracion_oauth_estados drop constraint if exists integracion_oauth_estados_proveedor_check;
alter table integracion_oauth_estados add constraint integracion_oauth_estados_proveedor_check
  check (proveedor in ('hubspot', 'mercadopago', 'slack'));
