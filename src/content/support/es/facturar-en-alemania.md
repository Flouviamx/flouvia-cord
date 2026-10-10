---
title: "Cómo facturar en Alemania con Cord"
description: "Rechnung con USt., Kleinunternehmer, fecha de prestación, XRechnung, Factur-X (ZUGFeRD) y Peppol, Leitweg-ID y domiciliación SEPA: lo que Cord hace y lo que no."
category: "Facturación por país"
order: 7
---

En Alemania Cord emite una **factura comercial** (Rechnung) en alemán, con folio consecutivo, la USt. de cada concepto y las menciones que exige la ley. Cada factura se puede descargar además como **XRechnung**, **Factur-X (ZUGFeRD)** y **Peppol BIS**, los formatos de factura electrónica que tu cliente puede procesar de forma automática. Cord **no transmite** las facturas por la red Peppol ni presenta tus declaraciones de USt.

**En resumen:**

- **Documento:** Rechnung y nota de crédito comercial, en todos los planes (10 al mes en Gratis, ilimitadas desde Starter).
- **Factura electrónica:** XRechnung (UBL y CII), Factur-X y Peppol BIS se descargan desde el detalle de la factura. Por defecto, el correo de cada factura lleva el **PDF y el XML de XRechnung**.
- **Impuestos:** USt. 19 %, USt. 7 % y **Steuerfrei**. Si eres **Kleinunternehmer (§ 19 UStG)**, enciéndelo y tus facturas sin impuesto llevan la mención legal.
- **Fecha de prestación (Leistungsdatum):** captúrala en el editor; si queda vacía, el PDF dice que corresponde a la fecha de la factura.
- **Qué necesitas:** Steuernummer o USt-IdNr. y, para XRechnung, un contacto con nombre, teléfono y correo.
- **Cobrar:** tarjeta y **domiciliación SEPA** en EUR, y cobro automático desde el portal del cliente.

## Qué documento emite Cord

| Situación | Documento |
|---|---|
| Cualquier plan | Rechnung con prefijo `INV` (o el que configures), en alemán. |
| Corrección o devolución | Nota de crédito comercial con prefijo `NCC`. |
| Descarga electrónica | XRechnung 3.0 (UBL y CII), Factur-X EN 16931 (PDF/A-3 con el XML dentro, también ZUGFeRD) y Peppol BIS 3.0. |

## Qué necesitas

- **Steuernummer** o **USt-IdNr.** de tu negocio. Cord valida el identificador.
- **Para XRechnung:** un contacto de facturación con nombre, teléfono y correo, la ciudad y el código postal del cliente, y el IBAN de tu cuenta de depósito.
- **Para un cliente del sector público:** su **Leitweg-ID** como referencia del comprador.
- **Para Peppol:** tu identificador de participante (dirección electrónica) y el de tu cliente, y la referencia del comprador u orden de compra.

## Configura tu cuenta

1. En **Ajustes › Facturación › Datos fiscales › Identidad de facturación**, captura **Razón social o nombre legal**, **Steuernummer / USt-IdNr.**, domicilio, **Código postal** y tu **Prefijo de factura**.
2. Si aplicas la franquicia, enciende **Kleinunternehmer (§ 19 UStG)**. La mención solo se imprime en las facturas que no cobran impuesto.
3. En **Factura electrónica europea**, completa **Contacto de facturación**, **Teléfono de contacto**, la **Dirección electrónica** con su esquema e **Identificador**, el **Número de registro mercantil** y el **BIC / SWIFT**. El IBAN es el de **Ajustes › Cobros**.
4. En **Adjuntar al correo de cada factura**, deja el automático (PDF + XRechnung) o elige **Solo el PDF**, **PDF Factur-X (en lugar del PDF)** o **PDF + XML de XRechnung**.
5. En la ficha de cada cliente empresarial, captura su dirección electrónica y, si es del sector público, su **Referencia del comprador (Leitweg-ID)**. Cord comprueba el dígito de control del Leitweg-ID.

## Emitir una factura

En **Facturas › Nueva factura** (o **Emitir factura** desde una cotización aprobada), agrega conceptos con su tasa y, en el resumen, la **Fecha de prestación**: una fecha o el inicio y fin de un periodo. Si el cliente lo pide, llena **Referencia del comprador** y **Orden de compra**. Pulsa **Emitir y enviar**.

Una venta a una empresa de otro país de la UE con USt-IdNr. en ambos lados va con la inversión del sujeto pasivo y su mención; una venta a un cliente fuera de la UE, sin USt alemana. Elige la tasa al 0 % que corresponda con tu asesor.

## Cómo ves el estado

No hay un registro ante la autoridad. El detalle de la factura muestra el estado comercial y, en **Factura electrónica**, los formatos disponibles para descargar y, si falta algo, qué dato falta y dónde se corrige. Una factura emitida conserva los datos con que se emitió: lo que corrijas en Ajustes o en el cliente aplica a las siguientes.

## Anular o corregir

- **Anular:** **Más acciones › Anular**, solo si la factura no tiene pagos.
- **Nota de crédito (Gutschrift / Rechnungskorrektur):** **Más acciones › Nota de crédito**, que acredita el total. Su XRechnung sale como nota de crédito (381).
- Un reembolso es otra acción, desde **Cobros**.

## Problemas comunes

- **El correo salió solo con el PDF.** A la factura le faltaba un dato del formato. El detalle te dice cuál; las siguientes salen completas al corregirlo.
- **"El Leitweg-ID no es válido".** No pasa el dígito de control. Revisa el que te dio tu cliente público.
- **Peppol no está disponible.** Falta tu dirección electrónica, la de tu cliente o la referencia del comprador.
- **La factura tiene retención.** Ningún formato EN 16931 tiene dónde declararla: esa factura no tiene versión electrónica.

## Qué no cubre todavía

- **Enviar por la red Peppol** o a portales de la administración: Cord genera los archivos y los adjunta al correo.
- **Presentar tus declaraciones de USt.**
- **Order-X** y el perfil EXTENDED de Factur-X.

## Relacionados

- [Factura electrónica europea](/soporte/factura-electronica-europea)
- [Domiciliación SEPA y cargo ACH](/soporte/domiciliacion-sepa-ach)
- [Factura electrónica europea en la documentación](https://docs.cordhq.app/docs/pagos/factura-electronica)
