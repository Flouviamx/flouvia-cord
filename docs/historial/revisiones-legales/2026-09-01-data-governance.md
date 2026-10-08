# Revisión técnica de gobernanza de datos y SLA — fase 5.4

Fecha de corte: **1 de septiembre de 2026**.

Esta revisión prepara material para asesoría jurídica; no certifica cumplimiento,
no ejecuta un DPA y no convierte una política en vigente. Se contrastaron diez
variantes ES/EN —DPA, terceros/subencargados, cookies, retención y SLA— con código,
schema y fuentes oficiales. No se modificaron runtime, datos, schema, proveedores,
cron, despliegue ni los cuatro artefactos publicados.

## Resultado editorial

| Documento | Resultado | Estado contractual |
|---|---|---|
| `dpa` ES/EN | Reescrito con schedules y bloqueos reales | Sin oferta, aceptación ni ejecución |
| `subprocessors` ES/EN | Inventario separado por rol | Sin mecanismo de aviso/objeción |
| `cookies-policy` ES/EN | Inventario técnico y carriles de analítica | Sin publicación; evaluación multinorma pendiente |
| `retention-policy` ES/EN | Plazos implementados y contradicciones | Sin calendario legal completo |
| `sla` ES/EN | Medición real separada de garantía | Mejor esfuerzo; sin SLA estándar |

Con esta fase, los **24 borradores existentes** tienen `editorialStage:
technical-draft`, ocho secciones, procedencia, hash nulo, acción nula y bloqueos.
Ya no queda material fuente sin corregir entre los 22 extractos iniciales; las
53 variantes todavía ausentes siguen sin crearse.

## Matriz de hechos y decisiones

| ID | Prioridad | Hecho observado | Tratamiento editorial / técnico pendiente |
|---|---:|---|---|
| DATA-01 | P0 cerrado editorialmente | El DPA anterior era borrador pero declaraba `requiresAction: true`, acción `accepted` y scope de organización. No existe ruta, bundle o ejecución DPA. | La propuesta ahora tiene acción nula. Una futura ejecución exige decisión explícita, artefacto y evidencia separada. |
| DATA-02 | P0 | Faltan domicilio, tax ID, contacto de privacidad, ley y foro; representantes UE/UK también están sin determinar. | No se identifica una contraparte completa ni se publica el DPA. |
| DATA-03 | P0 | Hay 13 entradas: 8 subencargados, 3 proveedores con deberes propios, 1 autoridad/destinatario y 1 grupo de integraciones dirigidas. | Se preservan roles por flujo; una tabla no convierte a todos en subencargados. |
| DATA-04 | P0 | Nueve entradas conservan `account-evidence-pending`: Neon, Vercel, Anthropic, PostHog, Upstash, Slack Ops, Facturapi, Google y Apple. | Obtener contrato/configuración/región/retención de cuenta; los términos públicos no los prueban. |
| DATA-05 | P0 | No existe mapa por flujo de exportador, importador, países, categorías y mecanismo. | Completar transfer map y, cuando aplique, módulo y anexos de CCT 2021/914; revisar mecanismos no UE. |
| DATA-06 | P1 | No hay suscripción pública a cambios de subencargados, preaviso fijado, historial inmutable ni procedimiento de objeción. | Diseñar antes de usar autorización general. |
| DATA-07 | P0 | El código tiene TLS, tokens hasheados, permisos y cifrado de algunos campos; no cifra todo por campo. RLS existe en schema pero el rol de aplicación sigue pendiente de activación real. | El anexo de medidas debe usar evidencia desplegada y no prometer RLS efectiva, residencia, certificación o RTO/RPO todavía. |
| DATA-08 | P0 | No hay procedimiento contractual/operativo demostrado para notificación de incidentes del encargado, cooperación y escalamiento. | Conservar “sin dilación indebida” sin inventar 24/48/72 horas; diseñar owner, canal, severidad y evidencia. |
| COOKIE-01 | P1 | PostHog del navegador inicia opt-out y sólo se activa después de “Aceptar todas”; “Solo necesarias” conserva opt-out. | El texto refleja el control real y la retirada futura mediante reapertura del banner. |
| COOKIE-02 | P1 | La decisión vive seis meses en `cord_cookie_consent`, se comparte con `.cordhq.app` y se refleja en `localStorage`; no guarda fecha, versión o categorías. | Evidencia limitada: revisar alcance cross-subdomain y recibo versionado. |
| COOKIE-03 | P0 | Eventos PostHog de backend y MCP se emiten por organización cuando está configurado y no dependen de la decisión del navegador. | Darles fundamento, transparencia, minimización y retención propios; no atribuirlos al consentimiento de cookies. |
| COOKIE-04 | P0 | Vercel Web Analytics se carga aunque se rechace PostHog. Cord redacta query/IDs y lo describe como cookieless, pero no hay control de objeción específico. | “Sin cookies” no prueba exención: evaluar scripts/tags y excepciones por mercado, especialmente guía UK 2026. |
| COOKIE-05 | P1 | El repositorio permite enumerar cookies propias, pero no fija nombres/duración reales que PostHog pueda crear tras opt-in. | Levantar inventario en navegador desplegado y bloquear drift. |
| RET-01 | P1 | Existen reglas concretas: sesión 30/180 días; captura KYC hasta expiración o una hora tras cierre; webhooks 30/90 días; evidencia KYC con sweeper de cinco años. | Se publican como comportamiento técnico, no como fundamento legal universal. |
| RET-02 | P0 | `connect_kyc_evidencia` tiene sweeper de cinco años y simultáneamente FK `org_id on delete cascade`; borrar la organización la elimina antes. | Definir la política correcta y reconciliar schema, cierre y base jurídica antes de prometer cualquiera de las dos. |
| RET-03 | P0 | `audit_log` cascadea con la organización, incluida la fila que registra “eliminación iniciada”. El flujo del dueño no conserva prueba durable de finalización. | Crear evidencia de borrado separada, mínima y con plazo; no afirmar certificado existente. |
| RET-04 | P0 | El borrado cancela suscripción Stripe en mejor esfuerzo y no elimina una cuenta Connect activa; tampoco demuestra borrado de proveedores o backups. | Implementar cola/reconciliación, estados por proveedor y evidencia de conclusión. |
| RET-05 | P0 | `legal_acceptances` conserva ID seudónimo, org, documento, hash, IP completa y user-agent sin FK al usuario ni plazo aprobado. | Definir periodo, acceso, redacción y eliminación posterior compatible con prueba contractual. |
| RET-06 | P1 | `/api/org/export` se denomina “todos los datos” pero omite facturas, cobros, pagos, disputas, KYC, integraciones, mensajes y billing; limita auditoría a 1,000 y silencia fallos por tabla. | Renombrar/explicar como export parcial o completar manifiesto, errores y cobertura antes de usarlo para portabilidad/DPA. |
| RET-07 | P1 | La página de status consulta 90 días, pero `health_checks` no tiene purga de 90 días. | No confundir ventana de lectura con conservación; incluirla en el calendario. |
| SLA-01 | P0 | Vercel Hobby ejecuta tres sondas una vez al día; frescura 26 horas y timeout técnico de ocho segundos. | No sirve para una garantía mensual continua. Mantener mejor esfuerzo. |
| SLA-02 | P1 | El porcentaje se calcula sobre muestras existentes dentro de hasta 90 días. Pocas muestras pueden mostrar 100%. | Explicar denominador; no publicar como uptime contractual. |
| SLA-03 | P1 | Incidentes y estados se crean manualmente en ES/EN; no hay suscripción, deadline de primera actualización, cadencia o RCA. | Diseñar procedimiento antes de prometer incident response contractual. |
| SLA-04 | P0 | No hay targets de soporte, RTO/RPO, política de mantenimiento, medición por plan ni cálculo/reclamo de créditos. | No prometer 99.9%, 24/7, créditos o restauración; un SLA futuro debe ser individual y medible. |

## Fuentes oficiales consultadas

- [GDPR, artículos 28, 32 y 44](https://eur-lex.europa.eu/eli/reg/2016/679/oj): obligaciones de encargado, seguridad y transferencias.
- [EDPB, Guidelines 07/2020](https://www.edpb.europa.eu/documents/guideline/guidelines-072020-on-the-concepts-of-controller-and-processor-in-the-gdpr_en): roles de responsable y encargado por actividad.
- [Decisión (UE) 2021/914](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A32021D0914): módulos y anexos de CCT, incluidas medidas específicas y lista de subencargados.
- [ICO, guía final de storage and access technologies, 29 abr 2026](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/): cookies, scripts/tags, excepciones, información, consentimiento y objeción bajo PECR/UK GDPR.
- [ANPD, Guia Orientativo Cookies e Proteção de Dados Pessoais](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf?exec=1ba4046): transparencia, minimización, políticas y banners bajo LGPD.
- [LGPD brasileña, texto compilado](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm): roles, registros, transferencias, seguridad y derechos; texto consultado incluye modificaciones de 2026.
- [LFPDPPP mexicana vigente](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf): marco mexicano para responsable, tratamiento, derechos y transferencias.

Consulta realizada el 1 de septiembre de 2026. Son fuentes primarias de apoyo;
no completan por sí solas el análisis de los doce países ni de normas sectoriales.

## Orden técnico recomendado

1. Resolver la contradicción de evidencia KYC y crear prueba durable de borrado
   sin conservar más datos de los necesarios.
2. Corregir el export: manifiesto de tablas, errores visibles, cobertura y
   clasificación de campos antes de llamarlo “todos los datos”.
3. Automatizar inventario de cookies/storage en un navegador de producción y
   evaluar Vercel/PostHog por jurisdicción; versionar la preferencia.
4. Conservar evidencia de cuenta de los nueve proveedores y construir el mapa de
   transferencias, regiones, productos y retención.
5. Implementar aviso e historial de cambios de subencargados y un flujo de
   objeciones compatible con el DPA final.
6. Completar el anexo de medidas con evidencia desplegada, incluido el resultado
   real de RLS, backups, restauración e incidentes.
7. Definir retención por registro/proveedor/backup, holds y atención DSAR; decidir
   plazo/redacción de aceptaciones legales.
8. Si se ofrecerá SLA, crear observabilidad continua, fórmula, mantenimiento,
   severidades, soporte y créditos antes de redactar porcentajes.
9. Verificar partes/contactos, revisar jurídicamente ES/EN, decidir ejecución y
   sólo entonces publicar una nueva versión con artefacto e historial.

## Verificación reproducible

| Verificación | Resultado del 1 sep 2026 |
|---|---|
| Test focalizado | Pasa: 1 archivo, 48 pruebas |
| Check editorial | Pasa: 4 publicadas, 24 borradores técnicos y 53 variantes ausentes |
| Build | Pasa; conserva advertencias previas por headers durante prerender |
| Typecheck | Pasa |
| Suite completa | Pasa: 22 archivos, 272 pruebas |
| Checks legal, CSS y health | Pasan |
| `git diff --check` y whitespace de archivos nuevos | Pasan |
| Gate estricto del corpus | Falla como se espera: 24 borradores y 53 variantes ausentes |

```sh
npm test -- --run test/legal-supplemental-review.test.ts
node --experimental-strip-types scripts/legal-editorial-check.mjs
npm run build
npm run typecheck
npm test
npm run security:legal
npm run security:css
npm run security:health
git diff --check
npm run security:legal-corpus-release
```

El gate estricto debe seguir fallando por 24 borradores y 53 variantes ausentes.
Los demás checks prueban integridad técnica, no aprobación jurídica ni ejecución.
