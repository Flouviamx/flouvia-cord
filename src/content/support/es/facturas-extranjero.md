---
title: "Facturar a clientes en el extranjero"
description: "Qué campos configurar en Cord cuando tu cliente radica fuera de tu país."
category: "Facturación"
---

Configura el cliente correctamente y Cord factura la venta en la divisa que corresponda; el tratamiento fiscal específico del extranjero varía según el país en el que emites.

### Paso común a cualquier país: marca el país del cliente

Al dar de alta al cliente, elige su país en el campo **País**, al inicio de su ficha. Viene preseleccionado con el país de tu negocio: cámbialo si el cliente radica en otro. Cord usa ese dato, junto con el identificador fiscal que captures, para aplicar el tratamiento correcto a la factura; también ajusta el nombre del identificador fiscal, la lada del teléfono y el formato de la dirección.

### México: CFDI a un residente en el extranjero

Si tu negocio está en México y el país del cliente es otro, Cord timbra el CFDI como a un **residente en el extranjero** sin que configures nada más:

1. En la ficha del cliente, elige su **País** y captura en el identificador fiscal **su número fiscal de su país** (EIN en Estados Unidos, NIF en España, VAT number en Reino Unido…). No escribas un RFC: no lo tiene.
2. Al timbrar, Cord usa el RFC genérico de extranjeros del SAT (`XEXX010101000`), declara la **residencia fiscal** del país de la ficha, manda su número fiscal como **número de registro tributario** y pone el uso **S01 (Sin efectos fiscales)**. El régimen fiscal y el uso de CFDI de la ficha no aplican a un extranjero.
3. Al crear la cotización o factura, elige su **divisa** (por ejemplo, USD) y la tasa de impuesto de cada línea. La decides tú con tu contador: la exportación de servicios suele ir al 0 %.

Cord no emite el **Complemento de Comercio Exterior**, que exige la exportación definitiva de mercancías (clave A1). Para servicios o licencias no hace falta.

### España: cliente en la Unión Europea o fuera de ella

Si emites Verifactu para un cliente con país distinto de España, Cord usa el país que capturaste en su ficha para decidir automáticamente el tratamiento correcto en el registro: identificación intracomunitaria si el cliente está en la UE, o identificación por país de residencia si está fuera. No necesitas elegir nada adicional más allá de guardar el país correcto del cliente.

### Otros países

Fuera de México y España, Cord no tiene un tratamiento fiscal especial para clientes extranjeros más allá de emitir la factura en la divisa de venta que elijas; consulta con tu contador el tratamiento correcto para exportación de servicios en tu país.
