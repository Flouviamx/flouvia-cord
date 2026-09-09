---
docId: acceptable-use-policy
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
sourceOfTruth: src/content/legal/es-MX/acceptable-use-policy.md
artifactRoute: /legal/acceptable-use-policy
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-09-01"
reviewedBy: Redacción técnica; revisión jurídica externa pendiente
dependsOn: ["terms"]
sourceSections: ["terms@2026-08-11#prohibidas","terms@2026-08-11#fairuse"]
releaseBlockers: ["verified-identity", "provider-restriction-map", "organization-enforcement", "appeal-procedure", "mcp-tool-confirmation", "retention-evidence", "legal-review", "versioned-publication"]
---

# Política de uso aceptable

**BORRADOR TÉCNICO — no publicado ni en vigor.** La fecha del frontmatter identifica una propuesta editorial. Este documento no amplía por sí solo facultades de suspensión, crea monitoreo nuevo ni cambia los términos aceptados. Las cláusulas originales continúan vigentes según su propio alcance hasta una publicación autorizada.

## 1. Alcance y responsabilidad

La política propuesta aplica al uso de la cuenta, organización, APIs, enlaces públicos, documentos, correo, pagos, facturación, IA, MCP, webhooks e integraciones de Cord. Abarca a propietarios, miembros, invitados, clientes API y cualquier persona que actúe con credenciales del Cliente.

El Cliente debe administrar permisos, proteger credenciales, supervisar a su equipo y obtener las autorizaciones necesarias para contenido, datos e instrucciones. No puede usar a Cord o a un proveedor como medio para realizar una conducta que no podría realizar lícitamente de forma directa. Cord conserva responsabilidad por sus propios controles, seguridad y respuesta operativa.

## 2. Conductas ilícitas, engañosas o lesivas

No se permite usar Cord para:

- infringir leyes, órdenes, sanciones aplicables o derechos de otras personas;
- suplantar identidad, falsificar autorizaciones, ocultar al verdadero emisor o engañar sobre el origen, precio, destinatario o naturaleza de una operación;
- vender bienes o servicios ilegales, o regulados sin las licencias y controles exigibles;
- acosar, amenazar, discriminar, explotar o revelar información confidencial o personal sin base;
- infringir propiedad intelectual, privacidad, secreto profesional o compromisos contractuales;
- distribuir malware, phishing, spam, material de explotación o instrucciones destinadas a causar daño ilícito.

La referencia a reglas de un proveedor sólo aplica a la función que usa ese proveedor y a la versión contractual correspondiente; no incorpora silenciosamente cualquier política futura ni sustituye una lista comprensible de restricciones de Cord.

## 3. Facturación, pagos y cobranza

Está prohibido simular operaciones, emitir documentos por transacciones inexistentes, evadir impuestos, alterar evidencia, manipular precios o identificadores, cobrar sin autorización o usar datos de pago obtenidos indebidamente. Tampoco se permite ocultar reembolsos, disputar de forma fraudulenta, lavar dinero o financiar actividades ilícitas.

El Cliente no debe presentar un PDF comercial, simulación, entorno de prueba, estado pendiente o registro interno como comprobante fiscal, pago confirmado o respuesta aceptada por una autoridad. Debe usar datos verdaderos de emisor y receptor y corregir errores conforme al proceso aplicable.

La cobranza no puede hostigar, amenazar consecuencias inexistentes, contactar terceros ajenos, continuar cuando exista una solicitud aplicable de cese o inventar saldo, interés, autoridad o aceptación. El interés automático está deshabilitado. Los planes de cuotas requieren una aceptación atribuible y condiciones claras; no deben activarse mediante contexto ambiguo.

## 4. Seguridad e infraestructura

No se permite intentar acceso no autorizado, evadir autenticación, RLS, permisos, cuotas, rate limits o controles antifraude; sondear credenciales o tarjetas; introducir código malicioso; interferir con disponibilidad; extraer datos de otras organizaciones; ni usar automatización para saturar Cord o terceros.

Las claves API, tokens de captura, enlaces públicos, secretos MCP, certificados y credenciales de proveedores deben limitarse al propósito y personas autorizadas. Compartirlos asume riesgos operativos, pero no libera a Cord de investigar una falla propia. Una prueba de seguridad de buena fe requiere autorización y alcance acordado; esta política no crea un programa público de recompensas.

El Cliente no debe configurar integraciones hacia destinos internos o inseguros ni otorgar a un agente herramientas más amplias de lo necesario. Que Cord bloquee SSRF o cifre secretos no garantiza la seguridad o legitimidad del sistema externo.

## 5. IA y automatización

No se permite usar IA para hacerse pasar engañosamente por una persona, generar fraude, amenazas, discriminación, vigilancia ilícita, decisiones prohibidas o contenido que viole esta política. Los datos y documentos enviados deben ser necesarios y autorizados.

El Cliente debe revisar salidas cuando puedan afectar precios, cobros, derechos o comunicaciones. No debe desactivar divulgaciones de automatización ni presentar una sugerencia como hecho confirmado. En modo automático debe aplicar supervisión proporcional, exclusiones y canal humano.

Un permiso MCP no autoriza cualquier efecto externo. Hasta que existan controles por herramienta, no deben habilitarse herramientas de escritura o destructivas para el asistente de cotizaciones. Intentar inducir al modelo, mediante documentos o servidores, a revelar secretos, ignorar controles o ejecutar acciones no autorizadas viola esta política.

## 6. Cuotas, “ilimitado” y uso razonable

“Ilimitado” describe una dimensión comercial sin cuota ordinaria específica; no significa capacidad infinita, continuidad garantizada o ausencia de controles. Los límites del plan, consumo medido, tamaño de carga, concurrencia, seguridad, proveedor y protección de infraestructura siguen aplicando.

Cord puede rechazar o limitar peticiones cuando un gate no demuestra autorización, cuota o margen de seguridad. Los rate limits no son universales: cambian por ruta y algunos respaldos dependen de configuración. No se promete detectar todo abuso ni un techo único.

La propuesta elimina la promesa heredada de migración a infraestructura dedicada. Cualquier capacidad especial requiere acuerdo explícito; no nace automáticamente por consumo alto.

## 7. Respuesta y medidas

Los controles actuales incluyen validaciones, permisos, cuotas, límites por ruta, rechazo de archivos o destinos, revocación de sesiones y claves, exclusiones de automatización y suspensión manual de usuarios por Ops. No existe un motor general que detecte toda infracción ni un flujo completo demostrado para suspender una organización por esta política.

Cuando exista evidencia suficiente y dentro de lo permitido, Flouvia puede aplicar medidas proporcionales: pedir corrección, limitar la función afectada, preservar evidencia, revocar credenciales, suspender acceso o terminar conforme al contrato. La urgencia, seguridad, fraude, obligación legal y riesgo a terceros pueden justificar actuar sin aviso previo; en otros casos debe buscarse aviso y oportunidad razonable de corregir.

No se promete reportar toda sospecha. La información se comparte con proveedor o autoridad cuando exista obligación, solicitud válida o necesidad legítima y proporcional, conforme a privacidad y ley. Suspender no determina automáticamente pérdida de pagos o reembolsos; deben aplicarse contrato y normas imperativas.

## 8. Revisión, contacto y publicación

Debe existir un canal verificable para reportes y revisión. La decisión debe registrar alcance, fundamento y medida, separar usuario de organización cuando proceda y permitir una revisión humana proporcionada, sin exponer controles de seguridad. Esos procedimientos y contactos todavía no están completos.

La política se coordina con términos, privacidad, pagos, facturación, cobranza e IA aprobados. Prelación, notificaciones, evidencias, excepciones, apelación y tratamiento de saldos deben resolverse antes de publicarla.

**Bloqueos:** identidad/contactos; mapa de restricciones por proveedor/país; procedimiento de investigación y suspensión organizacional; apelación y avisos; confirmación MCP; retención/evidencia; revisión jurídica y publicación versionada.

Procedencia y evidencia: [revisión de automatización de fase 5.3](../../../../docs/historial/revisiones-legales/2026-09-01-automation.md). Las cláusulas originales permanecen preservadas según `sourceSections`.
