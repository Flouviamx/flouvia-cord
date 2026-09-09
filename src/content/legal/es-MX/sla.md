---
docId: sla
version: "2026-09-01"
effectiveDate: "2026-09-01"
supersedes: null
locale: es-MX
jurisdiction: GLOBAL
appliesToCountries: [MX, US, CA, BR, ES, GB, DE, FR, CO, AR, CL, PE]
requiresAction: false
action: none
acceptanceScope: none
publicationStatus: draft
sourceKind: markdown
editorialStage: technical-draft
sourceOfTruth: src/content/legal/es-MX/sla.md
artifactRoute: /legal/sla
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-09-01"
reviewedBy: Redacción técnica; revisión jurídica externa pendiente
dependsOn: ["terms"]
sourceSections: ["terms@2026-08-11#sla"]
releaseBlockers: ["continuous-monitoring", "metric-definition", "maintenance-policy", "incident-notification", "support-targets", "credit-remedy", "dependency-boundaries", "legal-review", "versioned-publication"]
---

# Disponibilidad y niveles de servicio

**BORRADOR TÉCNICO — no publicado ni en vigor.** Cord se presta actualmente en
mejor esfuerzo y no ofrece un SLA estándar de porcentaje, soporte o créditos. La
fecha editorial no crea un compromiso. Cualquier nivel negociado requiere un
acuerdo escrito ejecutado y controles capaces de medirlo.

## 1. Alcance actual

La página pública observa tres señales: consulta a Neon, lectura autenticada del
balance de Stripe y render completo del link público de demostración. No mide
cada ruta, región, usuario, correo, webhook, IA, CFDI, AEAT, Resend, PostHog, MCP
o integración del Cliente.

La disponibilidad de una señal no prueba la de todo Cord, y un fallo de una
dependencia no determina por sí solo la causa o responsabilidad contractual.

## 2. Cadencia y frescura

Vercel Hobby programa una sonda diaria a las 10:00 UTC y puede retrasarla. Una
muestra se considera reciente por hasta 26 horas. Si falta una señal o está
obsoleta, el estado público pasa a desconocido en vez de asumir operación.

Cada comprobación tiene timeout técnico de ocho segundos y persiste servicio,
éxito, latencia y fecha. Los detalles de error se registran en servidor, no en la
respuesta pública. Si Neon no permite guardar, no aparece una muestra parcial.

Una comprobación diaria no es monitoreo continuo y puede no observar una caída
entre muestras. No debe usarse para prometer uptime mensual.

## 3. Ventana y cálculo mostrado

La vista agrega como máximo 90 días y calcula éxitos sobre las muestras que
realmente existen. “100%” con una o pocas muestras significa que esas sondas
pasaron, no que el servicio estuvo disponible cada minuto ni para cada cliente.

La base no tiene hoy un sweeper de 90 días para `health_checks`; 90 días es una
ventana de consulta, no una promesa de conservación. No hay medición de minutos
totales, solicitudes reales elegibles, regiones o exclusiones contractuales.

Un SLA futuro debe definir fórmula, zona horaria, periodo, redondeo, fuente,
errores parciales, latencia, componentes y procedimiento de impugnación antes de
publicar un objetivo.

## 4. Incidentes y comunicaciones

Ops puede crear incidentes bilingües con severidad, inicio, resumen y estado de
investigación, identificación, monitoreo o resolución. No existen incidentes
sembrados y la UI no ofrece borrarlos; cada cambio se audita.

La detección y publicación son manuales. No existe suscripción a notificaciones,
plazo contractual de primera actualización, cadencia de seguimiento o RCA. La
página pública no garantiza que todo evento se detecte o publique de inmediato.

Antes de un SLA deben definirse severidades, propietario, canales, horarios,
actualizaciones, cierre, postmortem y tratamiento de información sensible.

## 5. Mantenimiento y dependencias

No hay una política contractual de mantenimiento programado, emergencia,
preaviso o exclusiones. Un acuerdo futuro debe distinguir mantenimiento de
indisponibilidad y evitar exclusiones tan amplias que vacíen el compromiso.

Cord depende de Vercel, Neon, Stripe, Resend, Anthropic, Facturapi, autoridades e
integraciones según la función. La dependencia debe documentarse por componente;
no convierte cualquier fallo externo en fuerza mayor ni elimina controles de
redundancia, selección y respuesta que correspondan a Cord.

## 6. Soporte, objetivos y créditos

El código revisado no implementa targets contractuales de primera respuesta,
resolución, disponibilidad por plan, RTO/RPO ni un cálculo automático de créditos.
Tampoco existe un proceso probado para reclamarlos o aplicarlos al billing.

Por ello, este borrador no promete 99.9%, atención 24/7, restauración en un plazo,
créditos, reembolsos o penalidades. Un acuerdo individual debe definir elegibilidad,
ventana de reclamación, prueba, cálculo, tope y relación con otros remedios.

## 7. Seguridad, continuidad y fuerza mayor

Disponibilidad y seguridad se relacionan, pero una página de status no sustituye
backups, restauración, respuesta a incidentes o continuidad. RTO, RPO, regiones,
capacidad y pruebas de recuperación siguen sin evidencia contractual completa.

Un evento fuera del control razonable puede justificar una demora sólo en la
medida en que cause el incumplimiento y la parte afectada adopte mitigación y
notificación razonables. La cláusula final debe tratar efectos, duración y
reanudación y no excluir responsabilidad que la ley no permita limitar.

## 8. Acuerdo individual y bloqueos

Un SLA futuro debe identificar Cliente, plan, servicios cubiertos, fecha,
métricas, exclusiones, mantenimiento, soporte, incidentes, remedios, límites y
precedencia. El status público seguirá siendo evidencia operativa limitada y no
se incorporará automáticamente como garantía.

**Bloqueos:** monitoreo continuo o fuente adecuada; definición de métrica;
mantenimiento y dependencias; severidades/notificación/RCA; objetivos de soporte;
RTO/RPO; mecanismo de créditos; revisión jurídica y publicación/ejecución
versionada.

Procedencia y evidencia: [revisión de gobernanza de datos de fase 5.4](../../../../docs/historial/revisiones-legales/2026-09-01-data-governance.md). Las cláusulas originales permanecen preservadas según `sourceSections`.
