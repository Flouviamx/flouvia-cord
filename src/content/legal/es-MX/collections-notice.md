---
docId: collections-notice
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
sourceOfTruth: src/content/legal/es-MX/collections-notice.md
artifactRoute: /legal/collections-notice
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-09-01"
reviewedBy: Redacción técnica; revisión jurídica externa pendiente
dependsOn: ["terms","privacy"]
sourceSections: ["terms@2026-08-11#pagos-autorizacion","privacy@2026-08-29#uso"]
releaseBlockers: ["verified-identity", "debt-classification", "stop-channel", "participant-attribution", "provider-account-contracts", "legal-review", "versioned-publication"]
---

# Aviso de cobranza

**BORRADOR TÉCNICO — no publicado ni en vigor.** La fecha del frontmatter identifica esta copia editorial, no el inicio de una campaña ni un cambio contractual. Este aviso no autoriza nuevos mensajes ni sustituye las condiciones acordadas entre acreedor y deudor.

## 1. Alcance y participantes

Cord permite al negocio usuario (el Cliente) gestionar cuentas por cobrar y, si activa la función correspondiente, preparar o enviar recordatorios por correo en nombre del acreedor. Cord es una herramienta tecnológica de Flouvia: no compra la deuda, no se convierte en acreedor, despacho jurídico o entidad financiera, y no decide si una suma es legalmente exigible.

El Cliente conserva la relación con su comprador y responde de la identidad del acreedor, el origen y exactitud del saldo, la vía de contacto y las condiciones comerciales. La identidad completa de Flouvia, su domicilio y contactos legales siguen pendientes de verificación para una publicación.

## 2. Cartera elegible y configuración

El flujo toma cuentas con saldo vencido de cotizaciones o facturas, descuenta pagos y notas aplicables y excluye saldos cubiertos, planes al corriente, registros excluidos y casos fuera de la configuración. El Cliente define días de gracia, cadencia, monto mínimo, idioma, tono, firma, máximo por corrida y cuándo pueden proponerse cuotas, dentro de los límites técnicos.

La configuración inicial está desactivada y usa modo aprobación. La función autónoma requiere un plan habilitado y activación expresa por un usuario con permiso. La corrida programada es diaria en la configuración revisada de Vercel Hobby; también existe ejecución manual. Una programación no garantiza entrega, frecuencia exacta ni recuperación.

Antes de activar, el Cliente debe determinar si la cuenta es comercial o de consumo, quién puede recibir comunicaciones y qué requisitos de aviso, horario, frecuencia, validación, registro o licencia aplican. Cord no clasifica automáticamente esas obligaciones por país, estado, tipo de deuda o destinatario.

## 3. Aprobación y modo automático

En modo aprobación, el modelo prepara un borrador. Un usuario autorizado puede editarlo, regenerarlo, descartarlo o aprobarlo; sólo la aprobación intenta enviarlo. Aprobar también puede materializar un plan de pagos propuesto antes de intentar el correo. Si el envío falla después, el plan puede quedar activo, por lo que el estado debe revisarse.

En modo automático, un resultado generado se intenta enviar sin revisión humana individual. Los límites de gracia, cadencia, exclusión y volumen reducen envíos no deseados, pero no prueban corrección jurídica o factual de cada mensaje. Activar ese modo confirma una decisión operativa del Cliente, no traslada a Cord todas las responsabilidades del contenido o del sistema.

## 4. Identificación, contenido y canal de cese

El correo identifica al acreedor con el nombre disponible, puede incluir identificación fiscal, usa “acreedor vía Cord”, ofrece un Reply-To cuando está configurado, declara que el mensaje de cobranza es automatizado y contiene un enlace al documento o al pago disponible. No debe amenazar, hostigar, hacerse pasar por autoridad, revelar la deuda a terceros ni afirmar consecuencias o facultades inexistentes.

Cada correo indica que la persona puede responder o contactar al acreedor para solicitar detener mensajes automáticos. **Esto es hoy una solicitud, no una baja instantánea ejecutada por Cord.** La recepción automática de respuestas en Cord está deshabilitada por middleware; el acreedor debe atender su buzón, verificar la solicitud y añadir la exclusión correspondiente. La UI permite excluir cliente, cotización o factura, pero no existe un enlace público de baja de un clic.

El Cliente no debe activar envíos si el contacto no es apropiado, fue revocado, expone información a terceros o ya existe una solicitud aplicable de cese. Debe mantener un proceso para reclamaciones, correcciones y preferencias. Las excepciones legales a un cese requieren análisis propio; este aviso no las decide.

## 5. Montos, enlaces, cuotas e interés

Los mensajes se basan en el saldo y días de atraso calculados por Cord; el Cliente debe comprobarlos y corregir pagos, notas o vencimientos mal registrados. Un enlace permite pagar sólo cuando el riel está disponible; de lo contrario abre el documento y sus opciones. No debe presentarse como prueba fiscal o sentencia.

El agente puede proponer entre dos y seis cuotas sólo después del umbral configurado y cuando no hay plan vigente. El servidor calcula importes que suman el saldo y no permite descuentos del principal. En aprobación, la propuesta queda pendiente hasta que un usuario la activa; en automático puede materializarse mediante la herramienta del modelo cuando el contexto parece contener aceptación.

Hoy el historial mezcla mensajes del vendedor y comprador bajo el mismo rol al enviarlo al modelo y el correo entrante está deshabilitado. Por ello, **no está demostrado que el sistema pueda atribuir con fiabilidad la aceptación de cuotas a la persona deudora**. Esta es una condición de bloqueo: no debe ofrecerse el modo automático para negociar o activar planes hasta separar participantes y conservar evidencia de aceptación.

El interés moratorio automático permanece deshabilitado en todos los países. Un valor histórico o texto del Cliente no autoriza a generarlo, y este aviso no fija tasa alguna.

## 6. Datos y proveedores

Para seleccionar y redactar, Cord procesa identificadores de organización y documento, nombre y correo del comprador, saldo, moneda, vencimiento, días de atraso, enlace, configuración y el historial seleccionado. El contexto enviado a Anthropic puede incluir nombre, saldo, atraso, enlace e historial; Resend recibe destinatario, remitente, asunto y contenido para entregar el correo.

El Cliente debe limitar el historial y la firma a información pertinente, evitar datos sensibles o de terceros innecesarios y contar con base para facilitar los datos. Los roles, regiones, contratos y transferencias de Anthropic y Resend deben quedar coordinados con privacidad, DPA y subprocesadores antes de publicar.

## 7. Registros, resultados y límites

Cord guarda borradores, mensajes, estado, errores, fechas, identificadores del proveedor, aprobaciones, exclusiones y eventos de planes. Un estado “enviado” significa que el proveedor aceptó la solicitud de entrega; no demuestra lectura, recepción por la persona correcta, validez del saldo ni acuerdo.

Cord no garantiza respuesta, pago, plan, preservación de la relación comercial o cumplimiento por usar la herramienta. El Cliente debe supervisar fallos, detener automatización cuando corresponda y ofrecer revisión humana. Ninguna frase excluye las obligaciones propias de Cord por diseño, seguridad o ejecución.

## 8. Coordinación y bloqueos

Este aviso se coordina con términos, privacidad, condiciones de pagos, divulgación de IA y política de uso aceptable que finalmente se aprueben. No sustituye contratos del acreedor ni normas imperativas, y no convierte automáticamente a Cord en despacho regulado.

**Bloqueos:** identidad/contactos; clasificación por mercado y tipo de deuda; canal público de cese y ejecución comprobada; separación de participantes y evidencia de aceptación de planes; roles/contratos/transferencias; retención y quejas; revisión jurídica bilingüe y publicación versionada.

Procedencia y evidencia: [revisión de automatización de fase 5.3](../../../../docs/historial/revisiones-legales/2026-09-01-automation.md). Las cláusulas originales permanecen preservadas según `sourceSections`.
