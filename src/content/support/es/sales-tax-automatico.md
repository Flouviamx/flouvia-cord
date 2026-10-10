---
title: "Sales tax automático de EE. UU. por dirección del cliente"
description: "Cómo se calcula el sales tax de estado, condado, ciudad y distritos, cuántas facturas incluye cada plan, el excedente, los clientes exentos, los límites y lo que todavía no cubre."
category: "Facturación"
order: 20
---

El catálogo de un negocio en Estados Unidos solo trae la tasa **estatal**, que es la mínima: una venta en Los Ángeles lleva más impuesto que el 7.25 % de California. Con **Calcular el sales tax por la dirección del cliente**, cada línea de una cotización o factura para un cliente en EE. UU. toma la tasa **combinada de estado, condado, ciudad y distritos especiales** de su dirección, y el documento imprime un renglón por jurisdicción.

**En resumen:**

- **Plan:** desde **Starter**. En Gratis no está disponible.
- **Incluido al mes:** 10 facturas con sales tax automático en Starter, 25 en Profesional, 60 en Scale y 150 en Developer.
- **Excedente publicado:** USD 0.75, MXN 15.00 o EUR 0.70 por factura adicional, según la divisa de tu suscripción (Developer no tiene tarifa EUR de autoservicio). Hoy ese excedente todavía no se cobra, así que lo incluido funciona como **tope**: al llegar, mejora tu plan o captura la tasa a mano hasta el mes siguiente.
- **Qué cuenta:** cada factura emitida y cada cotización cobrada que se registra en un estado **donde recaudas**, una sola vez. Las vistas previas no cuentan, una venta a un estado donde no recaudas tampoco, y una cotización y su factura cuentan como una sola venta.
- **Qué necesitas:** tu cuenta de Cord Payments activa, tu domicilio completo y los estados donde tienes permiso de recaudar.
- **Nunca estima:** si falta un dato o el cálculo no está disponible, el documento no se guarda y te dice qué falta.

## Activarlo

1. Activa Cord Payments en **Ajustes › Cobros**: el cálculo vive en tu cuenta de cobros.
2. Abre **Ajustes › Cotizaciones › Impuestos** y baja a **Sales tax por dirección**.
3. Enciende **Calcular el sales tax por la dirección del cliente**.
4. En **Domicilio de tu negocio**, captura **Calle y número**, **Ciudad**, **Estado** y **ZIP**. En los estados que gravan en el lugar del vendedor, tu domicilio decide la tasa.
5. En **Qué vendes**, elige **Servicios en general**, **Bienes físicos en general**, **Software como servicio (uso empresarial)** o **Servicios digitales en general**. Decide si un estado grava lo que vendes: muchos estados no gravan los servicios.
6. En **Estados donde recaudas sales tax**, marca solo aquellos donde tienes permiso.
7. Pulsa **Guardar**. El estado dice **El cálculo automático está encendido** y lista tus estados.

Quitar un estado deja de recaudar desde hoy; los documentos ya calculados conservan su impuesto. Si falta algo, Cord lo dice y deja el cálculo apagado.

## Cómo se ve en el documento

- La columna del concepto muestra la **tasa legal combinada** (por ejemplo 9.5 %).
- El resumen imprime **un renglón por jurisdicción**: "California 6%", "Los Angeles County 0.25%" y los distritos que apliquen.
- Un cliente en un estado donde **no** recaudas lleva 0 % y la nota "Sin obligación de recaudar sales tax en Texas".
- Un cliente exento lleva 0 % y la nota "Cliente exento de sales tax" con su certificado. Una venta que el estado no grava lleva la nota "Venta no gravada con sales tax en" y el estado.
- El total coincide al centavo con el impuesto calculado, también con precios con impuesto incluido. El cálculo se hace en la divisa de venta y ya con el descuento de documento repartido.

Esto aplica igual en el editor, el PDF, el link de la cotización (`/q`), el de la factura (`/i`) y las vistas de tu equipo.

## Clientes exentos

En la ficha del cliente, sección **Exención de sales tax**, márcalo como exento con su **número de certificado**, el estado y la fecha de vencimiento. Sin número de certificado no se guarda la exención, y con el certificado vencido el documento no se guarda hasta actualizarlo.

## Mensajes que puedes ver

| Mensaje | Qué hacer |
|---|---|
| "La dirección del cliente necesita su estado y un ZIP de EE. UU. de 5 dígitos" | Complétalos en la ficha del cliente. Calle y ciudad mejoran la precisión. |
| "No pudimos ubicar la dirección del cliente" | Revisa calle, ciudad, estado y ZIP. |
| "Falta el domicilio completo de tu negocio" | Captura calle, ciudad, estado y ZIP en **Sales tax por dirección**. |
| "Agrega al menos un estado donde tu negocio recauda sales tax" | Marca tus estados y guarda. |
| "Uno de tus estados registrados no está activo" | Vuelve a guardar tus estados. |
| "El cálculo de este documento ya no es válido" | Guarda el documento de nuevo para recalcular. |
| "Llegaste a las N facturas con sales tax automático de tu plan este mes" | Mejora tu plan o captura la tasa a mano hasta el mes siguiente. |
| "Este documento llegó a los N cálculos de sales tax de hoy" | Guárdalo para fijar su impuesto; mañana puedes recalcular. |
| "Tu negocio llegó a los N cálculos de sales tax de hoy" | Se renuevan en 24 horas; mientras tanto, captura la tasa a mano. |
| "No está disponible en este momento" | Intenta en unos minutos; no se usó ninguna tasa estimada. |

Para que el costo de cada cálculo no se dispare, Cord limita los cálculos por negocio (por minuto, por hora y hasta 500 al día) y por documento (hasta 20 cálculos nuevos al día en la vista previa), y reusa el cálculo de la vista previa al guardar si nada cambió. Una cotización típica usa de 1 a 3 cálculos.

## Registro de la venta

Al emitir una factura (también la que sale de una cotización), o cuando una cotización se cobra, Cord registra la venta una sola vez con el impuesto que el documento cobra. Si el documento cambió después y el impuesto ya no coincide al centavo, la venta queda en revisión en lugar de registrar una cifra distinta. **Anular** una factura revierte su venta, salvo que respalde una cotización ya cobrada.

## Si bajas de plan

La preferencia se conserva, pero queda **en pausa**: el estado dice **En pausa: tu plan actual no lo incluye** y tus documentos usan las tasas de tu catálogo hasta que vuelvas a Starter o superior.

## Qué no cubre todavía

- **Presentar tus declaraciones** de sales tax ni ver dentro de Cord los reportes de ventas registradas.
- **Clasificación por producto:** hoy es una por negocio.
- **Reverso parcial** de la venta cuando emites una nota de crédito.
- **La API y el servidor MCP** no exponen la exención del cliente ni el desglose por jurisdicción (los documentos que crean sí calculan por dirección).

## Relacionados

- [Cómo facturar en Estados Unidos con Cord](/soporte/facturar-en-estados-unidos)
- [Tu suscripción a Cord](/soporte/planes-suscripcion)
- [Facturación por país en la documentación](https://docs.cordhq.app/docs/pagos/facturacion)
