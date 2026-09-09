---
docId: dpa
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
editorialStage: technical-draft
dependsOn: ["terms", "privacy", "subprocessors", "retention-policy"]
sourceSections: ["privacy@2026-08-29#dpa", "privacy@2026-08-29#internacionales"]
releaseBlockers: ["verified-parties", "processing-schedules", "security-schedule", "account-contracts", "transfer-map", "subprocessor-notice", "incident-procedure", "retention-schedule", "legal-review", "execution-evidence", "versioned-publication"]
sourceKind: markdown
sourceOfTruth: src/content/legal/es-MX/dpa.md
artifactRoute: /dpa
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-09-01"
reviewedBy: Redacción técnica; revisión jurídica externa pendiente
---

# Anexo de Tratamiento de Datos

**BORRADOR TÉCNICO — no publicado, ofrecido, aceptado ni en vigor.** La fecha del
frontmatter identifica esta copia editorial. Aunque un DPA final normalmente
requerirá ejecución por la organización, este archivo no solicita aceptación y
no puede incorporarse al contrato cambiando sólo su metadata.

## 1. Partes, alcance y jerarquía

El anexo final identificará a la persona operadora de Cord y al Cliente con
domicilio, identificación fiscal, contacto, capacidad y fecha de ejecución
verificados. Esos datos no están completos. “Cord” es el servicio y no sustituye
el nombre de la contraparte legal.

Se aplicará únicamente al tratamiento de Datos del Cliente realizado por cuenta
del Cliente para prestar funciones habilitadas y prevalecerá sobre el acuerdo
principal sólo respecto de ese tratamiento. Un aviso de privacidad, el uso del
producto o el reconocimiento de un aviso no ejecutan este anexo.

Cada parte conserva los roles que le atribuya la ley para datos de cuenta,
seguridad, facturación propia, fraude, cumplimiento, pagos o relaciones directas.
La etiqueta responsable/encargado —o controlador/operador— se decide por
actividad; Cord no es encargado universal para todo flujo.

## 2. Objeto, duración e instrucciones

El objeto propuesto es operar, durante la cuenta y el periodo de retorno o
eliminación pactado, las funciones que el Cliente active. El tratamiento puede
incluir recepción, organización, alojamiento, consulta, generación de documentos
y mensajes, transmisión, respaldo, exportación, restricción y eliminación.

Las instrucciones documentadas pueden provenir de configuración, API, acciones
autenticadas y acuerdos ejecutados. El Cliente debe asegurar que son lícitas y
que sus destinatarios están autorizados. Cord deberá informar y suspender una
instrucción que considere contraria a la ley, salvo prohibición, sin convertir
esa revisión en asesoría jurídica del Cliente.

No se autoriza vender Datos del Cliente, usarlos para publicidad conductual de
terceros ni incorporarlos a entrenamiento voluntario de modelos para una
finalidad incompatible. Seguridad, billing propio o cumplimiento de Cord pueden
tener otro rol y fundamento, que debe explicarse en privacidad.

## 3. Personas, datos, finalidades y operaciones

Las personas pueden incluir usuarios, miembros, prospectos, clientes,
compradores, firmantes, deudores comerciales, representantes, directores y
beneficiarios finales. Los datos pueden incluir identidad y contacto, datos
comerciales, fiscales y técnicos, cotizaciones, facturas, pagos, comunicaciones,
evidencia de entrega o disputa, archivos e información introducida por el Cliente.

El anexo ejecutable debe completar por función categorías, personas, finalidades,
frecuencia, destinatarios, países, plazos y datos sensibles. La lista general no
sustituye anexos de transferencia ni una evaluación de impacto.

No se autorizan expedientes clínicos, datos de menores, biometría de identificación
ni otras categorías especiales salvo acuerdo escrito, necesidad, fundamento,
evaluación y controles previos. El flujo KYC puede transmitir identificaciones a
Stripe; esa actividad debe describirse con su rol real y no mediante una
autorización genérica.

## 4. Obligaciones, derechos e incidentes

Cuando actúe como encargado, Cord deberá tratar bajo instrucciones documentadas,
obligar a confidencialidad a las personas autorizadas, aplicar medidas apropiadas
al riesgo y ayudar razonablemente con derechos, evaluaciones y consultas según la
naturaleza del tratamiento y la información disponible.

Cord deberá comunicar al Cliente sin dilación indebida una vulneración de Datos
del Cliente que conozca y aportar la información disponible por etapas. Plazo,
canal, severidad, contacto, cooperación y formato aún no tienen un procedimiento
operativo demostrado; este borrador no promete 24, 48 o 72 horas contractuales.

El Cliente responde de instrucciones, bases, avisos, exactitud, destinatarios y
atención primaria a sus personas. Ninguna cláusula elimina obligaciones propias
de Cord ni obliga a revelar secretos de otros clientes o debilitar seguridad.

## 5. Seguridad, auditoría y continuidad

La línea base de código incluye TLS, hashes para tokens, autenticación, permisos,
controles por organización, rate limits, registros de ciertos eventos y cifrado
de campos para CLABE y secretos configurados. No todos los datos tienen cifrado
por campo. Las políticas RLS existen en schema, pero su activación efectiva con
el rol de aplicación sigue pendiente.

El anexo de medidas debe validar el entorno desplegado y describir de forma
específica acceso, cifrado, disponibilidad, respaldo, restauración, pruebas,
vulnerabilidades, personal e incidentes. No se prometen certificaciones,
residencia, RTO/RPO, pentests, periodos de backup ni borrado del proveedor sin
evidencia.

Las auditorías usarán primero documentación y reportes disponibles y, si son
insuficientes, un mecanismo acordado que proteja seguridad, confidencialidad y a
otros clientes. Alcance, frecuencia, costos y procedimiento siguen abiertos.

## 6. Subencargados e integraciones dirigidas

La autorización general propuesta abarca sólo proveedores clasificados realmente
como subencargados. Stripe, Google y Apple pueden tener obligaciones propias;
SAT/PAC/AEAT son destinatarios legales; SAML, MCP, Slack y webhooks configurados
por el Cliente son integraciones dirigidas. Una tabla no convierte todos esos
roles en subencargados.

Antes de que un nuevo subencargado trate Datos del Cliente, el contrato final
debe exigir protección equivalente y establecer aviso previo, canal, plazo y
tratamiento de objeciones. Cord no dispone hoy de suscripción a cambios ni ha
fijado esos plazos, por lo que la autorización no está lista para ejecutarse.

El Cliente conserva responsabilidad por alcance, credenciales y legitimidad de
las integraciones que ordena. Cord conserva la de sus controles de conexión y
ejecución; una instrucción no autoriza efectos externos ilimitados.

## 7. Transferencias internacionales

Cada flujo debe identificar exportador, importador, roles, países, datos,
finalidad y mecanismo. Cuando aplique el capítulo V del GDPR se elegirá el módulo
correcto de las CCT 2021/914 u otro mecanismo válido, con anexos, evaluación y
medidas suplementarias. Un enlace público al DPA de un proveedor no acredita la
región o ejecución de la cuenta de Cord.

También deben evaluarse Reino Unido, Brasil, México y los demás mercados; las CCT
europeas no son una solución universal. No se usará el consentimiento al aviso
como sustituto general de una transferencia.

Regiones y contratos de nueve entradas del inventario siguen pendientes. Hasta
completarlos, este anexo no debe afirmar residencia, adecuación o transferencias
regularizadas para todos los flujos.

## 8. Retorno, eliminación, terminación y bloqueos

El Cliente dispone de un export JSON parcial y CSV de productos/clientes. No es
un retorno completo: el JSON omite varias tablas y limita auditoría a 1,000 filas.
Al borrar una organización, Cord elimina la fila primaria y dependencias; no
elimina por sí mismo backups, datos retenidos por proveedores o una cuenta
Connect activa.

La evidencia KYC tiene un sweeper de cinco años, pero su FK `on delete cascade`
la elimina al borrar la organización. La evidencia de aceptación legal sobrevive
sin plazo aprobado. El `audit_log` de la organización, incluido el inicio del
borrado, también cascadea. Esto impide prometer retorno, retención o certificado
de eliminación uniforme.

**Bloqueos:** partes/contactos; anexos de tratamiento y seguridad; roles por
flujo; contratos/regiones; mapa de transferencias; aviso y objeción a
subencargados; procedimiento de incidentes/derechos; calendario y evidencia de
eliminación; revisión jurídica, ejecución y publicación versionada.

Procedencia y evidencia: [revisión de gobernanza de datos de fase 5.4](../../../../docs/historial/revisiones-legales/2026-09-01-data-governance.md). Las cláusulas originales permanecen preservadas según `sourceSections`.
