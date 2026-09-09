---
docId: payments-terms
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
sourceOfTruth: src/content/legal/es-MX/payments-terms.md
artifactRoute: /legal/payments-terms
artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000"
lastReviewed: "2026-08-30"
reviewedBy: Redacción técnica; revisión jurídica externa pendiente
dependsOn: ["terms"]
sourceSections: ["terms@2026-08-11#pagos-autorizacion","terms@2026-08-11#reembolsos"]
releaseBlockers: ["verified-identity", "provider-account-contracts", "fee-reconciliation", "negative-balance-review", "legal-review", "versioned-publication"]
---

# Condiciones de pagos

**BORRADOR TÉCNICO — no publicado ni en vigor.** La fecha del frontmatter identifica una copia de trabajo, no el inicio de obligaciones. Este texto propone condiciones independientes; no sustituye los términos aceptados ni la versión de tarifas `cord-pagos-2026-08-11`. Requiere revisión jurídica externa y resolución de los bloqueos indicados al final.

## 1. Alcance y partes

Cord Payments permite al negocio que usa Cord (el Cliente) solicitar pagos de sus compradores mediante su cuenta conectada de Stripe. Cord es la herramienta de Flouvia; la identificación completa de su operador, domicilio y canales contractuales debe verificarse antes de publicar. Este documento no crea una nueva entidad ni acredita licencias financieras.

El Cliente conserva su papel de vendedor: define la operación, obtiene la autorización del comprador, entrega los bienes o servicios, atiende reclamaciones y determina sus obligaciones fiscales. Cord transmite instrucciones al procesador y registra resultados; no ofrece una cuenta bancaria ni promete disponibilidad inmediata de fondos. Sus obligaciones propias no desaparecen por utilizar Stripe.

## 2. Alta, disponibilidad y autorizaciones

El cobro en línea depende del país admitido, del método y moneda de la operación, de los requisitos de verificación y de las capacidades habilitadas por Stripe. El catálogo de Cord incluye países con registro de pagos manual exclusivamente: Colombia, Argentina, Chile y Perú. Elegir una moneda para una cotización no garantiza que pueda cobrarse en línea.

Quien configure la cuenta debe contar con facultades para representar al Cliente y aceptar los acuerdos aplicables de Stripe que se presenten durante el alta. Las instrucciones de cobro, devolución o gestión de depósitos deben provenir de usuarios autorizados. La aceptación personal de los términos generales no reemplaza la autorización de la organización ni el consentimiento que corresponda al comprador.

## 3. Tarifas y monedas

Para organizaciones que activaron y aceptaron el esquema vigente de Cord Payments, la tabla MXN contempla tarjeta: 4% más MXN 3, más IVA; tarjeta recurrente: la misma tarifa combinada, que incluye el margen de Cord de 0.4%, no un 0.4% adicional sobre el 4%. SPEI: 1% más MXN 7, más IVA, con máximo combinado de MXN 588.12 por operación. El límite corresponde al margen de Cord de MXN 500 más el componente fijo y sus impuestos; no limita el monto del pago.

Los cálculos se realizan en unidades mínimas de la moneda, con redondeos del procesador. La comisión de plataforma y el costo de procesamiento son componentes distintos; la estimación de Cord no reemplaza la liquidación real de Stripe ni acredita tarifas negociadas de una cuenta.

La tabla de plataforma para USD, EUR, GBP, CAD y BRL está deshabilitada. Esto no significa procesamiento gratuito: pueden existir costos de Stripe conforme al acuerdo de la cuenta. No se convierte la tarifa mexicana ni su IVA a otras monedas. Las organizaciones heredadas conservan su esquema anterior hasta la aceptación específica del esquema nuevo. Este borrador no cambia importes, impuestos ni autorizaciones de cargos.

## 4. Anticipos, recurrencia y depósitos

El Cliente debe comunicar al comprador el importe, moneda, periodicidad, vencimientos y condiciones de cancelación de su operación. Registrar un anticipo, parcialidad o plazo no concede financiamiento de Cord ni garantiza la recuperación del saldo. Tampoco produce automáticamente un complemento fiscal de recepción de pagos. El interés moratorio automático está deshabilitado.

Un saldo pendiente no equivale a saldo disponible ni a un depósito recibido. La programación de depósitos está sujeta a disponibilidad, verificaciones, restricciones del procesador y tiempos bancarios. Cord no garantiza una fecha de abono ni modifica por este documento las facultades de reserva o retención del proveedor.

## 5. Reembolsos a compradores

El Cliente debe revisar la operación, el importe reembolsable y la información sobre comisiones antes de confirmar. El flujo de tarjeta solicita la devolución a Stripe y conserva la comisión de plataforma; la solicitud puede quedar pendiente o fallar. La confirmación de una solicitud no demuestra que el comprador ya recibió el dinero.

Para SPEI, Cord registra una devolución manual pendiente y una tarea: el Cliente debe realizar la transferencia por separado. Ese registro no mueve dinero. Conforme a la política comercial heredada, las tarifas transaccionales y de procesamiento no se devuelven por un reembolso voluntario salvo confirmación expresa y escrita de Flouvia, sin excluir derechos imperativos ni ajustes que correspondan. La devolución del precio no cancela automáticamente un comprobante fiscal.

## 6. Disputas y saldos negativos

Stripe puede debitar importes disputados y cuotas aplicables. Si falta saldo, Flouvia puede resultar responsable frente al procesador según la configuración y acuerdos de la cuenta. Se conserva **como propuesta sujeta a revisión**, sin ampliarla, la asignación heredada: el Cliente responde frente a Flouvia por importes disputados, cuotas y saldos negativos atribuibles a sus transacciones, excepto en la medida causada directamente por fraude o conducta dolosa comprobada de Flouvia.

Esa cláusula heredada contempla reintegro dentro de cinco días hábiles tras aviso escrito, compensación contra saldos presentes o futuros cuando ley y Stripe lo permitan, pausa de nuevos cobros o depósitos y solicitud de otro método autorizado. Su alcance, excepciones y procedimiento deben aprobarse jurídicamente antes de publicar. No se afirma que exista un mecanismo automático de recuperación ni se obtiene aquí una autorización bancaria nueva.

El Cliente debe aportar evidencia veraz dentro del plazo del caso. Cord ayuda a prepararla y transmitirla, pero no decide ni garantiza el resultado. Un resultado favorable no garantiza devolución de todas las cuotas del procesador o red.

## 7. Suscripción a Cord y cierre

El precio del plan de Cord es distinto de la comisión por cobrar a compradores. Su renovación, consumos autorizados y cancelación se rigen por los términos generales y la contratación del plan. La política heredada de no reembolsar meses no utilizados o excedentes requiere revisión de sus excepciones legales; este documento no la amplía.

Eliminar una organización no prueba la cancelación exitosa de una suscripción externa, el cierre de Connect ni la liquidación de obligaciones pendientes. Deben verificarse por separado operaciones, devoluciones, disputas y estados del proveedor.

## 8. Documentos relacionados y control de publicación

La propuesta se leerá con términos generales, privacidad, condiciones de facturación y avisos de KYC/evidencia en sus versiones aprobadas. Los acuerdos del procesador rigen su servicio; ninguna cláusula desplaza normas imperativas. La prelación, ley, foro, avisos y mecanismo de aceptación organizacional siguen pendientes de aprobación. No se incorpora por referencia una versión futura desconocida.

**Bloqueos editoriales:** identidad y contactos verificables; acuerdos reales de Stripe por cuenta/país; conciliación de tarifas y redondeo recurrente; revisión de no reembolsos, responsabilidad y recuperación de saldos; coordinación con las revisiones maestras; aceptación versionada y publicación explícita.

Procedencia y evidencia técnica: [revisión de fase 5.2](../../../../docs/historial/revisiones-legales/2026-08-30-payments.md). Las cláusulas originales siguen preservadas en las fuentes identificadas por `sourceSections`.
