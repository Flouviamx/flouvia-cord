-- Microsoft Teams como canal de avisos y como acción de Cord Workflows.
-- La URL es la del flujo de Power Automate que se crea desde el canal
-- (Workflows › "Post to a channel when a webhook request is received").
alter table orgs add column if not exists teams_webhook_url text;
