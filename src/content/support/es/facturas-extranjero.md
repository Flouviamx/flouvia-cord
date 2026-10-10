---
title: "Facturar a clientes en el extranjero"
description: "Qué hace Cord cuando tu cliente está fuera de tu país: CFDI a residente en el extranjero en México, inversión del sujeto pasivo y exportación en la UE, y qué cubre cada riel fiscal."
category: "Facturación"
---

El tratamiento de una venta a un cliente extranjero depende del país **desde el que emites**. Cord lo decide con dos datos de la ficha del cliente: su **país** y su **identificador fiscal**.

**En resumen:**

- **Paso común:** en la ficha del cliente elige su **País** y captura su identificador fiscal (EIN, NIF-IVA, VAT, RFC…). Cord valida el dígito de control en los 12 países de Cord.
- **México:** el CFDI sale automáticamente a un **residente en el extranjero**: RFC genérico XEXX010101000, su país, uso S01 y su identificador fiscal como número de registro tributario. No tienes que capturar el RFC genérico.
- **Unión Europea (España, Alemania, Francia):** un cliente empresarial de otro país de la UE con NIF-IVA va con **inversión del sujeto pasivo**; uno fuera de la UE, como **exportación**.
- **Divisa:** la factura sale en la divisa de venta. Si tus libros van en otra, declara el tipo de cambio que se congeló al cotizar.
- **Limitación en México:** un concepto al 0 % se declara **exento** en el CFDI; Cord todavía no emite IVA a tasa 0 % gravada.

## México: CFDI a un residente en el extranjero

Si el país del cliente no es México, Cord emite el CFDI así, sin que captures nada más:

- **RFC del receptor:** XEXX010101000, el genérico de extranjeros.
- **Residencia fiscal:** el país de la ficha.
- **Número de registro tributario:** el identificador fiscal que capturaste (opcional).
- **Uso del CFDI:** S01 (sin efectos fiscales), también en sus notas de crédito.
- El régimen fiscal y el uso de la ficha no aplican a un extranjero y no se envían.

**La tasa de cada concepto la decides tú con tu contador.** Ten en cuenta que Cord declara un concepto al 0 % como **exento**: todavía no distingue la **tasa 0 % gravada** que corresponde, por ejemplo, a la exportación de servicios. Si tu operación necesita tasa 0 %, emite ese CFDI fuera de Cord por ahora.

Cord timbra la operación como "No aplica" en exportación y **no emite el complemento de Comercio Exterior** que exige la exportación definitiva de mercancías.

## Unión Europea: España, Alemania y Francia

- **Cliente empresarial en otro país de la UE** con NIF-IVA, y tú con el tuyo: la operación va con **inversión del sujeto pasivo** (sin IVA y con la mención legal). Elige en la línea la tasa al 0 % que corresponda, por ejemplo **Entrega intracomunitaria (art. 25)** o **Inversión del sujeto pasivo** en España.
- **Cliente fuera de la UE:** exportación, sin IVA. En España, **Exportación (art. 21)**.
- **Factura electrónica:** Factur-X, XRechnung y Peppol declaran la categoría que corresponde y, en una entrega intracomunitaria, la dirección completa del cliente. Ver [Factura electrónica europea](/soporte/factura-electronica-europea).
- **Divisa extranjera:** si un emisor de la UE factura en otra divisa, el PDF imprime también la cuota en euros.

En España, mientras el registro Verifactu está en activación, Cord emite proformas. Ver [Cómo facturar en España con Cord](/soporte/facturar-en-espana).

## Estados Unidos, Canadá y Reino Unido

La factura comercial sale con la tasa que elijas en cada línea. En Reino Unido, una exportación suele ir como **Zero-rated**; en Canadá, como **Zero-rated**; en Estados Unidos, una venta fuera del país no lleva sales tax. Confírmalo con tu asesor.

## Rieles fiscales de LatAm (en activación)

| País | Cliente del exterior |
|---|---|
| Perú (SUNAT) | Factura de exportación (operación 0200 bienes o 0201 servicios). |
| Colombia (DIAN) | Factura con el cliente identificado como NIT de otro país. La factura de exportación todavía no. |
| Argentina (ARCA) | No cubierto: la Factura E de exportación todavía no se emite. |
| Chile (SII) | No cubierto: la factura de exportación todavía no se emite. |
| Brasil (NFS-e y NF-e) | No cubierto: la exportación todavía no se emite. |

Mientras esos rieles están en activación, la venta sale como factura comercial.

## Relacionados

- [Recibir pagos internacionales](/soporte/pagos-internacionales)
- [Cobro en múltiples divisas](/soporte/cobro-divisas)
- [Facturación por país](/soporte/categoria/facturacion-por-pais)
