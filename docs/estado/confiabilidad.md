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
5. **Eventos, CI y operación:** `.github/workflows/cord-reliability.yml` preparado
   para PR, push a main y ejecución manual: `npm ci` en app y Elements, pruebas/contratos (dos workers en CI), tipos,
   build y CSS, sin secretos LIVE ni migraciones. El workflow aún no ha corrido
   en GitHub y no se configuró como check obligatorio de rama ni puerta de Vercel.
   Faltan entrega durable, recuperación automática, alertas accionables y evidencia
   de restauración de un respaldo en un entorno aislado.
6. **Aceptación y publicación:** recorridos completos de pago/factura en TEST,
   permisos entre empresas, móvil, rollback y verificación posterior al despliegue.

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
