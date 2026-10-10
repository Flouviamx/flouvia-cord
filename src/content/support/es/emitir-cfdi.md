---
title: "Emitir CFDI 4.0 desde una cotización o desde cero"
description: "Cómo timbrar el CFDI 4.0 de una venta desde la cotización aprobada o desde Facturas, qué decide Cord por ti (PUE o PPD, uso, forma de pago) y qué revisar antes de emitir."
category: "Facturación"
order: 1
---

Esto aplica a organizaciones en **México** con plan **Starter** o superior y el CSD cargado en **Ajustes › Facturación › Datos fiscales**. El timbrado siempre lo confirma una persona: Cord no timbra por sí solo cuando entra un pago.

## Desde una cotización aprobada

1. Abre la cotización **aprobada** o **pagada**.
2. Pulsa **Timbrar CFDI 4.0**. Necesitas el permiso **Aprobaciones**.
3. Cord copia los conceptos, precios, descuentos, impuestos, retenciones, claves SAT y el tipo de cambio congelado al cotizar, y lo cobrado en la cotización pasa a la factura.
4. El CFDI queda timbrado con su folio fiscal y, desde su detalle, lo envías a tu cliente.

Si en tu cuenta el botón dice **Emitir proforma**, tu plan no incluye la emisión fiscal o elegiste la opción comercial.

## Sin cotización

1. Ve a **Facturas** y pulsa **Nueva factura**.
2. Elige el cliente y agrega los conceptos (de tu catálogo o líneas libres). Debajo de cada concepto ves su clave SAT y puedes cambiarla.
3. En **Tipo de documento**, deja **CFDI 4.0** (o elige **Proforma** si no quieres timbrar).
4. En **Datos del CFDI**, **Uso del CFDI** y **Forma de pago** quedan en automático; cámbialos solo si tu cliente lo pide.
5. En **Revisa y emite**, pulsa **Emitir y enviar** (o **Emitir sin enviar**). Una revisión final te muestra cliente, total, vencimiento y correo antes de timbrar.

El folio se asigna al emitir: un borrador no consume folio ni cuota. Si el timbrado termina y el correo falla, el folio se conserva y reenvías desde el detalle.

## Qué decide Cord por ti

- **Método de pago:** si la factura ya está pagada al timbrarse sale **PUE**; si no, **PPD** con forma 99, y cada cobro posterior lleva su complemento de pago automático. Ver [Facturas PPD y complementos de pago](/soporte/complementos-de-pago).
- **Forma de pago:** la del cobro de mayor importe, salvo que la fijes en **Datos del CFDI**.
- **Uso del CFDI:** el de la ficha del cliente (o el uso predeterminado de tu cuenta); S01 si el cliente está en el extranjero.
- **Receptor:** RFC, razón social, régimen y código postal de la ficha del cliente. Sin RFC, el genérico XAXX010101000 con régimen 616 y tu código postal de expedición.
- **Claves SAT:** la de la línea, luego la del producto y, sin ninguna, 01010101 y H87. El editor te avisa cuántos conceptos saldrían con la genérica.

## Antes de emitir

- Que la ficha del cliente tenga los datos de su constancia de situación fiscal.
- Que cada concepto tenga su clave SAT.
- Que las tasas sean IVA 16 %, IVA 8 % o exento: el CFDI de Cord no emite IEPS ni IVA a tasa 0 % gravada (un concepto al 0 % sale exento).

Una vez timbrado, un CFDI no se edita: se corrige con **Sustituir CFDI** o con una nota de crédito. Ver [Anular facturas y consultar cancelaciones](/soporte/cancelar-facturas).

## Relacionados

- [Cómo facturar en México con Cord](/soporte/facturar-en-mexico)
- [Claves de producto y unidad del SAT](/soporte/catalogos-sat-claves)
- [Facturación al Público en General y factura global](/soporte/facturar-publico-general)
