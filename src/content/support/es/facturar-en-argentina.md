---
title: "Cómo facturar en Argentina con Cord"
description: "Factura comercial hoy; factura electrónica A, B o C con CAE de ARCA en activación: certificado y punto de venta, condición frente al IVA, nota de crédito y lo que no cubre."
category: "Facturación por país"
order: 10
---

En Argentina cada factura debe autorizarla **ARCA**, que le asigna su número y su **CAE**. Cord tiene construido el riel directo con ARCA (web services de factura electrónica, sin intermediario), pero **está en activación**: hoy tus facturas se emiten como **factura comercial sin validez fiscal**. Si necesitas facturar con ARCA desde Cord, escríbenos para habilitarlo en tu cuenta.

**En resumen:**

- **Hoy:** factura comercial y nota de crédito comercial, en todos los planes (10 al mes en Gratis, ilimitadas desde Starter). No se presentan ante ARCA.
- **En activación:** Factura A, B o C con CAE, nota de crédito y el QR de ARCA en el PDF. En **Ajustes › Facturación › Datos fiscales › Factura electrónica con ARCA** dice **Próximamente**.
- **Qué vas a necesitar:** plan Starter o superior, tu CUIT, un **certificado digital de ARCA** asociado al servicio de factura electrónica y un **punto de venta** "Factura electrónica - Web services".
- **La clase la decide Cord** según tu condición frente al IVA y la de tu cliente: monotributo y exento emiten C, sin IVA discriminado.
- **Anular:** un comprobante con CAE no se anula: se ajusta con **nota de crédito** de la misma clase.
- **Cobrar:** en Argentina el cobro en línea es con **Mercado Pago**; Cord Payments no está disponible.

## Qué documento emite Cord

| Situación | Documento |
|---|---|
| Hoy, cualquier plan | Factura comercial (sin validez fiscal). |
| Con ARCA activo (Starter o superior) | Factura A, B o C con CAE, su vencimiento y el QR de ARCA. |
| Con ARCA activo, en Gratis o eligiendo **Factura comercial** | Proforma con serie `PRO`: sirve para cobrar, pero no es un comprobante válido ante ARCA. |
| Corrección | Nota de crédito de la misma clase, asociada a la factura. |

En una factura **B** el PDF imprime la leyenda de transparencia fiscal; a consumidor final, "A CONSUMIDOR FINAL"; en una **A** a un monotributista, la leyenda de su crédito fiscal.

## Qué vas a necesitar

- **CUIT** de tu negocio en **Identidad de facturación**.
- **Certificado digital de ARCA.** Lo generas con tu clave fiscal en la administración de certificados digitales de ARCA, a partir de una llave privada tuya, y lo asocias al servicio de factura electrónica (`wsfe`). ARCA no cobra por emitirlo. Cord acepta el certificado más la llave (`.crt` y `.key`) o un archivo `.p12`/`.pfx`.
- **Punto de venta** creado en ARCA como **"Factura electrónica - Web services"**, exclusivo para Cord.
- Tu **condición frente al IVA** y qué vendes (productos, servicios o ambos).

## Configura tu cuenta (cuando se active)

1. En **Identidad de facturación**, captura tu razón social y tu **CUIT**.
2. En **Factura electrónica con ARCA**: **Punto de venta (web service)**, **Condición frente al IVA**, **Qué vendes** y, si quieres, **Ingresos Brutos (opcional)** e **Inicio de actividades (opcional)**. Pulsa **Guardar ajustes de ARCA**.
3. En **Certificado de ARCA**, elige el formato (**Certificado + llave privada** o **Archivo .p12 / .pfx**), sube los archivos, escribe la **Contraseña de la llave (si tiene)** y pulsa **Subir certificado**. El certificado tiene que estar a nombre de tu CUIT y vigente.
4. En la ficha de cada cliente argentino, completa **Condición frente al IVA del cliente**. Sin ella, un cliente sin CUIT se trata como consumidor final; uno con CUIT necesita la condición capturada.
5. Revisa tu catálogo en **Ajustes › Cotizaciones › Impuestos**: tu cuenta nace con IVA 21 %, 10,5 %, 27 % y Exento.

## Cómo elige Cord la clase y el receptor

- **Clase A, B o C** según tu condición y la de tu cliente (tabla de la RG 5616/2024). Monotributo y exento emiten **C**.
- **Receptor:** con CUIT, con DNI o como consumidor final sin identificar. El consumidor final sin identificar solo va en B y C y por debajo de ARS 10.000.000.
- **Servicios:** la factura informa el período facturado y el vencimiento del pago.
- **Otra divisa:** se usa la cotización congelada del documento si tu divisa contable es ARS; si no, la oficial de ARCA. Sin cotización, no se envía.
- **Descuento de documento:** viaja como bonificación, con el neto y el IVA ya descontados.

## Cómo ves el estado

El detalle de la factura tiene un panel **ARCA**:

- **Autorizada por ARCA**, con el número, el CAE y su vencimiento.
- **Esperando la confirmación de ARCA**: si se perdió la respuesta, Cord **consulta** a ARCA por el último comprobante autorizado; nunca pide otro CAE para la misma factura.
- **ARCA no autorizó la factura**, con el motivo.

En el ambiente de pruebas (homologación) el número lleva el prefijo `H-` y el PDF dice "sin validez fiscal".

## Anular o corregir

- **Anular:** un comprobante con CAE no se anula. Usa **Más acciones › Nota de crédito**: sale con la misma clase, receptor, condición, concepto y moneda de la factura, y la cita como comprobante asociado.
- Un borrador sin CAE se corrige en el editor.

## Problemas comunes

- **"Falta: un certificado a nombre de tu CUIT".** El certificado es de otra CUIT. Genera uno para la tuya.
- **"Falta: un certificado vigente".** El certificado venció. Genera otro en ARCA y súbelo.
- **ARCA rechaza el punto de venta.** Revisa que sea del tipo "Factura electrónica - Web services" y que no lo use otro sistema.
- **El cliente con CUIT no tiene condición.** Captúrala en su ficha; Cord no la adivina.

## Qué no cubre todavía

- **Factura E de exportación** (cliente fuera de Argentina) y **Factura de Crédito Electrónica MiPyME**.
- Receptor **No categorizado**, **retenciones**, **percepciones y otros tributos**, **CAEA** y comprobantes **M**.

## Relacionados

- [Cobrar con Mercado Pago](/soporte/cobrar-mercado-pago)
- [Emitir una nota de crédito](/soporte/nota-de-credito)
- [Facturación por país en la documentación](https://docs.cordhq.app/docs/pagos/facturacion)
