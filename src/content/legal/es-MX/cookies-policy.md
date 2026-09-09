---
docId: cookies-policy
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
sourceOfTruth: src/content/legal/es-MX/cookies-policy.md
artifactRoute: /legal/cookies-policy
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-09-01"
reviewedBy: Redacción técnica; revisión jurídica externa pendiente
dependsOn: ["privacy"]
sourceSections: ["privacy@2026-08-29#cookies"]
releaseBlockers: ["complete-cookie-inventory", "vercel-storage-access-assessment", "posthog-cookie-evidence", "granular-consent-review", "server-analytics-basis", "withdrawal-procedure", "legal-review", "versioned-publication"]
---

# Política de cookies y almacenamiento local

**BORRADOR TÉCNICO — no publicado ni en vigor.** Describe el código revisado al
1 de septiembre de 2026. “Cookie” incluye aquí cookies HTTP, `localStorage`,
scripts, tags y tecnologías que almacenan o consultan información en el
dispositivo; que una herramienta no use cookies no decide por sí solo su régimen.

## 1. Alcance y categorías

Cord usa tecnologías necesarias para autenticación, seguridad, preferencias,
flujos solicitados y reconocimiento de visitantes de links públicos. PostHog se
usa para analítica de navegador sólo después de aceptar la opción disponible.
Vercel Web Analytics se carga sin gate de consentimiento porque la implementación
lo considera cookieless; su exención legal por mercado todavía debe verificarse.

No se usa publicidad conductual de terceros en el código revisado. Una finalidad
nueva, proveedor, cookie o uso de almacenamiento exige actualizar inventario,
banner y fundamento antes de activarse.

## 2. Tecnologías necesarias y funcionales

| Familia | Finalidad | Duración observada |
|---|---|---|
| `cord_session`, `cord_auth_hint` | Sesión autenticada y señal visual no autenticante. | 30 días, renovable; tope de sesión en BD de 180 días |
| `cord_active_org` | Organización activa elegida por el usuario. | 1 año |
| `cord_public_lang` | Idioma público seleccionado. | 1 año |
| `cord_q_visitor` | Distinguir visitante de un link público sin perfilar entre sitios. | 1 año |
| `cord_cookie_consent` | Recordar aceptación o rechazo de analítica. | 6 meses |
| `cord_test_mode` | Mantener el entorno sandbox elegido. | 1 año |
| Cookies OAuth, SAML, passkey, 2FA y legales | Estado, nonce, PKCE, reto o intención de un solo uso. | Normalmente 5, 10 o 15 minutos |
| Cookies Ops | Sesión privilegiada y retos internos. | Sesión hasta 8 horas; retos 5 minutos |
| `cord_capture_device` | Vincular temporalmente el dispositivo de captura KYC. | 1 hora |

La lista resume familias encontradas y no sustituye un inventario automatizado de
todas las variantes, dominios, flags y consumidores. Varias cookies son HttpOnly;
preferencias como idioma, consentimiento y modo de prueba son legibles por el
navegador. `Secure` se aplica en producción donde lo declara cada flujo.

## 3. Consentimiento de PostHog

PostHog inicia con `opt_out_capturing_by_default: true`. El banner presenta
“Solo necesarias” y “Aceptar todas”; sólo aceptar llama
`opt_in_capturing()`. Rechazar llama `opt_out_capturing()`. No hay categorías
adicionales porque el código sólo ofrece una finalidad opcional de analítica.

La decisión se guarda en la cookie `cord_cookie_consent` con `SameSite=Lax`,
`path=/` y, en hosts de Cord, `Domain=.cordhq.app`; también se refleja en
`localStorage` como respaldo. Compartirla entre subdominios amplía su alcance y
debe justificarse. La cookie no registra fecha, versión de política o categorías
separadas, por lo que la evidencia de consentimiento es limitada.

PostHog puede establecer sus propias cookies o almacenamiento después del opt-in.
Nombres, dominios y duraciones reales de la configuración desplegada no están
fijados en el repositorio y son un bloqueo del inventario.

## 4. Analítica del navegador y del servidor

Tras el opt-in, PostHog puede medir vistas, adopción e identificar al usuario y
organización autenticados. Sandboxes, demo y organizaciones internas llevan
flags o exclusiones. La revocación impide captura futura mediante el SDK, pero el
procedimiento no demuestra borrado retroactivo en PostHog.

Separadamente, el backend emite eventos comerciales y de MCP a nivel organización
cuando PostHog está configurado, con perfiles de persona deshabilitados en el
carril genérico. Ese tratamiento no depende de la cookie o preferencia del
navegador y necesita fundamento, transparencia, minimización y retención propios;
no debe describirse como cubierto por “Aceptar todas”.

## 5. Vercel Web Analytics

Vercel Web Analytics recibe vistas agregadas sin cookies de terceros según la
implementación. Antes del envío, Cord elimina query strings y reemplaza
identificadores en rutas de clientes, documentos, disputas, SSO, invitaciones,
links públicos y captura de identidad. El hosting conserva el request técnico
necesario para servir el sitio.

El componente se carga aunque se rechace PostHog, excepto en superficies donde
`analyticsDisabled` lo apaga. No existe hoy un control visible para objetar sólo
Vercel. Las reglas actuales del Reino Unido también alcanzan scripts, tags y
otras tecnologías de almacenamiento/acceso; ser cookieless no acredita por sí
solo una excepción. Debe evaluarse su operación real en cada mercado.

## 6. Preferencias, rechazo y retiro

La primera visita sin decisión muestra dos opciones. Rechazar no bloquea el
servicio ni activa PostHog. El enlace “Administrar preferencias” del aviso de
privacidad vuelve a abrir el banner. Cambiar de aceptar a rechazar aplica opt-out
para capturas futuras y sobrescribe la preferencia por seis meses.

No existe un centro granular, recibo versionado ni sincronización server-side de
la decisión. Borrar cookies o almacenamiento puede hacer que Cord pregunte de
nuevo. Retirar consentimiento no afecta tecnologías necesarias ni elimina por sí
solo datos previamente enviados; las solicitudes de derechos siguen su proceso.

## 7. Terceros, seguridad y cambios

PostHog y Vercel reciben datos según las condiciones anteriores. Proveedores de
autenticación pueden fijar tecnologías en sus propios dominios durante un flujo
seleccionado; sus políticas aplican allí. Cord no controla cookies colocadas por
sitios externos enlazados.

Los tokens sensibles de sesión y retos principales son HttpOnly, tienen flags
SameSite según el flujo y expiración acotada. Eso reduce riesgos, pero una cookie
necesaria no queda exenta de transparencia ni puede reutilizarse para analítica.

Un cambio material en finalidad, proveedor, duración o alcance debe provocar
revisión, actualización y, cuando corresponda, nueva elección antes de la carga.

## 8. Coordinación y bloqueos

Esta política se coordina con privacidad, DPA, subprocesadores y retención. No
convierte un consentimiento opcional en aceptación contractual ni cubre
telemetría server-side mediante una elección de navegador.

**Bloqueos:** inventario automatizado completo; cookies/almacenamiento reales de
PostHog; evaluación de Vercel bajo UE, Reino Unido, Brasil y demás mercados;
fundamento de analítica server-side; suficiencia de dos opciones y alcance
cross-subdomain; evidencia/retirada y borrado; identidad/contacto, revisión
jurídica y publicación versionada.

Procedencia y evidencia: [revisión de gobernanza de datos de fase 5.4](../../../../docs/historial/revisiones-legales/2026-09-01-data-governance.md). Las cláusulas originales permanecen preservadas según `sourceSections`.
