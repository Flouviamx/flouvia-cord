-- WhatsApp Business (Cloud API de Meta) como canal hacia el CLIENTE.
--
-- El token es de la cuenta de Meta del negocio y vale para mandar mensajes en su
-- nombre: se guarda cifrado, nunca en claro (mismo criterio que las credenciales
-- fiscales y de HubSpot).
alter table orgs add column if not exists whatsapp_phone_id text;
alter table orgs add column if not exists whatsapp_token_enc text;
-- Nombre e idioma de la PLANTILLA aprobada por Meta. Sin plantilla aprobada no
-- se puede iniciar una conversación: es regla de Meta, no una decisión de Cord.
alter table orgs add column if not exists whatsapp_plantilla text;
alter table orgs add column if not exists whatsapp_plantilla_idioma text;
