---
docId: subprocessors
version: "2026-10-10"
effectiveDate: "2026-10-10"
supersedes: null
locale: es-MX
jurisdiction: GLOBAL
appliesToCountries: [MX, US, CA, BR, ES, GB, DE, FR, CO, AR, CL, PE]
requiresAction: false
action: none
acceptanceScope: none
publicationStatus: draft
sourceKind: markdown
editorialStage: technical-draft
sourceOfTruth: src/content/legal/es-MX/subprocessors.md
artifactRoute: /legal/subprocessors
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-10-10"
reviewedBy: Redacción técnica; revisión jurídica externa pendiente
dependsOn: ["privacy"]
sourceSections: ["privacy@2026-09-28#dpa", "privacy@2026-09-28#internacionales"]
releaseBlockers: ["verified-identity", "provider-legal-entities", "account-contracts", "processing-locations", "transfer-mechanisms", "change-notice", "objection-procedure", "fr-platform-contract", "inbound-email-provider", "legal-review", "versioned-publication"]
---

# Terceros y subencargados

**BORRADOR TÉCNICO — no publicado ni en vigor.** Esta lista describe integraciones
encontradas en el código al 10 de octubre de 2026. No acredita que todas estén
configuradas, que sus términos públicos se hayan aceptado en la cuenta de Cord o
que una misma clasificación jurídica aplique en todos los flujos.

## 1. Alcance y forma de leer la lista

Un subencargado trata Datos del Cliente por cuenta de Cord. Un proveedor con
obligaciones propias puede determinar parte de su tratamiento. Una autoridad
recibe datos por un deber o función legal. Una integración dirigida es elegida y
configurada por el Cliente. Estas categorías no son intercambiables.

La condición indica cuándo puede activarse el flujo, no su base legal, región o
retención. La presencia en el catálogo tampoco prueba que hoy reciba datos de un
Cliente concreto.

## 2. Subencargados identificados

| Proveedor | Finalidad y condición observada | Evidencia de cuenta |
|---|---|---|
| Neon | PostgreSQL con datos de cuenta, operación y clientes; infraestructura principal. | Pendiente |
| Vercel | Hosting, ejecución, logs técnicos y Web Analytics; infraestructura principal. | Pendiente |
| Anthropic | Texto, imágenes/PDF y contexto para IA cuando se invoca una función. | Pendiente |
| Resend | Entrega de correo y newsletter con doble confirmación cuando Cord envía. | Términos públicos revisados; cuenta por conservar |
| PostHog | Analítica de navegador tras consentimiento y telemetría server-side de organización si está configurado. | Pendiente |
| Upstash | Rate limiting y sesiones MCP efímeras si existen variables; PostgreSQL es respaldo. | Pendiente |
| Slack, alertas de Cord | Alertas operativas minimizadas si el webhook interno está configurado. | Pendiente |
| Facturapi | Preparación, timbrado, cancelación y recuperación de CFDI/CSD en México, incluidos complementos de pago y factura global, si está configurado. | Pendiente |
| Correo entrante (proveedor por identificar) | Recepción de los correos dirigidos a casillas de Cord: respuestas a la cobranza y documentos de proveedores en la casilla de intercambio de Chile, si la recepción está configurada. | Pendiente; proveedor sin identificar |

La entidad legal, domicilio, país de tratamiento, productos concretos,
subencargados posteriores y mecanismo de transferencia deben completarse por
fila. Un nombre comercial no basta para un anexo contractual.

## 3. Proveedores con obligaciones propias

| Proveedor | Finalidad y condición observada |
|---|---|
| Stripe | Billing, cobros, reembolsos, disputas, depósitos y verificación financiera/identidad; métodos de pago y mandatos SEPA/ACH que guardan los clientes del Cliente para el cobro automático; cálculo del sales tax de EE. UU. en la cuenta conectada del Cliente, con la dirección de su cliente. Cuando se usa cada función. |
| Google | Autenticación OAuth elegida por la persona; Cord recibe identificador, nombre y correo autorizados. |
| Apple | Autenticación elegida por la persona; Cord recibe identificador y datos autorizados. |
| Mercado Pago | Cobro de cotizaciones y facturas con la cuenta del Cliente, y lectura de pagos y reembolsos para conciliarlos, cuando el Cliente la conecta. |
| Iopole | Plataforma autorizada en Francia: alta del negocio (SIREN, régimen de TVA, correo, dirección y, opcional, nombre y cargo del representante), facturas entre empresas con los datos de sus clientes, e-reporting de las demás ventas y de los cobros, y estados. La verificación de identidad y el mandato se hacen en su página. Solo si el servicio está habilitado y el negocio completa el alta; el contrato de producción de Flouvia sigue pendiente. |

Su rol puede variar por producto, jurisdicción y dato. Clasificarlos aquí fuera de
la lista de subencargados no declara que nunca actúen como encargados; evita
atribuirles un rol universal sin análisis. Stripe y Resend tienen términos
públicos revisados, pero eso no sustituye evidencia de cuenta o configuración.

## 4. Autoridades e integraciones dirigidas

Son autoridades o destinatarios fiscales, cada una solo en el país del emisor y
cuando su riel está habilitado y configurado: el SAT por el PAC al timbrar CFDI;
la AEAT con Verifactu (envío desactivado por defecto) y, cuando la AEAT publique
su servicio, la solución pública de factura electrónica entre empresarios, hoy sin
envíos; ARCA; la Sefin Nacional y la SEFAZ (o su contingencia); SUNAT; el SII; la
DIAN; y la DGFiP a través de la plataforma autorizada. Cord les transmite como
sistema de facturación del Cliente, con las credenciales del Cliente, sin actuar
como su apoderado ni como proveedor tecnológico autorizado. En Chile, los
proveedores del Cliente reciben además las respuestas de intercambio firmadas con
su certificado.

Los IdP SAML, servidores MCP, espacios de Slack y webhooks/endpoints configurados
por el Cliente son destinatarios dirigidos por éste. El Cliente decide su alta y
alcance; Cord debe aplicar autenticación, minimización y seguridad. En MCP,
autorizar `[*]` y carecer de confirmación por llamada impide presentar la
instrucción como control suficiente para herramientas con efectos externos.

HubSpot es una integración dirigida cuando el Cliente la conecta con OAuth. Cord
envía a esa cuenta nombre de empresa, contacto, correo y teléfono de sus clientes,
y folio, cliente, monto, divisa y etapa de sus cotizaciones enviadas; y lee de
vuelta nombre, contacto, correo y teléfono de los registros ya vinculados. Cord
guarda los tokens cifrados, los identificadores vinculados y una cola de
sincronización. Al desconectar, Cord intenta revocar el acceso, borra los tokens
y deja de sincronizar; lo ya enviado a HubSpot no se borra.

También son integraciones dirigidas por el Cliente, cada una sólo si éste la
conecta: Google (Sheets con `drive.file`, envío desde su Gmail con `gmail.send` y
el complemento para Gmail), Microsoft (Excel en su OneDrive y Teams),
Intuit QuickBooks Online, Xero (facturas definitivas con cliente, líneas, divisa e
impuestos), Shopify (catálogo y clientes hacia Cord y el pedido de vuelta si lo
activa) y Meta (WhatsApp Business con sus plantillas). Cord guarda sus
credenciales cifradas y los identificadores vinculados; desconectar deja de
sincronizar y lo ya entregado permanece en la cuenta del Cliente.

Zapier, Make y otras plataformas que usan la API actúan con una llave del
Cliente: reciben los eventos que éste elige y ejecutan las acciones que la llave
permite. Cord Workflows ejecuta automatizaciones definidas por el Cliente: crea
tareas, envía correo sólo a miembros de su organización y publica en el Slack que
el Cliente configuró; no escribe a clientes finales ni mueve dinero.

## 5. Datos, activación y minimización

Neon y Vercel participan en infraestructura principal. Los demás flujos son
condicionales por correo, analítica, IA, rate limit, alerta, fiscalidad, pago o
autenticación. El DPA final debe vincular cada proveedor con categorías de datos,
personas, finalidad, frecuencia y retención.

Cord redacta query strings e identificadores de ciertas rutas antes de Vercel
Web Analytics; no elimina el request técnico del hosting. PostHog del navegador
está desactivado por defecto, pero los eventos server-side de negocio se rigen
por un carril distinto. Anthropic y las integraciones pueden recibir contenido
del Cliente. La minimización debe evaluarse por llamada, no por nombre.

## 6. Contratos, regiones y transferencias

Diez entradas siguen marcadas `account-evidence-pending`: Neon, Vercel,
Anthropic, PostHog, Upstash, Slack de Ops, Facturapi, Google, Apple y Mercado Pago. Faltan
evidencia de términos aceptados, producto, región, retención y transferencias. La
siguiente versión del Aviso agregaría la plataforma autorizada francesa y el
proveedor de correo entrante, ambos sin evidencia de cuenta: el contrato de
producción con la plataforma y la elección del proveedor de correo entrante siguen
abiertos.

Un DPA público o trust center informa términos generales; no demuestra dónde
procesa la cuenta de Cord ni que se ejecutó un mecanismo. Cada transferencia
debe mapear exportador, importador, rol, país y salvaguarda. Las CCT 2021/914,
cuando apliquen, requieren módulo y anexos completos.

## 7. Altas, cambios y objeciones

Cord no dispone hoy de una suscripción pública a cambios de esta lista, plazo de
preaviso, historial inmutable ni procedimiento de objeción. Publicar una tabla
estática sin esos controles no satisface por sí solo una autorización general de
subencargados.

El contrato final debe definir qué cambio activa aviso, canal y antelación, qué
información se entrega, cómo se presenta una objeción razonable y qué ocurre si
no puede resolverse. Un cambio urgente de seguridad requiere tratamiento propio.

## 8. Responsabilidad, coordinación y bloqueos

Cord debe imponer al subencargado obligaciones compatibles con el DPA y conservar
responsabilidad en la medida aplicable. El Cliente conserva la de integraciones
que dirige; los proveedores con deberes propios y autoridades responden bajo sus
regímenes. Esta separación no reduce obligaciones directas de Cord.

**Bloqueos:** identidad legal; entidades y domicilios de proveedor; contratos de
cuenta; países/regiones; categorías y retención por flujo; mecanismos de
transferencia; aviso, historial y objeciones; revisión jurídica y publicación
versionada. `src/lib/legal-providers.ts` sigue siendo el inventario técnico, no
una lista contractual autoactualizable.

Procedencia y evidencia: [revisión de gobernanza de datos de fase 5.4](../../../../docs/historial/revisiones-legales/2026-09-01-data-governance.md) y [revisión de facturación por país](../../../../docs/historial/revisiones-legales/2026-10-10-facturacion-paises.md). Las cláusulas originales permanecen preservadas según `sourceSections`.
