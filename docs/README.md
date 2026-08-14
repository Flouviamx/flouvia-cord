# Documentación de Cord

Este directorio separa tres clases de información que antes convivían en
`CLAUDE.md`: reglas permanentes, estado actual e historial. La separación es
intencional; evita que una decisión vigente quede enterrada entre iteraciones ya
reemplazadas.

## Protocolo de lectura

Antes de modificar código:

1. Lee [`proyecto.md`](proyecto.md) y
   [`estandares-ingenieria.md`](estandares-ingenieria.md). Son el contexto base.
2. Lee el documento de estado actual del dominio que vas a tocar.
3. Consulta el historial de ese dominio solo si necesitas entender una decisión,
   una migración o una regresión anterior.
4. Si el trabajo toca dinero, aislamiento multi-tenant, autenticación u Ops,
   verifica también el código y el schema; la documentación no sustituye esa
   comprobación.

## Jerarquía de autoridad

Cuando dos fuentes difieran, usa este orden:

1. Código ejecutable, `db/schema.sql`, `package.json` y `.env.example`.
2. Reglas no negociables en [`estandares-ingenieria.md`](estandares-ingenieria.md).
3. Documentos de estado actual de este índice.
4. Historiales cronológicos.

Una contradicción entre los niveles 1 y 2 no se resuelve en silencio: se corrige
la implementación o se actualiza la regla con una decisión explícita. Los
historiales describen lo que ocurrió en su fecha y no deben interpretarse como el
estado vigente.

## Estado actual

| Documento | Responsabilidad | Léelo cuando... |
|---|---|---|
| [`proyecto.md`](proyecto.md) | Identidad del producto, repositorio, comandos, stack, configuración y despliegue. | Siempre. |
| [`estandares-ingenieria.md`](estandares-ingenieria.md) | Reglas permanentes de producto, UI, Astro, CSS, accesibilidad y honestidad funcional. | Siempre. |
| [`app-rutas.md`](app-rutas.md) | Modelo multi-tenant, RLS, tablas, rutas y superficies de la aplicación. | Tocas backend, datos, permisos, rutas o `/app`. |
| [`negocio-billing.md`](negocio-billing.md) | Planes, suscripciones, medidores, cobros, Connect y facturación. | Tocas dinero real, límites o Stripe. |
| [`landing.md`](landing.md) | Landing, navegación pública, animaciones, soporte y páginas públicas especiales. | Tocas marketing, soporte, navbar, GSAP o la página 404. |
| [`sistema-de-diseno.md`](sistema-de-diseno.md) | Tokens, patrones visuales detallados y evolución de landing y aplicación; las secciones fechadas son históricas. | Tocas cualquier UI visible. |
| [`cord-ops.md`](cord-ops.md) | Contrato de seguridad, rutas, acciones, consumo y escala de la consola privada. | Tocas `ops.cordhq.app`, auditoría privilegiada o telemetría de costos. |
| [`analytics.md`](analytics.md) | Contrato vigente de eventos, consentimiento, exclusión interna y dashboards. | Tocas PostHog, atribución o métricas de negocio. |
| [`../MOCKUP_STANDARDS.md`](../MOCKUP_STANDARDS.md) | SOP obligatorio para mockups de marketing. | Creas o modificas un mockup. |

## Historial

[`historial.md`](historial.md) es el único índice cronológico. Desde ahí se
enruta a los siete historiales temáticos:

| Tema | Archivo |
|---|---|
| Billing, cobros y CFDI | [`historial-billing-cobros.md`](historial-billing-cobros.md) |
| Presupuestos eliminados | [`historial-presupuestos.md`](historial-presupuestos.md) |
| Landing, marketing y mockups | [`historial-landing-marketing.md`](historial-landing-marketing.md) |
| Aplicación interna y UX | [`historial-app-features.md`](historial-app-features.md) |
| Auth propio y legado Clerk | [`historial-auth-clerk.md`](historial-auth-clerk.md) |
| API, MCP, webhooks y Elements | [`historial-platform-api.md`](historial-platform-api.md) |
| Infraestructura, seguridad e hitos | [`historial-infra-hitos.md`](historial-infra-hitos.md) |

Los historiales no se cargan automáticamente desde los archivos de instrucciones.
Esto es deliberado: se consulta el tema relevante, no todo el pasado del producto.

## Rutas de lectura por tarea

| Tarea | Lectura mínima adicional |
|---|---|
| UI dentro de `/app` | `app-rutas.md` + `sistema-de-diseno.md` |
| Landing o página de producto | `landing.md` + `sistema-de-diseno.md` |
| Mockup de marketing | `landing.md` + `sistema-de-diseno.md` + `MOCKUP_STANDARDS.md` |
| Auth, sesiones, equipo o SSO | `app-rutas.md` + `historial-auth-clerk.md` |
| Schema, query o RLS | `app-rutas.md` + `db/schema.sql` |
| Billing, cobros, CFDI o Connect | `negocio-billing.md` + `historial-billing-cobros.md` |
| API pública, MCP, SDK o webhooks | `app-rutas.md` + `historial-platform-api.md` |
| Ops, seguridad o escalabilidad | `cord-ops.md` + `historial-infra-hitos.md` |
| Analytics o Growth | `analytics.md` + las entradas PostHog del historial de app/infra |

## Contrato de mantenimiento

- Una regla nueva y permanente va en `estandares-ingenieria.md`.
- El estado vigente de un dominio se actualiza en su documento temático.
- Una implementación o decisión fechada se registra en un solo historial: el del
  tema dominante. Los demás documentos enlazan a esa entrada, no la duplican.
- `.env.example` es la fuente única para variables de entorno. Los documentos
  explican contratos y dependencias, pero no mantienen una segunda lista completa.
- `CLAUDE.md` y `AGENTS.md` son adaptadores de entrada. No deben volver a acumular
  arquitectura, changelog ni runbooks.
- Un nuevo archivo histórico no debe crecer por encima de aproximadamente 1,500
  líneas: se segmenta por periodo o subdominio y el anterior queda como índice.
  `historial-app-features.md` es la excepción heredada; al segmentarlo se deben
  preservar literalmente sus entradas y mantener esa ruta como índice estable.
