---
docId: invoicing-terms
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
sourceOfTruth: src/content/legal/es-MX/invoicing-terms.md
artifactRoute: /legal/invoicing-terms
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-08-30"
reviewedBy: Redacción técnica; revisión jurídica y fiscal pendiente
dependsOn: ["terms"]
sourceSections: ["terms@2026-08-11#descripcion","terms@2026-08-11#fiscal"]
releaseBlockers: ["verified-identity", "provider-account-contracts", "cfdi-tax-mapping", "cfdi-cancellation-state", "verifactu-readiness", "retention-evidence", "legal-review", "versioned-publication"]
---

# Condiciones de facturación

**BORRADOR TÉCNICO — no publicado ni en vigor.** La fecha del frontmatter es editorial. Esta propuesta no modifica comprobantes, contratos aceptados, configuración fiscal ni tarifas. Requiere revisión jurídica y fiscal externa, así como resolver los bloqueos técnicos indicados.

## 1. Alcance, partes y documentos

Cord Invoicing ayuda al negocio usuario (el Cliente) a elaborar y gestionar documentos de sus operaciones. Cord es la herramienta de Flouvia; antes de publicar deben verificarse la identidad completa del operador, domicilio y contactos. El Cliente es el emisor de los documentos de sus ventas; los comprobantes de las cuotas o suscripción de Cord corresponden a otra operación y emisor.

Una cotización, un PDF comercial, un recibo de pago, un CFDI y un registro Verifactu no son intercambiables. La disponibilidad de una plantilla o país no acredita remisión a una autoridad, deducibilidad, certificación fiscal ni cobertura de todas las obligaciones del Cliente.

## 2. Datos, impuestos y credenciales

El Cliente debe proporcionar datos reales de emisor y receptor, conceptos, cantidades, precios, moneda, régimen, identificadores fiscales y demás elementos exigibles a su operación. Debe revisar exenciones, retenciones, tasas, claves de productos, unidades y tratamiento de pagos; los valores predeterminados no constituyen asesoría ni una determinación de sus obligaciones.

La moneda de la factura es distinta de la moneda del plan de Cord. Cuando un comprobante requiere tipo de cambio, debe corresponder al par y fecha aplicables; no se presume paridad ni se convierte una tasa contable de un tercer país en tipo de cambio fiscal.

Los certificados, claves y autorizaciones deben pertenecer al emisor correspondiente y mantenerse bajo control de personas autorizadas. Una credencial cargada no demuestra que todas las operaciones sean válidas ni autoriza su uso para otros emisores. Cord conserva sus propias responsabilidades sobre el tratamiento de credenciales y la ejecución de las instrucciones recibidas.

## 3. México: emisión CFDI

La integración de México utiliza Facturapi para solicitar la emisión de CFDI. El timbrado real depende de credenciales y configuración válidas para el emisor, información fiscal suficiente y respuesta del proveedor. Un resultado de prueba, un documento simulado, un folio interno o un PDF por sí solos no acreditan un CFDI real y vigente. Deben comprobarse el ambiente de emisión, XML, UUID y estado correspondientes.

Cuando no hay credenciales disponibles, el proveedor de Cord puede producir un resultado marcado como simulado; el entorno de pruebas tampoco debe usarse como comprobante fiscal real. El Cliente debe revisar que el emisor y los importes del documento devuelto correspondan a su operación.

La integración revisada aún no acredita trasladar al proveedor todas las tasas y retenciones configuradas en las partidas. Por ello, no se promete equivalencia fiscal completa entre el cálculo de Cord y el XML timbrado. Esta diferencia es un bloqueo de implementación que debe resolverse y probarse, no una responsabilidad que se elimine con una cláusula.

## 4. Cancelaciones, correcciones y pagos parciales

Solicitar cancelar un CFDI no demuestra que ya quedó cancelado. El motivo, la relación con un comprobante sustituto y la eventual aceptación del receptor dependen del caso. Debe verificarse el estado fiscal final y conservar el acuse pertinente. El camino actual necesita completar la lectura de estados pendientes y el envío del folio sustituto cuando corresponda; no se presenta como cobertura integral de esos supuestos.

Registrar un abono, anticipo, devolución o nota comercial no genera automáticamente un Complemento de Recepción de Pagos (REP), ni determina si corresponde emitirlo. Una devolución de dinero y una cancelación fiscal son procesos distintos. El Cliente debe resolver el tratamiento de su operación con su asesor y con las herramientas fiscales disponibles, sin que ello exonere a Cord de corregir fallas propias.

## 5. España: estados Verifactu y límites actuales

El modo de la organización y los requisitos de emisión determinan el camino. En el modo comercial, Cord genera un documento sin remisión fiscal; eso no equivale a un sistema NO VERI*FACTU acreditado como conforme. En modo Verifactu, la falta de NIF del emisor o de identidad del sistema puede bloquear la emisión: no existe una conversión automática garantizada a documento comercial.

Los estados deben distinguirse:

| Estado observado | Lo que acredita |
|---|---|
| Documento comercial | Documento generado; no demuestra envío a la AEAT. |
| Registro encadenado / pendiente | Generación local de huella y registro; no demuestra transmisión. |
| Envío intentado | Intento de comunicación; por sí solo no demuestra recepción aceptada. |
| Aceptado, aceptado con errores o rechazado | Respuesta registrada de la autoridad; deben revisarse sus detalles y acciones pendientes. |

El indicador técnico `authority_submission`, un QR o la existencia de una huella no bastan como prueba de aceptación. El despliegue revisado tiene procesamiento programado diario y envío deshabilitado por defecto; esta cadencia no acredita remisión inmediata ni conformidad integral. No se ofrece el carril como fiscalmente listo mientras sigan pendientes identidad, declaración responsable del productor, configuración, pruebas y corrección de estados.

La declaración responsable corresponde al productor del sistema; no es una homologación concedida por la AEAT. La generación de anulaciones o rectificaciones no autoriza a borrar o reescribir el registro histórico encadenado ni demuestra por sí sola que la autoridad recibió la corrección.

## 6. Otros países y alcance comercial

Fuera de los carriles fiscales expresamente verificados, el documento es comercial. No se promete transmisión al SAT, AEAT u otra autoridad, ni cumplimiento de todos los formatos, libros o reportes locales. El catálogo de países ofrecidos no amplía esa cobertura.

El Cliente debe determinar los documentos y reportes adicionales exigibles a su actividad. Las funcionalidades, cuotas del plan y métodos de pago son cuestiones separadas: emitir una factura no habilita un riel de cobro ni garantiza su pago. El interés moratorio automático está deshabilitado.

## 7. Conservación, errores y cierre

El Cliente debe conservar las copias y acuses necesarios para sus obligaciones. Los archivos locales, los respaldos y la conservación del proveedor son capas distintas; Cord no garantiza aquí un archivo fiscal permanente ni un plazo uniforme para todos los países. Eliminar la organización no equivale a cancelar documentos emitidos ni a borrar registros en autoridades o proveedores.

Ante una diferencia o respuesta incierta, debe verificarse el documento y estado existentes antes de volver a emitir o corregir. Cord no promete ausencia de errores, pero tampoco excluye sus obligaciones por fallas propias mediante este aviso. Los canales de incidentes, atención y conservación deben quedar definidos antes de la publicación.

## 8. Coordinación contractual y bloqueos

La propuesta complementa términos generales, privacidad y condiciones de pagos en las versiones que se aprueben. No reemplaza acuerdos fiscales del emisor ni normas imperativas. Prelación, ley, foro, contacto y aceptación deben revisarse conjuntamente con las propuestas maestras.

**Bloqueos editoriales y operativos:** identidad verificada; emisor/credenciales y acuerdos de Facturapi; correspondencia de impuestos CFDI; cancelación pendiente y sustitución; estados y requisitos de Verifactu; declaración responsable y remisión; conservación y exportación comprobadas; revisión fiscal/jurídica por mercado y publicación versionada.

Evidencia y fuentes primarias: [revisión de fase 5.2](../../../../docs/historial/revisiones-legales/2026-08-30-payments.md). Los originales permanecen preservados según `sourceSections`.
