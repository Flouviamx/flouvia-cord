# Cord — índice operativo

Cord es la plataforma de cierre comercial de Flouvia: de la propuesta al pago,
todo en un solo link. Este repositorio despliega de forma independiente en
`cordhq.app`.

Este archivo es deliberadamente corto. Sirve como router de contexto, no como
manual, changelog ni depósito de decisiones. La documentación canónica vive en
[`docs/README.md`](docs/README.md).

## Antes de trabajar

1. Lee el contexto base importado al final: proyecto y estándares de ingeniería.
2. Abre solo los documentos del dominio que vas a tocar usando la tabla inferior.
3. Consulta el historial temático únicamente cuando necesites el porqué de una
   decisión, migración o regresión.
4. Verifica en código, `db/schema.sql`, `package.json` y `.env.example` cualquier
   dato operativo sensible a drift.
5. Preserva cambios locales ajenos a la tarea; el worktree puede estar sucio.

## Mapa de lectura

| Si vas a tocar... | Lee antes... |
|---|---|
| Cualquier tarea | [`docs/proyecto.md`](docs/proyecto.md) + [`docs/estandares-ingenieria.md`](docs/estandares-ingenieria.md) |
| UI dentro de `/app` | [`docs/app-rutas.md`](docs/app-rutas.md) + [`docs/sistema-de-diseno.md`](docs/sistema-de-diseno.md) |
| CSS con `backdrop-filter` u otra propiedad con prefijo `-webkit-` | Regla 31 de [`docs/estandares-ingenieria.md`](docs/estandares-ingenieria.md) — el minificador de producción puede borrar la forma estándar; verifica con `npm run security:css` |
| `/app/ajustes` — agregar o mover una pestaña | [`docs/app-rutas.md`](docs/app-rutas.md) + `src/lib/settings.ts` (`SETTINGS_CATEGORIES`, campo `keywords` para ⌘K) |
| Landing, soporte o páginas públicas | [`docs/landing.md`](docs/landing.md) + [`docs/sistema-de-diseno.md`](docs/sistema-de-diseno.md) |
| Mockups de marketing | Los dos anteriores + [`MOCKUP_STANDARDS.md`](MOCKUP_STANDARDS.md) |
| Auth, sesiones, equipo o SSO | [`docs/app-rutas.md`](docs/app-rutas.md) + [`docs/historial-auth-clerk.md`](docs/historial-auth-clerk.md) |
| Schema, queries, RLS o multi-tenant | Regla 30 de [`docs/estandares-ingenieria.md`](docs/estandares-ingenieria.md) + [`docs/app-rutas.md`](docs/app-rutas.md) + `db/schema.sql` + carriles en `src/lib/db.ts` |
| Cualquier query nueva a una tabla con `org_id` | Regla 30 de [`docs/estandares-ingenieria.md`](docs/estandares-ingenieria.md); el contrato lo verifica `npm run security:tenancy` |
| Activar `cord_app` / que la RLS realmente aplique | [`db/RUNBOOK-cord-app.md`](db/RUNBOOK-cord-app.md) + `db/cord-app-role.sql` + `db/cord-force-bootstrap-rls.sql` |
| Captura de documentos de identidad, calidad de foto o el enlace "continúa en tu teléfono" | Regla 34 de [`docs/estandares-ingenieria.md`](docs/estandares-ingenieria.md) + contrato ejecutable en `src/lib/upload-guard.ts`, `src/lib/capture-quality.ts`, `src/lib/identity-documents.ts` y `src/lib/kyc-evidencia.ts`; lo verifican `test/upload-guard.test.ts`, `test/capture-quality.test.ts` y `test/identity-documents.test.ts` |
| KYC de Cord Payments, personas/UBO o requisitos de Connect | Reglas 32 y 33 de [`docs/estandares-ingenieria.md`](docs/estandares-ingenieria.md) + contrato ejecutable en `src/lib/connect-requirements.ts`, `src/lib/connect-personas.ts` y `src/lib/connect-fields.ts`; lo verifican `npm run security:payments` y `test/connect-requirements.test.ts` |
| Cualquier ruta que cree un PaymentIntent, Checkout Session, Subscription o Refund | Regla 33 de [`docs/estandares-ingenieria.md`](docs/estandares-ingenieria.md); el contrato lo verifica `npm run security:payments` |
| Rate limit del carril PÚBLICO de pago (`/api/q/*`, `/api/i/*`) | `limitPublicPayment()` en `src/lib/connect-security.ts` — estricto y con componente de IP. `rateLimit()` a secas falla ABIERTO, y ahí vive el fraude de prueba de tarjetas. `npm run security:payments` verifica también el envoltorio, no sólo las rutas |
| Depósitos, frecuencia de payout o conciliación bancaria | [`docs/negocio-billing.md`](docs/negocio-billing.md) + tabla `payouts` en `db/schema.sql` + `src/pages/api/billing/connect/payout-schedule.ts` |
| Billing, planes, cobros, CFDI o Connect | [`docs/negocio-billing.md`](docs/negocio-billing.md) + [`docs/historial-billing-cobros.md`](docs/historial-billing-cobros.md) + contrato ejecutable en `src/lib/entitlements.ts` |
| Precio de un plan de Cord o su divisa | Reglas 21 y 27 de [`docs/estandares-ingenieria.md`](docs/estandares-ingenieria.md) + contrato ejecutable en `src/lib/plan-currency.ts`, `src/lib/plan-money.ts` y `src/lib/precios.ts` |
| Superficie de facturación (`billing.cordhq.app`) | Regla 26 de [`docs/estandares-ingenieria.md`](docs/estandares-ingenieria.md) + [`docs/app-rutas.md`](docs/app-rutas.md) + guard en `src/lib/billing-surface.ts` |
| Cualquier importe, divisa o tipo de cambio del CLIENTE | Reglas 21 y 22 de [`docs/estandares-ingenieria.md`](docs/estandares-ingenieria.md) + contrato ejecutable en `src/lib/currency.ts` y `src/lib/fx/FXService.ts` |
| Impuestos, retenciones, zona horaria o rieles de cobro por país | Reglas 23 y 24 de [`docs/estandares-ingenieria.md`](docs/estandares-ingenieria.md) + contrato ejecutable en `src/lib/impuestos.ts`, `src/lib/impuestos-db.ts`, `src/lib/countries.ts`, `src/lib/fmt-server.ts` y `src/lib/payout-fields.ts` |
| Qué países o divisas ofrece Cord | Regla 28 de [`docs/estandares-ingenieria.md`](docs/estandares-ingenieria.md) + contrato ejecutable en `src/lib/countries.ts` (`SUPPORTED_COUNTRIES`) y `src/lib/currency.ts` (`OFFERED_CURRENCIES`) |
| Cord Invoicing (facturas, recordatorios, recurrencia, cobranza) | Regla 25 de [`docs/estandares-ingenieria.md`](docs/estandares-ingenieria.md) + [`docs/app-rutas.md`](docs/app-rutas.md) + [`docs/negocio-billing.md`](docs/negocio-billing.md) + `src/pages/app/facturas/` + `src/lib/fiscal/` |
| Verifactu (España) — huella, certificado, envío a la AEAT | Regla 29 de [`docs/estandares-ingenieria.md`](docs/estandares-ingenieria.md) + [`docs/negocio-billing.md`](docs/negocio-billing.md) + `src/lib/fiscal/verifactu/` + `src/lib/fiscal/providers/SpainVerifactuProvider.ts` |
| Roadmap público y estado de features | [`docs/landing.md`](docs/landing.md) + `src/components/roadmap/RoadmapPage.astro` + `src/components/roadmap/RoadmapDetail.astro` + `src/lib/roadmap-data.ts` + documento temático del dominio que cambia |
| API pública, MCP, webhooks o Elements | [`docs/app-rutas.md`](docs/app-rutas.md) + [`docs/historial-platform-api.md`](docs/historial-platform-api.md) |
| Cord Ops, seguridad o escala | [`docs/cord-ops.md`](docs/cord-ops.md) + [`docs/historial-infra-hitos.md`](docs/historial-infra-hitos.md) |
| Analytics o Growth | [`docs/analytics.md`](docs/analytics.md) + historial de app/infra relevante |
| Historia del producto | [`docs/historial.md`](docs/historial.md) |

## Fuentes de verdad

En caso de discrepancia:

1. código ejecutable, schema, `package.json` y `.env.example`;
2. estándares permanentes;
3. documentos de estado actual;
4. historial cronológico.

El historial conserva contexto válido para su fecha, pero no invalida el estado
vigente. Una contradicción entre código y una regla permanente se resuelve de forma
explícita, no eligiendo en silencio la fuente más conveniente.

## Mantenimiento documental

- Regla permanente nueva → `docs/estandares-ingenieria.md`.
- Estado vigente de un dominio → su documento temático en `docs/`.
- Decisión o implementación fechada → un solo `docs/historial-<tema>.md`, el del
  tema dominante.
- Variable de entorno → `.env.example`; no dupliques el inventario completo.
- Este archivo → solo navegación y protocolo. No agregues features, runbooks ni
  changelog aquí.

## Contexto base importado

Solo estos dos documentos se cargan siempre. El resto se consulta bajo demanda para
mantener el contexto pequeño, vigente y relevante.

@docs/proyecto.md
@docs/estandares-ingenieria.md
