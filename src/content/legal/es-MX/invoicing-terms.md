---
docId: invoicing-terms
version: "2026-10-10"
effectiveDate: "2026-10-10"
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
lastReviewed: "2026-10-10"
reviewedBy: Redacción técnica; revisión jurídica y fiscal pendiente
dependsOn: ["terms"]
sourceSections: ["terms@2026-09-28#descripcion","terms@2026-09-28#fiscal"]
releaseBlockers: ["verified-identity", "provider-account-contracts", "fr-platform-contract", "latam-rail-activation", "verifactu-readiness", "spfe-publication", "fiscal-retention-after-closure", "retention-evidence", "legal-review", "versioned-publication"]
---

# Condiciones de facturación

**BORRADOR TÉCNICO — no publicado ni en vigor.** La fecha del frontmatter es editorial. Esta propuesta no modifica comprobantes, contratos aceptados, configuración fiscal ni tarifas. Requiere revisión jurídica y fiscal externa, así como resolver los bloqueos técnicos indicados. Revisada el 10 de octubre de 2026 contra los rieles fiscales por país, la sustitución de CFDI, los descuentos y el sales tax de Estados Unidos.

## 1. Alcance, partes y documentos

Cord Invoicing ayuda al negocio usuario (el Cliente) a elaborar y gestionar documentos de sus operaciones. Cord es la herramienta de Flouvia; antes de publicar deben verificarse la identidad completa del operador, domicilio y contactos. El Cliente es el emisor de los documentos de sus ventas; los comprobantes de las cuotas o suscripción de Cord corresponden a otra operación y emisor.

Una cotización, un PDF comercial, un recibo de pago, un CFDI, un registro Verifactu y un comprobante autorizado por otra autoridad no son intercambiables. La disponibilidad de una plantilla, un formato electrónico o un país no acredita remisión a una autoridad, deducibilidad, certificación fiscal ni cobertura de todas las obligaciones del Cliente.

Según el país del emisor y los rieles habilitados, Cord puede timbrar CFDI en México por medio de un proveedor autorizado; generar y remitir registros Verifactu a la AEAT; transmitir directamente a ARCA (Argentina), la Sefin Nacional y la SEFAZ (Brasil), SUNAT (Perú), el SII (Chile) y la DIAN (Colombia); emitir por una plataforma autorizada en Francia; o emitir una factura comercial que no se transmite. Cada riel nace desactivado y se habilita por separado; mientras no lo está, el documento es comercial.

## 2. Datos, impuestos y credenciales

El Cliente debe proporcionar datos reales de emisor y receptor, conceptos, cantidades, precios, moneda, régimen, identificadores fiscales y demás elementos exigibles a su operación. Debe revisar exenciones, retenciones, tasas, claves de productos, unidades y tratamiento de pagos; los valores predeterminados no constituyen asesoría ni una determinación de sus obligaciones.

La moneda de la factura es distinta de la moneda del plan de Cord. Cuando un comprobante requiere tipo de cambio, debe corresponder al par y fecha aplicables; no se presume paridad ni se convierte una tasa contable de un tercer país en tipo de cambio fiscal.

Los certificados, llaves, archivos de folios (CAF) y claves de acceso ante la autoridad —incluidos el usuario y la clave SOL de Perú, y el PIN del software y la clave técnica de Colombia— deben pertenecer al emisor o a una persona facultada para usarlos en su nombre, y mantenerse bajo control de personas autorizadas. Al cargarlos, el Cliente autoriza a Cord a usarlos solo para firmar y transmitir los documentos de esa organización, consultar su estado y, en Chile, responder a sus proveedores. Cord los guarda cifrados, por riel y entorno, y no los devuelve al navegador. Una credencial cargada no demuestra que todas las operaciones sean válidas ni autoriza su uso para otros emisores. Cord conserva sus propias responsabilidades sobre el tratamiento de credenciales y la ejecución de las instrucciones recibidas.

El descuento de documento se aplica antes de impuestos y se reparte entre los conceptos; cada comprobante lo declara según su formato. El Cliente define sus cupones (valor, divisa, vigencia y topes) y responde de que sus promociones cumplan la ley aplicable. Cord registra el uso de cada cupón al emitir la factura o aprobar la cotización y, si se agotó, no emite ni aprueba el documento.

## 3. México: emisión CFDI

La integración de México utiliza Facturapi para solicitar la emisión de CFDI. El timbrado real depende de credenciales y configuración válidas para el emisor, información fiscal suficiente y respuesta del proveedor. Un resultado de prueba, un documento simulado, un folio interno o un PDF por sí solos no acreditan un CFDI real y vigente. Deben comprobarse el ambiente de emisión, XML, UUID y estado correspondientes.

Cuando no hay credenciales disponibles, el proveedor de Cord puede producir un resultado marcado como simulado; el entorno de pruebas tampoco debe usarse como comprobante fiscal real. El Cliente debe revisar que el emisor y los importes del documento devuelto correspondan a su operación.

La integración declara por concepto la tasa de IVA congelada en el documento (16 %, 8 % o exento), las retenciones de IVA e ISR y el descuento repartido, y rechaza antes del proveedor un documento cuyo desglose no cuadra o que requiere IEPS o tasa cero gravada, que todavía no se representan. Las claves de producto y unidad del SAT salen de la línea o del producto; sin ellas se usan las genéricas del SAT y el editor lo advierte. También emite la factura global a público en general y el CFDI a receptores extranjeros, sin el complemento de comercio exterior. Esta correspondencia acota, pero no elimina, la necesidad de revisar el XML timbrado.

## 4. Cancelaciones, sustituciones y pagos parciales

Solicitar cancelar un CFDI no demuestra que ya quedó cancelado. Cord pide el motivo del SAT y guarda el estado que devuelve el proveedor (aceptada, pendiente de respuesta del receptor, en verificación, rechazada o vencida); mientras no está aceptada, la factura sigue vigente y el estado puede consultarse de nuevo. Cord no cancela un CFDI con notas de crédito vigentes (primero hay que anularlas) ni con pagos registrados (en ese caso pide una nota de crédito).

La sustitución de un CFDI ya está disponible: Cord crea un borrador con los datos del original, lo timbra relacionado con el original (relación 04), traslada a él los pagos y el cupón del original en la misma operación y después solicita la cancelación del original con el motivo 01 y el folio fiscal del sustituto. Si esa cancelación queda pendiente o se rechaza, se guarda y puede reintentarse. La factura global se corrige cancelándola, con el motivo 04 cuando un cliente pide su propia factura.

Cord emite el complemento de pago (REP) de cada cobro registrado sobre un CFDI timbrado como pago diferido o en parcialidades (PPD), una sola vez por pago, y deja visible en la factura un complemento que no salió para reintentarlo. Un anticipo, una devolución o una nota comercial no determinan por sí solos si corresponde otro comprobante. Una devolución de dinero y una cancelación fiscal son procesos distintos. El Cliente debe resolver el tratamiento de su operación con su asesor y con las herramientas fiscales disponibles, sin que ello exonere a Cord de corregir fallas propias.

## 5. España: Verifactu, factura entre empresarios y límites actuales

El modo de la organización y los requisitos de emisión determinan el camino. En el modo comercial, Cord genera un documento sin remisión fiscal; eso no equivale a un sistema NO VERI*FACTU acreditado como conforme. Con el envío a la AEAT desactivado, Cord no genera registros encadenados: el documento sale como comercial, sin QR ni leyenda. En modo Verifactu, la falta de NIF del emisor o de identidad del sistema puede bloquear la emisión: no existe una conversión automática garantizada a documento comercial.

Los estados deben distinguirse:

| Estado observado | Lo que acredita |
|---|---|
| Documento comercial | Documento generado; no demuestra envío a la AEAT. |
| Registro encadenado / pendiente | Generación local de huella y registro; no demuestra transmisión. |
| Envío intentado | Intento de comunicación; por sí solo no demuestra recepción aceptada. |
| Aceptado, aceptado con errores o rechazado | Respuesta registrada de la autoridad; deben revisarse sus detalles y acciones pendientes. |

El indicador técnico `authority_submission`, un QR o la existencia de una huella no bastan como prueba de aceptación. El envío está deshabilitado por defecto; cuando se habilita, se procesa por tandas cada hora y después de emitir o anular, respetando la espera que indica la AEAT. Esta cadencia no acredita remisión inmediata ni conformidad integral. No se ofrece el carril como fiscalmente listo mientras sigan pendientes la identidad, la declaración responsable del productor, la configuración y las pruebas.

La declaración responsable corresponde al productor del sistema; Cord la publica en su propia página, pero no es una homologación concedida por la AEAT. La generación de anulaciones o subsanaciones no autoriza a borrar o reescribir el registro histórico encadenado ni demuestra por sí sola que la autoridad recibió la corrección. Los registros Verifactu no se pueden borrar y, mientras existan, impiden eliminar la organización.

La factura electrónica obligatoria entre empresarios (Ley 18/2022 y RD 238/2026) viajará por la solución pública de la AEAT. Cord tiene ese envío construido, pero no transmite nada hasta que la AEAT publique su servicio; la pantalla lo indica como próximamente. Las facturas con IRPF se descargan como Facturae mientras la AEAT no publique cómo declararlas por ese canal. Si el Cliente activa la firma de su Facturae, Cord la firma en su nombre con el certificado que subió para Verifactu; sin esa opción se descarga sin firmar.

## 6. Otros países y alcance comercial

En Argentina, Brasil, Perú, Chile y Colombia, cuando el riel está habilitado y el Cliente cargó sus credenciales, Cord actúa como su sistema de facturación y transmite directamente a la autoridad, sin proveedor intermediario y sin actuar como apoderado ni como proveedor tecnológico autorizado. Un documento solo tiene validez fiscal cuando la autoridad lo autoriza; un envío sin respuesta se consulta y nunca se reenvía a ciegas; un documento autorizado no se edita: se anula solo donde la autoridad lo permite y en los demás casos se corrige con nota de crédito. Cada riel rechaza antes de enviar lo que todavía no cubre (por ejemplo, boletas, exportaciones, retenciones o tributos que no modela) y lo dice en pantalla. En homologación los documentos llevan la leyenda de que no tienen validez fiscal.

En Chile, si el Cliente usa la recepción de documentos de sus proveedores, Cord valida cada documento, responde automáticamente el acuse de recibo firmado con el certificado del Cliente y, cuando el Cliente decide, envía la aceptación o el reclamo y lo registra ante el SII. El Cliente debe decidir dentro del plazo legal; la decisión no se cambia después y Cord no la toma por él.

En Francia, cuando el servicio está habilitado y el Cliente completa su alta y firma el mandato en la página de la plataforma autorizada, Cord transmite sus facturas entre empresas establecidas en Francia y declara las demás ventas y los cobros que la ley exige. La plataforma es contraparte del Cliente para ese servicio y se rige por sus condiciones. Cord solo emite; el Cliente necesita su propia plataforma de recepción. Un dato declarado no se corrige desde Cord y una factura rechazada se corrige con una nueva.

En el resto de la Unión Europea, Cord genera Factur-X, XRechnung o Peppol cuando la factura lo admite y, según lo que elija el Cliente, los adjunta al correo; no los transmite por la red Peppol ni a FACe. En Estados Unidos, el cálculo del sales tax por dirección usa los estados donde el Cliente declara recaudar; el Cliente recauda y declara, y Cord no tramita registros ni presenta declaraciones.

Fuera de esos carriles verificados, el documento es comercial. El catálogo de países ofrecidos no amplía esa cobertura. El Cliente debe determinar los documentos y reportes adicionales exigibles a su actividad. Las funcionalidades, cuotas del plan y métodos de pago son cuestiones separadas: emitir una factura no habilita un riel de cobro ni garantiza su pago. El interés moratorio automático está deshabilitado.

## 7. Conservación, errores y cierre

El Cliente debe conservar las copias, XML y acuses que su ley fiscal exige durante el plazo que corresponda. Cord conserva los documentos fiscales y las respuestas de la autoridad mientras exista la organización, sin borrado por antigüedad. Al eliminar la organización se borran, salvo los registros Verifactu, que impiden eliminarla. Eliminar la organización no equivale a cancelar documentos emitidos ni a borrar registros en autoridades, plataformas o proveedores. Antes de cerrar su cuenta, el Cliente debe descargar lo que necesite conservar; la exportación general no incluye los documentos fiscales y hoy no existe una descarga masiva de XML.

Ante una diferencia o respuesta incierta, debe verificarse el documento y estado existentes antes de volver a emitir o corregir. Cord no promete ausencia de errores, pero tampoco excluye sus obligaciones por fallas propias mediante este aviso. Los canales de incidentes, atención y conservación deben quedar definidos antes de la publicación.

## 8. Coordinación contractual y bloqueos

La propuesta complementa términos generales, privacidad y condiciones de pagos en las versiones que se aprueben. No reemplaza acuerdos fiscales del emisor ni normas imperativas. Prelación, ley, foro, contacto y aceptación deben revisarse conjuntamente con las propuestas maestras.

**Bloqueos editoriales y operativos:** identidad verificada; emisor/credenciales y acuerdos de Facturapi; contrato de producción con la plataforma autorizada francesa; activación y prueba real de cada riel de LatAm con un certificado del país; estados y requisitos de Verifactu; declaración responsable y remisión; publicación del servicio de la AEAT para la factura entre empresarios; conservación tras el cierre y descarga de los documentos fiscales; revisión fiscal/jurídica por mercado y publicación versionada.

Evidencia y fuentes primarias: [revisión de fase 5.2](../../../../docs/historial/revisiones-legales/2026-08-30-payments.md) y [revisión de facturación por país](../../../../docs/historial/revisiones-legales/2026-10-10-facturacion-paises.md). Los originales permanecen preservados según `sourceSections`.
