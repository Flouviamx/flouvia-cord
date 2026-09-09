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
  html-snapshot`). Versión vigente del Aviso: **`2026-08-29`** (sucede a
  `2026-08-11` y obliga a nuevo reconocimiento personal). Términos siguen en
  `2026-08-11`.
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
está **desactivado por defecto** (`VERIFACTU_AEAT_ENABLED`) y `VERIFACTU_SIF_NIF`
aún no se configura porque Flouvia no tiene NIF español. Sin esas variables,
`issueDocument()` lanza y la factura no se marca emitida; sin certificado de la
org, el rail degrada a `commercial_only`. Detalle operativo en
[`../proyecto.md`](../proyecto.md) y regla 29 de
[`../estandares-ingenieria.md`](../estandares-ingenieria.md).

## Pendientes operativos, no de código

- **España**: conseguir NIF (gestor), presentar la declaración responsable del
  software (RD 1007/2023) y probar un envío real contra el sandbox de la AEAT
  antes de `VERIFACTU_AEAT_ENABLED=true`.
- **Estados Unidos**: solicitar EIN propio (Formulario SS-4, responsible party por
  pasaporte, sin SSN/ITIN) para retomar el wizard de 1099-K de Stripe Connect.
- **Legal**: domicilio verificable del responsable, RFC/contactos dedicados,
  confirmación de foro; DPA completo + subprocesadores verificables +
  transferencias + AUP + SLA + anexos jurisdiccionales; política de retención y
  eventual redacción de IP/user-agent en la evidencia; corpus `pt-BR` completo y
  su selector país/idioma.
