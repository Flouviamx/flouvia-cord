# Confiabilidad de Cord — estado y evidencia

Alcance: Cord Payments, Cord Invoicing, enlaces públicos, autenticación y suscripción.
Primero se completa la fase 1 de confiabilidad; después la fase 2 de utilidad para
negocios que venden productos y servicios, con igual prioridad.

## Inventario de lo trabajado

| Bloque | Implementación y beneficio | Fuente operativa |
| --- | --- | --- |
| Acceso 2FA | Bloqueo también en API de sesión cuando el equipo exige 2FA; excepciones exactas para completar recuperación. Evita saltarse la pantalla. | `src/middleware.ts`, `src/lib/two-factor-gate.ts` |
| Pagos parciales de factura | Comprueba el saldo y el intento anterior; permite un siguiente cobro tras aplicar el anterior. | `src/pages/api/i/[token]/payment-intent.ts` |
| Reembolsos | Un solo manejo de `refund.updated`, lectura vigente y registro idempotente. Conserva eventos que llegan antes del pago. | `src/pages/api/stripe/webhook.ts`, `src/lib/fiscal/reconciliation.ts` |
| Conciliación documental | Separa pago, crédito emitido, devolución confirmada, saldo y devolución pendiente, con locks por factura/pago. | `src/lib/fiscal/reconciliation.ts`, `src/lib/fiscal/payments.ts` |
| Emisión mexicana | Mapea impuestos y retenciones por concepto; notas E ligadas al UUID original; preserva contexto de credenciales. | `src/lib/fiscal/providers/MexicoSatProvider.ts`, `src/lib/fiscal/invoices.ts` |
| Cancelación | Pendiente/verifying no anula. Rechazo/expiración conservan vigencia; consulta manual desde el detalle. | `src/lib/fiscal/invoices.ts`, `src/pages/api/facturas/[id].ts` |
| Descargas públicas | Token autoriza solo su factura y formato; cabeceras privadas y proveedor consultado en servidor. | `src/lib/fiscal/invoice-download.ts`, `src/pages/api/i/[token]/documents/[format].ts` |
| Enlace de factura | Acción según estado, contacto, saldo actualizable, confirmación real tras el retorno y lectura móvil. | `src/pages/i/[token].astro` |
| Recurrencias | Reserva compare-and-set por fecha y versión; calendario desde periodo programado y fecha final; pausa/edición concurrente. | `src/lib/fiscal/recurrencias.ts`, `src/lib/fiscal/recurrence-calendar.ts` |
| Planes USD/EUR | Opciones del proveedor verificadas, EUR fijo aprobado, divisa contractual preservada, resumen validado y ciclo anual conservado. | `src/lib/plan-currency.ts`, `src/lib/plan-eur-rates.ts`, `src/pages/api/billing/subscribe.ts` |
| Marca y excedentes | Personalización según plan efectivo; tres decimales donde corresponden y total anual visible. | `src/lib/plan-overage-pricing.ts`, `src/lib/queries.ts` |
| SPEI/tarjeta | Cancelación confirmada antes de reemplazo; intento durable, hash, clave estable, límite de 23 h si resultado desconocido; vínculo antes de confirmar SPEI. | `src/lib/quote-payment-attempts.ts`, `src/pages/api/q/[token]/payment-intent.ts` |
| Comisiones de factura directa | Conserva desglose al crear/actualizar el intento; concilia cargo en su cuenta y vincula org/documento; importes inciertos van a revisión. No cambia tarifas. | `src/lib/invoice-payment-fees.ts`, webhook y ruta de factura |
| Inactividad de sesión | Lectura de cookie sin renovar; API/app/billing y alta de passkeys comprueban y actualizan bajo lock en una sola sentencia. | `src/lib/auth.ts`, `src/middleware.ts` |
| Contratos de validación | Se repararon referencias legales desfasadas, matriz de dominio propio ya existente y catálogo de cinco eventos ya emitidos por docs. | `test/legal-supplemental-review.test.ts`, `scripts/billing-security-check.mjs`, `src/lib/analytics-events.ts` |

## Operaciones autorizadas ya ejecutadas

- Migración de conciliación de facturas: tres columnas y `documento_reembolsos`.
  Sin recálculo masivo ni alteración de saldos históricos.
- 23 opciones USD LIVE y 17 EUR LIVE (6 base y 11 medidos), sobre precios existentes.
  No se migraron contratos activos ni se ejecutaron cobros.
- Tabla `cotizacion_pago_intentos` y relación compuesta negocio/cobro aplicadas a
  la base conectada. Preflight: cero cobros. ENABLE/FORCE RLS y FK verificados.
- No se cambiaron credenciales globales para activar `cord_app`. Una migración
  aplicada desde el entorno local no demuestra igualdad con la base de producción.

Los precios y tarifas exactos viven en [negocio-billing.md](negocio-billing.md),
`billing.ts` y `plan-eur-rates.ts`, no se duplican aquí.

## Evidencia y límites

El cierre del primer bloque SPEI/tarjeta pasó 567 pruebas en 47 archivos, incluyendo
35 nuevas (20 de ruta y 15 de SQL/migración), `test:payments`, tipos y build.
Las consultas de Billing LIVE y DB también pasaron. Son ejecuciones concretas,
no un contador garantizado para cualquier futuro checkout del repositorio.

El bloque posterior de comisiones y sesiones pasó 632 pruebas en 51 archivos,
incluidas pruebas de ruta, webhook firmado localmente y SQL. La suite y build se ejecutaron además en una copia sin archivos
`.env` de credenciales; se reutilizaron dependencias locales. Esto no demuestra
instalación limpia ni ejecución en el runner Linux de GitHub.

Pruebas unitarias: proveedor simulado y regresiones deterministas. SQL: PGlite
con restricciones, transacciones y rol limitado. Auditorías LIVE: lectura de
configuración. Ninguna sustituye Stripe TEST integrado, prueba fiscal sandbox,
restauración de respaldos o aislamiento con la credencial real de despliegue.

El estado de publicación debe verificarse por archivo/commit desplegado. Un
estado READY en Vercel no demuestra por sí solo que todos estos cambios estén allí.
La actualización documental no debe desplegar el worktree compartido completo.

## Fase 1 pendiente y criterios de cierre

1. **Comisiones de factura directa — implementado localmente:** conciliador propio
   para pagos sin `cotizacion_cobros`, sin migración. Unicidad org/PaymentIntent,
   cargo/cuenta/divisa comprobados, fecha del cargo y desglose guardado al preparar
   el pago. Sin balance: `pending`; sin desglose verificable o con FX: `needs_review`,
   fuera del borrador mensual. `application_fee.created` tardío conserva revisión,
   pendiente y devolución. Fallos de consulta liberan el evento para reintento.
   Falta aceptación integrada, recuperación automática de `pending` y verificar
   periodos contables ya cerrados. No hay backfill ni timbrado/cobro real nuevo.
2. **Checkout anterior — unificación autorizada y preparada:** la API conserva
   `{ url }` pero devuelve `/q/<token>/pay`; deja de crear Customers/Checkout
   Sessions. No modifica `checkout_v2` ni tarifas. `audit-legacy-checkout.mjs`
   revisó el 8-sep (03:06 UTC del 9-sep) tres cuentas conectadas LIVE: cero sesiones
   `open`/`complete`, una org con flag anterior. No se canceló ninguna sesión.
   Repetir auditoría antes y después de publicar y revisar cualquier pendiente detectado.
   Las transferencias tardías y resultados inciertos requieren recuperación
   adicional: no hay devolución automática ni clave fresca tras 23 h.
3. **Aislamiento real:** seguir [el runbook cord_app](../../db/RUNBOOK-cord-app.md),
   probar dos organizaciones con la credencial real y preparar reversión antes de
   cambiar rol/conexión. Requiere aprobación operativa específica.
4. **Inactividad de sesión — implementado localmente:** `validateSession` ya no
   renueva actividad. `authorizeSessionActivity` bloquea la fila, comprueba timeout,
   TTL, revocación y suspensión, y actualiza o elimina en una sentencia. Se aplica
   en app, API interna protegida, billing y registro de passkeys. Páginas públicas
   y recuperación 2FA no renuevan; las rutas de recuperación conservan acceso para
   una identidad válida sin conferir acceso de negocio. Actividad = requests, no
   mouse; polling protegido puede contar. Cada solicitud comprobada escribe
   `last_used_at`; TTL/cookie se deslizan con throttle de 5 min. Sin migración.
   Falta aceptación integrada de login, múltiples organizaciones, retorno de
   Billing y flujos OAuth de vinculación (no se modificaron esos handlers).
5. **Eventos, CI y operación:** cuatro workflows versionados; `.gitignore` ignora
   `.github/workflows/*` y cada uno entra con una excepción explícita.
   - `cord-reliability.yml` — PR, push a main y manual: `npm ci` en app y
     Elements, `agents:check`, pruebas/contratos (`test:payments`, que incluye
     `security:i18n`), tipos (`astro sync` antes de `tsc`), build y CSS, sin
     secretos LIVE ni migraciones. En verde en GitHub desde sep 2026.
   - `elements.yml` — solo si cambia `packages/elements/**`: tipos, build,
     exports contra `api-report.json`, `attw` y `publint`. En verde desde sep 2026.
   - `status-probe.yml` — sonda horaria de disponibilidad (ver `cord-ops.md`).
   - `cord-crons.yml` — segundo reloj de los crons; el contrato completo está
     en [Crons: dos relojes y reclamo por periodo](#crons-dos-relojes-y-reclamo-por-periodo).
     Un endpoint que no responde 200 hace fallar el job (GitHub avisa por
     correo); requiere el secret `CRON_SECRET` del repositorio, con el mismo
     valor que la variable en Vercel.

   Las acciones oficiales corren en Node 24 (`checkout@v7`, `setup-node@v7`,
   `setup-python@v7`, verificadas en el `action.yml` de cada tag, oct 2026);
   las versiones anteriores (`@v4`/`@v5`) corrían en Node 20 y GitHub las
   marcaba como obsoletas. `publish-packages.yml` no usa caché de npm: es el
   único job con `id-token: write`.

   Ninguno está configurado como check obligatorio de rama ni como puerta de
   Vercel: un push a main despliega aunque CI falle.
   Faltan entrega durable de eventos de negocio y evidencia de restauración de
   un respaldo en un entorno aislado. Los crons ya se recuperan solos y su fallo
   avisa (ver abajo); los demás eventos todavía no.
6. **Aceptación y publicación:** recorridos completos de pago/factura en TEST,
   permisos entre empresas, móvil, rollback y verificación posterior al despliegue.

## Crons: dos relojes y reclamo por periodo

Estado vigente (oct 2026). Los endpoints viven en `src/pages/api/cron/*` y todos
validan `CRON_SECRET` con `assertCronAuth()` antes de cualquier otra cosa.

**Dos relojes.**

- `crons` de `vercel.json` es el reloj principal de los diarios y mensuales. El
  plan Hobby solo admite crons diarios (un horario sub-diario rechaza el
  deployment entero) y Vercel no reintenta una corrida fallida.
- `.github/workflows/cord-crons.yml` es el reloj de recuperación y el de los
  endpoints que necesitan varias corridas al día. GitHub no corre el schedule a
  la hora pedida: del 1 al 8 oct 2026 corrió 3-4 veces al día a horas
  variables. Por eso no compara la hora exacta: en cada corrida llama todo
  endpoint cuya hora programada YA PASÓ hoy (UTC), los mensuales si su día ya
  pasó en el mes, y los de "cada corrida". La lista sale de
  `scripts/cron-schedule.mjs`, que lee `vercel.json`: no hay una segunda tabla
  a mano. `node scripts/cron-schedule.mjs --tabla` la imprime y
  `--at <ISO>` simula una hora.

**Reclamo por periodo.** `runCronOnce(request, endpoint, periodo, fn)`
(`src/lib/cron-runs.ts`) reclama `(endpoint, periodo)` en la tabla `cron_runs`
con un `insert … on conflict` atómico antes de trabajar:

- el segundo disparo del mismo periodo responde 200 `omitido` sin trabajar;
- un periodo que terminó en `error` (5xx o excepción) o que lleva más de 30 min
  en `running` (la función murió) se vuelve a reclamar en la corrida siguiente;
- si la tabla no existe o la base no responde al reclamar, el cron corre igual
  y lo deja en el log: falla ABIERTO, porque cada endpoint conserva su
  idempotencia por fila y un cron detenido por la bitácora es peor que uno
  repetido;
- `?force=1` (input `force` del workflow manual) repite un periodo ya `ok`,
  nunca uno en curso;
- la tabla no tiene `org_id`: RLS forzada y una sola política, la del carril
  de sistema (regla 30). Sin retención automática (unas 20-40 filas al día).

| Endpoint | Horario (UTC) | Reclamo | Por qué |
|---|---|---|---|
| `recordatorios`, `cobranza`, `expirar-cotizaciones`, `anclas-tiempo`, `recurrencias`, `informes-programados`, `integraciones`, `billing-reconcile`, `webhooks-limpieza`, `limpieza-capturas` | diario, `vercel.json` | día | una vez al día; se recupera si Vercel no corrió o falló |
| `intereses` (día 1), `comisiones-mensuales` (día 2) | mensual | mes | se recupera cualquier día posterior del mes |
| `verifactu-submit` | diario + cada corrida de GitHub | hora | remisión lo más inmediata posible sin dos envíos simultáneos del mismo lote |
| `workflows`, `webhooks` | diario + cada corrida de GitHub | ninguno | se repiten a propósito; su seguridad es por fila (compare-and-set, lease con `skip locked`) |
| `tareas` | solo cada corrida de GitHub (no está en `vercel.json`) | ninguno | decide él mismo en qué zonas ya son las 8:00; dedup por tarea (`tareas.recordada_el`) y por persona y día (`org_members.tareas_avisadas_el`) |
| `stripe-webhook-health` | diario | ninguno | solo lee; la alerta se acota a una cada 24 h |
| `/api/health` | diario | ninguno | lo muestrea `status-probe.yml` cada hora; cord-crons no lo llama |
| `comisiones-emitir` | manual (POST) | — | Ops lo invoca tras revisar el borrador; no está programado |

**Aislamiento.** El barrido descubre organizaciones en `withSystemTx` y el
trabajo de cada una vuelve a `withOrgTx`; la excepción de una organización (o
de un documento) se registra y la corrida sigue con las demás.

**Límites conocidos.**

- Un día UTC en que ni Vercel ni ninguna corrida de GitHub posterior a la hora
  programada lleguen a correr se pierde para los endpoints de ventana exacta
  (el aviso "por vencer" de `expirar-cotizaciones`); los de escalera o ventana
  (`recordatorios`, `anclas-tiempo`, `recurrencias`) lo retoman al día
  siguiente.
- La precisión horaria de `workflows` ("cada lunes a las 9") depende de
  GitHub: hoy llega con horas de retraso. Opciones, ninguna contratada:
  Vercel Pro (precio por miembro del equipo; admite crons sub-diarios, así
  que `workflows` y `webhooks` podrían ir cada hora en `vercel.json`; verificar
  precio y límites vigentes antes de decidir), o un cron externo con nivel
  gratuito (cron-job.org, Upstash QStash) que llame los mismos endpoints con
  `CRON_SECRET`: cero o pocos dólares, pero es otro proveedor que vigilar y
  otro lugar donde vive el secreto. Disparar el workflow por
  `repository_dispatch` desde ese mismo servicio no gana nada sobre llamarlo
  directo. Con el
  reclamo por periodo cualquiera de ellos se puede sumar como tercer reloj sin
  cambiar los endpoints.
- `intereses` hace una escritura por documento; con carteras de miles de
  documentos vencidos puede acercarse al límite de 300 s de la función.

**Cómo agregar un cron.**

1. Crea `src/pages/api/cron/<nombre>.ts` con `export const prerender = false`,
   `assertCronAuth()` primero, y el trabajo dentro de
   `runCronOnce(request, '/api/cron/<nombre>', cronPeriod('dia' | 'mes' | 'hora'), () => run())`.
   Sin reclamo solo si el endpoint es seguro de repetir por construcción, y
   entonces va en `EN_CADA_CORRIDA` de `scripts/cron-schedule.mjs` con el
   motivo.
2. Barrido en `withSystemTx`, trabajo por organización en `withOrgTx`, con
   `try/catch` por organización (regla 30).
3. Prográmalo en `crons` de `vercel.json` como `M H * * *` o `M H D * *` (día
   del mes hasta 28). cord-crons.yml lo recupera sin tocar el workflow.
4. `test/cron-runs-db.test.ts` verifica que todo cron de `vercel.json` se llame
   o tenga motivo en `NO_LLAMAR`, y que cada ruta exista.

## Fase 2 — no iniciada

Continuidad del trato y expediente comercial, acciones con responsables, bandeja
operativa, hitos para servicios, recompra de productos e integraciones útiles.
Son propuestas posteriores; no se publican como capacidades entregadas.

## Documentación externa

La guía ES/EN `pagos/mejoras-confiabilidad` reúne cambios, beneficios y límites.
Las guías de suscripción, métodos, facturas, recurrencias y seguridad desarrollan
el uso. Ayuda incluye saldo/créditos, enlace de factura, cambio de método y
cancelaciones. El roadmap conserva el programa de confiabilidad como `next`
hasta completar la aceptación, sin convertir las propuestas de fase 2 en `live`.

Las decisiones fechadas se registran solo en
[historial de billing y cobros](../historial/billing-cobros.md).

## Ampliación autorizada: facturación en Free

Implementación local, pendiente de publicación: documentos comerciales en Free,
emisión fiscal integrada desde Starter y cuota mensual 5/20/500/100 (Developer
conserva 1.000). Contrato en [Negocio y Billing](negocio-billing.md#contrato-documental-implementado-localmente).
Se comparte emisión y medición para cotizaciones, facturas directas, API y
recurrencias. Una reserva pendiente no dispara excedentes sobre otra factura;
los documentos confirmados permiten recuperar su reserva de consumo en el cron.

Este bloque **no cierra la fase 1**: siguen pendientes recuperación durable de
los eventos de negocio, aislamiento con la conexión real, restauración demostrada
de respaldos y pruebas integradas con proveedores. Recuperar el consumo de una
factura no equivale a recuperar todos sus eventos ni una emisión fiscal incierta.

### Fallos de transporte de base de datos al abrir la app

El wrapper HTTP de Neon registra únicamente el código de transporte final, sin
URL, SQL, parámetros ni credenciales. Conserva los reintentos acotados a fallos
de conexión seguros. La capa exterior del middleware devuelve una página 503
no cacheable con reintento manual para errores de transporte Neon en GET de
`/app`; no acepta una sesión sin validarla, no muestra datos sustitutos y no
repite mutaciones. Los errores SQL y las demás rutas mantienen su tratamiento.
Contrato: `database-unavailable.ts` y `test/database-unavailable.test.ts`.
