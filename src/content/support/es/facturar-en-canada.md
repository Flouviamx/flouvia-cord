---
title: "Cómo facturar en Canadá con Cord"
description: "Factura comercial con GST/HST y los impuestos provinciales (QST, PST, RST) cobrados junto al GST, número de QST, cobro con tarjeta y lo que Cord no presenta ante la CRA."
category: "Facturación por país"
order: 3
---

En Canadá Cord emite una **factura comercial** con folio consecutivo, los impuestos de cada concepto y los datos de las dos partes. Canadá no tiene una autoridad que autorice facturas: Cord no presenta la factura ante nadie y **no presenta tus declaraciones de GST/HST ni de QST**.

**En resumen:**

- **Documento:** factura comercial y nota de crédito comercial, en todos los planes (10 al mes en Gratis, ilimitadas desde Starter).
- **Impuestos:** GST 5 %, las HST de las provincias armonizadas y las tasas **combinadas** de las provincias con impuesto propio: GST 5 % + QST 9.975 % (Quebec), GST 5 % + PST 7 % (Columbia Británica), GST 5 % + RST 7 % (Manitoba) y GST 5 % + PST 6 % (Saskatchewan).
- **El desglose separa cada impuesto:** el PDF, el link de la factura y los editores muestran el GST y el impuesto provincial en renglones distintos, y la suma es exactamente lo cobrado.
- **Qué necesitas:** tu Business Number (BN) con tu registro de GST/HST, tu provincia y, si estás registrado en Quebec, tu número de QST.
- **Cobrar:** tarjeta con Cord Payments en CAD. Cord no cobra comisión propia por transacción fuera de pesos mexicanos.
- **No cubre todavía:** declaración de GST/HST o QST, y cargo a cuenta bancaria (no hay domiciliación para Canadá).

## Qué documento emite Cord

| Situación | Documento |
|---|---|
| Cualquier plan | Factura comercial con prefijo `INV` (o el que configures). |
| Corrección o devolución | Nota de crédito comercial con prefijo `NCC`. |

La factura imprime tu número de GST/HST y, si lo capturaste, tu número de QST junto a él. En francés, los impuestos se llaman TPS, TVQ y TVH.

## Cómo calcula Cord los impuestos provinciales

En Quebec, Columbia Británica, Saskatchewan y Manitoba el impuesto provincial se cobra **junto al** 5 % de GST, no en su lugar. Por eso cada línea lleva **una tasa combinada** (14.975 %, 12 % u 11 %) y el desglose la separa: el GST se calcula sobre la base y el impuesto provincial se queda con el resto, así que la suma coincide al centavo con lo cobrado. El 7 % provincial se llama RST si tu negocio está en Manitoba y PST en el resto.

Las HST de las provincias armonizadas (13 % en Ontario, 14 % en Nueva Escocia y 15 % en Nuevo Brunswick, Terranova y Labrador e Isla del Príncipe Eduardo) están en el catálogo de todas las cuentas, porque se cobran al vender **hacia** esas provincias, sin importar dónde esté tu negocio. Las tasas siguen las publicadas por la CRA desde el 1 de abril de 2025.

## Qué necesitas

- **Business Number (BN)** y registro de **GST/HST** ante la CRA, si tu negocio está obligado a registrarse.
- **Registro de QST** ante Revenu Québec, si vendes en Quebec y estás obligado. El número tiene 10 dígitos, `TQ` y 4 dígitos.
- Si vendes en Columbia Británica, Saskatchewan o Manitoba, el registro provincial que corresponda.

Cord no tramita estos registros ni decide si estás obligado; confírmalo con tu asesor.

## Configura tu cuenta

1. Abre **Ajustes › Facturación › Perfil fiscal** y completa **Identidad de facturación**: **Razón social o nombre legal**, **BN / GST/HST no.**, **Domicilio fiscal**, **Ciudad**, **Provincia o territorio** (de la lista), **Código postal** y, si quieres, tu **Prefijo de factura**.
2. Si estás registrado en Quebec, captura el **Número de registro de QST**.
3. Guarda. Al elegir tu provincia, Cord siembra en **Ajustes › Cotizaciones › Impuestos** la tasa de tu provincia como predeterminada, el GST 5 % solo, las HST para vender hacia las provincias armonizadas y la opción **Zero-rated**. Si ya habías elegido una provincia antes, un catálogo que no tocaste se vuelve a sembrar.
4. Revisa el catálogo y marca como predeterminada la tasa que más usas.

## Emitir una factura

Desde una cotización aprobada pulsa **Emitir factura**, o en **Facturas** pulsa **Nueva factura**, elige el cliente, agrega conceptos con su tasa y pulsa **Emitir y enviar**. Si vendes a un cliente de otra provincia, elige la tasa de su provincia en cada línea.

## Cómo ves el estado

No hay un registro ante la autoridad. El detalle de la factura muestra el estado comercial (abierta, pagada, vencida, anulada o incobrable), el saldo, los pagos y la actividad.

## Anular o corregir

- **Anular:** **Más acciones › Anular**, solo si la factura no tiene pagos.
- **Nota de crédito:** **Más acciones › Nota de crédito**, que acredita el total y conserva el desglose de impuestos.
- Un reembolso es otra acción, desde **Cobros**.

## Problemas comunes

- **Una venta en Quebec solo cobró la QST, o solo el GST.** Elige la tasa combinada **GST 5% + QST 9.975%**. Una tasa provincial suelta que guardaste antes (QST 9.975 %, PST o RST 7 %, PST 6 %) Cord la lee como la combinada, para que un borrador viejo no caiga al GST solo.
- **No veo mi número de QST en la factura.** Captúralo en **Perfil fiscal**; aplica a las facturas que emitas después.
- **Mi catálogo no cambió al elegir la provincia.** Solo se vuelve a sembrar un catálogo que no modificaste. Ajusta las tasas a mano.

## Qué no cubre todavía

- **Presentar tus declaraciones** de GST/HST o de QST.
- **Cargo a cuenta bancaria** para clientes en Canadá: el cobro en línea es con tarjeta.
- **Distinguir "exento" de "zero-rated"** en la declaración: Cord guarda la tasa del concepto (0 %), no el régimen.

## Relacionados

- [Configurar retenciones de impuestos](/soporte/retenciones-impuestos)
- [Facturas comerciales en Gratis](/soporte/facturacion-gratis)
- [Facturación por país en la documentación](https://docs.cordhq.app/docs/pagos/facturacion)
