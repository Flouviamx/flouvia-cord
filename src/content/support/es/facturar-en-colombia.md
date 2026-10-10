---
title: "Cómo facturar en Colombia con Cord"
description: "Factura comercial hoy; factura electrónica de venta con validación previa de la DIAN en activación: habilitación como software propio, set de pruebas, resolución de numeración, certificado, nota crédito y lo que no cubre."
category: "Facturación por país"
order: 9
---

En Colombia la factura electrónica de venta necesita la **validación previa de la DIAN**. Cord tiene construido el riel directo con la DIAN como **software propio** de cada negocio (sin proveedor tecnológico), pero **está en activación**: hoy tus facturas se emiten como **factura comercial sin validez fiscal**. Si necesitas facturar con la DIAN desde Cord, escríbenos para habilitarlo en tu cuenta.

**En resumen:**

- **Hoy:** factura comercial y nota de crédito comercial, en todos los planes (10 al mes en Gratis, ilimitadas desde Starter). No se presentan ante la DIAN.
- **En activación:** factura electrónica de venta y nota crédito con validación previa (Anexo Técnico 1.9). En **Ajustes › Facturación › Datos fiscales › Factura electrónica con la DIAN** dice **Próximamente**.
- **Qué vas a necesitar:** plan Starter o superior, tu NIT con dígito de verificación, habilitarte en el portal de la DIAN como **software propio** con un PIN, superar el **set de pruebas**, una **resolución de numeración** asociada al software y un **certificado de firma digital** de una entidad avalada por la ONAC.
- **Anular:** una factura validada no se anula: se ajusta con **nota crédito** (anulación si acredita el total, rebaja si acredita una parte).
- **Cobrar:** en Colombia el cobro en línea es con **Mercado Pago**; Cord Payments no está disponible.

## Qué documento emite Cord

| Situación | Documento |
|---|---|
| Hoy, cualquier plan | Factura comercial (sin validez fiscal). |
| Con la DIAN activa (Starter o superior) | Factura electrónica de venta con CUFE y QR. |
| Con la DIAN activa, en Gratis o eligiendo **Factura comercial** | Proforma con serie `PRO`: sirve para cobrar, pero no es una factura electrónica de venta. |
| Corrección | Nota crédito con CUDE, ligada a la factura. |

## Qué vas a necesitar

- **Habilitación en la DIAN.** En el portal de la DIAN, **Registro y habilitación › Documentos electrónicos › Factura electrónica**, eliges el modo de operación **Software propio**, le das nombre al software y un **PIN** de 5 dígitos. La DIAN te asigna el **identificador del software** y un **set de pruebas** (TestSetId, rango de pruebas con su prefijo, resolución, vigencia y clave técnica).
- **Resolución de numeración** para producción, que solicitas en la DIAN y **asocias a tu software**.
- **Certificado de firma digital** para factura electrónica a nombre de tu NIT, emitido por una entidad certificadora avalada por la ONAC, con su cadena completa. Su costo lo fija esa entidad.
- La habilitación ante la DIAN no tiene costo.

## Configura tu cuenta (cuando se active)

1. En **Identidad de facturación**, captura tu razón social, tu **NIT** con dígito de verificación y tu domicilio.
2. En **Factura electrónica con la DIAN**, completa **Tu negocio en el RUT**: **Tipo de persona**, **Responsabilidad frente al IVA**, **Municipio del domicilio fiscal**, las **Responsabilidades fiscales (casilla 53 del RUT)** y, si quieres, **Nombre comercial**, **Matrícula mercantil** y **Correo de recepción registrado en la DIAN**.
3. En **Software y numeración**: **Identificador del software**, **PIN del software (5 dígitos)**, el rango (número de resolución, **Prefijo**, **Desde el número**, **Hasta el número**, **Vigente desde**, **Vigente hasta**), la **Clave técnica del rango**, el **Prefijo de las notas crédito** y cómo son **Tus ventas al 0 %** (**Exentas de IVA** o **Excluidas de IVA**). Pulsa **Guardar ajustes de la DIAN**. El PIN y la clave técnica se guardan cifrados y no se vuelven a mostrar.
4. En **Certificado de firma**, sube tu `.p12`/`.pfx` (o certificado y llave) con la cadena intermedia y raíz si no viene en el archivo, y pulsa **Subir certificado**.
5. En **Set de pruebas (habilitación)**, captura el **TestSetId** y las cantidades de facturas, notas crédito y notas débito que pide tu set, y pulsa **Enviar set de pruebas**. **Ver resultado** consulta cada envío. Cuando la DIAN lo acepta, sincronizas a producción desde su portal.
6. En producción, registra la resolución real y pulsa **Traer de la DIAN** para guardar la clave técnica del rango.
7. En la ficha de cada cliente, completa **Datos para factura electrónica (DIAN)**: tipo de documento, persona natural o jurídica y responsabilidades. Un cliente sin identificación del país va como **consumidor final**.

## Impuestos y retenciones

- **IVA** por línea al 19 %, 5 %, 16 % o 0 %. Las líneas al 0 % van como exentas o excluidas según lo que elegiste; sin esa decisión, una factura con líneas al 0 % no se envía.
- **INC, ICUI, ICA e impuestos saludables** todavía no se informan: una línea con esos impuestos se rechaza antes de enviar.
- **Retenciones:** la que se calcula sobre el IVA se informa como **ReteIVA** y la de renta (tu perfil **ReteFuente**) como **ReteRenta**. Una retención que no se puede clasificar con certeza no se informa a la DIAN, pero sigue restando del total en Cord.
- **Otra divisa:** una factura fuera de COP declara la tasa a COP congelada del documento; sin ella, o si tu divisa contable no es COP, no se envía.

## Cómo ves el estado

El detalle de la factura tiene un panel **DIAN**:

- **Validada por la DIAN**, con el CUFE.
- **Esperando la confirmación de la DIAN**: Cord **consulta** por el CUFE, nunca reenvía otro documento.
- **La DIAN rechazó el documento**, con el motivo. Un rechazo libera su número.

El PDF lleva el CUFE en el pie de todas las páginas, el QR de consulta y la autorización de numeración. **Más acciones › Descargar XML** entrega el contenedor que firma la DIAN (AttachedDocument), y el correo de la factura lo lleva en un `.zip` junto con el PDF. **Ajustes** te avisa cuando quedan menos de 50 números (o el 5 %) o menos de 30 días de vigencia de la resolución.

## Anular o corregir

- **Anular:** una factura validada por la DIAN no se anula. Usa **Más acciones › Nota de crédito**: si acredita el total va con el concepto de anulación; si acredita una parte, con el de rebaja. La nota lleva el adquiriente, la moneda y la tasa de la factura.
- **Antes de validar**, un borrador se corrige en el editor.

## Problemas comunes

- **"Se agotó el rango de numeración" o "la resolución venció".** Solicita una nueva resolución a la DIAN, asóciala al software y regístrala en Cord.
- **Rechazo por el certificado.** Revisa que sea de una entidad avalada por la ONAC, a nombre de tu NIT, con firma digital y no repudio, y con la cadena completa.
- **No se envía una factura con líneas al 0 %.** Elige en Ajustes si tus ventas al 0 % son exentas o excluidas.
- **El cliente no tiene NIT.** Va como consumidor final; si tiene cédula, captúrala en su ficha.

## Qué no cubre todavía

- Factura de **exportación** y facturas de **contingencia**.
- **INC, ICUI, ICA**, ReteICA informado, **AIU**, mandatos, propinas y cargos de documento.
- **Documento soporte**, **nómina electrónica** y los **eventos RADIAN** (acuse y aceptación).
- **Nota débito** fuera del set de pruebas.

## Relacionados

- [Cobrar con Mercado Pago](/soporte/cobrar-mercado-pago)
- [Configurar retenciones de impuestos](/soporte/retenciones-impuestos)
- [Facturación por país en la documentación](https://docs.cordhq.app/docs/pagos/facturacion)
