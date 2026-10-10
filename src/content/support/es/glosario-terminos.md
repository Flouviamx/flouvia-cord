---
title: "Glosario FinTech y Contable"
description: "Diccionario de términos técnicos, financieros y fiscales (SAT) utilizados en la plataforma Cord."
category: "Cuenta y Equipo"
order: 99
---

Cord une a dos mundos que hablan idiomas distintos: **Desarrolladores** y **Contadores**. 

Este glosario resuelve las ambigüedades más comunes para que ambos equipos puedan integrar la plataforma sin fricciones.

## Términos de Facturación (SAT)

### CFDI (Comprobante Fiscal Digital por Internet)
Es el archivo XML oficial que representa una factura electrónica en México. Cord timbra CFDI versión 4.0 desde el plan Starter, con el CSD de tu negocio.

### PUE (Pago en Una sola Exhibición)
Se utiliza cuando la factura ya está pagada al emitirse. Cord lo decide solo: si al timbrar la venta ya está cobrada por completo, el CFDI sale PUE con la forma de pago real.

### PPD (Pago en Parcialidades o Diferido)
Se utiliza cuando se emite la factura y el pago se recibirá después (crédito o parcialidades). Cord timbra PPD con forma de pago 99 cuando la factura no está pagada al emitirse, y cada cobro posterior requiere un REP.

### REP (Recibo Electrónico de Pago)
También conocido como "complemento de pago" o CFDI tipo P. Documenta cada cobro de una factura PPD. Cord lo emite solo cada vez que un pago se aplica a una factura PPD: al registrarlo a mano, al cobrarse en línea o al pasar de la cotización a la factura. Un cobro en otra divisa queda para tu contador. Ver [Facturas PPD y complementos de pago](/soporte/complementos-de-pago).

### CSD (Certificado de Sello Digital)
Son los archivos criptográficos (`.cer` y `.key`) emitidos por el SAT que permiten a un software firmar digitalmente las facturas a nombre de una empresa. Es distinto a la FIEL (Firma Electrónica Avanzada). En Cord solo debes subir tu CSD.

### Uso de CFDI
Clave del catálogo del SAT que indica para qué usará el receptor (cliente) la factura (Ej. `G03 - Gastos en general`, `I04 - Equipo de cómputo`).

### Factura global
CFDI que documenta, a nombre de PUBLICO EN GENERAL (RFC XAXX010101000), las ventas cobradas de un periodo sin que el cliente pidiera factura. Ver [Facturación al Público en General y factura global](/soporte/facturar-publico-general).

### Sustitución (motivo 01)
Forma de corregir un CFDI con otro: el nuevo se relaciona con el original y Cord cancela el original con el motivo 01. Ver [Anular facturas](/soporte/cancelar-facturas).

---

## Términos de facturación en otros países

### Proforma y factura comercial
Una **proforma** (México y España) es un documento comercial que dice expresamente que no sustituye una factura fiscal. Una **factura comercial** (el resto de los países) lleva folio, impuestos y los datos de las dos partes, pero Cord no la presenta ante ninguna autoridad.

### Verifactu
Sistema de facturación verificable que exige la ley española: cada factura genera un registro encadenado que se envía a la AEAT. En Cord está en activación. Ver [Cómo facturar en España](/soporte/facturar-en-espana).

### Factur-X, XRechnung, Peppol y Facturae
Formatos de factura electrónica europea que el sistema del cliente lee sin capturar a mano. Ver [Factura electrónica europea](/soporte/factura-electronica-europea).

### CAE, CUFE y DTE
Lo que cada autoridad de LatAm le da a una factura autorizada: el **CAE** de ARCA (Argentina), el **CUFE** de la DIAN (Colombia) y el **DTE** con su folio del SII (Chile). En Cord, esos rieles están en activación. Ver [Facturación por país](/soporte/categoria/facturacion-por-pais).

### NFS-e y NF-e
En Brasil, la **NFS-e** documenta servicios (la genera el Sistema Nacional NFS-e) y la **NF-e** documenta la venta de mercancías (la autoriza la SEFAZ de cada estado). Ver [Cómo facturar en Brasil](/soporte/facturar-en-brasil).

### Nota de débito
Documento que aumenta lo que el cliente debe sobre una factura ya emitida (intereses, diferencia de precio). En Cord existe para Chile (DTE 56). Ver [Nota de débito y certificación ante el SII](/soporte/nota-de-debito-sii-chile).

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

## Términos Financieros B2B

### Net-30 / Términos de Crédito
Significa que el cliente tiene 30 días naturales a partir de la emisión de la factura (o entrega del producto) para liquidar el saldo total.

### Disputa (Chargeback)
Ocurre cuando un cliente final contacta a su banco para rechazar un cargo procesado vía Cord. El banco retiene los fondos temporalmente mientras Cord te ayuda a enviar evidencia para ganar la disputa.

### Conciliación (Reconciliation)
El proceso de emparejar un movimiento de dinero en la cuenta bancaria corporativa con su respectiva factura o registro contable. Cord automatiza este proceso para los cobros que pasan por Cord Payments (tarjeta y, en México, SPEI); un depósito por transferencia bancaria manual lo confirmas tú mismo.
