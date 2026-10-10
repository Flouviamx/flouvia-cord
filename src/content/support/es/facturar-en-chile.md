---
title: "Cómo facturar en Chile con Cord"
description: "Factura comercial hoy con IVA redondeado por documento; DTE del SII en activación: certificación, folios (CAF), factura afecta y exenta, notas de crédito y débito, intercambio y lo que no cubre."
category: "Facturación por país"
order: 11
---

En Chile la factura con validez tributaria es un **Documento Tributario Electrónico (DTE)** que se envía al **SII**. Cord tiene construido el riel directo con el SII (toma el folio, timbra, firma, envía y consulta el veredicto, sin proveedor intermediario), pero **está en activación**: hoy tus facturas se emiten como **factura comercial sin validez tributaria**. Si necesitas emitir DTE desde Cord, escríbenos para habilitarlo en tu cuenta.

**En resumen:**

- **Hoy:** factura comercial y nota de crédito comercial, en todos los planes (10 al mes en Gratis, ilimitadas desde Starter). No se envían al SII.
- **IVA por documento, ya hoy:** en Chile Cord calcula el IVA una sola vez sobre el neto total (neto × 19 %, redondeado), como lo pide el formato del SII, y no sumando el IVA redondeado de cada línea.
- **En activación:** factura electrónica (33), factura exenta (34), nota de débito (56) y nota de crédito (61). En **Ajustes › Facturación › Datos fiscales › Factura electrónica con el SII** dice **Próximamente**.
- **Qué vas a necesitar:** plan Starter o superior, tu RUT, un **certificado digital** de una persona autorizada ante el SII, aprobar la **certificación** como emisor electrónico con sistema de mercado, la **resolución** del SII y los **folios (CAF)** de cada tipo de documento.
- **Anular:** un DTE aceptado no se anula: se corrige con **nota de crédito** y, para cobrar de más o revertir una nota de crédito, con **nota de débito**.
- **Cobrar:** en Chile el cobro en línea es con **Mercado Pago**; Cord Payments no está disponible.

## Qué documento emite Cord

| Situación | Documento |
|---|---|
| Hoy, cualquier plan | Factura comercial (sin validez tributaria). |
| Con el SII activo, conceptos afectos | Factura electrónica (33) con timbre electrónico y copia cedible. |
| Con el SII activo, todos los conceptos exentos | Factura no afecta o exenta (34). |
| Corrección de montos o anulación | Nota de crédito (61). |
| Cargo adicional o anulación de una nota de crédito | Nota de débito (56). |

## Qué vas a necesitar

- **Certificado digital** de la persona que firma ante el SII (el usuario autorizado de tu negocio), emitido por una entidad acreditada y registrado en el SII. Su costo lo fija la entidad que lo emite.
- **Postulación y certificación** como emisor electrónico con sistema de mercado en el sitio del SII: set de pruebas, simulación, intercambio de información, muestras impresas y declaración de cumplimiento. Cord te acompaña en cada etapa. Ver [Nota de débito y certificación ante el SII](/soporte/nota-de-debito-sii-chile).
- **Resolución del SII** (número y fecha) que te autoriza como emisor electrónico. En certificación el número es 0.
- **Folios (CAF)** de cada tipo de documento, que descargas del SII. Los de factura, nota de crédito y nota de débito vencen a los seis meses de su autorización.
- Los datos de tu negocio: **giro**, **actividades económicas** (hasta 4), **comuna** y la **unidad del SII** que te corresponde.

## Configura tu cuenta (cuando se active)

1. En **Identidad de facturación**, captura tu razón social y tu **RUT**.
2. En **Factura electrónica con el SII › Datos del emisor**: **Giro**, **Códigos de actividad económica (hasta 4)**, **Unidad del SII (dirección regional)**, la dirección si difiere, **Comuna**, **Ciudad**, **Sucursal** y su código si aplica, y el **Número de resolución** y **Fecha de la resolución**. Pulsa **Guardar datos del SII**.
3. En **Folios (CAF)**, sube el **Archivo de folios** tal como lo descargaste del SII, sin modificarlo, con **Subir folios**. Cord verifica que sea de tu RUT, de un tipo que emite y que la llave corresponda.
4. En **Certificado digital**, sube tu `.pfx`/`.p12` con su contraseña y el **RUT del titular del certificado** si Cord no lo puede leer, y pulsa **Subir certificado**.
5. En la ficha de cada cliente chileno, completa **Giro del cliente** y **Comuna**: el SII exige en cada factura el RUT, la razón social, el giro, la dirección y la comuna del cliente.

## Cómo ves el estado

El detalle de la factura tiene un panel **SII**:

- **En validación en el SII:** el SII valida cada envío después de recibirlo. Cord espera unos segundos y, si el veredicto no llega, lo consulta solo hasta terminar la factura.
- **Aceptado por el SII**, con el folio y el número de envío. Si el SII aceptó con reparos, la observación queda anotada.
- **El SII rechazó el documento**, con el motivo.
- **Esperando la confirmación del SII:** si se perdió la respuesta del envío, Cord consulta el documento; nunca envía otro con el mismo folio.

Desde el panel descargas el **XML del DTE** y la **Copia cedible** (factura 33 y 34), con el acuse de recibo de la Ley 19.983. El PDF lleva el recuadro con tu RUT, tipo y folio, y el timbre electrónico. **Ajustes** te avisa cuando quedan pocos folios o un CAF está por vencer.

## Anular o corregir

- **Anular:** un DTE aceptado no se anula.
- **Nota de crédito (61):** **Más acciones › Nota de crédito**. Anula el total o corrige montos, referenciando la factura aceptada.
- **Nota de débito (56):** desde el panel **SII** de un documento aceptado, **Emitir nota de débito** para cobrar un monto adicional (intereses, diferencia de precio) o, sobre una nota de crédito, **Anular con nota de débito**. Ver [Nota de débito y certificación ante el SII](/soporte/nota-de-debito-sii-chile).
- **Un folio usado no vuelve nunca:** un rechazo libera el documento, no el folio.

## Documentos que te envían tus proveedores

En **Documentos recibidos de proveedores (intercambio)** subes el XML que te envió un proveedor con **Recibir y acusar recibo**. Cord valida el envío y la firma, responde el acuse y te deja aceptar, aceptar con discrepancias o reclamar cada documento, y registrar esa decisión en el SII dentro de los 8 días corridos.

## Problemas comunes

- **"Falta: folios de factura (CAF)".** Descarga del SII el archivo de folios del tipo 33 (y 34, 56 o 61 si los emites) y súbelo.
- **"Solicita más al SII".** Quedan pocos folios: pide otro rango antes de que se agoten.
- **El SII rechaza por el certificado.** Revisa que esté registrado en el SII a nombre de la persona autorizada y vigente.
- **El cliente no tiene RUT o es extranjero.** Le correspondería una boleta o una factura de exportación, que Cord todavía no emite; se dice antes de tomar folio.
- **El IVA no coincide con la suma de las líneas.** Es lo correcto en Chile: el IVA es el 19 % del neto total, redondeado una vez.

## Qué no cubre todavía

- **Boleta electrónica** (39 y 41), **factura de exportación** (110 a 112), **guía de despacho** (52) y **boleta de honorarios**.
- **Retenciones** en el DTE: la de honorarios es de la boleta de honorarios.
- **Otra divisa:** el DTE es en pesos chilenos enteros.
- **Libros de compras y ventas** fuera del set de certificación: desde 2017 el Registro de Compras y Ventas los reemplaza.

## Relacionados

- [Nota de débito y certificación ante el SII](/soporte/nota-de-debito-sii-chile)
- [Cobrar con Mercado Pago](/soporte/cobrar-mercado-pago)
- [Facturación por país en la documentación](https://docs.cordhq.app/docs/pagos/facturacion)
