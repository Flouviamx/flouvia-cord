---
title: "Configurar retenciones de impuestos"
description: "Qué retenciones siembra Cord por país, sobre qué base se calculan, cómo se activan por defecto y qué hace cada documento fiscal con ellas."
category: "Facturación"
---

Una **retención** se **resta** del total que te paga tu cliente: él la entera a la autoridad en tu nombre. En Cord las retenciones viven en el catálogo de impuestos de tu organización y se aplican al documento completo, no línea por línea.

**En resumen:**

- **Dónde:** **Ajustes › Cotizaciones › Impuestos**. Tu catálogo ya trae las retenciones estándar de tu país.
- **Cómo se aplican:** marca como **predeterminado** el perfil de retención que usas y se aplicará a toda cotización y factura nueva mientras siga marcado.
- **Base:** cada perfil dice si se calcula sobre **el subtotal**, **el subtotal gravado** (sin conceptos exentos) o **el impuesto trasladado**.
- **Documentos fiscales:** el CFDI y la Facturae las declaran; Factur-X, XRechnung y Peppol no tienen dónde, así que una factura con retención no tiene esas versiones.

## Qué retenciones trae tu catálogo

| País | Retenciones sembradas | Se calculan sobre |
|---|---|---|
| México | Retención IVA 10.6667%, Retención ISR 1.25%, Retención IVA 4% (autotransporte), Retención IVA 6% (servicios de personal) | IVA: el subtotal gravado. ISR: el subtotal. |
| Colombia | ReteIVA 15%, ReteFuente 2,5% | ReteIVA: el IVA. ReteFuente: el subtotal. |
| España | Retención IRPF 15%, Retención IRPF 7% (nuevo autónomo) | El subtotal. |
| Chile | Retención honorarios 15,25% (no predeterminada) | El subtotal. |
| Perú | Ninguna, a propósito | La retención del IGV la practica tu cliente agente de retención, no tu factura. |
| Resto | Ninguna | Puedes crear una con **+ Nuevo impuesto**. |

La retención de IVA de México es dos terceras partes del 16 % (10.6667 %, no 10.667 %) y solo se calcula sobre los conceptos que trasladan IVA: un concepto exento no entra en su base. La ReteIVA de Colombia es el 15 % **del IVA**, no del subtotal.

## Activar una retención

1. Ve a **Ajustes › Cotizaciones › Impuestos**.
2. Revisa el perfil de retención. Al crear uno con **+ Nuevo impuesto**, elige el **Tipo**, la **Tasa (%)**, **Se calcula sobre** y, en México, el **Impuesto retenido en el CFDI** (IVA o ISR).
3. Marca el perfil como **Predeterminado** (o activa **Predeterminado para este tipo** al crearlo).
4. Desde ese momento, toda cotización o factura nueva aplica esa retención y el resumen del editor la muestra restando del total.

<callout type="warning">

Cord no detecta tu régimen fiscal ni el de tu cliente para decidir si corresponde una retención: se aplica porque marcaste un perfil como predeterminado. Como es una política del documento completo, un perfil predeterminado se aplica a **toda** cotización o factura nueva. Si mezclas ventas que llevan retención con otras que no, quita el predeterminado antes de capturar las que no la llevan y vuelve a marcarlo después.

</callout>

## Qué hace cada documento con una retención

| Documento | Retenciones |
|---|---|
| CFDI 4.0 (México) | Declara cada retención de IVA e ISR por concepto. Las ventas con retenciones no entran en la factura global: el SAT pide una factura por operación. |
| Facturae (España) | Declara el IRPF. Es la única versión electrónica de una factura con IRPF. |
| Factur-X, XRechnung, Peppol | No tienen dónde declarar una retención: esa factura no tiene versión electrónica. |
| Verifactu (España, en activación) | Declara el importe total sin restar el IRPF; el PDF muestra por separado "Importe total factura" y "Total a pagar". |
| DIAN (Colombia, en activación) | Informa la ReteIVA y la ReteRenta (tu ReteFuente). Una retención que no se puede clasificar con certeza no se informa, pero sigue restando en Cord. |
| NFS-e (Brasil, en activación) | Solo el ISS retenido por el cliente, si marcas ese perfil como ISS en la sección NFS-e. |
| ARCA, SII y NF-e (en activación) | No se emiten con retenciones: la factura se rechaza antes de enviarse. |
| SUNAT (Perú, en activación) | No usa el catálogo: la retención del IGV se configura con la lista de tus clientes agentes de retención en la sección SUNAT. |
| Factura comercial | Muestra cada retención restando del total. |

## Relacionados

- [Cómo facturar en México con Cord](/soporte/facturar-en-mexico)
- [Cómo facturar en España con Cord](/soporte/facturar-en-espana)
- [Cómo facturar en Colombia con Cord](/soporte/facturar-en-colombia)
