---
title: "Conectar Google Sheets"
description: "Cada cotización y cada factura como una fila en tu hoja de Google, al día sola, para que lleves tus números donde ya los llevas."
category: "Cuenta y Equipo"
order: 25
---

Cord escribe tus cotizaciones y tus facturas en una hoja de Google tuya: una fila por documento, que se actualiza sola cuando el documento cambia de estado. Sirve para lo de siempre —sumar el mes, filtrar por cliente, armar una gráfica— sin exportar nada a mano.

**Cord crea la hoja y solo puede abrir esa.** No ve nada más de tu Google Drive. Es el permiso más estrecho que ofrece Google (`drive.file`), y lo pedimos así a propósito.

### Conectarla

1. Entra a **Ajustes › Integraciones › Google Sheets**. Necesitas el permiso de **Ajustes**.
2. Pulsa **Conectar Google Sheets** y autoriza con tu cuenta de Google.
3. Al volver, Cord crea el archivo en tu Drive y empieza a llenarlo con lo que ya tenías.
4. Pulsa **Abrir la hoja** para verla. El primer llenado tarda un momento si tienes mucho histórico.

### Qué trae la hoja

Dos pestañas, **Cotizaciones** y **Facturas**, con una fila por documento. Llegan con la cabecera congelada y en negrita, el filtro puesto, los importes con formato de número y las columnas al ancho de su contenido:

- **Cotizaciones:** folio, cliente, estado, fecha, vigencia, divisa, subtotal, descuento, impuestos, total, cobrado y el link público.
- **Facturas:** folio, cliente, estado, estado fiscal, fecha, vencimiento, divisa, total, pagado, saldo y el link público.

Tres detalles pensados para que la hoja sirva de verdad:

- **Los importes son números, no texto.** Puedes sumarlos, promediarlos y graficarlos sin limpiar nada primero.
- **La divisa va en su propia columna.** Si cotizas en dos monedas, la hoja lo dice en vez de esconderlo dentro del número: así no sumas pesos con dólares sin darte cuenta.
- **Las fechas van en la zona horaria de tu cuenta**, en formato `AAAA-MM-DD`, que ordena bien y las dos hojas reconocen como fecha.

### Cómo se mantiene al día

Cuando una cotización se envía, se aprueba, se rechaza, vence o se paga —y cuando una factura se emite, se envía, se paga, se vence o se cancela— Cord busca su folio en la columna A y **reemplaza esa fila**. Si no la encuentra, la agrega al final.

Por eso puedes ordenar, filtrar y hasta agregar tus propias columnas a la derecha: Cord se guía por el folio, no por el número de fila. Lo único que no conviene tocar es **la columna A**, que es donde vive el folio.

El botón **Actualizar ahora** vuelve a escribir tus últimos 500 documentos de cada pestaña. Sirve si acabas de conectar o si dudas de algo.

### Si algo falla

- **"La conexión con tu hoja dejó de funcionar":** el permiso se revocó o la contraseña de la cuenta cambió. Vuelve a conectarla desde la misma tarjeta.
- **Borraste el archivo:** desconecta y vuelve a conectar; Cord crea uno nuevo.
- **Borraste la primera fila:** no pasa nada, Cord la vuelve a escribir en la siguiente actualización.
