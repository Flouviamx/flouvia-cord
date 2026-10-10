# Legal, privacidad e internacionalización

> Estado vigente del programa de blindaje legal e i18n. Registra hechos
> verificables del producto; no sustituye la revisión de abogados en las
> jurisdicciones aplicables.
>
> La bitácora cronológica (fases 0–5, línea base, hallazgos priorizados) vive en
> [`../historial/legal.md`](../historial/legal.md). Las revisiones editoriales
> fechadas, en [`../historial/revisiones-legales/`](../historial/revisiones-legales/).
> El trabajo editorial del corpus y su preservación de evidencia, en
> [`legal-corpus.md`](legal-corpus.md).

## Propósito

Este dominio cubre cuatro contratos relacionados, pero distintos:

1. que el producto y su copy describan hechos reales;
2. que los documentos legales tengan versión, variante y evidencia durable;
3. que consentimiento contractual, aviso de privacidad y consentimientos
   opcionales no se confundan;
4. que las superficies publicadas estén completas en español, inglés y
   portugués de Brasil.

La jerarquía de evidencia es la del repositorio: código, `db/schema.sql`,
`package.json` y `.env.example` ganan sobre este documento. Una conclusión
jurídica marcada como pendiente no se convierte en requisito sólo por estar
escrita aquí.

## Corpus y aceptación versionada

- Colección `legal` tipada + catálogo ejecutable. **Cuatro variantes públicas**:
  Términos y Aviso de Privacidad, cada uno en `es-MX` (`/…`) y `en-US` (`/en/…`),
  servidas desde el corpus por idioma con HTML literal (`sourceKind:
  html-snapshot`). Versión vigente de ambos: **`2026-09-28`** (ver abajo).
- Tablas: `legal_documents` (documento lógico + versión),
  `legal_document_variants` (locale, jurisdicción, ruta, hash de artefacto),
  `legal_acceptances` (usuario pseudónimo, versión y variante exactas, acción,
  scope, superficie, IP confiable, user-agent, momento; no se borra en cascada
  con la cuenta), `legal_acceptance_intents` (snapshot pre-OAuth, 15 min, token
  sólo en cookie HttpOnly, SHA-256 en base, un solo uso).
- El alta exige por separado **aceptar** Términos y **confirmar lectura** del
  Aviso. La segunda acción no es consentimiento a analítica; esa decisión
  opcional la conserva el banner de cookies.
- Cuentas históricas sin evidencia quedan confinadas a `/app/aceptacion-legal`
  (gate fail-closed; deja disponibles facturación, exportación, baja y logout).
  Las invitaciones comprueban la aceptación personal antes de activar la
  membresía.
- RLS habilitada y forzada sobre evidencias e intenciones; el rol de app sólo
  escribe vía funciones `SECURITY DEFINER` estrechas.
- **Orden de despliegue obligatorio**: migración de `db/schema.sql` primero,
  aplicación después. Verificar contra `db/schema.sql` si la migración ya corrió
  en el entorno.

Gates ejecutables: `npm run security:legal` (extrae el cuerpo renderizado tras el
build, recalcula los cuatro hashes y exige que catálogo TS, manifiestos
editoriales y `db/schema.sql` coincidan — un cambio silencioso bajo la misma
versión lo rompe) y `npm run security:legal-release` (bloquea la publicación
contractual estricta mientras falte cualquier campo de identidad o evidencia de
cuenta; ver abajo).

## Identidad pública del responsable

`src/lib/legal-identity.ts` es la fuente única de la contraparte pública.
`.env.example` declara los campos. Confirmado: el nombre publicado
`Andre Valle Ortega`. **Pendiente y bloqueante** de la publicación estricta:

- domicilio verificable (art. 15 LFPDPPP);
- identificación fiscal;
- contacto de privacidad confirmado;
- ley aplicable confirmada;
- foro confirmado.

El aviso publica de forma visible que el domicilio sigue abierto. Los campos de
representante UE / Reino Unido existen pero no se rellenan con nombres ficticios
ni con una exención supuesta. No se inventa una dirección.

## Terceros y DPA

`src/lib/legal-providers.ts` clasifica 13 entradas desde consumidores reales del
código: (1) subencargados, (2) proveedores con obligaciones/relaciones propias,
(3) autoridades/destinatarios legales, (4) integraciones dirigidas por el
Cliente. Nueve entradas conservan `account-evidence-pending`: un DPA público de
un proveedor prueba sus términos, no la región/configuración/aceptación de la
cuenta de Cord.

DPA de Cord: **borrador bilingüe**, `publicationStatus: draft`, hash provisional,
sin ruta pública. No está ejecutado ni se presenta como vigente.

Integraciones (sep 2026): HubSpot, plataformas conectadas por API (Zapier, Make) y
Cord Workflows quedan descritos como integraciones dirigidas por el Cliente en los
borradores de DPA, subencargados y retención, y en la revisión pendiente del Aviso
(`privacy-2026-08-30.1`). El registro `legal-providers.ts` y el Aviso publicado no
cambian hasta la siguiente versión revisada. Detalle en
[`../historial/revisiones-legales/2026-09-15-integraciones.md`](../historial/revisiones-legales/2026-09-15-integraciones.md).

El 28 de septiembre la misma revisión pendiente sumó Google (Sheets, envío desde
Gmail y complemento para Gmail, con la declaración de Uso Limitado que exige la
verificación de Google), Microsoft, QuickBooks, Xero, Shopify, WhatsApp Business
y Mercado Pago, y los Términos reescribieron la sección 7 de integraciones.
Mientras no se publique, la declaración de datos de Google vive en
`/integraciones/gmail`. Detalle en
[`../historial/revisiones-legales/2026-09-28-integraciones-google-contabilidad.md`](../historial/revisiones-legales/2026-09-28-integraciones-google-contabilidad.md).

El 10 de octubre se preparó la revisión candidata `2026-10-10.1` (facturación,
impuestos y cobros por país): autoridades fiscales de LatAm y Francia, la
plataforma autorizada francesa (Iopole), Stripe Tax, credenciales fiscales,
recepción de documentos en Chile, portal y cobro automático, y cupones. **No se
publicó.** `legal-providers.ts` no cambia hasta publicarla: nombre, rol,
finalidad, condición y orden de cada tercero entran en el `sourceInputsSha256`
del Aviso vigente y el build falla si difieren. El bloque listo para aplicar,
los textos exactos y la justificación viven en
[`../historial/revisiones-legales/2026-10-10-facturacion-paises.md`](../historial/revisiones-legales/2026-10-10-facturacion-paises.md).

## Corpus complementario — estado

Además de las cuatro variantes públicas hay **22 extractos complementarios + 2
DPA previos**, todos en borrador y sin rutas públicas. El plan editorial abarca
27 documentos en tres idiomas: **faltan 53 variantes**, incluidos los anexos
locales y **todo `pt-BR`**. No se publica `pt-BR` incompleto ni se configura
fallback legal a inglés. El adaptador rechaza contenido, idioma, ruta o entradas
de identidad/proveedores que no correspondan con la publicación. Inventario y
preservación de evidencia: [`legal-corpus.md`](legal-corpus.md).

## Veracidad de producto (correcciones vigentes)

- **Disponibilidad**: la página pública de estado deriva sólo de muestras reales
  (`health_checks`, cron diario, `GET /api/health` con `CRON_SECRET`). Declara
  que son sondas sintéticas, calcula el porcentaje sobre las muestras existentes
  en una ventana ≤ 90 días y **no** lo presenta como SLA. Términos conservan
  mejores esfuerzos y exigen acuerdo escrito separado para cualquier nivel de
  servicio. Incidentes en `status_incidents`, sin filas sembradas, redactados
  ES+EN desde `/ops/status`, cada mutación en `ops_audit_log`.
- **Interés moratorio**: política central fail-closed — la API rechaza toda tasa
  mayor a cero y el cron omite organizaciones con tasas históricas. No hay
  política aprobada para habilitar ninguna jurisdicción.
- **Cobranza**: los cuatro caminos de envío identifican al acreedor (nombre
  visible, Reply-To, identificación fiscal cuando existe) y ofrecen una vía de
  cese. No existe baja pública de un clic.
- **Reembolsos**: la UI muestra y exige aceptar que `refund_application_fee=false`
  conserva la tarifa de plataforma; la API exige `feeDisclosureAccepted: true`.
- **Evidencia de disputa**: no sube archivos automáticamente, no adjunta el hilo
  completo por defecto, y exige vista previa confirmada antes de transferir.
- Copy de límites, SLA y "99.9%" retirado de landing/soporte/términos donde no
  había contrato ejecutable equivalente. La auditoría de exactitud continúa por
  superficies.

## Internacionalización

- Vocabulario de escritura: `es-MX` y `en-US`. **No existe `pt-BR`**; Brasil nace
  hoy en inglés. Los componentes de auth no importan la infraestructura de i18n y
  la API arrastra deuda amplia de mensajes en español. Este frente está asignado
  a la ola de i18n pendiente ("fase 10" en la bitácora) y se aborda por olas
  medidas, no de una vez.
- `orgs.idioma` sí sirve ES/EN en la app interna, `/q`, `/i` y los correos
  transaccionales; `orgs.zona_horaria` tiene consumidor real vía
  `src/lib/fmt-server.ts`. Detalle en [`negocio-billing.md`](negocio-billing.md),
  [`cobros-facturacion.md`](cobros-facturacion.md) y reglas 23–25 de
  [`../estandares-ingenieria.md`](../estandares-ingenieria.md).

## Países y rieles

12 países ofrecidos (MX, US, CA, BR, ES, GB, DE, FR, CO, AR, CL, PE); 8 con cobro
en línea (CO, AR, CL, PE quedan en pago manual y se dice antes del alta).
`SUPPORTED_COUNTRIES` prueba qué ofrece la UI, no clientes activos ni exposición
jurídica completa — la matriz país-por-flujo sigue pendiente. Contrato y criterio
de admisión: regla 28 de [`../estandares-ingenieria.md`](../estandares-ingenieria.md).

## Verifactu (España)

Cadena SHA-256 encadenada construida y verificada contra los vectores oficiales
de la AEAT; envío SOAP construido desde el WSDL/XSD reales. El envío a la AEAT
está **desactivado por defecto** (`VERIFACTU_AEAT_ENABLED`); con él apagado no se
encadena nada y, encendido, se envía cada hora y tras emitir o anular. Flouvia se
identifica como productor sin NIF español (`VERIFACTU_SIF_ID_OTRO_*`) y la
declaración responsable vive en `/verifactu/declaracion-responsable`; sin la
identidad configurada, emitir falla cerrado; sin certificado de la org, el rail
degrada a `commercial_only`. Los Términos vigentes todavía dicen "procesamiento
programado diario": lo corrige la revisión `2026-10-10.1`. Detalle operativo en
[`../proyecto.md`](../proyecto.md) y regla 29 de
[`../estandares-ingenieria.md`](../estandares-ingenieria.md).

## Versión vigente: `2026-09-28` de Términos y Aviso

Publicada el 28 de septiembre de 2026 por decisión explícita de André, sabiendo
que obliga a toda la base de usuarios a volver a aceptar (la puerta
`/app/aceptacion-legal` la pide en la siguiente entrada). Es la revisión
`2026-08-30.1` —corrección general de agosto, integraciones de septiembre
(HubSpot, Zapier, Make, Workflows, Google, Microsoft, QuickBooks, Xero, Shopify,
WhatsApp, Mercado Pago), sección de datos de usuario de Google con Uso Limitado y
plazos de derechos de privacidad— sin marcadores de borrador. Sucede a Términos
`2026-08-11` y Aviso `2026-08-29`, cuyas filas y hashes se conservan para las
aceptaciones históricas.

Se publicó todavía **sin** los cinco campos de identidad y **sin** revisión
jurídica externa (`reviewedBy` lo dice). `legal-providers.ts` ya lista los 19
terceros de la tabla. Los borradores complementarios citan ahora secciones de
`2026-09-28` y deben revisarse contra ese texto.

Para publicar la siguiente versión, el procedimiento es el mismo: nuevas filas
en `legal_documents`/`legal_document_variants` (migrar ANTES de desplegar),
archivos publicados con `artifactSha256` = sha256(`restoreLegacyLegalHtml`) y
`sourceInputsSha256` de `legalPublicationInputsHash()`, catálogo en
`legal-corpus.ts`, y `npm run security:legal`.

## Pendientes operativos, no de código

- **España**: cargar en Vercel la identidad del productor (sin NIF español, vía
  `VERIFACTU_SIF_ID_OTRO_*`) y los datos de la declaración responsable, firmarla y
  archivarla, y probar con el certificado cualificado de un contribuyente español
  contra el portal de pruebas antes de `VERIFACTU_AEAT_ENABLED=true` (pasos en
  "Activación paso a paso" de [`cobros-facturacion.md`](cobros-facturacion.md)).
- **Estados Unidos**: solicitar EIN propio (Formulario SS-4, responsible party por
  pasaporte, sin SSN/ITIN) para retomar el wizard de 1099-K de Stripe Connect.
- **Legal, datos de André**: domicilio verificable, RFC, correo de contacto de
  privacidad, ley aplicable y foro (`src/lib/legal-identity.ts`); evidencia de
  cuenta de 10 proveedores (contrato/DPA aceptado, región, retención): Neon,
  Vercel, Anthropic, PostHog, Upstash, Slack, Facturapi, Google, Apple y Mercado
  Pago. Al publicar `2026-10-10.1` se suman Iopole y el proveedor de correo
  entrante.
- **Legal, revisión preparada `2026-10-10.1` (facturación, impuestos y cobros por
  país), sin publicar.** Términos y Aviso ES/EN completos en
  `src/content/legal-revisions/`; textos exactos, justificación, hechos de código y
  procedimiento en
  [`../historial/revisiones-legales/2026-10-10-facturacion-paises.md`](../historial/revisiones-legales/2026-10-10-facturacion-paises.md).
  Los borradores de facturación, pagos, subencargados, DPA y retención ya se
  actualizaron (la sustitución de CFDI dejó de figurar como pendiente). Bloquean
  su publicación:
  - la **decisión de André**, porque obliga a toda la base a aceptar de nuevo;
  - revisión jurídica (roles ante cada autoridad, mandato y contrato de la
    plataforma francesa, autorización del cobro automático, IP completa como
    evidencia);
  - el **contrato de producción con Iopole** y su región de tratamiento;
  - **identificar el proveedor de correo entrante** (casilla del SII y respuestas a
    la cobranza; hoy no figura en el Aviso publicado);
  - **decidir la conservación fiscal tras el cierre**: hoy solo Verifactu impide
    borrar la organización; los CFDI y los XML de ARCA, NFS-e, NF-e, SUNAT, SII,
    DIAN y Francia se borran con ella;
  - aplicar el bloque de `legal-providers.ts` en el mismo cambio que la
    publicación (cambia el hash de insumos del Aviso);
  - los cinco campos de identidad, que siguen pendientes.
- **Legal, riesgo de fusión**: portal del cliente, cobro automático, cupones,
  rieles de LatAm y Francia y sales tax por dirección **no están en `main`**. Si
  se fusionan antes de publicar `2026-10-10.1`, Cord tratará datos que el Aviso
  vigente no describe (IP completa de la autorización de cobro, credenciales
  fiscales, dirección para el sales tax, documentos de proveedores). Publicar
  antes o junto con la fusión; si no, mantener apagados los rieles y retener el
  portal y el cobro automático.
- **Legal, cambios de producto que pide esta revisión** (no hechos): conservar el
  historial de autorizaciones de cobro automático (hoy una nueva sobrescribe la
  anterior); enlazar un aviso de privacidad desde el portal; exportación masiva
  de documentos fiscales antes del cierre; plazos de purga para
  `us_tax_calculos`, redenciones de cupones y documentos recibidos; comprobar en
  una cuenta Custom real los avisos de débito SEPA y ACH.
- **Legal, 12 documentos en borrador** que NO están listos para publicar, cada
  uno con bloqueos propios además de la revisión jurídica: términos de pagos,
  de facturación, KYC, aviso de cobranza, divulgación de IA, evidencia de
  disputas, uso aceptable, DPA, subencargados, cookies, retención y SLA. Sus
  `releaseBlockers` en `src/content/legal/es-MX/*.md` dicen qué falta.
- **Legal, cambios de producto que piden las revisiones** (hechos por Claude
  cuando se prioricen): canal de baja verificable y atribución vendedor/comprador
  en cobranza con IA; permisos MCP por herramienta con confirmación humana;
  procedimiento de suspensión y apelación; borrado verificable de evidencia KYC;
  export completo; inventario de cookies; calendario de retención; activar el rol
  `cord_app`.
- **Legal, lo que no existe**: anexos de los 12 países, anexo de estados de
  EE.UU. y todo `pt-BR` (53 variantes). Ahora que hay flujo real con autoridades,
  los más urgentes son `country-es` (Verifactu y factura entre empresarios),
  `country-fr` (plataforma autorizada), `country-cl` (intercambio de documentos y
  Leyes 19.983 y 20.956), `country-co`, `country-pe`, `country-ar`, `country-br`,
  `country-mx` (sustitución y complemento de pago) y `country-us` con
  `us-state-privacy-annex` (sales tax por dirección del cliente).
- **Legal (resto)**: domicilio verificable del responsable, RFC/contactos dedicados,
  confirmación de foro; DPA completo + subprocesadores verificables +
  transferencias + AUP + SLA + anexos jurisdiccionales; política de retención y
  eventual redacción de IP/user-agent en la evidencia; corpus `pt-BR` completo y
  su selector país/idioma.
