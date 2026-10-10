---
title: "Cómo facturar en Estados Unidos con Cord"
description: "Factura comercial con sales tax por estado o calculado por la dirección del cliente, EIN, cobro con tarjeta y ACH, y qué hace y qué no hace Cord ante los estados."
category: "Facturación por país"
order: 2
---

En Estados Unidos Cord emite una **factura comercial** (invoice) con folio consecutivo, el sales tax de cada concepto y los datos de las dos partes. Estados Unidos no tiene una autoridad que autorice facturas: Cord no presenta la factura ante nadie y **no presenta tus declaraciones de sales tax**.

**En resumen:**

- **Documento:** factura comercial y nota de crédito comercial. En todos los planes; Gratis incluye 10 al mes y desde Starter son ilimitadas.
- **Qué necesitas:** tu EIN (o Tax ID) y tu domicilio en **Ajustes › Facturación › Perfil fiscal**, y un permiso de sales tax en cada estado donde recaudas.
- **Sales tax:** al elegir tu estado, Cord siembra la tasa estatal y una opción exenta. Desde Starter puedes calcularlo **por la dirección del cliente** (estado, condado, ciudad y distritos), con una cuota mensual por plan.
- **Cobrar:** tarjeta con Cord Payments y cargo a cuenta bancaria (ACH) en USD; cobro automático desde el portal del cliente (el cargo ACH y el cobro automático son nuevos y se están habilitando: pueden no estar disponibles todavía en tu cuenta). Cord no cobra comisión propia por transacción fuera de pesos mexicanos.
- **Anular o corregir:** **Más acciones › Anular** si no tiene pagos; si ya los tiene, **Nota de crédito**.
- **No cubre todavía:** declaración de sales tax ante los estados, reportes de ventas registradas dentro de Cord y clasificación de impuesto por producto.

## Qué documento emite Cord

| Situación | Documento |
|---|---|
| Cualquier plan | Factura comercial con prefijo `INV` (o el que configures). |
| Corrección o devolución | Nota de crédito comercial con prefijo `NCC`. |

La factura imprime el sales tax de cada concepto. Si usas el cálculo por dirección, imprime un renglón por jurisdicción ("California 6%", "Los Angeles County 0.25%") y, cuando corresponde, la nota del 0 %: "Sin obligación de recaudar sales tax en Texas" o la referencia al certificado de exención del cliente.

## Qué necesitas

- **EIN o Tax ID de tu negocio.** El IRS lo asigna sin costo.
- **Permiso de sales tax (sales tax permit)** en cada estado donde tienes la obligación de recaudar. Lo tramitas con cada estado, y cada estado decide si cobra por él. Cord no tramita permisos ni decide dónde tienes nexus: confírmalo con tu asesor.
- **Para el cálculo por dirección:** plan Starter o superior y tu cuenta de Cord Payments activa.

## Configura tu cuenta

1. Abre **Ajustes › Facturación › Perfil fiscal** y completa **Identidad de facturación**: **Razón social o nombre legal**, **EIN / Tax ID**, **Domicilio fiscal**, **Ciudad**, **Estado, provincia o región** (eliges tu estado de la lista), **Código postal** y, si quieres, tu **Prefijo de factura**. Guarda.
2. Al elegir tu estado, Cord siembra en **Ajustes › Cotizaciones › Impuestos** la tasa estatal ("Sales tax CA 7.25%", por ejemplo) y la opción **Exempt / Resale**. Un estado sin sales tax estatal, como Oregon, solo recibe la opción exenta.
3. La tasa estatal es la mínima del estado. Si vendes en una ciudad con impuesto local, crea tu propia tasa con **+ Nuevo impuesto** o enciende el cálculo por dirección.
4. Para el cálculo por dirección, en **Ajustes › Cotizaciones › Impuestos › Sales tax por dirección** activa **Calcular el sales tax por la dirección del cliente**, captura **Domicilio de tu negocio**, elige **Qué vendes**, marca los **Estados donde recaudas sales tax** y pulsa **Guardar**. Ver [Sales tax automático de EE. UU.](/soporte/sales-tax-automatico).
5. Si un cliente está exento, márcalo en su ficha, en **Exención de sales tax**, con su número de certificado, el estado y la fecha de vencimiento.

## Emitir una factura

Desde una cotización aprobada pulsa **Emitir factura**, o en **Facturas** pulsa **Nueva factura**, elige el cliente, agrega conceptos y pulsa **Emitir y enviar**. El correo lleva el PDF y el link de pago. El folio se asigna al emitir: un borrador no consume folio ni cuota.

Con el cálculo por dirección, el cliente necesita al menos estado y código ZIP de 5 dígitos; calle y ciudad mejoran la precisión. Si falta un dato o el cálculo no está disponible, la factura no se guarda y el editor te dice qué falta. Cord nunca usa una tasa estimada.

## Cobrar

- **Tarjeta** desde el link de la factura, con Cord Payments.
- **Cargo a cuenta bancaria (ACH)** en USD, si lo enciendes en **Ajustes › Cobros**. Tarda hasta 4 días hábiles en confirmarse y solo admite reembolsos completos. Ver [Domiciliación SEPA y cargo ACH](/soporte/domiciliacion-sepa-ach).
- **Portal del cliente** para pagar varias facturas a la vez y **cobro automático** en la fecha de vencimiento. Ver [Portal del cliente](/soporte/portal-del-cliente) y [Cobro automático](/soporte/cobro-automatico).

## Cómo ves el estado

No hay un registro ante una autoridad. El detalle de la factura muestra su estado comercial (abierta, pagada, vencida, anulada o incobrable), el saldo, los pagos y la actividad. Con el cálculo por dirección, cada factura emitida se registra como venta en los estados donde recaudas, para que tengas el dato al declarar.

## Anular o corregir

- **Anular:** **Más acciones › Anular**, solo si la factura no tiene pagos. Con el cálculo por dirección, anular revierte la venta registrada.
- **Nota de crédito:** **Más acciones › Nota de crédito** acredita el total de la factura. La nota copia el desglose de sales tax para imprimirlo.
- **Reembolso:** devolver dinero es otra acción, desde **Cobros**. Ver [Emitir reembolsos](/soporte/emitir-reembolsos).

## Problemas comunes

- **La tasa es más baja que la de mi ciudad.** La tasa sembrada es solo la estatal. Usa el cálculo por dirección o crea la tasa combinada de tu localidad.
- **"La dirección del cliente necesita su estado y un ZIP de EE. UU. de 5 dígitos".** Complétalos en la ficha del cliente. Si el mensaje habla de tu domicilio, de tus estados o de la cuenta de cobros, completa tu configuración en **Ajustes › Cotizaciones › Impuestos** o **Ajustes › Cobros**.
- **Una venta a otro estado sale al 0 %.** Es correcto si no marcaste ese estado: no tienes registro ahí y la factura lo dice. Si sí recaudas ahí, márcalo en la configuración.
- **Llegué a las facturas con sales tax automático de mi plan.** Hasta el mes siguiente, mejora tu plan o captura la tasa a mano.

## Qué no cubre todavía

- **Presentar tus declaraciones de sales tax** ante los estados.
- **Ver dentro de Cord los reportes** de ventas registradas para declarar.
- **Una clasificación de impuesto por producto:** hoy es una por negocio (servicios, bienes físicos, SaaS o servicios digitales).
- **Reverso parcial** de la venta registrada cuando emites una nota de crédito por una parte.

## Relacionados

- [Sales tax automático de EE. UU.](/soporte/sales-tax-automatico)
- [Domiciliación SEPA y cargo ACH](/soporte/domiciliacion-sepa-ach)
- [Facturas comerciales en Gratis](/soporte/facturacion-gratis)
- [Facturación por país en la documentación](https://docs.cordhq.app/docs/pagos/facturacion)
