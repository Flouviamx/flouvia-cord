# Product Marketing Context

*Last updated: 2026-07-01*
*Generado por: auto-draft desde el código (opción 1 de la skill `product-marketing-context`) — falta revisión de André en las secciones marcadas ⚠️ REVISAR.*

## Product Overview
**One-liner:** Cord es el SaaS de cotizaciones B2B para negocios en México — de la cotización a la factura, sin Excel ni PDFs perdidos por correo.
**Qué hace:** Cord permite crear cotizaciones profesionales con marca propia, compartirlas por un link público donde el cliente aprueba/paga/firma digitalmente, dar seguimiento en tiempo real (saber exactamente cuándo se vio), cobrar (Stripe + cobranza autónoma con IA), y facturar CFDI 4.0 real ante el SAT — todo en un solo flujo conectado, sin recapturar datos en 4 sistemas distintos.
**Categoría de producto:** Software de cotizaciones B2B / CPQ (Configure-Price-Quote) para el mercado mexicano.
**Tipo de producto:** SaaS multi-tenant, freemium.
**Modelo de negocio y pricing:** Freemium (5 cotizaciones activas gratis, con "Powered by Cord" visible) → 5 planes de pago vía Stripe Billing: Starter $240, **Profesional $590 (plan ancla/destacado)**, Scale $1,390, Developer $2,990 MXN/mes. Cada plan trae cuota mensual de IA/CFDI/API/usuarios incluida; el excedente se cobra por uso (Stripe Billing Meters).

## Target Audience
**Tipo de empresa objetivo:** PyMEs y empresas medianas B2B en México — cualquier negocio que cotiza a otros negocios, no solo e-commerce/retail.
**Verticales documentadas en el producto:** distribuidoras (crédito Net30/60), constructoras (aprobación de obra, materiales), manufactura (specs de lote, evidencia), agencias (retainers, hitos), comercializadoras (multi-divisa, crédito B2B), SaaS/software factories (cobro por commits/T&M), servicios profesionales.
**Decisores:** dueño de negocio, gerente de ventas (aprueba descuentos/márgenes vía "Auditor Silencioso"), vendedor (arma y envía cotizaciones), y en cuentas más grandes contador/CFO (factura, ve el dashboard financiero).
**Caso de uso principal:** reemplazar Excel + Word + PDF por correo con un flujo de cotización profesional, rastreable y cobrable de punta a punta.
**Jobs to be done:**
- Verse profesional ante el cliente con cotizaciones de marca propia (no una hoja de Excel).
- Saber EXACTAMENTE cuándo el cliente vio la cotización, para dar seguimiento en el momento justo (no "a ciegas").
- Cobrar más rápido y facturar sin recapturar datos en el portal del SAT/PAC.
**Casos de uso específicos:**
- Distribuidora que cotiza con precios por volumen y descuento por nivel de cliente.
- Constructora que necesita aprobación gerencial cuando un vendedor da más descuento del permitido.
- Empresa que exporta y necesita cotizar en USD pero facturar en MXN con tasa de cambio protegida (FX lock).

## Personas (B2B)
| Persona | Le importa | Su reto | Valor que le prometemos |
|---------|-------------|-----------|------------------|
| Vendedor | Cerrar rápido, verse profesional | Cotizar a mano toma tiempo, no sabe si el cliente ya la vio | Arma cotizaciones en minutos con IA, ve en vivo cuándo el cliente abre el link |
| Gerente de ventas | Proteger el margen del equipo | Vendedores dan descuentos sin control | Umbrales automáticos + Auditor Silencioso que bloquea envíos fuera de regla |
| Dueño / Admin | Que el negocio se vea serio, cobrar a tiempo | Cartera vencida, procesos manuales dispersos | Cobranza con IA, flujo de caja predictivo, todo en un dashboard |
| Contador / Finanzas | Facturar sin errores, cumplir con el SAT | Recapturar datos de la cotización a mano en el sistema de facturación | CFDI 4.0 generado directo desde la cotización aprobada, sin recaptura |

## Problems & Pain Points
**Problema central:** Cotizar en Excel/Word y mandar PDF por correo es lento, no rastreable, y no dice cuándo (o si) el cliente realmente vio la propuesta.
**Por qué las alternativas se quedan cortas:**
- Excel no calcula IVA/márgenes en vivo ni aplica descuentos por nivel de cliente automáticamente.
- El PDF por correo "muere" en la bandeja de entrada — no hay evento de apertura, no hay botón de aprobar.
- Facturar significa recapturar todo manualmente en el portal del PAC/SAT.
- No hay control de quién autorizó qué descuento — el margen se pierde en negociaciones informales.
**Qué les cuesta:** ciclos de venta más lentos, seguimiento "a ciegas" (llamar sin saber si ya vieron la propuesta), errores de captura al facturar, cobranza manual y tardía.
**Tensión emocional:** no saber si el cliente "se enfrió" con la propuesta; sentir que la empresa se ve menos profesional que competidores más grandes que sí tienen portales de cliente.

## Competitive Landscape
⚠️ **REVISAR — no tengo información confirmada de competidores directos reales en México.** No quiero inventar nombres. André: ¿quiénes son los 2-3 competidores que más te mencionan los prospectos (herramientas de cotización, ERPs con módulo de cotización, o incluso "seguimos usando Excel")?

**Directo:** *(pendiente — herramientas de cotización B2B en México/LatAm)*
**Secundario:** *(pendiente — ERPs/facturación electrónica que agregaron cotizaciones como feature secundaria)*
**Indirecto:** Excel + WhatsApp + PDF por correo (el "competidor" real de la mayoría de las PyMEs hoy) — se queda corto porque no hay tracking, no hay aprobación digital, y facturar requiere recapturar todo.

## Differentiation
**Diferenciadores clave (documentados en el producto real, no aspiracionales):**
- CFDI 4.0 real timbrado ante el SAT (vía Facturapi) directo desde la cotización aprobada — no un sistema aparte.
- Seguimiento en vivo real: evento de "vista" con fecha/hora exacta y conteo de aperturas.
- Cobranza con IA autónoma que negocia planes de pago con clientes morosos dentro de reglas que tú defines (opt-in por cliente).
- Multi-divisa con cobertura cambiaria real: cotiza en USD, factura en MXN, con FX lock de 30 días que protege el margen.
- Auditor Silencioso de márgenes: bloquea automáticamente el envío de una cotización si el descuento rompe el margen mínimo configurado.
- Firma digital con hash SHA-256 en cada cotización aprobada — evidencia verificable del acuerdo.
**Por qué eso es mejor:** todo vive en un solo flujo conectado (cotizar → aprobar → cobrar → facturar), no 4 herramientas distintas pegadas con copy-paste.
**Por qué los clientes eligen Cord:** dejan de perder tiempo recapturando datos y dejan de cotizar "a ciegas" sin saber si el cliente vio la propuesta.

## Objections
⚠️ **REVISAR — estas son inferidas, no verbatim de clientes reales.** André, corrígelas o reemplázalas con lo que de verdad escuchas en ventas.

| Objeción (inferida) | Respuesta sugerida |
|-----------|----------|
| "Ya uso Excel y me funciona" | Excel no te dice cuándo el cliente vio la cotización ni calcula márgenes en vivo — Cord hace ambas cosas sin que cambies tu forma de vender. |
| "No quiero pagar otra suscripción" | El plan gratuito ya cubre 5 cotizaciones activas; los planes de pago se pagan solos con el tiempo que ahorras en seguimiento y facturación. |
| "Mis datos fiscales son delicados, no confío en dar mi CSD a otro sistema" | El CSD se cifra y aísla por negocio; Cord no es el PAC, usa Facturapi (autorizado por el SAT) para timbrar. |

**Anti-persona:** *(pendiente — a quién NO le sirve Cord: ¿negocios sin operación B2B/cotizaciones formales? ¿empresas ya atadas a un ERP grande tipo SAP?)*

## Switching Dynamics
**Push (qué los aleja de su solución actual):** perder tiempo armando cotizaciones a mano, no saber si el cliente vio la propuesta, errores al facturar por recaptura manual.
**Pull (qué los atrae a Cord):** ver en vivo cuándo el cliente abre la cotización, facturar sin recapturar, cobranza que se persigue sola.
**Habit (qué los mantiene con su método actual):** ya tienen una plantilla de Excel/Word que "funciona", cambiar de herramienta se siente como fricción innecesaria.
**Anxiety (qué les preocupa de cambiar):** que sus datos fiscales/CSD estén seguros, que el equipo de ventas tarde en aprender un sistema nuevo, que se pierda historial de cotizaciones anteriores.

## Customer Language
⚠️ **REVISAR — no tengo lenguaje verbatim real de clientes.** La skill original recomienda explícitamente capturar frases EXACTAS de clientes reales, no descripciones pulidas — esto necesita que André pegue citas reales de conversaciones de ventas/soporte cuando las tenga.

**Cómo describen el problema (verbatim):** *(pendiente)*
**Cómo describen Cord (verbatim):** *(pendiente)*
**Palabras a usar:** cotización, seguimiento en vivo, aprobar, cobrar, timbrar, margen, cartera.
**Palabras a evitar:** "invoice"/"charge" en inglés en contexto MX, jerga fintech genérica sin anclar a cotizaciones B2B.
**Glosario:**
| Término | Significado |
|------|---------|
| CFDI | Comprobante Fiscal Digital por Internet — factura electrónica mexicana 4.0 |
| PAC | Proveedor Autorizado de Certificación (timbra el CFDI ante el SAT) |
| CSD | Certificado de Sello Digital — la "firma" fiscal del negocio |
| Auditor Silencioso | Feature de Cord: bloquea envíos que rompen el margen mínimo configurado |

## Brand Voice
**Tono:** Profesional, serio, corporativo — "Enterprise / Quiet Luxury". Nunca juguetón, nunca genérico de startup.
**Estilo de comunicación:** Directo, sobrio, sin exageraciones — el copy se corrigió activamente para NO prometer features que no existen (ver auditorías de exactitud documentadas en el historial).
**Personalidad de marca (documentada en las reglas de diseño):** técnica, exclusiva, minimalista, ultra-premium, confiable — referencias visuales explícitas: Stripe, Linear, Apple, Aesop.
**Reglas duras de estilo:** cero emojis en cualquier texto/UI/commit; montos siempre en formato `.editorial` (Inter 600, tabular-nums); títulos en negro absoluto con tracking ajustado; nada de animaciones "juguetonas" (se rechazaron explícitamente botones magnéticos, ripple, tilt 3D).

## Proof Points
⚠️ **REVISAR — el producto usa datos de una org demo ficticia ("Materiales del Valle" / cliente "Distribuidora El Zarco") para mockups; no hay clientes reales, métricas ni testimonios documentados todavía.**

**Métricas:** *(pendiente — sin datos reales de producción todavía)*
**Clientes notables:** *(pendiente)*
**Testimonios:** *(pendiente)*
**Temas de valor principales:** velocidad de cotización, visibilidad de seguimiento, cobranza automatizada, cumplimiento fiscal sin fricción.

## Goals
**Objetivo de negocio principal:** crecer usuarios de pago a partir del freemium (5 cotizaciones activas gratis).
**Acción de conversión clave:** registro gratis → primera cotización enviada (activación) → upgrade a plan pagado (típicamente disparado por el límite de 5 cotizaciones activas o por necesitar quitar "Powered by Cord").
**Métricas actuales:** *(pendiente — sin datos de producción confirmados en este documento)*
