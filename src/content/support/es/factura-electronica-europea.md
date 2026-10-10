---
title: "Factura electrónica europea: Factur-X, XRechnung, Peppol y Facturae"
description: "Qué formatos genera Cord para emisores de la UE, qué datos pide cada uno, cómo descargarlos o adjuntarlos al correo, la firma de la Facturae y cuándo no se pueden generar."
category: "Facturación"
order: 21
---

Si tu negocio está establecido en la **Unión Europea** (de los países de Cord: España, Alemania y Francia), cada factura se puede descargar además en un formato electrónico que el sistema de tu cliente lee sin capturar nada a mano. Es **la misma factura** que el PDF, con los mismos importes, escrita para una máquina según la norma europea EN 16931.

**En resumen:**

- **Formatos:** **Factur-X** (PDF/A-3 con el XML dentro; también es ZUGFeRD), **XRechnung 3.0** (UBL y CII), **Peppol BIS 3.0** (UBL) y, solo en España, **Facturae 3.2.2**, que además declara el IRPF.
- **Dónde:** en el detalle de la factura, sección **Factura electrónica**. Tu cliente ve en su link los formatos disponibles.
- **Correo:** por defecto Francia adjunta el **PDF Factur-X**, Alemania el **PDF + XML de XRechnung** y España solo el PDF. Se cambia en **Adjuntar al correo de cada factura**.
- **Cord genera y adjunta, no transmite:** no envía por la red Peppol ni a FACe. En Francia, la emisión por plataforma autorizada está en activación.
- **No se genera** para borradores, facturas anuladas, documentos de prueba, proformas ni facturas con retenciones (salvo Facturae).
- **Sin costo extra:** no consume cuota ni depende del plan.

## Qué formatos hay

| Formato | Para qué sirve | Disponible en |
|---|---|---|
| **Factur-X (PDF)** | Un PDF que se lee como siempre y lleva el XML dentro. El estándar en Francia; en Alemania se conoce como ZUGFeRD. | Emisores de la UE |
| **XRechnung (UBL)** y **XRechnung (CII)** | El formato alemán, obligatorio para la administración pública y aceptado entre empresas. | Emisores de la UE |
| **Peppol BIS 3.0 (UBL)** | El formato de la red Peppol, usado en toda Europa. | Emisores de la UE |
| **Facturae 3.2.2 (XML)** | El formato español, que además declara la retención de IRPF. | Emisores en España, en euros |

## Prepara tus datos una vez

En **Ajustes › Facturación › Perfil fiscal › Factura electrónica europea**:

- **Contacto de facturación** y **Teléfono de contacto**: XRechnung exige un contacto con nombre, teléfono y correo (el de tu negocio). Sin teléfono aquí, se usa el de General.
- **Dirección electrónica** con su esquema e **Identificador**: tu identificador de participante Peppol (por ejemplo un GLN o tu NIF-IVA). Peppol lo exige; XRechnung usa tu correo si no hay otro.
- **Número de registro mercantil** y **BIC / SWIFT**. El IBAN es el de tu cuenta de depósito en **Ajustes › Cobros**.
- **Adjuntar al correo de cada factura:** automático, **Solo el PDF**, **PDF Factur-X (en lugar del PDF)**, **PDF + XML de XRechnung** o, en España, **PDF + XML de Facturae**.
- En España, **Firmar la Facturae con mi certificado electrónico** (ver abajo).

En la **ficha del cliente**: su dirección electrónica y, si lo pide (sector público alemán), su **Referencia del comprador (Leitweg-ID)**. Cord comprueba el dígito de control del Leitweg-ID. En la **factura**: **Referencia del comprador** y **Orden de compra**, si tu cliente las exige.

Para las líneas al 0 %, en **Ajustes › Cotizaciones › Impuestos** cada perfil exento tiene su **Clasificación en la factura electrónica** (en España, **Causa de exención (Verifactu)**). Si la dejas en **Automática (según el cliente)**, Cord la deduce: un cliente de otro Estado miembro con NIF-IVA va con inversión del sujeto pasivo; uno fuera de la UE, como exportación; uno nacional, como exento.

## Descargar y enviar

1. Emite la factura.
2. En su detalle, la sección **Factura electrónica** lista los formatos disponibles. Pulsa el que necesites para descargarlo.
3. Si a la factura le falta algo para un formato, la misma sección dice **Para generar los demás formatos:** y qué dato falta, con el enlace donde se corrige.

Una factura emitida conserva los datos con que se emitió: lo que corrijas en Ajustes o en el cliente aplica a las siguientes. Si una factura no admite el formato elegido para el correo, sale con el PDF de siempre: el correo nunca falla por esto.

## Qué pide cada formato

- **XRechnung:** la referencia del comprador, un contacto con nombre, teléfono y correo, la ciudad y el código postal del cliente y, en una factura, el IBAN.
- **Peppol:** la referencia del comprador o la orden de compra, tu dirección electrónica y la del cliente y, entre empresas alemanas, el IBAN.
- **Factur-X y XRechnung CII:** que el IGIC no esté al 0 % (en ese caso, usa XRechnung UBL o Peppol).
- **Facturae:** emisor en España y factura en euros.

## La Facturae y su firma

La Facturae declara el IVA, el IGIC, el IPSI y la retención de **IRPF**, así que una factura con IRPF **solo** está disponible como Facturae: Factur-X, XRechnung y Peppol no tienen dónde declarar una retención.

Sin firma, la Facturae le sirve a tu cliente. Para presentarla en **FACe** (administraciones públicas) tiene que ir firmada y llevar los códigos DIR3 del organismo, que Cord todavía no captura, y Cord no la presenta en FACe. Si enciendes **Firmar la Facturae con mi certificado electrónico**, Cord la firma (XAdES) con el certificado que subiste para Verifactu, en nombre de tu negocio; por eso solo se aplica si tú la activas.

## Cuándo no se puede generar

- **Borrador, factura anulada o documento de prueba.**
- **Proforma.** Una proforma no es una factura. En España, mientras el registro Verifactu está en activación, Cord emite proformas: los formatos electrónicos estarán disponibles al activarse.
- **Emisor fuera de la UE** (Reino Unido, por ejemplo).
- **Retenciones**, salvo Facturae.
- **Totales o líneas que no cuadran**, divisa con tres decimales, un Leitweg-ID que no pasa su dígito de control, o datos de identidad incompletos.

## Problemas comunes

- **El correo salió solo con el PDF.** A la factura le faltaba un dato del formato. Revisa la sección **Factura electrónica** del detalle.
- **"El Leitweg-ID no es válido".** No pasa el dígito de control: confírmalo con tu cliente.
- **Peppol no aparece.** Falta tu dirección electrónica, la del cliente o la referencia del comprador.
- **Mi cliente en España me pide la factura por la solución pública de la AEAT.** Está en activación. Ver [Cómo facturar en España con Cord](/soporte/facturar-en-espana).

## Qué no cubre todavía

- **Transmisión por la red Peppol** y presentación en **FACe**.
- Los **códigos DIR3** de la Facturae.
- **Order-X** y el perfil EXTENDED de Factur-X.

## Relacionados

- [Cómo facturar en Alemania con Cord](/soporte/facturar-en-alemania)
- [Cómo facturar en Francia con Cord](/soporte/facturar-en-francia)
- [Cómo facturar en España con Cord](/soporte/facturar-en-espana)
- [Factura electrónica europea en la documentación](https://docs.cordhq.app/docs/pagos/factura-electronica)
