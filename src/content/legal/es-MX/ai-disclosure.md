---
docId: ai-disclosure
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
sourceOfTruth: src/content/legal/es-MX/ai-disclosure.md
artifactRoute: /legal/ai-disclosure
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-09-01"
reviewedBy: Redacción técnica; revisión jurídica externa pendiente
dependsOn: ["privacy","collections-notice"]
sourceSections: ["privacy@2026-08-29#uso","privacy@2026-08-29#dpa"]
releaseBlockers: ["verified-identity", "anthropic-account-evidence", "ai-transparency-review", "mcp-tool-confirmation", "participant-attribution", "human-review-procedure", "legal-review", "versioned-publication"]
---

# Divulgación sobre inteligencia artificial

**BORRADOR TÉCNICO — no publicado ni en vigor.** La fecha del frontmatter es editorial. Este texto describe las funciones revisadas al 1 de septiembre de 2026; no activa IA, cambia proveedores ni constituye una evaluación de cumplimiento.

## 1. Alcance y proveedor

Cord usa la API comercial de Anthropic en dos funciones: convertir texto, imágenes o PDF en un borrador de partidas de cotización, y redactar mensajes o propuestas para cobranza. El modelo concreto puede cambiar mediante configuración técnica; mostrar un nombre de modelo no garantiza comportamiento constante.

Anthropic recibe instrucciones y contenido sólo cuando se invoca la función o corre una automatización habilitada. Su información pública vigente indica que no usa chats de productos comerciales para entrenar modelos salvo participación u opción expresa, pero esa publicación no demuestra la configuración, contrato, región o retención de la cuenta de Cord. Estos elementos permanecen bloqueados hasta verificarse.

## 2. Borrador de cotización

El usuario puede enviar hasta el límite técnico texto libre y una imagen o PDF. Cord añade su catálogo activo —identificadores, nombres, unidades y precios— para que el modelo extraiga conceptos y sugiera coincidencias. El archivo y el catálogo se transmiten a Anthropic; no se ejecuta un OCR local separado.

La salida vuelve al editor como partidas. El servidor vuelve a tomar nombre, unidad y precio de lista del catálogo cuando reconoce un identificador y limita cantidades y precios sugeridos, pero no valida el pedido completo, la intención del comprador, impuestos, inventario o licitud. El borrador no se guarda ni envía automáticamente por ese endpoint: el usuario debe revisarlo en el editor.

Los documentos pueden contener instrucciones engañosas, datos personales, secretos o contenido no relacionado. El Cliente debe minimizar los archivos y revisar todas las páginas. Los límites de formato y tamaño no detectan por sí solos prompt injection, fraude o derechos de terceros.

## 3. Herramientas e integraciones MCP

Si el plan y la configuración lo permiten, el asistente de cotización puede consultar servidores MCP activos a los que el agente tenga acceso. Los nombres, descripciones, esquemas, llamadas y resultados de esas herramientas pasan por el flujo de IA; los resultados pueden enviarse de vuelta a Anthropic como contexto.

Actualmente autorizar un servidor concede normalmente `["*"]`, es decir, todas las herramientas que exponga. El modelo puede invocarlas sin confirmación humana por llamada y el código no distingue de forma verificable lectura de escritura. Por ello, una herramienta con efectos externos podría modificar el sistema conectado. No debe habilitarse para herramientas de escritura hasta implementar permisos por herramienta, clasificación de efectos, vista previa, confirmación y auditoría. Desactivar o borrar un servidor no revierte acciones anteriores.

## 4. Cobranza con IA y acciones

El agente recibe nombre del comprador, saldo, días de atraso, enlace, configuración e historial seleccionado. Genera correo en español o inglés y puede proponer cuotas dentro de límites validados por servidor. No puede conceder descuentos del principal ni generar interés moratorio automático.

En modo aprobación, la salida queda como borrador y un usuario puede editar, regenerar, descartar o aprobar. Aprobar puede activar el plan propuesto antes del intento de correo. En modo automático, el texto se envía sin revisión humana individual y una herramienta puede materializar cuotas cuando el contexto parece contener aceptación.

El contexto actual no distingue de forma fiable al vendedor del comprador y las respuestas entrantes están deshabilitadas. La negociación automática de cuotas queda bloqueada hasta corregir atribución y evidencia. El modelo no debe presentarse como abogado, autoridad, decisión final o persona humana.

## 5. Transparencia frente a personas

Los correos automáticos actuales declaran que son mensajes automatizados enviados por Cord en nombre del acreedor. Esa divulgación debe conservarse de manera visible y comprensible, también tras una edición. El Reply-To identifica el canal del acreedor cuando está configurado.

La interfaz debe distinguir una sugerencia de IA de un dato confirmado y ofrecer corrección humana. Cord no añade hoy una marca técnica universal o metadato legible por máquina a todo texto generado. Tampoco existe una pantalla pública que explique modelo, versión, criterios o mecanismo de impugnación para cada salida. Los requisitos aplicables deben evaluarse por función y mercado; una etiqueta genérica “IA” no prueba cumplimiento.

## 6. Datos, finalidades y retención

Además del contenido descrito, Cord registra uso externo, modelo, operación, tokens, éxito o fallo y metadatos de corrida a nivel organización. Los borradores y mensajes de cobranza pueden persistir con aprobaciones, errores y referencias de entrega. La conservación del request del proveedor, sus logs y cualquier opt-in debe verificarse contractualmente.

El Cliente debe contar con base para transmitir información de compradores, empleados y terceros, informarles cuando proceda y no cargar categorías sensibles, credenciales o secretos salvo necesidad y protección comprobadas. El uso para operar una función no autoriza publicidad, entrenamiento voluntario o una finalidad incompatible. Privacidad, DPA, subprocesadores y retención deben especificar roles y solicitudes de derechos.

## 7. Limitaciones, revisión y seguridad

La IA puede omitir, duplicar, inferir o redactar incorrectamente; sus salidas no son asesoría legal, fiscal, financiera o profesional. Una coincidencia con catálogo, cálculo server-side o formato estructurado reduce errores concretos, pero no certifica el resultado.

El Cliente debe revisar importes, destinatario, tono, datos, enlaces, productos, permisos de herramientas y consecuencias antes de usar una salida. En automático debe monitorear fallos y ofrecer intervención humana. Cord conserva responsabilidad por sus propios controles y no puede desplazarla con una exención absoluta.

Incidentes, contenido inesperado o una decisión impugnada deben poder escalarse a personas. El procedimiento, plazos y contacto real siguen pendientes; no se promete un derecho uniforme ni una función automatizada inexistente.

## 8. Coordinación y bloqueos

Esta divulgación se coordina con privacidad, DPA, subprocesadores, aviso de cobranza, uso aceptable y términos aprobados. No incorpora políticas futuras del proveedor ni autoriza nuevas finalidades.

**Bloqueos:** identidad/contactos; contrato, región y retención de Anthropic; evaluación de transparencia por mercado desde el 2 de agosto de 2026 en la UE; permisos MCP por herramienta y confirmación de efectos; atribución de participantes y aceptación de cuotas; procedimiento humano, retención y derechos; revisión jurídica y publicación versionada.

Procedencia y evidencia: [revisión de automatización de fase 5.3](../../../../docs/historial/revisiones-legales/2026-09-01-automation.md). Las fuentes originales permanecen preservadas según `sourceSections`.
