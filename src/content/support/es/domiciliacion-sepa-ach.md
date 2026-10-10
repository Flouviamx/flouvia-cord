---
title: "Domiciliación SEPA y cargo a cuenta bancaria (ACH)"
description: "Cobra en EUR con domiciliación SEPA (España, Alemania y Francia) y en USD con cargo ACH (Estados Unidos): cómo activarlo, cuánto tarda, devoluciones, reembolsos y dónde se ofrece."
category: "Pagos y Depósitos"
order: 8
---

> **Función nueva, en habilitación.** Puede no estar disponible todavía en tu cuenta. Si no la ves, escríbenos y te decimos cuándo se activa.

Además de tarjeta, tus clientes pueden pagar con **cargo directo a su cuenta bancaria**: **domiciliación SEPA** en euros si tu negocio está en España, Alemania o Francia, y **cargo ACH** en dólares si tu negocio está en Estados Unidos. Sirve a los clientes que prefieren pagar desde su banco y al cobro automático, pero **tarda días en confirmarse**.

**En resumen:**

| | Domiciliación SEPA | Cargo a cuenta bancaria (ACH) |
|---|---|---|
| Tu negocio en | España, Alemania, Francia | Estados Unidos |
| Divisa | Solo EUR | Solo USD |
| Cuenta del cliente | IBAN de la zona SEPA | Cuenta bancaria de EE. UU. |
| Confirmación | Hasta 6 días hábiles | Hasta 4 días hábiles |
| Devoluciones | El titular puede pedir la devolución del cargo durante 8 semanas, sin dar motivo | El titular puede disputar el cargo con su banco |
| Reembolsos | Totales o parciales | Solo completos |

- **Dónde se ofrece:** en el link de cada factura, en el [portal del cliente](/soporte/portal-del-cliente) y en el [cobro automático](/soporte/cobro-automatico). No se ofrece en el link de la cotización.
- **Activarlo:** en **Ajustes › Cobros**, enciende **Domiciliación SEPA** o **Cargo a cuenta bancaria (ACH)**. Necesitas Cord Payments activo.
- **Costo de Cord:** fuera de pesos mexicanos Cord no cobra comisión propia por transacción.

## Activarlo

1. Abre **Ajustes › Cobros** con el permiso **Configurar cobros**.
2. Enciende **Domiciliación SEPA** (si tu negocio está en España, Alemania o Francia) o **Cargo a cuenta bancaria (ACH)** (si está en Estados Unidos). El interruptor solo aparece en tu país.
3. Cord solicita la capacidad a tu cuenta de cobros. La etiqueta junto al nombre te dice su estado: **Activa**, **En revisión** o **No disponible: revisa tu verificación**.
4. Solo cuando dice **Activa** se ofrece a tus clientes. Mientras está en revisión, tus clientes siguen pagando con tarjeta.

## Qué ve tu cliente

En el link de la factura o en su portal, tu cliente elige pagar con su cuenta bancaria, captura su IBAN (SEPA) o los datos de su cuenta (ACH) y acepta el mandato que te autoriza a cargarle. Cord guarda solo el tipo, el banco y los últimos cuatro dígitos, nunca la cuenta completa.

Tu cliente recibe por correo el aviso de cada cargo SEPA y la confirmación del mandato ACH, por eso Cord necesita su correo en la ficha.

## Mientras el cargo está en proceso

Un débito no confirma al instante:

- La factura muestra que **hay un cargo a cuenta bancaria en proceso**: no se puede cobrar otra vez ni anular hasta que se confirme o falle.
- El link de la factura y el portal se lo dicen a tu cliente ("Pago en proceso") para que no pague dos veces.
- Cuando se confirma, el pago se aplica a la factura como cualquier otro. Si falla, la factura sigue abierta con su saldo y, en el cobro automático, se aplica la [política de reintentos](/soporte/cobro-automatico).

## Devoluciones y reembolsos

- **SEPA:** el titular puede pedir a su banco la devolución de un cargo durante **8 semanas** sin dar motivo. Si lo hace, el importe se te descuenta: contacta a tu cliente para aclararlo.
- **ACH:** solo admite **reembolsos completos**. Para devolver una parte, acuerda con tu cliente otro medio.
- Un reembolso que inicias tú se hace desde **Cobros**, como cualquier otro.

## Si un cargo falla

Un débito solo se reintenta por **fondos insuficientes**, como máximo dos veces y dentro de 30 días (SEPA) o 40 días (ACH) desde el primer intento. Cualquier otro rechazo (cuenta cerrada, mandato retirado) lo resuelve tu cliente con su banco o con otro método.

## Problemas comunes

- **No veo el interruptor.** Tu negocio no está en España, Alemania, Francia o Estados Unidos, o no tienes el permiso **Configurar cobros**.
- **Dice "No disponible: revisa tu verificación".** A tu cuenta de cobros le falta un requisito. Revisa **Ajustes › Cobros**.
- **Mi cliente no ve la opción.** La factura no está en la divisa del método (EUR para SEPA, USD para ACH), la capacidad todavía no está **Activa** o es el link de una cotización.

## Relacionados

- [Cobro automático y reintentos](/soporte/cobro-automatico)
- [Portal del cliente y pago de varias facturas](/soporte/portal-del-cliente)
- [Métodos de cobro en la documentación](https://docs.cordhq.app/docs/pagos/metodos)
