---
title: "Glosario FinTech y Contable"
description: "Diccionario de términos técnicos, financieros, fiscales (SAT) y de informes utilizados en la plataforma Cord."
category: "Cuenta y Equipo"
order: 99
---

Cord une a mundos que hablan idiomas distintos: **desarrolladores**, **contadores** y quienes leen los **informes** del negocio.

Este glosario resuelve las ambigüedades más comunes para que todos puedan usar la plataforma sin fricciones.

## Términos de Facturación (SAT)

### CFDI (Comprobante Fiscal Digital por Internet)
Es el archivo XML oficial que representa una factura electrónica en México. Cord emite CFDI versión 4.0 automáticamente.

### PUE (Pago en Una sola Exhibición)
Se utiliza cuando el cobro de una factura se realiza en el momento exacto de la emisión o antes de emitirla. Si un cliente paga vía Tarjeta de Crédito en un link de Cord, la factura generada será PUE.

### PPD (Pago en Parcialidades o Diferido)
Se utiliza cuando se emite la factura pero el pago se recibirá en una fecha futura (crédito). Las facturas PPD **siempre** requieren que se emita un REP posteriormente cuando el dinero llega a la cuenta.

### REP (Recibo Electrónico de Pago)
También conocido como "Complemento de Recepción de Pagos". Es un comprobante secundario que se emite para "saldar" una factura PPD original. Hoy Cord registra cada abono y actualiza el saldo de la factura, pero **no timbra el REP**: ese comprobante lo generas por tu cuenta mientras su timbrado automático llega (ver [Facturas PPD y Complementos de Pago](/soporte/complementos-de-pago)).

### CSD (Certificado de Sello Digital)
Son los archivos criptográficos (`.cer` y `.key`) emitidos por el SAT que permiten a un software firmar digitalmente las facturas a nombre de una empresa. Es distinto a la FIEL (Firma Electrónica Avanzada). En Cord solo debes subir tu CSD.

### Uso de CFDI
Clave del catálogo del SAT que indica para qué usará el receptor (cliente) la factura (Ej. `G03 - Gastos en general`, `I04 - Equipo de cómputo`).

---

## Términos Técnicos (Desarrolladores)

### Idempotencia
Es la propiedad de las APIs de Cord que garantiza que una misma operación no se ejecute dos veces, incluso si la petición se envía múltiples veces por un error de red. Para lograrlo, envías un `Idempotency-Key` en los headers de tus requests. [Más información](/soporte/idempotencia).

### Webhook
Es un mecanismo mediante el cual Cord avisa proactivamente a tu servidor (vía una petición HTTP POST) que un evento importante ha sucedido (ej. `quote.paid`, `quote.invoiced`). [Más información](/soporte/configurar-webhooks).

### Cord Elements
Es nuestra suite de componentes de interfaz de usuario (UI) pre-construidos que puedes incrustar directamente en tu aplicación (React, Vue o HTML plano) para procesar pagos sin tener que diseñar el flujo de *checkout* desde cero. [Más información](/soporte/cord-elements).

### Modo de prueba (Test)
Las llaves `sk_test_` no consumen tu medidor de uso ni cuentan para tu facturación, así que sirven para integrar la API sin afectar tu plan. Nota: operan sobre los mismos datos de tu organización (no hay un sandbox 100% aislado todavía), y que el timbrado sea real o simulado depende de si tienes tu CSD conectado.

### Endpoint
Una URL específica de la API de Cord diseñada para ejecutar una acción (Ej. `POST /api/v1/cotizaciones` para crear una cotización).

---

## Términos financieros

### Net-30 / Términos de Crédito
Significa que el cliente tiene 30 días naturales a partir de la emisión de la factura (o entrega del producto) para liquidar el saldo total.

### Disputa (Chargeback)
Ocurre cuando un cliente final contacta a su banco para rechazar un cargo procesado vía Cord. El banco retiene los fondos temporalmente mientras Cord te ayuda a enviar evidencia para ganar la disputa.

### Conciliación (Reconciliation)
El proceso de emparejar un movimiento de dinero en la cuenta bancaria corporativa con su respectiva factura o registro contable. Cord automatiza este proceso para los cobros que pasan por Cord Payments (tarjeta y, en México, SPEI); un depósito por transferencia bancaria manual lo confirmas tú mismo.

---

## Términos de informes y analítica

### Rango
El periodo que eliges en el selector de fechas del Inicio o de un informe (por ejemplo, **Últimos 30 días** o un rango **Personalizado**). Los widgets con la etiqueta **Rango** lo siguen; los que dicen **Hoy** son una foto de este momento y los que dicen **Histórico** suman todo tu historial. [Más información](/soporte/leer-kpis-y-rango).

### Periodo anterior
El periodo de la misma duración inmediatamente antes del rango elegido: contra él se calcula la variación de cada cifra. **Últimos 30 días** se compara con los 30 días previos, y **Este mes** a día 8 se compara con los 8 días previos, no con todo el mes pasado. Los importes varían en porcentaje y las tasas, en puntos.

### Cobrado
El dinero que entró, por la fecha del pago: pagos de cotizaciones y de facturas (incluidos los abonos parciales) y cotizaciones marcadas como pagadas a mano, menos lo reembolsado. Significa lo mismo en el Inicio y en todos los informes.

### Tasa de cierre
De las cotizaciones enviadas en el periodo, qué porcentaje se ganó (aprobada, pagada o facturada). Se mide sobre una **cohorte** para que dos periodos se comparen sin mezclar fechas.

### Cohorte
Un grupo que se sigue en el tiempo según cuándo empezó. En la **Tasa de cierre** y en el **Informe personalizado**, la cohorte son las cotizaciones creadas en el periodo y lo que pasó con ellas después. En **Recompra por cohorte**, son los clientes que compraron por primera vez en un mismo mes.

### Ticket promedio
Lo vendido en el periodo entre el número de ventas que lo forman.

### Moneda base
La moneda de tu negocio (**Ajustes › General**). Todos los importes del Inicio, los informes, los CSV y los correos programados se expresan en ella; las ventas en otras monedas se convierten con el tipo de cambio fijado en la cotización o, si no tiene uno, con el publicado hoy. [Más información](/soporte/importes-en-varias-divisas-informes).

### Informe tabla
Un informe con cifras clave comparadas contra el periodo anterior, una gráfica y una tabla completa que se ordena por columna y se exporta con **Exportar CSV**. Por ejemplo, **Ventas en el tiempo** o **Pagos recibidos**. [Más información](/soporte/informes-de-cord).

### Informe personalizado
Un informe tabla que armas tú: eliges **Agrupar por** y hasta seis métricas. Puedes compartirlo con un enlace, guardarlo con nombre para todo el equipo y recibirlo por correo. [Más información](/soporte/informes-personalizados).

### Drill-down (ver detalle)
Ir de una cifra agregada a lo que la forma: un clic en la barra de un cliente abre su ficha y uno en la barra de un mes abre ese mes con más detalle. En el celular, el primer toque muestra el dato y **Ver detalle** te lleva.

### Widget
Cada tarjeta del Inicio y de los informes de widgets. Se mueve, cambia de tamaño, se oculta y se agrega desde la biblioteca con **Personalizar**. [Más información](/soporte/personalizar-inicio-widgets).
