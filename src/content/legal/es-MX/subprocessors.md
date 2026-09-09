---
docId: subprocessors
version: "2026-09-01"
effectiveDate: "2026-09-01"
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
lastReviewed: "2026-09-01"
reviewedBy: Redacción técnica; revisión jurídica externa pendiente
dependsOn: ["privacy"]
sourceSections: ["privacy@2026-08-29#dpa", "privacy@2026-08-29#internacionales"]
releaseBlockers: ["verified-identity", "provider-legal-entities", "account-contracts", "processing-locations", "transfer-mechanisms", "change-notice", "objection-procedure", "legal-review", "versioned-publication"]
---

# Terceros y subencargados

**BORRADOR TÉCNICO — no publicado ni en vigor.** Esta lista describe integraciones
encontradas en el código al 1 de septiembre de 2026. No acredita que todas estén
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
| Facturapi | Preparación, timbrado y recuperación de CFDI/CSD en México si está configurado. | Pendiente |

La entidad legal, domicilio, país de tratamiento, productos concretos,
subencargados posteriores y mecanismo de transferencia deben completarse por
fila. Un nombre comercial no basta para un anexo contractual.

## 3. Proveedores con obligaciones propias

| Proveedor | Finalidad y condición observada |
|---|---|
| Stripe | Billing, cobros, reembolsos, disputas, depósitos y verificación financiera/identidad cuando se usa esa función. |
| Google | Autenticación OAuth elegida por la persona; Cord recibe identificador, nombre y correo autorizados. |
| Apple | Autenticación elegida por la persona; Cord recibe identificador y datos autorizados. |

Su rol puede variar por producto, jurisdicción y dato. Clasificarlos aquí fuera de
la lista de subencargados no declara que nunca actúen como encargados; evita
atribuirles un rol universal sin análisis. Stripe y Resend tienen términos
públicos revisados, pero eso no sustituye evidencia de cuenta o configuración.

## 4. Autoridades e integraciones dirigidas

SAT, PAC y AEAT son autoridades o destinatarios fiscales. SAT/PAC participan al
timbrar CFDI; AEAT sólo recibiría datos cuando Verifactu y su envío estén
realmente configurados, y hoy el envío nace desactivado.

Los IdP SAML, servidores MCP, espacios de Slack y webhooks/endpoints configurados
por el Cliente son destinatarios dirigidos por éste. El Cliente decide su alta y
alcance; Cord debe aplicar autenticación, minimización y seguridad. En MCP,
autorizar `[*]` y carecer de confirmación por llamada impide presentar la
instrucción como control suficiente para herramientas con efectos externos.

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

Nueve entradas siguen marcadas `account-evidence-pending`: Neon, Vercel,
Anthropic, PostHog, Upstash, Slack de Ops, Facturapi, Google y Apple. Faltan
evidencia de términos aceptados, producto, región, retención y transferencias.

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

Procedencia y evidencia: [revisión de gobernanza de datos de fase 5.4](../../../../docs/historial/revisiones-legales/2026-09-01-data-governance.md). Las cláusulas originales permanecen preservadas según `sourceSections`.
