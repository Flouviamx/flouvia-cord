---
title: "Cómo facturar en Francia con Cord"
description: "Factura con las menciones de la reforma, Factur-X, régimen de TVA y opción por los débitos; la emisión por plataforma autorizada y el e-reporting en activación, y lo que Cord no recibe."
category: "Facturación por país"
order: 8
---

En Francia Cord emite una **factura comercial** en francés con las **menciones que exige la reforma de la factura electrónica** (categoría de la operación, SIREN del cliente, opción por los débitos, dirección de entrega) y la entrega como **Factur-X**. La **emisión por una plataforma autorizada (PA)**, el **e-reporting** y la comunicación de cobros están construidos, pero **en activación**: hoy Cord no transmite nada a la administración. Si necesitas emitir por la plataforma desde Cord, escríbenos para habilitarlo en tu cuenta.

**En resumen:**

- **Documento:** factura y nota de crédito comercial, en todos los planes (10 al mes en Gratis, ilimitadas desde Starter). Por defecto el correo de cada factura lleva el **PDF Factur-X** (el PDF con el XML dentro).
- **En activación:** la emisión por plataforma autorizada, el e-reporting y la comunicación de cobros. En **Ajustes › Facturación › Datos fiscales › Factura electrónica en Francia** dice **Próximamente**.
- **Calendario de la reforma:** desde el 1 de septiembre de 2026 toda empresa establecida en Francia debe poder **recibir** facturas electrónicas, y las grandes empresas y ETI además emiten y declaran. Las PYME y microempresas emiten y declaran desde el **1 de septiembre de 2027**.
- **Cord solo emite:** no recibe facturas de tus proveedores. Necesitas tu propia plataforma de recepción.
- **Qué necesitas:** tu SIREN (o tu número de TVA, que lo contiene), tu **Régimen de TVA**, si optaste por pagar la TVA sobre los débitos y el tipo de cada producto (bien o servicio).
- **Cobrar:** tarjeta y **domiciliación SEPA** en EUR, y cobro automático desde el portal del cliente.

## Qué documento emite Cord

| Situación | Documento |
|---|---|
| Cualquier plan | Factura comercial en francés con prefijo `INV` (o el que configures). |
| Corrección o devolución | Nota de crédito comercial con prefijo `NCC`. |
| Descarga electrónica | Factur-X EN 16931, XRechnung y Peppol BIS. |
| Con la plataforma activa | La factura entre empresas francesas se transmite como Factur-X; las ventas a particulares y con el extranjero se declaran. |

## Las menciones de la reforma

Todas tus facturas francesas ya las llevan, con o sin plataforma:

- **Categoría de la operación** (bienes, servicios o mixta), que sale del **Tipo de venta** de cada producto (producto, servicio o suscripción) y, para los conceptos escritos a mano, de **Conceptos sin producto del catálogo** en Ajustes. Sin ella, la factura no se podrá transmitir.
- **Opción por los débitos**, si la tienes: la factura imprime "Option pour le paiement de la taxe d'après les débits".
- **SIREN del cliente** y su dirección electrónica en el anuario.
- **Dirección de entrega**, si difiere de la del cliente y no son solo servicios: el campo **Dirección de entrega (opcional)** del editor de facturas.
- Las condiciones entre profesionales: penalidades de retraso, la indemnización fija de 40 € por gastos de cobro y la ausencia de descuento por pronto pago; y, si aplicas la franquicia, la mención del art. 293 B del CGI.

## Qué necesitas

- **SIREN** de tu negocio o tu número de TVA intracomunitario, que lo contiene.
- Tu **régimen de TVA**: real normal mensual, real normal trimestral o simplificado (la franquicia se toma del interruptor de franquicia).
- **Una plataforma de recepción** para las facturas que recibes: Cord no las recibe.
- Cuando se active la emisión, verificar tu identidad y firmar el mandato con la plataforma autorizada con la que emite Cord.

## Configura tu cuenta

1. En **Ajustes › Facturación › Datos fiscales › Identidad de facturación**, captura **Razón social o nombre legal**, **SIREN / N° TVA**, domicilio y tu **Prefijo de factura**. Si aplicas la franquicia, enciende **Franquicia en base de TVA (art. 293 B du CGI)**.
2. En **Factura electrónica en Francia**, elige tu **Régimen de TVA**, define **Conceptos sin producto del catálogo** (bienes o servicios) y, si corresponde, enciende **Opté por pagar la TVA sobre los débitos**. Estos datos alimentan las menciones aunque la plataforma esté apagada.
3. En **Productos**, revisa el **Tipo de venta** de cada uno: un producto es una entrega de bienes; un servicio, una suscripción o una licencia, una prestación de servicios.
4. En **Factura electrónica europea**, completa contacto, dirección electrónica y qué adjuntar al correo.
5. Cuando la plataforma esté activa: **Darme de alta en la plataforma** y, en su página, **verificar identidad y firmar el mandato**.

## Cómo ves el estado

Hoy, el detalle de la factura muestra su estado comercial y, en el panel **Plataforma de facturación electrónica**, cómo la trata la reforma (entre empresas francesas, con una empresa extranjera o a un particular) y si ya tiene lo que exige o qué le falta. Con la plataforma activa, el mismo panel muestra el envío, cada estado con su fecha y motivo (200 a 213) y los cobros comunicados. Ajustes muestra la cola (en cola, sin confirmación, declaraciones con el plazo vencido) y lo que necesita atención.

## Anular o corregir

- **Anular:** **Más acciones › Anular**, solo si la factura no tiene pagos. Una factura ya transmitida por la plataforma no se anula ante ella: se corrige con una nota de crédito.
- **Nota de crédito:** **Más acciones › Nota de crédito**, que cita la factura original y su fecha.
- **Factura rechazada** por el cliente (210) o por una plataforma (213): se registra una anulación contable sin flujo y se emite una factura nueva con los datos correctos. Nada se corrige solo.

## Problemas comunes

- **"Todavía no se puede transmitir".** Falta algo que exige la reforma: SIREN, la categoría de la operación de algún concepto, una tasa francesa válida o el número de factura con caracteres admitidos. El panel lo enumera.
- **No recibo facturas de proveedores en Cord.** Es a propósito: Cord solo emite. Mantén tu plataforma de recepción.
- **La factura tiene servicios y bienes.** Es una operación mixta y así se declara; cada concepto toma la categoría de su tipo.

## Qué no cubre todavía

- **Emisión por plataforma, e-reporting y comunicación de cobros:** en activación.
- **Recepción** de facturas de proveedores.
- **Corregir un dato ya declarado** en el e-reporting desde Cord.
- Por la plataforma no se emiten: autofacturación, multivendedor, anticipos ni el régimen de margen.

## Relacionados

- [Factura electrónica europea](/soporte/factura-electronica-europea)
- [Domiciliación SEPA y cargo ACH](/soporte/domiciliacion-sepa-ach)
- [Factura electrónica europea en la documentación](https://docs.cordhq.app/docs/pagos/factura-electronica)
