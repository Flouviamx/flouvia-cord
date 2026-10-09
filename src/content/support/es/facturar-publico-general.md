---
title: "Facturación al Público en General y factura global"
description: "Cuándo usar el RFC genérico y cómo emitir la factura global del periodo."
category: "Facturación"
---

Esto aplica solo a organizaciones en **México**. Las ventas que cobras sin que el
cliente pida factura —ventas de mostrador, cobros donde nadie pidió CFDI— se
documentan ante el SAT en una **factura global** del periodo, a nombre de
**PUBLICO EN GENERAL** con el RFC genérico **XAXX010101000**.

## Emitir la factura global

1. Abre **Facturas** y pulsa **Factura global**.
2. Elige la **periodicidad** (diaria, semanal, quincenal o mensual), el **mes** y
   el **año** que declara. La periodicidad bimestral solo aparece si tu régimen
   fiscal es el de Incorporación Fiscal (621). Si es diaria, semanal o
   quincenal, indica también los días que cubre, dentro de ese mes.
3. Pulsa **Ver ventas del periodo**. Cord lista las cotizaciones **cobradas** en
   esas fechas que no tienen factura propia ni están en otra global. Desmarca las
   que no quieras incluir.
4. Revisa la **forma de pago**. Cord propone la de la venta de mayor importe,
   como pide el SAT.
5. Pulsa **Emitir factura global**.

Cada venta entra como un concepto con la clave **01010101**, la unidad **ACT** y
el folio de la cotización como número de identificación. El CFDI se emite en
pesos, con método de pago **PUE**, uso **S01** y, como domicilio del receptor,
el código postal fiscal de tu negocio. Por eso Cord te pide capturarlo en
**Ajustes › Datos fiscales** antes de emitirla.

El SAT pide emitir la global a más tardar 24 horas después del cierre del
periodo.

### Ventas que no entran

Cord te dice por qué una venta del periodo no aparece:

- ya tiene su propia factura, o ya está en otra factura global;
- se cobró en otra divisa (la global se emite en pesos);
- tiene retenciones (el SAT pide una factura por cada operación con retenciones);
- el cliente está en el extranjero (lleva factura individual);
- tiene una tasa de IVA distinta de 0 %, 8 % o 16 %.

Mientras una venta esté en una factura global vigente, Cord no deja emitirle
una factura individual: la misma venta quedaría facturada dos veces.

## Si un cliente pide su factura después

1. Abre la factura global y usa **Más acciones › Anular factura** con el motivo
   **04 · Operación nominativa relacionada en una factura global**.
2. Al confirmarse la cancelación, sus ventas quedan libres. Pulsa **Emitir de
   nuevo la global del periodo**, que abre la misma periodicidad, mes y año, y
   desmarca la venta del cliente.
3. Emite la factura del cliente desde su cotización.

## Una factura individual a un cliente sin RFC

Si emites una factura a un cliente sin RFC capturado, Cord timbra con el RFC
genérico XAXX010101000, el régimen 616 y el código postal fiscal de tu negocio,
y con el **nombre de tu cliente**. El nombre "PUBLICO EN GENERAL" está reservado
a la factura global: con ese nombre el SAT exige los datos del periodo, así que
Cord no deja usarlo en una factura individual.
