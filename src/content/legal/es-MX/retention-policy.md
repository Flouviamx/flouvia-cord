---
docId: retention-policy
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
sourceOfTruth: src/content/legal/es-MX/retention-policy.md
artifactRoute: /legal/retention-policy
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-09-01"
reviewedBy: Redacción técnica; revisión jurídica externa pendiente
dependsOn: ["privacy"]
sourceSections: ["privacy@2026-08-29#seguridad", "privacy@2026-08-29#portabilidad"]
releaseBlockers: ["record-level-schedule", "kyc-deletion-conflict", "durable-deletion-evidence", "provider-retention", "backup-rotation", "legal-acceptance-period", "complete-export", "legal-review", "versioned-publication"]
---

# Conservación, exportación y eliminación

**BORRADOR TÉCNICO — no publicado ni en vigor.** Este texto diferencia plazos
implementados, periodos todavía sin definir y obligaciones que pueden variar por
registro y país. No transforma comentarios de código en fundamentos jurídicos ni
promete borrado en sistemas que Cord no controla.

## 1. Alcance y principios

La conservación debe limitarse a una finalidad documentada: prestación,
seguridad, disputa, contrato, fiscalidad, cumplimiento o defensa. Cada categoría
requiere responsable, inicio del cómputo, plazo, evento de borrado, excepción y
evidencia. “Mientras sea necesario” no reemplaza ese calendario.

El producto debe distinguir base primaria, backups, logs, proveedores,
autoridades, datos entregados por instrucción y evidencia legal. El borrado de
una cuenta u organización no produce el mismo resultado en todas esas capas.

## 2. Plazos implementados y verificables

| Registro | Regla observada |
|---|---|
| Sesión de usuario | Cookie y vigencia deslizante de 30 días; tope absoluto en BD de 180 días |
| Retos OAuth, passkey, 2FA y legales | Expiraciones cortas, normalmente de 5 a 15 minutos; varios se limpian al consumir o de forma perezosa |
| Sesión de captura KYC | Hasta `expires_at` o una hora después de cerrarse; cron diario |
| Evidencia técnica KYC | Sweeper a cinco años desde `created_at`, mientras exista la organización |
| Entregas de webhooks | Más de 30 días o más de las 500 últimas por endpoint |
| Eventos webhook resueltos | 30 días; fallidos, 90 días |
| Preferencia de cookies | 6 meses; idioma, organización, sandbox y visitante público, hasta 1 año |
| Muestras de salud | La página consulta como máximo 90 días; no existe purga equivalente en código |

Una ventana de consulta no equivale a retención. Los plazos anteriores son
comportamiento técnico observado; su fundamento y suficiencia legal deben
validarse por tipo de dato y mercado.

## 3. Datos sin calendario completo

Cotizaciones, clientes, productos, facturas, cobros, CFDI, pagos, mensajes,
auditoría, incidentes, billing, archivos de proveedor y la mayoría de registros
operativos viven mientras exista la organización o hasta una acción específica.
No hay un sweeper general por antigüedad.

`legal_acceptances` conserva identificador seudónimo de persona, organización,
documento, versión, hash, IP completa, user-agent y fecha sin FK al usuario y sin
plazo aprobado. Sobrevive a la baja para preservar prueba contractual, pero falta
definir duración, acceso, redacción y eliminación posterior.

Backups y logs de Vercel/Neon, así como retención de Stripe, Facturapi, Resend,
Anthropic, PostHog y otros, siguen sin evidencia de cuenta suficiente. No se les
asigna aquí un plazo inventado.

## 4. KYC, fiscalidad, pagos y disputas

Cord no conserva persistentemente los bytes de la identificación transmitida a
Stripe por el flujo revisado. Sí guarda metadatos técnicos KYC —hash, tamaño,
formato, métricas, IP, user-agent, persona/cuenta y veredicto— con un sweeper de
cinco años. Stripe puede conservar la imagen y datos bajo sus propios roles.

Existe una contradicción: `connect_kyc_evidencia.org_id` usa
`on delete cascade`, por lo que borrar la organización elimina esa evidencia de
inmediato aunque el sweeper diga cinco años. El fundamento heredado tampoco está
validado para toda persona, país y flujo. Hasta resolverlo, no se promete cinco
años uniformes ni preservación tras cierre.

Los CFDI y registros Verifactu, pagos, reembolsos y disputas necesitan reglas por
rol y norma. Un plazo fiscal mexicano no debe aplicarse automáticamente a todo
dato comercial o a otro país.

## 5. Exportación y portabilidad

La organización puede descargar CSV de productos y clientes y un JSON con datos
de organización, productos, clientes, cotizaciones/partidas, eventos, tareas,
llaves API enmascaradas y hasta 1,000 filas de auditoría.

El comentario del endpoint dice “todos los datos”, pero el archivo omite, entre
otros, facturas/documentos fiscales, cobros, pagos, disputas, KYC, integraciones,
mensajes, billing y auditoría fuera del límite. Además, el helper devuelve una
lista vacía si una consulta falla. Por ello, no debe presentarse como exportación
completa, respuesta integral a derechos ni respaldo restaurable.

Antes del cierre, el Cliente debe descargar los artefactos disponibles. El DPA
final debe definir formato, alcance, ventana de retorno y asistencia.

## 6. Borrado de organización y cuenta

El dueño puede borrar una organización tras reautenticarse y escribir su nombre.
Cord intenta cancelar la suscripción de Stripe en mejor esfuerzo y luego borra
la fila `orgs`; aproximadamente 33 dependencias cascadean. Una cuenta Connect
activa no se borra por ese flujo y requiere revisión en el proveedor.

El `audit_log` también cascadea, incluso la fila “eliminación iniciada”; por eso
no queda evidencia durable en BD de que el borrado terminó. El camino de Ops
tiene un registro separado, pero no es equivalente al flujo del dueño. Tampoco
hay certificado, cola de proveedor ni reconciliación de backups.

La baja personal elimina organizaciones de dueño único, bloquea si quedarían
miembros activos y seudonimiza ciertas referencias en organizaciones que
sobreviven. No borra las aceptaciones legales seudónimas.

## 7. Proveedores, backups, bloqueos y excepciones

Los datos ya enviados a un destinatario dirigido por el Cliente, autoridad o
proveedor con obligación propia no se eliminan sólo por borrar Cord. Deben
documentarse solicitud, contrato, obligación de conservación, backup y respuesta.

Una retención por litigio, seguridad, fraude, obligación fiscal o contrato debe
ser limitada, autorizada y registrada. Bloquear no significa usar libremente el
dato. Terminada la excepción, debe reanudarse el borrado.

No hay evidencia suficiente para prometer residencia, rotación de backup,
eliminación instantánea o cascada a todos los proveedores.

## 8. Derechos, coordinación y bloqueos

Las solicitudes de acceso, corrección, oposición, limitación o eliminación se
evalúan según rol y ley. Un Cliente atiende primariamente las solicitudes sobre
sus datos; Cord debe asistir cuando actúe como encargado y atender las que le
correspondan como responsable. Identidad, canal y plazos todavía deben fijarse.

**Bloqueos:** calendario por tabla/proveedor/backup; contradicción KYC; evidencia
durable del borrado; contratos y regiones; plazo/redacción de aceptaciones;
exportación completa o límites transparentes; holds y DSAR; identidad/contacto,
revisión jurídica y publicación versionada.

Procedencia y evidencia: [revisión de gobernanza de datos de fase 5.4](../../../../docs/historial/revisiones-legales/2026-09-01-data-governance.md). Las cláusulas originales permanecen preservadas según `sourceSections`.
