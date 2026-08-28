---
title: "Facturar a clientes en el extranjero"
description: "Qué campos configurar en Cord cuando tu cliente radica fuera de tu país."
category: "Facturación"
---

Configura el cliente correctamente y Cord factura la venta en la divisa que corresponda; el tratamiento fiscal específico del extranjero varía según el país en el que emites.

### Paso común a cualquier país: marca el país del cliente

Al dar de alta al cliente, selecciona su país en el campo **País** de su ficha (no "hereda del emisor"). Cord usa ese dato, junto con el identificador fiscal que captures, para aplicar el tratamiento correcto a la factura.

### México: exportación de servicios

Vender servicios o licencias de software a un cliente fuera de México requiere un CFDI de exportación de servicios:

1. En el campo de identificador fiscal del cliente, usa el RFC genérico internacional del SAT: `XEXX010101000`. Cord no tiene un campo separado para el Tax ID del país de tu cliente — hoy se usa este único campo.
2. En **Uso de CFDI** de la ficha del cliente, selecciona **S01 (Sin efectos fiscales)**, ya que el receptor extranjero no deduce impuestos ante el SAT.
3. Al crear la cotización o factura, configura su **divisa** a la que corresponda (por ejemplo, USD) y selecciona la tasa **Exento** en el impuesto de la línea si tu contador confirma que esa venta califica para tasa 0% de exportación.

### España: cliente en la Unión Europea o fuera de ella

Si emites Verifactu para un cliente con país distinto de España, Cord usa el país que capturaste en su ficha para decidir automáticamente el tratamiento correcto en el registro: identificación intracomunitaria si el cliente está en la UE, o identificación por país de residencia si está fuera. No necesitas elegir nada adicional más allá de guardar el país correcto del cliente.

### Otros países

Fuera de México y España, Cord no tiene un tratamiento fiscal especial para clientes extranjeros más allá de emitir la factura en la divisa de venta que elijas; consulta con tu contador el tratamiento correcto para exportación de servicios en tu país.
