---
title: "[EN] Glosario FinTech y Contable"
description: "Diccionario de términos técnicos, financieros y fiscales (SAT) utilizados en la plataforma Cord."
category: "Account"
order: 99
---

Cord une a dos mundos que hablan idiomas distintos: **Desarrolladores** y **Contadores**. 

Este glosario resuelve las ambigüedades más comunes para que ambos equipos puedan integrar la plataforma sin fricciones.

## Términos de Facturación (SAT)

### CFDI (Comprobante Fiscal Digital por Internet)
Es el archivo XML oficial que representa una factura electrónica en México. Cord emite CFDI versión 4.0 automáticamente.

### PUE (Pago en Una sola Exhibición)
Se utiliza cuando el cobro de una factura se realiza en el momento exacto de la emisión o antes de emitirla. Si un cliente paga vía Tarjeta de Crédito en un link de Cord, la factura generada será PUE.

### PPD (Pago en Parcialidades o Diferido)
Se utiliza cuando se emite la factura pero el pago se recibirá en una fecha futura (crédito). Las facturas PPD **siempre** requieren que se emita un REP posteriormente cuando el dinero llega a la cuenta.

### REP (Recibo Electrónico de Pago)
También conocido como "Complemento de Recepción de Pagos". Es un comprobante secundario que se emite para "saldar" una factura PPD original. Cord puede automatizar la emisión de REPs cuando detecta la conciliación del depósito bancario.

### CSD (Certificado de Sello Digital)
Son los archivos criptográficos (`.cer` y `.key`) emitidos por el SAT que permiten a un software firmar digitalmente las facturas a nombre de una empresa. Es distinto a la FIEL (Firma Electrónica Avanzada). En Cord solo debes subir tu CSD.

### Uso de CFDI
Clave del catálogo del SAT que indica para qué usará el receptor (cliente) la factura (Ej. `G03 - Gastos en general`, `I04 - Equipo de cómputo`).

---

## Términos Técnicos (Desarrolladores)

### Idempotencia
Es la propiedad de las APIs de Cord que garantiza que una misma operación no se ejecute dos veces, incluso si la petición se envía múltiples veces por un error de red. Para lograrlo, envías un `Idempotency-Key` en los headers de tus requests. [Más información](/soporte/idempotencia).

### Webhook
Es un mecanismo mediante el cual Cord avisa proactivamente a tu servidor (vía una petición HTTP POST) que un evento importante ha sucedido (ej. `payment.succeeded`, `invoice.created`). [Más información](/soporte/configurar-webhooks).

### Cord Elements
Es nuestra suite de componentes de interfaz de usuario (UI) pre-construidos que puedes incrustar directamente en tu aplicación (React, Vue o HTML plano) para procesar pagos sin tener que diseñar el flujo de *checkout* desde cero. [Más información](/soporte/cord-elements).

### Sandbox (Entorno de Pruebas)
Un entorno completamente aislado del mundo real. En Sandbox puedes usar [tarjetas de prueba](/soporte/tarjetas-prueba) y emitir facturas ficticias sin valor fiscal ni movimiento de dinero real. Es fundamental para integrar la API.

### Endpoint
Una URL específica de la API de Cord diseñada para ejecutar una acción (Ej. `POST /v1/invoices` para crear una factura).

---

## Términos Financieros B2B

### Net-30 / Términos de Crédito
Significa que el cliente tiene 30 días naturales a partir de la emisión de la factura (o entrega del producto) para liquidar el saldo total.

### Disputa (Chargeback)
Ocurre cuando un cliente final contacta a su banco para rechazar un cargo procesado vía Cord. El banco retiene los fondos temporalmente mientras Cord te ayuda a enviar evidencia para ganar la disputa.

### Conciliación (Reconciliation)
El proceso de emparejar un movimiento de dinero en la cuenta bancaria corporativa con su respectiva factura o registro contable. Cord automatiza el 95% de la conciliación B2B.
