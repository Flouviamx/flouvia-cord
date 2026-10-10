---
title: "Cómo facturar en Perú con Cord"
description: "Factura comercial hoy; factura electrónica directa con SUNAT en activación: afiliación al SEE del Contribuyente, usuario SOL secundario, serie, IGV, retención, nota de crédito y lo que no cubre."
category: "Facturación por país"
order: 12
---

En Perú la factura electrónica se envía a **SUNAT**, que responde con una constancia de recepción (CDR). Cord tiene construido el riel directo con SUNAT como **SEE - Del Contribuyente** (sin OSE ni PSE), firmado con el certificado de tu negocio, pero **está en activación**: hoy tus facturas se emiten como **factura comercial sin validez fiscal**. Si necesitas facturar con SUNAT desde Cord, escríbenos para habilitarlo en tu cuenta.

**En resumen:**

- **Hoy:** factura comercial y nota de crédito comercial, en todos los planes (10 al mes en Gratis, ilimitadas desde Starter). No se envían a SUNAT.
- **En activación:** factura electrónica (01) y nota de crédito (07). En **Ajustes › Facturación › Perfil fiscal › Factura electrónica con SUNAT** dice **Próximamente**.
- **Qué vas a necesitar:** plan Starter o superior, tu RUC, afiliarte como emisor electrónico desde tus sistemas (SEE - Del Contribuyente), un **certificado digital** a nombre de tu RUC registrado en SUNAT, un **usuario SOL secundario** con perfil de envío de comprobantes y una **serie `F###`** reservada para Cord.
- **Solo facturas:** un cliente sin RUC necesitaría una **boleta de venta**, que Cord todavía no emite.
- **Anular:** Cord no hace comunicaciones de baja: una factura se corrige con **nota de crédito**, de anulación si acredita el total o de disminución si acredita una parte.
- **Cobrar:** en Perú el cobro en línea es con **Mercado Pago**; Cord Payments no está disponible.

## Qué documento emite Cord

| Situación | Documento |
|---|---|
| Hoy, cualquier plan | Factura comercial (sin validez fiscal). |
| Con SUNAT activo (Starter o superior), cliente con RUC | Factura electrónica (01) en tu serie `F###`. |
| Cliente del exterior | Factura de exportación (operación 0200 bienes o 0201 servicios). |
| Con SUNAT activo, en Gratis o eligiendo **Factura comercial** | Proforma con serie `PRO`: sirve para cobrar, pero no es un comprobante electrónico. |
| Corrección | Nota de crédito (07) en la misma serie, con su propia numeración. |

## Qué vas a necesitar

- **Afiliación** como emisor electrónico desde tus sistemas (SEE - Del Contribuyente) en SUNAT Operaciones en Línea.
- **Certificado digital** a nombre de tu RUC, registrado en SUNAT. Lo emite una entidad de certificación y su costo lo fija esa entidad.
- **Usuario SOL secundario** con el perfil de envío de comprobantes electrónicos.
- **Serie `F###`** reservada para Cord. Si ya emitiste en esa serie fuera de Cord, el último número emitido, para continuar la numeración.

## Configura tu cuenta (cuando se active)

1. En **Identidad de facturación**, captura tu razón social y tu **RUC**.
2. En **Factura electrónica con SUNAT**: **Serie de facturas**, **Qué vendes** (bienes o servicios), **Último número de factura emitido fuera de Cord**, **Último número de nota de crédito emitido fuera de Cord**, **Tus conceptos sin IGV son** (**Exonerados** o **Inafectos**), **Código de establecimiento** y, si quieres, **Nombre comercial**.
3. Marca lo que aplique a tu negocio: MYPE de restaurantes u hoteles con IGV reducido, bienes o servicios sujetos a detracciones (SPOT), agente de percepción, o **No me retienen IGV**. En **RUC de tus clientes que son agentes de retención del IGV**, lista sus RUC. Pulsa **Guardar ajustes de SUNAT**.
4. En **Usuario SOL secundario**, captura el **Usuario (sin el RUC)** y la **Clave SOL**, y pulsa **Guardar usuario SOL**. Cord lo prueba con una consulta sin efectos.
5. En **Certificado digital**, sube tu `.p12`/`.pfx` (o certificado y llave) y pulsa **Subir certificado**.

## IGV, retención y forma de pago

- **IGV** al 18 % por concepto. Los conceptos al 0 % van como **exonerados** o **inafectos**, según lo que indicaste en Ajustes; Cord no lo adivina. Una factura lleva **una sola tasa de IGV**.
- **MYPE de restaurantes y hoteles:** con el régimen declarado, IGV de 10,5 % en 2026 y 15 % en 2027.
- **Retención del IGV:** la practica tu cliente si es agente de retención. En una venta gravada al crédito por encima de S/ 700 a un cliente de tu lista, la factura lleva la retención del 3 % y el neto pendiente la descuenta. En otra moneda hace falta el tipo de cambio a soles congelado del documento.
- **Forma de pago:** contado, o crédito con el monto neto pendiente y una cuota con su vencimiento. La factura imprime además el monto en letras.
- **Detracciones y percepciones:** no se modelan. Si las marcas en Ajustes, el riel no se activa para tu cuenta, para no emitir a medias.

## Cómo ves el estado

El detalle de la factura tiene un panel **SUNAT**:

- **Aceptada por SUNAT**, con su CDR. Si SUNAT la aceptó con observaciones, quedan anotadas.
- **Esperando la confirmación de SUNAT:** si se perdió la respuesta, Cord **consulta** a SUNAT; nunca reenvía la factura en producción.
- **SUNAT no aceptó la factura**, con el motivo. Un rechazo consume el número; el siguiente intento toma otro.

El PDF lleva el QR de SUNAT, el valor resumen y la leyenda de representación impresa. **Más acciones › Descargar XML** entrega exactamente el XML que SUNAT aceptó; tu cliente también lo descarga desde su link.

## Anular o corregir

- **Anular:** Cord no hace comunicaciones de baja, porque entrega la factura a tu cliente al emitirla. Usa **Más acciones › Nota de crédito**: tipo 01 (anulación) si acredita la factura completa, o 09 (disminución en el valor) si acredita una parte.
- Un borrador se corrige en el editor antes de emitir.

## Problemas comunes

- **"La factura electrónica exige el RUC del cliente".** A un cliente sin RUC (consumidor final con DNI) le corresponde una boleta de venta, que Cord todavía no emite. Agrega el RUC en su ficha o emite la boleta fuera de Cord.
- **Rechazo por certificado o usuario SOL.** Revisa que el certificado esté a nombre de tu RUC y registrado en SUNAT, y que el usuario SOL secundario tenga el perfil de envío.
- **SUNAT rechaza por la tasa.** Una factura no puede mezclar tasas de IGV: divídela.
- **El riel no se activa.** Marcaste detracciones o percepciones, que Cord todavía no emite.

## Qué no cubre todavía

- **Boleta de venta** y resumen diario, **comunicación de baja**, **nota de débito** y **guía de remisión**.
- **Detracciones, percepciones**, anticipos, operaciones gratuitas, ISC, ICBPER e IVAP.
- **Varias cuotas** por factura.

## Relacionados

- [Cobrar con Mercado Pago](/soporte/cobrar-mercado-pago)
- [Configurar retenciones de impuestos](/soporte/retenciones-impuestos)
- [Facturación por país en la documentación](https://docs.cordhq.app/docs/pagos/facturacion)
