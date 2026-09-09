---
docId: dispute-evidence-notice
version: "2026-08-30"
effectiveDate: "2026-08-30"
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
sourceOfTruth: src/content/legal/es-MX/dispute-evidence-notice.md
artifactRoute: /legal/dispute-evidence-notice
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-08-30"
reviewedBy: Redacción técnica; revisión jurídica externa pendiente
dependsOn: ["payments-terms","privacy"]
sourceSections: ["terms@2026-08-11#reembolsos","privacy@2026-08-29#datos"]
releaseBlockers: ["verified-identity", "processing-roles", "provider-account-contracts", "evidence-minimization", "retention-evidence", "legal-review", "versioned-publication"]
---

# Aviso sobre evidencia de disputas

**BORRADOR TÉCNICO — no publicado ni en vigor.** La fecha del frontmatter es de trabajo editorial. Este aviso propuesto describe el flujo revisado; no constituye una instrucción para enviar datos, una aceptación del comprador ni una autorización nueva. Debe completarse su revisión jurídica y de privacidad antes de publicarse.

## 1. Objeto y participantes

Cuando un comprador disputa un pago, el negocio vendedor (el Cliente) puede preparar una respuesta mediante Cord. Cord, herramienta de Flouvia, recibe las instrucciones de usuarios autorizados de la organización y transmite archivos o evidencia a Stripe en el contexto de su cuenta conectada. La identidad completa del operador y los canales de contacto deben verificarse para la versión final.

Stripe recibe la información para el trámite de la disputa; la respuesta puede circular hacia el emisor de la tarjeta y la red de pagos según el procedimiento aplicable. Cord no es quien determina el resultado. Los roles, acuerdos y mecanismos de transferencia internacional deben verificarse por tratamiento y proveedor; este aviso no los constituye.

## 2. Datos que puede incluir la evidencia

La respuesta puede contener nombre y correo del comprador, descripción del producto o servicio, fecha de prestación, IP de compra o aprobación, referencias de la transacción, importes y moneda, recibos, comunicación seleccionada, documentos de entrega y políticas de devolución o cancelación. El usuario debe revisar el contenido de los archivos, no sólo su nombre.

El recibo generado por Cord incorpora los datos disponibles de negocio y cotización, comprador y correo, importe y moneda, método y fecha de pago, transacción, partidas, nombre del firmante, fecha de aprobación e IP completa de aprobación. No se promete que esa IP esté anonimizada ni que cada campo del recibo automático pueda excluirse individualmente.

La comunicación convertida a PDF procede del texto que el usuario aporta para ese fin, acompañado de referencias del cliente y cotización. No se adjunta automáticamente el hilo completo de conversación. Un campo de texto guardado no equivale por sí solo a un archivo enviado como evidencia.

## 3. Cuándo sale la información de Cord

Deben distinguirse tres acciones:

| Acción | Efecto en el flujo revisado |
|---|---|
| Guardar borrador | Guarda campos y referencias en Cord; esa acción no sube archivos nuevos ni presenta la respuesta. Puede contener referencias a archivos ya transmitidos. |
| Preparar o subir archivos con confirmación | Envía los bytes a Stripe y recibe identificadores de archivo, incluso antes de presentar la respuesta final. |
| Presentar respuesta final con confirmación | Envía a Stripe los campos y referencias seleccionados con la instrucción de presentar la evidencia de la disputa. |

Preparar un recibo o PDF de comunicación puede transferir datos aunque después se abandone el borrador. Quitar una referencia, reemplazar un archivo o cerrar la pantalla no revoca por sí solo una transferencia anterior. Un fallo después de subir un archivo puede dejarlo en el proveedor aunque no aparezca una confirmación local completa.

## 4. Revisión, minimización y confirmación

Antes de preparar archivos o presentar evidencia, el usuario debe revisar la información mostrada, su pertinencia para el caso y el aviso de transferencia. Cord exige confirmación en esos pasos; guardar un borrador es distinto. La presentación final requiere además una sesión con autenticación reciente.

El Cliente debe aportar datos veraces y conservar el contexto necesario, sin inventar documentos ni omitir hechos de manera engañosa. Debe excluir información ajena a la disputa, credenciales, datos de tarjetas innecesarios y datos de terceros sin relación. Si un documento necesita ocultar información no pertinente, debe prepararse una copia adecuada antes de cargarlo; no se ofrece una redacción automática integral del contenido.

Si el recibo automático incorpora datos no pertinentes, no debe generarse bajo la suposición de que ya están ocultos. Debe revisarse una alternativa adecuada antes de confirmar la transferencia. Los controles técnicos de formato o seguridad de archivos no sustituyen esa revisión de contenido.

## 5. Instrucción del Cliente y base de tratamiento

El usuario que actúe debe tener permiso y facultades para representar al Cliente en esa disputa. Su confirmación instruye la transmisión y reconoce el aviso presentado; no acredita el consentimiento del comprador, firmante o cada persona mencionada.

El Cliente y Cord deben identificar sus respectivas bases y deberes de información según el tratamiento y la jurisdicción. La defensa de una operación no autoriza a recopilar o transmitir cualquier dato sin límite. La participación del proveedor tampoco elimina las obligaciones propias de Cord. Si una persona solicita derechos sobre información ya transmitida, debe coordinarse la respuesta según los roles y obligaciones aplicables.

## 6. Plazos, envío y resultado

El Cliente debe atender el plazo real comunicado para el caso. Guardar un borrador o subir un archivo no cumple por sí solo el plazo de presentación. La confirmación local debe contrastarse con el estado del proveedor cuando exista un error o respuesta incierta.

El flujo revisado impide modificar la evidencia una vez registrada su presentación final. No se garantiza que pueda retirarse, sustituirse o volver a presentarse. Antes de confirmar, el Cliente debe revisar la integridad del paquete y las condiciones del caso.

Stripe comunica la resolución del procedimiento, que depende del emisor o la red según corresponda. Cord no garantiza ganar, recuperar un importe, evitar una cuota ni suspender débitos por preparar evidencia. Las consecuencias económicas se revisan en las condiciones de pagos, no se crean en este aviso.

## 7. Conservación, eliminación y contacto

Cord conserva el borrador, referencias de archivos, estado de disputa y registros técnicos de las acciones; Stripe conserva los archivos que recibió bajo su marco aplicable. Este aviso no fija un plazo único para todas las capas ni garantiza borrado sincronizado en Cord, proveedor, emisor y red.

Eliminar la organización, descartar un borrador o solicitar la eliminación de datos no demuestra que un archivo presentado haya desaparecido del expediente del proveedor. Las solicitudes y excepciones de conservación requieren un procedimiento verificable y un contacto de privacidad real, pendientes para la publicación. No se promete una función de recuperación o borrado de archivos externos que no se haya implementado.

## 8. Documentos relacionados y bloqueos

Esta propuesta se coordina con privacidad y condiciones de pagos en versiones aprobadas, sin reemplazar los acuerdos del procesador ni normas imperativas. No incorpora versiones futuras de otros textos ni se incorpora automáticamente a una aceptación existente.

**Bloqueos editoriales y operativos:** identidad/contacto; roles, bases y transferencias; evidencia del contenido exacto confirmado; revisión de minimización del recibo automático; contrato y conservación del proveedor; manejo de archivos huérfanos y respuestas inciertas; procedimiento de derechos; revisión jurídica y publicación versionada.

Procedencia y evidencia: [revisión de fase 5.2](../../../../docs/historial/revisiones-legales/2026-08-30-payments.md). Las cláusulas originales siguen preservadas según `sourceSections`.
