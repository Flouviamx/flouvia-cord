---
title: "Configurar retenciones de impuestos"
description: "Cómo activar una retención por defecto para tus cotizaciones y facturas."
category: "Facturación"
---

Las retenciones no son exclusivas de México: el catálogo de impuestos de Cord siembra perfiles de retención según tu país al crear la cuenta (ISR e IVA retenido en México, ReteIVA y ReteFuente en Colombia, IRPF en España, retención de IGV en Perú, entre otros). Una retención se **resta** del total y se calcula sobre el subtotal (o sobre el impuesto, en los países donde así lo exige la ley, como Colombia).

### Cómo se aplica una retención en Cord

Las retenciones **no se eligen línea por línea** como la tasa de impuesto normal: son una política del negocio completo. Para que se apliquen automáticamente a tus cotizaciones nuevas:

1. Ve a **Ajustes › Cotizaciones › Impuestos** y revisa el catálogo de tu organización — ya trae sembrados los perfiles estándar de tu país, incluidas sus retenciones.
2. Marca como **predeterminado** el perfil de retención que aplica a tu operación (por ejemplo, "Retención ISR 1.25%" si facturas honorarios a Personas Morales bajo RESICO en México).
3. A partir de ese momento, cualquier cotización o factura nueva de esa organización aplicará esa retención automáticamente sobre el subtotal, sin que tengas que capturarla en cada documento.

<Callout type="warning">
Cord no detecta automáticamente tu régimen fiscal ni el de tu cliente para decidir si corresponde una retención — se aplica porque marcaste un perfil como predeterminado en el catálogo, no porque el sistema haya inferido que facturas a una Persona Moral bajo RESICO. Al ser una política del documento completo (no de la línea), un perfil marcado como predeterminado se aplica a **toda** cotización o factura nueva mientras siga marcado así. Si tu operación mezcla ventas que sí llevan retención (servicios profesionales) con otras que no (venta de un bien), tendrás que desmarcar el perfil como predeterminado antes de capturar las que no la llevan, y volver a marcarlo después.
</Callout>

En México, al convertir la cotización a CFDI, el XML incluye el nodo `Retenciones` con los importes retenidos. En países sin retenciones aplicables, el catálogo simplemente no tiene perfiles de ese tipo y la sección no aparece.
