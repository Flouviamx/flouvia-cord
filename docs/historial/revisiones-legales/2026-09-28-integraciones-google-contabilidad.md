# Revisión técnica de integraciones: Google, Microsoft, contabilidad, Shopify y WhatsApp

Fecha de corte: **28 de septiembre de 2026**, rama `main`.

Evidencia para revisión jurídica; no es una opinión legal ni autoriza publicar. No se
modificaron los cuatro artefactos legales publicados: el Aviso y los Términos
vigentes conservan su hash. Los cambios viven en la revisión pendiente
`2026-08-30.1` (Aviso: datos, finalidades, tabla de terceros y nueva sección
"Datos de usuario de Google"; Términos: sección 7 reescrita).

## Hechos observados en código

| ID | Evidencia | Tratamiento en la revisión |
|---|---|---|
| INT-08 | Google Sheets pide solo `drive.file`: la app ve únicamente el archivo que crea. Tokens cifrados. | Tabla de terceros del Aviso. |
| INT-09 | Envío desde Gmail (`gmail.send` + `openid email`): cotizaciones, facturas, recordatorios de pago y el correo al cliente de un workflow salen desde la cuenta del Cliente. No lee correo. Si Gmail falla, el correo sale por Resend y la conexión queda en error. | Aviso (finalidades, tabla) y Términos (remitente responsable, entrega por canal propio). |
| INT-10 | Complemento de Gmail: lee remitente, asunto y folio del correo abierto (`gmail.addons.current.message.readonly`); el texto viaja a Cord y a Anthropic solo al pulsar "Cotizar con IA"; lee destinatarios del borrador (`metadata`) e inserta contenido (`action.compose`). Tokens OAuth de Cord en las propiedades del usuario de Apps Script. | Aviso (finalidades y sección de datos de Google). |
| INT-11 | Declaración de Uso Limitado de Google: exigida por la verificación de Google para permisos sensibles. Hoy también publicada en `/integraciones/gmail`. | Nueva sección del Aviso "Datos de usuario de Google". |
| INT-12 | Excel (Graph `Files.ReadWrite`, delegado) y Teams con la misma app de Entra. | Tabla de terceros. |
| INT-13 | QuickBooks y Xero: solo facturas definitivas, con cliente, líneas, importes, divisa e impuestos. Idempotencia por vínculo. | Tabla y Términos (el Cliente revisa asientos e impuestos). |
| INT-14 | Shopify: lee catálogo y clientes; crea pedidos si el Cliente lo activa, en la divisa del documento solo si la tienda la acepta; nunca convierte. | Tabla y Términos (inventario, divisas). |
| INT-15 | WhatsApp Business (plantillas del Cliente) y Mercado Pago (cobro con la cuenta del Cliente). | Tabla de terceros. |
| INT-16 | Desconectar borra o revoca credenciales; no borra lo ya entregado al tercero. | Términos, disponibilidad y desconexión. |

## Pendientes para asesoría

- Si la declaración de Uso Limitado basta en la página de la integración mientras
  la revisión del Aviso no se publica, o si el revisor de Google exigirá verla en
  el Aviso publicado antes de aprobar la verificación.
- Base legal y aviso a terceros cuando el Cliente envía desde su correo documentos
  a sus clientes y cuando el texto de un correo de un tercero (el cliente del
  Cliente) se procesa con IA por decisión del Cliente.
- Si la entrega por el canal propio de Cord cuando falla el correo del Cliente
  requiere aviso adicional al destinatario.
- Plazo de retención de los vínculos de integración y de las conexiones
  desconectadas (hoy se conservan sin credenciales).
- `src/lib/legal-providers.ts` alimenta el hash de insumos del Aviso publicado y
  no se modificó: sus entradas nuevas (Google como integración, Microsoft, Intuit,
  Xero, Shopify, Meta, Mercado Pago) deben entrar junto con la publicación de la
  revisión.
