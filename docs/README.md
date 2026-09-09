# Documentación de Cord

Este directorio separa tres clases de información que antes convivían en
`CLAUDE.md`: reglas permanentes, estado actual e historial. La separación es
intencional; evita que una decisión vigente quede enterrada entre iteraciones ya
reemplazadas.

## Estructura

```
docs/
  README.md                 este índice
  proyecto.md               base — se carga siempre (@import)
  estandares-ingenieria.md  base — se carga siempre (@import)
  estado/                   estado vigente por dominio (se abre bajo demanda)
  historial/                registro cronológico por tema (se consulta, no se auto-carga)
  historial/revisiones-legales/   auditorías editoriales fechadas
```

La raíz contiene solo este índice y los dos documentos base. Todo lo demás vive
en `estado/` o `historial/` y se consulta según la tarea.

## Protocolo de lectura

Antes de modificar código:

1. Lee [`proyecto.md`](proyecto.md) y
   [`estandares-ingenieria.md`](estandares-ingenieria.md). Son el contexto base.
2. Lee el documento de `estado/` del dominio que vas a tocar.
3. Consulta el historial de ese dominio solo si necesitas entender una decisión,
   una migración o una regresión anterior.
4. Si el trabajo toca dinero, aislamiento multi-tenant, autenticación u Ops,
   verifica también el código y el schema; la documentación no sustituye esa
   comprobación.

## Jerarquía de autoridad

Cuando dos fuentes difieran, usa este orden:

1. Código ejecutable, `db/schema.sql`, `package.json` y `.env.example`.
2. Reglas no negociables en [`estandares-ingenieria.md`](estandares-ingenieria.md).
3. Documentos de estado actual (`estado/`).
4. Historiales cronológicos (`historial/`).

Una contradicción entre los niveles 1 y 2 no se resuelve en silencio: se corrige
la implementación o se actualiza la regla con una decisión explícita. Los
historiales describen lo que ocurrió en su fecha y no deben interpretarse como el
estado vigente.

## Estado actual — `estado/`

| Documento | Responsabilidad | Léelo cuando... |
|---|---|---|
| [`estado/multi-tenant.md`](estado/multi-tenant.md) | Modelo `org_id`, membresías, tablas multi-tenant, política RLS, carriles de contexto, 2FA en APIs. | Tocas schema, queries, permisos o aislamiento entre organizaciones. |
| [`estado/dominios-clientes.md`](estado/dominios-clientes.md) | Dominios propios Profesional+, DNS/HTTPS, rutas aisladas y checklist de activación. | Tocas enlaces de marca propia o su conexión. |
| [`estado/app-rutas.md`](estado/app-rutas.md) | Mapa completo de rutas (landing, `/app`, subdominios, API pública/MCP, entorno de prueba, legales) y `AppLayout`. | Tocas rutas, `/app` o la superficie pública. |
| [`estado/negocio-billing.md`](estado/negocio-billing.md) | La suscripción de Cord: modelo de negocio, planes freemium, Stripe Billing, medidores de excedente, cortesías internas. | Tocas planes, límites, la suscripción o Stripe Billing. |
| [`estado/confiabilidad.md`](estado/confiabilidad.md) | Inventario de la auditoría, evidencia, activaciones y fases pendientes. | Continúas la fase 1 o verificas qué se construyó y publicó. |
| [`estado/cobros-facturacion.md`](estado/cobros-facturacion.md) | Lo que el negocio cobra a sus clientes: Connect Custom, cobros (anticipo/saldo/cuotas/crédito/igualas), la factura como objeto de primera clase, facturación internacional, Verifactu, multi-divisa y FX, impuestos por línea, cartera, recordatorios, KYC y depósitos. | Tocas Connect, un PaymentIntent, una factura, impuestos, FX o KYC de pagos. |
| [`estado/landing.md`](estado/landing.md) | Landing, navegación pública, animaciones, soporte y páginas públicas especiales. | Tocas marketing, soporte, navbar, GSAP o la página 404. |
| [`estado/sistema-de-diseno.md`](estado/sistema-de-diseno.md) | Tokens, patrones visuales detallados y evolución de landing y aplicación; las secciones fechadas son históricas. | Tocas cualquier UI visible. |
| [`estado/cord-ops.md`](estado/cord-ops.md) | Contrato de seguridad, rutas, acciones, consumo y escala de la consola privada. | Tocas `ops.cordhq.app`, auditoría privilegiada o telemetría de costos. |
| [`estado/analytics.md`](estado/analytics.md) | Contrato vigente de eventos, consentimiento, exclusión interna y dashboards. | Tocas PostHog, atribución o métricas de negocio. |
| [`estado/legal.md`](estado/legal.md) | Estado vigente legal, privacidad, aceptación contractual e internacionalización, y pendientes de trámite. | Tocas términos, privacidad, consentimiento, países, idiomas o copy regulado. |
| [`estado/legal-corpus.md`](estado/legal-corpus.md) | Fuentes contractuales por idioma, preservación de artefactos, borradores y bloqueos editoriales. | Editas, traduces o publicas un documento legal. |
| [`../MOCKUP_STANDARDS.md`](../MOCKUP_STANDARDS.md) | SOP obligatorio para mockups de marketing. | Creas o modificas un mockup. |

## Historial — `historial/`

[`historial/README.md`](historial/README.md) es el índice cronológico. Enruta a
los historiales temáticos:

| Tema | Archivo |
|---|---|
| Billing, cobros y CFDI | [`historial/billing-cobros.md`](historial/billing-cobros.md) |
| Presupuestos eliminados | [`historial/presupuestos.md`](historial/presupuestos.md) |
| Landing, marketing y mockups | [`historial/landing-marketing.md`](historial/landing-marketing.md) |
| Aplicación interna y UX | [`historial/app-features.md`](historial/app-features.md) |
| Auth propio y legado Clerk | [`historial/auth-clerk.md`](historial/auth-clerk.md) |
| API, MCP, webhooks y Elements | [`historial/platform-api.md`](historial/platform-api.md) |
| Infraestructura, seguridad e hitos | [`historial/infra-hitos.md`](historial/infra-hitos.md) |
| Programa de blindaje legal e i18n (fases 0–5) | [`historial/legal.md`](historial/legal.md) |
| Revisiones editoriales legales fechadas | [`historial/revisiones-legales/`](historial/revisiones-legales/) |

Los historiales no se cargan automáticamente desde los archivos de instrucciones.
Esto es deliberado: se consulta el tema relevante, no todo el pasado del producto.

## Rutas de lectura por tarea

| Tarea | Lectura mínima adicional |
|---|---|
| UI dentro de `/app` | `estado/app-rutas.md` + `estado/sistema-de-diseno.md` |
| Landing o página de producto | `estado/landing.md` + `estado/sistema-de-diseno.md` |
| Mockup de marketing | `estado/landing.md` + `estado/sistema-de-diseno.md` + `MOCKUP_STANDARDS.md` |
| Auth, sesiones, equipo o SSO | `estado/app-rutas.md` + `historial/auth-clerk.md` |
| Schema, query, RLS o multi-tenant | `estado/multi-tenant.md` + `db/schema.sql` |
| Suscripción, planes o límites de Cord | `estado/negocio-billing.md` + `historial/billing-cobros.md` |
| Cobros, CFDI, Connect, impuestos o KYC de pagos | `estado/cobros-facturacion.md` + `historial/billing-cobros.md` |
| API pública, MCP, SDK o webhooks | `estado/app-rutas.md` + `historial/platform-api.md` |
| Ops, seguridad o escalabilidad | `estado/cord-ops.md` + `historial/infra-hitos.md` |
| Analytics o Growth | `estado/analytics.md` + las entradas PostHog del historial de app/infra |
| Legal, privacidad, consentimiento o i18n | `estado/legal.md` + documento del flujo afectado (`estado/app-rutas.md` o `estado/cobros-facturacion.md`) |

## Contrato de mantenimiento

- Una regla nueva y permanente va en `estandares-ingenieria.md`.
- El estado vigente de un dominio se actualiza en su documento de `estado/`.
- Una implementación o decisión fechada se registra en un solo historial: el del
  tema dominante. Los demás documentos enlazan a esa entrada, no la duplican.
- `.env.example` es la fuente única para variables de entorno. Los documentos
  explican contratos y dependencias, pero no mantienen una segunda lista completa.
- `CLAUDE.md` y `AGENTS.md` son adaptadores de entrada. No deben volver a acumular
  arquitectura, changelog ni runbooks.
- Un archivo histórico no debe crecer por encima de aproximadamente 1,500 líneas:
  se segmenta por periodo o subdominio y el anterior queda como índice.
  `historial/app-features.md` es la excepción heredada; al segmentarlo se deben
  preservar literalmente sus entradas y mantener esa ruta como índice estable.
- Un documento de `estado/` que mezcle dominios distintos (o que acumule bitácora
  fechada en vez de estado vigente) se segmenta: el estado se reparte por dominio
  y la bitácora baja a `historial/`.
