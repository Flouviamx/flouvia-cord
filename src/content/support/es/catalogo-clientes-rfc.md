---
title: "Catálogo de clientes y RFC"
description: "Cómo guardar el RFC de tus clientes en Cord y qué validaciones aplican realmente."
category: "Facturación"
---

Este artículo aplica al RFC como identificador fiscal mexicano; en otros países el mismo campo guarda el identificador fiscal local de tu cliente (NIF/CIF en España, EIN/Tax ID en Estados Unidos, y así según el país que hayas configurado).

### Qué guarda Cord hoy

Al dar de alta un cliente, el campo de identificador fiscal se guarda tal como lo escribes, en mayúsculas. Cord **no valida el código postal contra el catálogo del SAT ni limpia automáticamente la razón social** (por ejemplo, quitarle "S.A. DE C.V.") — si el SAT rechaza un CFDI 4.0 por una discrepancia entre el nombre o el código postal capturado y la Constancia de Situación Fiscal (CSF) de tu cliente, la corrección hoy es manual: copia el nombre y el código postal exactamente como aparecen en la CSF antes de guardar al cliente.

### Importación masiva por CSV

Si vienes de otro sistema, usa la importación por lote desde tu directorio de **Clientes**. Cada fila acepta: nombre de la empresa, contacto, correo, teléfono, identificador fiscal, términos de pago (contado, 30 o 60 días) y límite de crédito. Si un cliente ya existe (mismo identificador fiscal o mismo nombre de empresa), la importación actualiza esa fila en lugar de duplicarla.

<Callout type="info">
Como la importación no valida el identificador fiscal ni el código postal contra ningún catálogo oficial, la calidad del dato depende de tu archivo de origen: cópialo directamente de la CSF (o el documento fiscal equivalente en tu país) de cada cliente para evitar rechazos al facturar.
</Callout>
