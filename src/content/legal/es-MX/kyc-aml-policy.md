---
docId: kyc-aml-policy
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
sourceOfTruth: src/content/legal/es-MX/kyc-aml-policy.md
artifactRoute: /legal/kyc-aml-policy
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-08-30"
reviewedBy: Redacción técnica; revisión jurídica externa pendiente
dependsOn: ["payments-terms","privacy"]
sourceSections: ["privacy@2026-08-29#datos"]
releaseBlockers: ["verified-identity", "person-consent-evidence", "processing-roles", "provider-account-contracts", "retention-evidence", "legal-review", "versioned-publication"]
---

# Aviso de verificación de identidad y condiciones KYC

**BORRADOR TÉCNICO — no publicado ni en vigor.** La fecha del frontmatter identifica esta revisión, no una nueva política efectiva. El identificador editorial `kyc-aml-policy` no acredita que Cord sea una entidad financiera, un sujeto obligado en todos los países ni un servicio certificado de prevención de lavado de dinero.

## 1. Alcance y participantes

Este aviso describe la información que Cord solicita para configurar y mantener la cuenta conectada de pagos de un negocio (el Cliente), las instrucciones que transmite a Stripe y los registros técnicos asociados. Cord es la herramienta de Flouvia; la identidad completa del operador, su domicilio y el contacto de privacidad deben verificarse antes de publicar.

Intervienen el Cliente, sus representantes y otras personas que deban identificarse, Cord y Stripe. Los roles de protección de datos deben determinarse por tratamiento: una función técnica o un acuerdo comercial no convierte automáticamente a todos los participantes en encargados del Cliente. El aviso de privacidad, los acuerdos de Stripe y el DPA aplicable deben coordinarse sin atribuir contratos o roles no verificados.

## 2. Información solicitada

Los requisitos se obtienen de la cuenta y de las personas asociadas, y pueden cambiar durante su uso. Según corresponda, incluyen nombre o razón social, domicilio, fecha de nacimiento, identificación personal o fiscal, actividad del negocio, medios de contacto, cuenta bancaria y relación con la organización. Pueden solicitarse documentos de identidad, domicilio, constitución o acreditación de representación.

Los roles de representante, administrador, director o beneficiario real deben declararse conforme a la situación real y al requisito del proveedor. No se presume que la primera persona sea propietaria del 100% ni se impone un umbral universal de participación del 25%. No todos los campos ni documentos son obligatorios para todas las personas o países.

## 3. Finalidades, representación y decisiones separadas

La información se utiliza para tramitar la verificación y habilitación de pagos, atender requisitos posteriores y mantener trazabilidad y seguridad del flujo. Las métricas de calidad de captura y respuestas del proveedor también permiten evaluar problemas de legibilidad. No se presentan estas finalidades como consentimiento a publicidad o analítica opcional.

Quien aporte datos de otra persona debe contar con facultades y una base lícita, proporcionar la información exigible al titular y obtener su consentimiento cuando corresponda. No debe aceptar por una persona sin representación válida ni sustituir sus datos por los propios para terminar el alta.

Aceptar condiciones de pagos, reconocer un aviso de privacidad y consentir un tratamiento específico son actos distintos. El alta actual valida la versión de tarifas y una confirmación de privacidad del usuario actuante, con fecha e IP obtenidas por el servidor para la aceptación enviada a Stripe. Esto no demuestra una aceptación o consentimiento versionado de cada persona identificada. Las bases y evidencias por titular, incluidos datos financieros o sensibles cuando correspondan, deben completarse antes de publicar este aviso como definitivo.

## 4. Captura y transmisión de documentos

Los documentos se procesan para verificar formato, tamaño y legibilidad y se transmiten a Stripe con el propósito correspondiente al requisito. Una comprobación de calidad no garantiza autenticidad, aprobación ni ausencia de fraude. No se ofrece como implementada una prueba biométrica de vida por tomar una fotografía ordinaria.

El flujo de identidad elimina metadatos innecesarios de las imágenes compatibles, preservando la orientación técnica cuando hace falta. Los bytes se manejan durante la transmisión; no se guardan como imágenes en la tabla de evidencia KYC de Cord. Esto no significa ausencia de datos personales en otros registros ni eliminación inmediata de copias recibidas por el proveedor.

El enlace para continuar la captura en el teléfono es una credencial temporal. Debe compartirse sólo con la persona a la que corresponde la captura. Su caducidad y controles de dispositivo no son un mecanismo de consentimiento por esa persona ni justifican enviar el enlace a terceros no autorizados.

## 5. Registro técnico y conservación

Cord intenta registrar identificadores de organización, cuenta y persona, propósito, tipo de documento, huella SHA-256, tamaño, formato, dimensiones, métricas de calidad, origen, usuario actuante, IP, navegador, fechas y estado o detalle de respuesta del proveedor. No todos los campos están presentes en todos los casos. La huella no es la fotografía, pero el registro asociado puede seguir siendo dato personal.

La configuración actual fija cinco años desde el envío para limpiar evidencia técnica KYC. Es una política implementada pendiente de validación de necesidad, fundamento y excepciones; no se afirma que una ley AML imponga ese plazo a Cord en toda jurisdicción. El registro es de mejor esfuerzo y puede fallar. La limpieza depende de la ejecución del proceso programado, y la eliminación de una organización puede afectar registros antes; no existe aquí garantía de archivo probatorio completo durante cinco años.

La conservación del proveedor, los respaldos y las obligaciones de preservación deben evaluarse por separado. Caducar una sesión de captura no elimina por sí solo el documento ya transmitido a Stripe.

## 6. Revisión, restricciones y actualización

Una carga exitosa no significa verificación aprobada. Stripe puede pedir correcciones, documentos adicionales o pasos que no puedan completarse en la interfaz de Cord. Las capacidades de cobrar y recibir depósitos tienen estados separados. La información debe mantenerse actualizada y atenderse el plazo real que corresponda al requisito.

Cord no garantiza aprobación, tiempos fijos de revisión ni verificación permanente. No completar un requisito puede impedir o restringir pagos o depósitos. Esa dependencia del proveedor no elimina las obligaciones propias de Cord respecto a información, seguridad y ejecución del flujo.

## 7. Derechos y solicitudes

Las personas deben poder solicitar información, corrección y los derechos aplicables mediante el contacto de privacidad que se verifique para la publicación. El procedimiento debe identificar quién resuelve cada tratamiento, qué acreditación proporcional se requiere y cómo se coordina con el Cliente o Stripe. No se inventa aquí un representante, DPO, buzón nuevo ni plazo uniforme.

Retirar un consentimiento cuando sea la base aplicable no equivale a cancelar contratos o borrar registros que deban conservarse por otra base válida. Tampoco justifica seguir tratando datos sin fundamento. Cerrar Cord no prueba el cierre de Connect ni permite prometer borrado de toda copia en terceros.

## 8. Coordinación y condiciones de publicación

Esta propuesta debe leerse con privacidad y condiciones de pagos en sus versiones aprobadas. No autoriza nuevos tratamientos, no sustituye acuerdos de Stripe ni crea obligaciones regulatorias universales.

**Bloqueos editoriales y operativos:** identidad y canal verificables; matriz de roles y bases por finalidad/país/persona; evidencia de representación y consentimientos; contratos y transferencias del proveedor; retención, eliminación y prueba de ejecución; revisión de requisitos no soportados y traducción del alta; revisión jurídica y publicación versionada.

Procedencia y evidencia: [revisión de fase 5.2](../../../../docs/historial/revisiones-legales/2026-08-30-payments.md). La fuente original de privacidad permanece preservada según `sourceSections`.
