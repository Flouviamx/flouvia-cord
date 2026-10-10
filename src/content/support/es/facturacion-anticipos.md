---
title: "Facturar anticipos"
description: "El tratamiento fiscal de cobrar un porcentaje por adelantado y el resto después."
category: "Facturación"
---

Cobrar un porcentaje por adelantado y el resto a la entrega es común en proyectos B2B, pero requiere un manejo fiscal cuidadoso ante el SAT.

### Regla fiscal para anticipos

Según la guía de llenado del SAT, un anticipo solo existe cuando **no se conoce o no se ha determinado el bien o servicio, o su precio final**. Si ya enviaste una cotización detallada de $100,000 MXN y pides el 50% de entrada, contablemente **no es un anticipo**: es un pago en parcialidades.

### Cómo lo cobras en Cord

Cord divide el cobro por ti con la función de anticipo (ver [Cobrar un anticipo](/soporte/cobrar-anticipo)):

1. Crea tu cotización por el monto total ($100,000).
2. Define el **% de anticipo** (ej. 50%) en la barra lateral del editor.
3. Cuando el cliente aprueba, el anticipo ($50,000) queda pagable de inmediato con tarjeta (o SPEI, si tu negocio cobra en pesos mexicanos), y el saldo se cobra según los términos.

### La parte fiscal la controlas tú

> [!NOTE]
> Cord se encarga del **cobro** dividido y del complemento de pago de cada cobro que se aplica a una factura PPD. El procedimiento de anticipos del SAT (CFDI de anticipo y su aplicación) no lo emite.

Para el CFDI, pulsa **Timbrar CFDI 4.0** desde el detalle de la cotización. Cord decide el método: si la venta ya está pagada por completo sale `PUE`; si queda saldo, sale `PPD` y cada pago que recibas después (el saldo, una cuota o un abono) emite su complemento de pago automático. Lo que se cobró **antes** de timbrar (por ejemplo, el anticipo) pasa a la factura como un pago más. Si tu operación es un anticipo real, el SAT pide su procedimiento propio: resuélvelo con tu contador **antes** de timbrar. Ver [Facturas PPD y complementos de pago](/soporte/complementos-de-pago).
