# Historial — Índice — Cord

> Registro cronológico de features, decisiones de arquitectura y bugs resueltos.
> **La fuente de reglas permanentes es `estandares-ingenieria.md`.** Este archivo dejó de ser un
> changelog monolítico (llegó a 3200+ líneas) y ahora es un ÍNDICE — el contenido real
> vive segmentado por tema en los archivos de abajo. Los historiales se consultan bajo
> demanda y no se auto-cargan en cada tarea.

---

## Cómo usar este archivo

- Si sabes de qué ÁREA es el cambio que buscas (dinero, presupuestos, landing, app,
  auth, API, infra) — ve directo al archivo de esa área.
- Si no sabes dónde cayó algo, `grep -rn "término" docs/historial-*.md`.
- **Regla de mantenimiento:** al agregar una entrada de changelog nueva, va en el archivo
  de tema correspondiente (tabla abajo), NO aquí. Si una sesión toca varios temas a la
  vez, la entrada completa va en el archivo del tema DOMINANTE (no la partas a mano) y
  puede referenciar de pasada los otros temas que tocó.

---

## Archivos por tema

| Archivo | Qué contiene | Léelo cuando… |
|---------|--------------|---------------|
| **[`historial-billing-cobros.md`](historial-billing-cobros.md)** | Suscripciones (Stripe Billing), Stripe Connect (Standard/Express/Custom), cobros por anticipo/saldo/cuotas, cobros recurrentes (igualas), CFDI/Facturapi, CSD multi-tenant, intereses moratorios, FX. | Tocas dinero real: planes, cobros, facturación, Connect. |
| **[`historial-presupuestos.md`](historial-presupuestos.md)** | Historial de Cédulas Presupuestales, Presupuesto vs. Real, wizard de plan financiero completo, herramientas de análisis. **(MÓDULO ELIMINADO en ago 2026, archivo conservado como referencia)** | Tocas `/app/presupuestos`, `cedulas.ts`, `analisis.ts`. |
| **[`historial-landing-marketing.md`](historial-landing-marketing.md)** | Landing pública completa: home, precios, producto, soluciones, casos de uso, blog, soporte, roadmap, legales, mockups, shaders GLSL/WebGL, SEO/AI-SEO, navbar/footer, copy de marketing. | Tocas cualquier página pública fuera de `/app`. |
| **[`historial-app-features.md`](historial-app-features.md)** | Todo dentro de `/app/**`: shell (sidebar/topbar/ajustes), editor de cotizaciones, link público `/q`, dashboard, cobranza (UI), onboarding, dark mode, entorno de prueba, chat, tiempo real (SSE). El archivo más grande — es donde vive la mayoría del producto. | Tocas la app interna (no landing, no dinero puro). |
| **[`historial-auth-clerk.md`](historial-auth-clerk.md)** | Auth propio y su migración desde Clerk: sign-in/sign-up, Organizations históricas, SSO, org switcher, 2FA, passkeys, cuentas conectadas, equipo y roles. | Tocas auth, sesiones, SSO, org switcher, equipo o legado Clerk. |
| **[`historial-platform-api.md`](historial-platform-api.md)** | API REST pública v1, servidor y cliente MCP, webhooks salientes, el SDK `@flouviahq/elements` (Cord Elements) en todas sus fases. | Tocas `/api/v1`, MCP, webhooks, o el paquete npm. |
| **[`historial-infra-hitos.md`](historial-infra-hitos.md)** | Migración de dominio, fixes de schema/RLS, auditorías de seguridad/escala, hitos fundacionales del proyecto, notas de "listo para producción". | Tocas infraestructura, deploy, o quieres el panorama fundacional. |

---

## Estado actual — resumen de alto nivel

Cord es una plataforma de cierre comercial standalone (`cordhq.app`), en producción
desde junio de 2026. Stack vigente: Astro 7 SSR + Vercel, Neon con RLS multi-tenant,
auth propio, Stripe Billing + Connect, Facturapi para CFDI 4.0 en México, Resend,
Anthropic y PostHog. El core loop cotizar → aprobar → cobrar está implementado; el
módulo de presupuestos fue eliminado en agosto de 2026 para simplificar el producto.
El detalle cronológico de cada implementación vive en los archivos de arriba; el
estado operativo actual se navega desde [`README.md`](README.md).
