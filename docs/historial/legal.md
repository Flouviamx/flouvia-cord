# Historial — Programa de blindaje legal e i18n

> Bitácora cronológica del programa legal (fases 0–5). Extraída el 2026-09-06
> desde `docs/estado/legal.md`, que crecía como changelog fechado en vez de
> describir estado vigente. El contenido de abajo se conservó **sin editar**;
> solo se reapuntaron los enlaces relativos a su nueva ubicación.
>
> El estado vigente del dominio vive en [`../estado/legal.md`](../estado/legal.md).
> Las revisiones editoriales fechadas están en
> [`revisiones-legales/`](revisiones-legales/).

## Línea base de la fase 0

Fotografía tomada el **28 de agosto de 2026** sobre:

- rama: `main`;
- commit: `71db6686c42a94eb8073dc1915870306b020ecbf`;
- Node: `v24.15.0`;
- npm: `11.12.1`;
- worktree previo: 64 archivos modificados o agregados, 1 eliminado y 21 no
  rastreados.

La línea base se ejecutó sin limpiar, guardar ni revertir esos cambios. Por ello
describe el árbol de trabajo que realmente recibirán las fases siguientes, no un
checkout limpio del commit indicado.

### Inventario medido

| Superficie | Estado medido |
|---|---|
| Países ofrecidos | 12: MX, US, CA, BR, ES, GB, DE, FR, CO, AR, CL y PE |
| Cobro en línea | 8 países; CO, AR, CL y PE quedan en pago manual |
| Idiomas de app | `es-MX` y `en-US`; no existe `pt-BR` en el vocabulario de escritura |
| Diccionario de app | 6,819 líneas, 403,576 bytes, 3,096 claves ES y 3,096 EN |
| Consumidores de `src/i18n/app.ts` | 81 archivos |
| Auth visible | 8 componentes; 0 importan la infraestructura de i18n |
| API | 171 archivos |
| Respuestas de error API | 710 coincidencias en 126 archivos; 359 parecen contener español según un barrido heurístico |
| Legal público | `terminos.astro` y `privacidad.astro`, con ES/EN en el mismo archivo |
| Ternarios legales `isEn ?` | 161 |
| Corpus legal estructurado | No existe colección `legal` |
| Registro general de aceptaciones | No existen `legal_documents` ni `legal_acceptances` |
| Consentimiento versionado actual | Sólo `FEE_TERMS_VERSION` y su proyección en `orgs` |
| Support Hub | 71 entradas ES y 71 EN |
| Documentación de producto | 64 entradas ES y 64 EN |

Los conteos de errores son indicadores de tamaño, no una clasificación jurídica
ni una promesa de que cada coincidencia deba traducirse en servidor.

### Superficie contractual actual

- `/terminos` declara que crear una cuenta o usar Cord implica aceptación.
  El registro, OAuth y las invitaciones no guardan una versión general ni el
  artefacto presentado.
- `/privacidad` contiene una sección denominada DPA y una tabla de
  subprocesadores. No es correcto describirla como inexistente; sí queda por
  verificar y completar contra el contrato exigible a un encargado.
- `/terminos` ya contiene actividades prohibidas y una sección SLA. La tarea es
  validar, completar o separar esas cláusulas, no afirmar que jamás existieron.
- La identidad pública nombra a una persona operadora y la marca Flouvia, pero no
  publica un domicilio del responsable.
- Los documentos dicen haber sido actualizados el 11 de agosto de 2026 y no
  tienen un catálogo inmutable de variantes.
- Los wrappers ingleses importan las páginas españolas, pero no vuelven a
  declarar `prerender`; el build de fase 0 sólo produjo artefactos estáticos para
  `/terminos` y `/privacidad`, no para `/en/terminos` y `/en/privacidad`.

Hashes de preservación de las fuentes actuales:

```text
f8f39c5c27a54154e62c999fe6ad634d6632576f8b5d0c922590a34349a431f9  src/pages/terminos.astro
e5af8148c3cf1442883a16645c34103425ed6b0da5d5b95a437ed4a7e10f32b3  src/pages/privacidad.astro
```

Hashes de los dos HTML estáticos producidos por el build de la línea base:

```text
5d22edef35fbdba756abae2060f3dcec333afbc9c954205eb2644cab2dcb70d4  /terminos/index.html
a06ccf13aef3195f2bbd0b2f589e47c78fed672feb3da67171b1a32ed5699912  /privacidad/index.html
```

Estos hashes preservan la fotografía actual; todavía no prueban qué variante se
presentó a una persona ni deben reutilizarse como modelo de aceptación.

## Registro inicial de hallazgos

| ID | Severidad | Hecho observado | Tratamiento previsto |
|---|---|---|---|
| TRUTH-01 | P0 | La página de status publicaba cuatro porcentajes, historial generado e incidentes sembrados. | Retirado en fase 1; reemplazado por monitoreo real en fase 4. |
| TRUTH-02 | P0 | Soporte publica límites de 50,000/300,000 MXN, un motor de fraude propio y respuesta de riesgos en 48 h sin contrato ejecutable equivalente. | Corregir en fase 1. |
| CONTRACT-01 | P0 | Signup no presenta ni registra una versión general de términos o privacidad. | Clickwrap y evidencia en fases 6 y 7. |
| IDENTITY-01 | P0 | El aviso no publica domicilio del responsable y la identidad está duplicada dentro del contenido. | Verificación y fuente única en fase 3. |
| DPA-01 | P1 | Existe una sección DPA, pero no se ha demostrado que cubra todo el artículo 28 GDPR ni las transferencias aplicables. | Matriz de roles en fase 2; documento completo en fase 6. |
| VERIFACTU-01 | P0 | El repo implementa el bloque `SistemaInformatico`, pero no contiene la declaración responsable visible y versionada. `docs/proyecto.md` registra la identidad del productor y el trámite como pendientes; `.env.example` mantiene el envío desactivado por defecto. | Separar y verificar en fases 2, 5 y 6. |
| INTEREST-01 | P0 | La escritura admite hasta 100% mensual y el cron lo aplica al saldo. | Contención en fase 1; política revisada en fase 5. |
| COLLECTIONS-01 | P0 | El correo automatizado usa `fromName: null`, no configura `replyTo` en ese camino y firma como cobranza de Cord. | Corregir en fase 1. |
| REFUND-01 | P0 | Stripe recibe `refund_application_fee=false`; la conservación de la comisión no se presenta antes de confirmar el reembolso. | Corregir producto y documento en fases 1, 5 y 6. |
| DISPUTE-01 | P0 | La generación de evidencia puede adjuntar firmante, IP y el hilo completo de la cotización. | Minimización, vista previa y aviso en fases 1 y 5. |
| CRYPTO-01 | P1 | La auditoría local de secretos pasa, pero el contrato de degradación histórica debe revisarse por consumidor antes de prometer cifrado uniforme. | Inventario y fail-closed en fase 5. |
| RLS-01 | P0 | La base auditada usa `neondb_owner` con `SUPERUSER/BYPASSRLS`; las políticas no se aplican. Además `billing_handoff_tokens` no tiene RLS habilitada y dos tablas SSO no tienen FORCE. | Activación y correcciones con el runbook; no afirmar aislamiento forzado antes. |
| BILLING-01 | P0 | La verificación real de Stripe falla porque un Price no tiene opción USD. | Corregir antes de ampliar cobro de planes fuera de MXN. |
| I18N-01 | P1 | Brasil nace en inglés; auth no usa i18n y la API contiene deuda amplia de mensajes en español. | Fase 10 por olas. |
| I18N-02 | P1 | Un barrel que importe todos los idiomas no garantiza reducción de bundle. | Medir y diseñar code splitting en fase 10. |
| LEGAL-DATA-01 | P0 | Un único hash por `docId + version` no podría representar tres idiomas, anexos y contenido renderizado. | Variantes y bundles inmutables en fase 4. |
| COUNTRY-01 | P1 | `SUPPORTED_COUNTRIES` prueba qué ofrece la UI, no clientes activos, targeting ni exposición jurídica completa. | Matriz país por flujo en fase 2. |
| BUILD-01 | P1 | El build pasa, pero advierte headers usados durante prerender y un chunk superior a 500 kB. | Clasificar consumidores en fases 1 y 10. |

## Resultado de la fase 1 — contención urgente

Fase ejecutada el **29 de agosto de 2026** sobre la línea base anterior, sin
limpiar ni revertir cambios locales preexistentes.

| Hallazgo | Control aplicado | Estado después de fase 1 |
|---|---|---|
| TRUTH-01 | La página pública de estado dejó de generar porcentajes, latencias, 90 días simulados e incidentes ficticios. ES y EN declaran expresamente que todavía no hay telemetría pública. | Contenido; falta conectar una fuente real. |
| TRUTH-02 | Los artículos de límites ES/EN ya no publican topes, aprobaciones, países ni tiempos de respuesta inventados y distinguen registro manual de movimiento de dinero. | Contenido. |
| TRUTH-03 | Se retiró el 99.9% histórico de las tarjetas de solución, el objetivo 99.9% de términos y la afirmación de un SLA empresarial estándar. | Contenido; la auditoría completa de copy continúa por superficies. |
| INTEREST-01 | Política central fail-closed: la API rechaza toda tasa mayor a cero y el cron omite organizaciones con tasas históricas. Ajustes y documentación declaran la suspensión. | Contenido en todos los países; no existe aún política aprobada para habilitar uno. |
| COLLECTIONS-01 | Los cuatro caminos de envío identifican al acreedor, usan su nombre visible, Reply-To, identificación fiscal cuando existe y una vía de contacto para solicitar el cese de mensajes automáticos. | Contenido; la solicitud llega por respuesta/contacto, no existe baja pública automática de un clic. |
| REFUND-01 | La UI muestra y exige aceptar que `refund_application_fee=false` conserva la tarifa de plataforma; la API exige `feeDisclosureAccepted: true` y la auditoría lo registra. SPEI conserva su divulgación separada de devolución manual. | Contenido. |
| DISPUTE-01 | El borrador ya no sube archivos, no se agrega automáticamente el hilo completo, el usuario confirma una vista previa antes de cualquier transferencia y las tres APIs de archivos/envío exigen la divulgación aceptada. | Contenido para envíos nuevos; la retención de archivos históricos se tratará con privacidad. |
| CRYPTO-01 | Los tokens MCP nuevos dejaron de degradarse a texto claro: `addMcpServer` usa el carril de cifrado obligatorio. | Escrituras nuevas fail-closed; migración de valores históricos sigue pendiente. |

### Evidencia técnica de fase 1

| Verificación | Resultado |
|---|---|
| `npm run typecheck` | Pasa |
| `npm test` | Pasa: 13 archivos, 181 pruebas |
| `npm run build` | Pasa; conserva las advertencias preexistentes de prerender, compatibilidad y tamaño de chunk |
| `security:disputes` | Pasa |
| `security:crypto` | Pasa |
| `security:fees` | Pasa |
| `security:payments` | Pasa: 15 rutas |
| `security:tenancy` | Pasa: 58 tablas |
| `security:csrf` | Pasa |
| `git diff --check` | Pasa |

Dos pruebas nuevas fijan el cierre por defecto del interés y la identificación,
divulgación y canal de cese de los correos de cobranza.

### Riesgos que esta fase no pretende resolver

- no borra archivos de evidencia ya transferidos al proveedor ni define todavía
  una política de retención;
- no crea una baja pública automática para cobranza; por ahora ofrece una vía de
  solicitud y las exclusiones siguen bajo control del acreedor;
- no habilita interés en ninguna jurisdicción;
- no corrige RLS, Price USD, evidencia de billing, clickwrap general, DPA, DSAR,
  retención ni portugués; permanecen asignados a las fases siguientes.

### Matices jurídicos que el programa debe conservar

- Falta evidencia contractual fuerte; no se afirmará de nuevo que jurídicamente
  no existe contrato alguno. El Código Civil Federal reconoce consentimiento
  expreso y tácito por medios electrónicos.
- La LFPDPPP vigente ubica identidad y domicilio del responsable en el artículo
  15. No se reutilizará la numeración de la ley anterior.
- Bajo GDPR, aceptar términos, reconocer un aviso y consentir tratamientos
  opcionales son actos distintos.
- Un representante UE o UK y un DPO son funciones reales, no nombres de buzón ni
  campos que un DPA pueda crear por sí solo.
- `tipoUsoPosibleMultiOT` identifica características del SIF; no sustituye la
  declaración responsable visible y conservada por cada versión.
- Una tabla estática `país -> máximo legal de interés` no se publicará sin
  distinguir al menos tipo de cliente, operación, fecha y norma aplicable.
- Constituir una sociedad futura no cambia automáticamente la contraparte de los
  contratos: requiere una migración operativa y jurídica separada.

## Resultado de la fase 2 — corpus y aceptación versionada

Fase ejecutada el **29 de agosto de 2026**. El alcance cerró la infraestructura
de publicación y la evidencia personal de términos/aviso; no pretende declarar
completos los anexos por país, el DPA ni la revisión jurídica externa.

### Catálogo publicado

El repositorio ya tiene una colección `legal` tipada y un catálogo ejecutable
para cuatro variantes del bundle inicial:

| Documento | Versión | Locale | Acción | Ruta | SHA-256 del `<main>` renderizado |
|---|---|---|---|---|---|
| Términos | `2026-08-11` | `es-MX` | `accepted` | `/terminos` | `caca9992…db369` |
| Términos | `2026-08-11` | `en-US` | `accepted` | `/en/terminos` | `891f4c86…18fd7` |
| Privacidad | `2026-08-11` | `es-MX` | `acknowledged` | `/privacidad` | `5c33c600…60881` |
| Privacidad | `2026-08-11` | `en-US` | `acknowledged` | `/en/privacidad` | `4d2674ef…9e597` |

Los hashes son por variante, no por documento lógico. El comando
`npm run security:legal`, ejecutado después del build, extrae el cuerpo legal
renderizado, recalcula los cuatro hashes y comprueba que catálogo TypeScript,
manifiestos editoriales y `db/schema.sql` coincidan. Un cambio silencioso bajo
la misma versión rompe el gate.

Las rutas inglesas se prerenderizan explícitamente. La fase 5 trasladó los cuatro
cuerpos completos a Markdown con HTML literal (`sourceKind: html-snapshot`),
conservando los artefactos aceptados byte por byte. La composición de documentos
independientes y anexos continúa en revisión editorial; el inventario vigente
está en [../estado/legal-corpus.md](../estado/legal-corpus.md). No se publica `pt-BR` incompleto ni se
configura fallback legal a inglés.

### Evidencia y flujos

- `legal_documents` separa documento lógico y versión.
- `legal_document_variants` agrega locale, jurisdicción, ruta y hash de artefacto.
- `legal_acceptances` conserva usuario, versión exacta, variante, acción, scope,
  superficie, IP confiable, user-agent y momento. La referencia al usuario es
  deliberadamente pseudónima y no se borra en cascada con la cuenta; la política
  de retención/redacción sigue pendiente.
- `legal_acceptance_intents` guarda durante 15 minutos el snapshot exacto que se
  mostró antes de un alta OAuth. El token crudo sólo vive en cookie HttpOnly; en
  base queda SHA-256 y el consumo es de un solo uso.
- Alta por contraseña crea usuario y dos evidencias en una función transaccional.
  Google y Apple crean usuario, vínculo OAuth y evidencias en otra transacción.
- La pantalla de registro exige por separado aceptar Términos y confirmar lectura
  del Aviso. La segunda acción no se presenta ni registra como consentimiento a
  analítica; el banner de cookies conserva esa decisión opcional.
- Cuentas históricas sin evidencia quedan confinadas a
  `/app/aceptacion-legal`. El gate falla cerrado, pero deja disponibles
  facturación, exportación, baja y cierre de sesión. Las invitaciones también
  comprueban la aceptación personal antes de activar la membresía.
- RLS está habilitado y forzado sobre evidencias e intenciones. El rol de app no
  tiene escrituras directas: sólo funciones `SECURITY DEFINER` estrechas.

### Despliegue y límites honestos

La migración está escrita en `db/schema.sql`, pero **no se ejecutó contra Neon en
esta fase**. El orden obligatorio de despliegue es migración primero y aplicación
después; las altas nuevas dependen de las funciones SQL y el gate está diseñado
para fallar cerrado si no puede demostrar la versión vigente.

Persisten estos bloqueos:

- falta el domicilio verificable del responsable exigido por el artículo 15 de
  la LFPDPPP, además de RFC/contactos dedicados y confirmación del foro;
- la identidad aún vive dentro de los cuerpos heredados y se parametrizará sólo
  cuando existan datos verificados; no se inventó una dirección;
- faltan DPA completo, subprocesadores verificables, transferencias, AUP, SLA y
  anexos jurisdiccionales;
- falta definir retención y eventual redacción de IP/user-agent en la evidencia;
- falta todo el corpus `pt-BR` y el selector país/idioma correspondiente.

### Evidencia técnica de fase 2

| Verificación | Resultado |
|---|---|
| `npm run typecheck` | Pasa |
| `npm test` | Pasa: 14 archivos, 187 pruebas |
| `npm run build` | Pasa; conserva advertencias preexistentes de prerender y tamaño de chunk |
| `npm run security:legal` | Pasa: 4 variantes publicadas y verificadas |
| `npm run security:csrf` | Pasa |
| `npm run security:tenancy` | Pasa: 59 tablas |
| `git diff --check` | Pasa |

Fuentes primarias de referencia inicial:

- [LFPDPPP vigente](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf)
- [Código Civil Federal](https://www.diputados.gob.mx/LeyesBiblio/pdf/CCF.pdf)
- [GDPR consolidado](https://eur-lex.europa.eu/eli/reg/2016/679/ojv)
- [Real Decreto 1007/2023](https://www.boe.es/eli/es/rd/2023/12/05/1007)
- [Orden HAC/1177/2024](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-22138)
- [Aceptación de acuerdos de cuentas Connect](https://docs.stripe.com/connect/updating-service-agreements)

## Resultado de la fase 3 — identidad, terceros y veracidad de privacidad

Fase ejecutada el **29 de agosto de 2026**. Esta fase corrige afirmaciones
contractuales y crea controles de preparación; no sustituye la evidencia de
cuenta de cada proveedor ni la revisión de abogados.

### Identidad y gate de publicación

`src/lib/legal-identity.ts` es ahora la fuente única de la contraparte pública.
Conserva únicamente el nombre ya publicado, `Andre Valle Ortega`, y no rellena
con ejemplos los datos que faltan. `.env.example` declara los campos públicos y
`npm run security:legal-release` bloquea una publicación contractual estricta
mientras falten:

- domicilio verificable;
- identificación fiscal;
- contacto de privacidad confirmado;
- ley aplicable confirmada;
- foro confirmado.

Las evaluaciones de representante UE/Reino Unido también tienen campos propios,
pero no se convierten en nombres ficticios ni en una supuesta exención. El aviso
publica de forma visible que el domicilio sigue siendo un pendiente abierto.

### Inventario de terceros y DPA

`src/lib/legal-providers.ts` clasifica 13 entradas a partir de consumidores
reales del código:

1. subencargados;
2. proveedores con obligaciones regulatorias o relaciones propias;
3. autoridades/destinatarios legales;
4. integraciones dirigidas por el Cliente.

Esto retira cuatro simplificaciones incorrectas del aviso anterior: Stripe no
tiene un único rol universal; AEAT no es un subencargado; Google y Apple son
proveedores de identidad seleccionados por la persona; y los IdP SAML, servidores
MCP, Slack y webhooks configurados por el Cliente son transferencias instruidas,
no proveedores elegidos silenciosamente por Cord.

Los DPA y políticas públicas de un proveedor se registran como evidencia de sus
términos publicados. No se consideran prueba de la región, configuración o
aceptación contractual de la cuenta de Cord. Nueve entradas conservan por ello
`account-evidence-pending`.

Existe un borrador bilingüe de DPA en la colección legal. Cubre instrucciones,
confidencialidad, seguridad, derechos, incidentes sin dilación indebida,
eliminación/devolución, auditoría, subencargados, transferencias e integraciones
dirigidas por el Cliente. Permanece `publicationStatus: draft`, con hash
provisional y sin ruta pública: no está ejecutado ni se presenta como vigente.

### Aviso de privacidad 2026-08-29

La versión `2026-08-29` sucede a `2026-08-11` y obliga a nuevo reconocimiento
personal. Sus artefactos son:

| Locale | Ruta | SHA-256 del `<main>` |
|---|---|---|
| `es-MX` | `/privacidad` | `469dd0c2…6dbf4` |
| `en-US` | `/en/privacidad` | `4f10b326…9bb10` |

Correcciones materiales:

- el aviso ya no afirma que usar Cord celebre automáticamente un DPA;
- Verifactu distingue cadena construida de envío AEAT, desactivado por defecto;
- el uso comercial de Anthropic se describe conforme a su política pública, no
  como una garantía contractual propia sin evidencia de cuenta;
- PostHog separa captura del navegador bajo consentimiento de telemetría de
  negocio del servidor a nivel organización;
- Vercel Analytics deja de recibir query strings e identificadores en rutas de
  clientes, documentos, disputas, SSO, invitaciones y tokens públicos;
- “anonimizado” deja de significar imposibilidad absoluta de reidentificación;
- incidentes de encargado usan “sin dilación indebida”; las 72 horas del GDPR no
  se presentan como 72 horas hábiles hacia el Cliente;
- el borrado distingue base primaria, proveedores, respaldos y evidencia legal;
- no se pide identificación oficial completa por correo como requisito inicial;
- el uso continuado ya no se llama aceptación explícita: el gate versionado de
  fase 2 registra el nuevo reconocimiento.

La misma segunda pasada corrigió Soporte y Ajustes, que todavía prometían un
borrado “total”, un año de auditoría no demostrado, cinco años de archivo Cord y
borrado de PAN tokenizado que Cord no almacena.

### Estado de despliegue

La nueva versión y el cambio de puntero `is_current` están escritos en
`db/schema.sql`, pero no se ejecutaron contra Neon. Igual que en fase 2, la
migración debe correr antes que la aplicación. No se ejecutó despliegue ni se
aceptaron contratos de proveedores desde esta fase.

### Evidencia técnica de fase 3

| Verificación | Resultado |
|---|---|
| `npm run typecheck` | Pasa |
| `npm test` | Pasa: 16 archivos, 193 pruebas |
| `npm run build` | Pasa; conserva advertencias preexistentes de prerender y tamaño de chunk |
| `npm run security:legal` | Pasa: 4 variantes, 13 terceros y pendientes declarados |
| `npm run security:legal-release` | Falla de forma esperada: 5 campos de identidad y 9 evidencias de cuenta pendientes |
| `npm run security:csrf` | Pasa |
| `npm run security:tenancy` | Pasa: 59 tablas |
| `git diff --check` | Pasa |

Fuentes primarias utilizadas en esta fase:

- [GDPR, artículos 28 y 44](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [CCT para transferencias, Decisión 2021/914](https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj)
- [LFPDPPP vigente](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf)
- [LGPD de Brasil](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
- [Privacidad de Vercel Web Analytics](https://vercel.com/docs/analytics/privacy-policy)
- [Uso de datos comerciales de Anthropic](https://privacy.anthropic.com/en/articles/7996885-how-do-you-use-personal-data-in-model-training)
- [DPA de Stripe](https://stripe.com/legal/dpa)
- [DPA de Resend](https://resend.com/legal/dpa)

## Resultado de la fase 4 — disponibilidad demostrable

La página de status dejó de ser un documento prerenderizado y ahora deriva su
estado exclusivamente de muestras reales. `GET /api/health` exige
`CRON_SECRET`; la configuración vigente de Vercel Hobby lo agenda una vez al día
(10:00 UTC), con frescura máxima de 26 horas, y el handler abre
`cronScope` antes de usar `withSystemTx`.

Cada ejecución mide tres señales independientes:

1. `select 1` contra Neon por el carril de sistema;
2. lectura autenticada de `/v1/balance` en Stripe, sin crear ni modificar dinero;
3. respuesta HTML y marcadores de render de `/q/demo`.

`health_checks` conserva servicio, resultado, latencia y fecha. No almacena
errores, llaves, respuestas de proveedores ni datos de clientes. Si Neon no
permite persistir una ejecución, el endpoint falla y la muestra anterior termina
obsoleta: la página muestra “sin señal reciente” en vez de asumir éxito.

La vista pública declara que son sondas sintéticas, calcula el porcentaje sobre
las muestras que realmente existen dentro de una ventana máxima de 90 días y no
lo presenta como SLA contractual. El texto vigente de términos conserva el
esquema de mejores esfuerzos y exige un acuerdo escrito separado para cualquier
nivel de servicio.

Los incidentes viven en `status_incidents`, sin filas sembradas. `/ops/status`
permite que un administrador los redacte obligatoriamente en español e inglés y
cambie su estado entre investigación, identificación, monitoreo y resolución.
Cada mutación se registra en `ops_audit_log` dentro de la misma transacción; la
interfaz no ofrece eliminación.

### Evidencia técnica de fase 4

| Verificación | Resultado |
|---|---|
| `npm run security:health` | Pasa: cron autenticado, status SSR y cero incidentes sembrados |
| `npm run typecheck` | Pasa |
| `npm test` | Pasa: 17 archivos, 197 pruebas |
| `npm run build` | Pasa; conserva advertencias preexistentes de prerender y tamaño de chunk |
| `npm run security:legal` | Pasa: las cuatro variantes publicadas conservan su hash |
| `npm run security:tenancy` | Pasa: 59 tablas multi-tenant, sin deuda nueva |
| `npm run security:csrf` | Pasa |
| `npm run security:css` | Pasa sobre el bundle producido |
| `git diff --check` | Pasa |

### Estado de despliegue de fase 4

El schema, cron, endpoint, página SSR y control de Ops están implementados
localmente. No se ejecutó `npm run db:migrate` ni se desplegó Vercel. Hasta que la
migración y el despliegue ocurran en ese orden, la página seguirá sin muestras
reales y no hará una afirmación positiva de disponibilidad. La cadencia original
de cinco minutos fue reemplazada por una diaria para el plan Hobby indicado por
el usuario; este cambio no convierte las muestras en monitoreo continuo ni SLA.

## Fase 5 — extracción terminada, revisión editorial pendiente

Las cuatro variantes públicas se sirven desde el corpus por idioma sin modificar
URLs, versiones, hashes, estilos ni evidencia de aceptación. Hay 22 nuevos
extractos complementarios y dos DPA previos, todos en borrador y sin rutas públicas.
El plan editorial abarca 27 documentos en tres idiomas: faltan 53 variantes,
incluidos los anexos locales y todo PT-BR. No se presentan como completas.

El adaptador rechaza contenido, idioma, ruta o entradas de identidad/proveedores
que no correspondan con la publicación. Los checks verifican además las hojas de
estilo de los artefactos y todos los destinos de sus índices. No se cambió el
schema ni se ejecutó una migración o despliegue en esta fase.

El formato de preservación, inventario, decisiones de publicación y trabajo
pendiente están en [../estado/legal-corpus.md](../estado/legal-corpus.md). El gate estricto del corpus
permanece bloqueado por diseño; la extracción no equivale a aprobación jurídica.

La fase 5.1 preparó cuatro revisiones completas ES/EN de términos y privacidad,
sin publicarlas. Corrigen límites/excedentes, estados fiscales, alcance de KYC,
retención, finalidades opcionales y evidencia de aceptación. La propuesta vive
en una colección distinta, sin vigencia ni hash de publicación. La matriz de
cambios, fuentes y bloqueos técnicos/jurídicos está en
[revisiones-legales/2026-08-30-general.md](revisiones-legales/2026-08-30-general.md).

La fase 5.2 reescribió ocho extractos en condiciones/avisos independientes de
pagos, facturación, KYC y evidencia ES/EN, todavía en borrador técnico. Quedan
—en el corte de esa fase— 14 extractos y dos DPA previos sin completar: el total
seguía en 24 borradores, con 53 variantes ausentes. Un guard compartido bloquea
publicación/aceptación accidental. La revisión detectó además omisión del desglose fiscal al enviar
partidas a Facturapi y cancelación CFDI que confunde respuesta HTTP exitosa con
estado fiscal final; se documentaron, **no se corrigió runtime en esta fase**.
Evidencia y criterios de salida en
[revisiones-legales/2026-08-30-payments.md](revisiones-legales/2026-08-30-payments.md).

La fase 5.3 reescribió los seis extractos ES/EN de cobranza, divulgación de IA y
uso aceptable como propuestas técnicas independientes. El inventario sigue en 24
borradores y 53 variantes ausentes, pero ahora 14 de los 22 extractos tienen
redacción técnica y sólo ocho conservan material fuente sin corregir. La revisión
documentó tres bloqueos P0: aceptación de cuotas con participantes indistinguibles,
herramientas MCP autorizadas como `[*]` sin confirmación por llamada y solicitudes
de cese que dependen de un buzón del acreedor porque el inbound de Cord está
cerrado. También retiró promesas no demostradas de detección universal, reporte
automático e infraestructura dedicada. No se cambió runtime, schema, datos,
publicación ni despliegue. Matriz y fuentes en
[revisiones-legales/2026-09-01-automation.md](revisiones-legales/2026-09-01-automation.md).

La fase 5.4 completó los diez textos ES/EN de DPA, subencargados, cookies,
retención y SLA. Los 24 borradores existentes tienen ahora redacción técnica; no
se crearon las 53 variantes ausentes. El DPA dejó de declarar una acción de
aceptación mientras no está ofrecido ni ejecutado. La revisión encontró como P0
la contradicción entre retención KYC de cinco años y borrado `on delete cascade`,
la desaparición del audit de borrado, exportación parcial presentada internamente
como total, analítica server-side fuera de la decisión de cookies y uso de sondas
diarias insuficiente para cualquier porcentaje SLA. Quedaron documentados, **sin
cambiar runtime o schema**. Evidencia y prioridades en
[revisiones-legales/2026-09-01-data-governance.md](revisiones-legales/2026-09-01-data-governance.md).

## Resultado de verificaciones

| Verificación | Resultado de fase 0 |
|---|---|
| `npm run typecheck` | Pasa |
| `npm run test` | Pasa: 11 archivos, 176 pruebas |
| `npm run build` | Pasa con advertencias de prerender y tamaño de chunk |
| `npm run test:payments` | Falla en `security:whitelabel` por cinco menciones de Stripe dentro de documentación nueva/no rastreada |
| `security:disputes` | Pasa |
| `security:billing` | Pasa: 69 verificaciones |
| `security:currency` | Pasa |
| `security:tax` | Pasa |
| `security:fiscal` | Pasa |
| `security:verifactu` | Pasa contra vectores y esquemas incluidos |
| `security:payments` | Pasa: 15 rutas, sin deuda pendiente detectada |
| `security:tenancy` | Pasa: 58 tablas, sin deuda de código detectada |
| `security:css` | Pasa sobre el bundle producido |
| `security:billing-live` | Falla: un Price de Stripe no tiene opción USD |
| `security:billing-db` | Pasa estructuralmente; la salida reporta que la suscripción activa observada no tiene evidencia de periodo pagado |
| `security:rls` | Falla: rol con bypass y tres huecos adicionales de RLS/FORCE |

El fallo de `test:payments` ocurre antes de ejecutar las verificaciones posteriores;
por eso se ejecutaron individualmente y sus resultados se registran arriba. Las
cinco menciones que rompen `security:whitelabel` pertenecen a archivos no
rastreados que ya estaban en el worktree al iniciar esta fase; no fueron creadas
por el programa legal.

## Criterio de salida de fase 0

- Línea base técnica reproducible: completa.
- Inventario cuantitativo inicial: completo.
- Fuentes legales actuales identificadas: completo para arrancar la matriz; la
  validación por jurisdicción sigue pendiente.
- Hallazgos priorizados y separados de las correcciones: completo.
- Cambios locales previos preservados: completo.
- Comportamiento de producción modificado: ninguno.

La fase siguiente autorizada es la **fase 1: contención urgente**. Los fallos de
esta línea base no se corrigen retroactivamente en el reporte; cada fase actualizará
el estado y conservará aquí la diferencia respecto de esta fotografía.
