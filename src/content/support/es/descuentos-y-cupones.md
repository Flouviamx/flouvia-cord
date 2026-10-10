---
title: "Descuentos de documento y cupones"
description: "Cómo aplicar un descuento por porcentaje o monto a toda una cotización o factura, crear cupones con vigencia y límite de usos, cuándo se cuenta un uso y cómo aparece en el CFDI y los demás documentos."
category: "Cotizaciones"
order: 6
---

Además de negociar el precio de cada partida, puedes rebajar **la venta completa**: un **descuento de documento** por porcentaje o por monto, o un **cupón** con código que creas una vez y aplicas en cotizaciones y facturas. El descuento se aplica **antes de impuestos** y Cord lo reparte entre las líneas en proporción a su importe.

**En resumen:**

- **Dónde se aplica:** en el resumen del editor de cotizaciones y de facturas, con **+ Agregar descuento o cupón**: **Porcentaje**, **Monto** o **Cupón**.
- **Cupones:** se crean en **Ajustes › Descuentos › Cupones** con código, tipo, valor, vigencia, divisa (si es monto) y límites de usos en total y por cliente.
- **Un cupón manda sobre un descuento manual:** un documento lleva uno u otro.
- **Un uso se cuenta** cuando la factura se emite o la cotización se aprueba, y se devuelve si la factura se anula, el borrador se borra o la cotización se rechaza.
- **En todos los planes.** Crear cupones requiere el permiso **Ajustes**; aplicarlos, el permiso **Cotizaciones**.
- **Fiscal:** el CFDI declara el descuento en cada concepto, y los demás documentos lo reparten por línea; el PDF muestra el importe bruto y el renglón "Descuento" con el código del cupón.

## Aplicar un descuento en el editor

1. En el editor de una cotización o de una factura, ve al resumen y pulsa **+ Agregar descuento o cupón**.
2. Elige **Porcentaje** (de 0 a 100) o **Monto** (en la divisa del documento) y escribe el valor.
3. O elige **Cupón**, escribe el código y pulsa **Aplicar**. Cord lo valida en ese momento y te dice si no aplica.
4. El subtotal, los impuestos y el total se recalculan en vivo. Para quitarlo, pulsa **Quitar**.

Un monto mayor que el subtotal se topa en el subtotal. Con precios que ya incluyen impuesto, el monto rebaja lo que paga el cliente y la base se desagrega después. Las retenciones se calculan sobre las bases ya descontadas.

## Crear un cupón

1. Abre **Ajustes › Descuentos › Cupones** y pulsa **Nuevo cupón**.
2. **Código:** de 3 a 32 letras, números, guion o guion bajo (por ejemplo `BIENVENIDA10`). Es único en tu negocio.
3. **Nombre (opcional)**, para reconocerlo en la lista.
4. **Descuento:** **Porcentaje** o **Monto fijo**, y su **Valor**. Un monto fijo exige su **Divisa**: solo aplica a documentos en esa divisa.
5. **Válido desde** y **Válido hasta** (opcionales), en la zona horaria de tu negocio.
6. **Usos en total** y **Usos por cliente** (opcionales; sin valor, no hay límite).
7. Pulsa **Crear cupón**.

El código, el tipo, el valor y la divisa no cambian una vez creado: para otro valor, crea otro cupón. Un cupón **desactivado** ya no se puede aplicar en documentos nuevos; los que ya lo llevan lo conservan. Un cupón que ya se usó no se puede eliminar: desactívalo.

## Cuándo se cuenta un uso

- **Factura:** al emitirse, antes de reservar el folio. Si los usos ya se agotaron, la factura no se emite y lo ves en su actividad.
- **Cotización:** al aprobarse. Si los usos ya se agotaron, la aprobación no procede.
- **La factura de una cotización** reusa el uso de la cotización: no cuenta dos veces.
- **Se devuelve** si anulas la factura, borras el borrador o la cotización se rechaza.

La vigencia y si el cupón está activo se revisan **al aplicarlo**: un cupón ya aplicado a un documento se conserva aunque edites ese documento después de su vencimiento.

## Mensajes al aplicar un cupón

| Mensaje | Qué pasa |
|---|---|
| "Ese cupón no existe" | El código no está en tu negocio. |
| "Ese cupón está desactivado" | Actívalo en **Cupones** o usa otro. |
| "Ese cupón todavía no está vigente" o "ya venció" | Fuera de sus fechas de validez. |
| "Ese cupón es de otra divisa que la del documento" | Un cupón de monto fijo solo aplica en su divisa. |
| "Ese cupón ya no tiene usos disponibles" | Llegó a su límite total. |
| "Este cliente ya usó ese cupón todas las veces permitidas" | Llegó a su límite por cliente. |
| "Ese cupón está limitado por cliente: elige un cliente primero" | Elige el cliente antes de aplicarlo. |

## Descuentos y aprobaciones

Si tu negocio tiene flujos de aprobación (**Ajustes › Cotizaciones › Aprobaciones**), un **descuento manual** cuenta para el tope de descuento que pide aprobación; un **cupón** no, porque ya lo autorizó quien lo creó.

## Cupones en tu sitio web

Tus compradores pueden capturar un código en el **cotizador embebible** de tu sitio (Cord Elements), y se valida igual que en el editor.

## Cómo aparece en cada documento

- **PDF y links:** cada concepto muestra su importe **bruto** y los totales muestran el renglón **Descuento** con el código del cupón, si lo hay.
- **CFDI (México):** cada concepto lleva su parte del descuento en el nodo de descuento. Un concepto que el descuento deja en cero no se puede timbrar. La factura global declara el descuento de cada venta, y una venta con descuento del 100 % no entra.
- **Verifactu (España):** declara la base ya descontada.
- **Factur-X, XRechnung y Peppol:** cada línea va con su importe bruto y el descuento como rebaja de documento por tasa de impuesto.
- **Rieles de LatAm** (cuando estén activos): ARCA lo informa como bonificación, la NFS-e como descuento incondicionado, la NF-e por ítem, el SII por línea y la DIAN como descuento de cada línea.
- **Nota de crédito:** reparte el descuento igual que la factura.

## Duplicar, repetir y sustituir

- **Duplicar factura** copia el precio bruto y el descuento aparte.
- Una factura recurrente (**Más acciones › Repetir cada mes**) solo lleva un descuento manual, no un cupón.
- **Sustituir un CFDI** hereda el descuento del original tal cual, con su cupón y sin volver a validarlo; el uso no se cuenta dos veces.
- Una **aprobación parcial** y la factura de una cotización vuelven a aplicar el descuento sobre lo aprobado.

## Relacionados

- [Aplicar descuentos o promociones](/soporte/descuentos-promociones)
- [Productos y descuentos en la documentación](https://docs.cordhq.app/docs/cotizacion/productos)
