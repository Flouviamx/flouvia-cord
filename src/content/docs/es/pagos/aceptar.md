---
title: "Aceptar un Pago"
description: "Recibe dinero mediante tarjeta de crédito o transferencia SPEI dinámica."
---

<header class="content-header">
  <h1 class="page-title">Aceptar un Pago</h1>
  <p class="page-subtitle">Ofrece a tus clientes una experiencia de pago nativa sin salir de la cotización.</p>
</header>

## El Checkout Integrado

Una vez que el cliente aprueba la cotización (y firma electrónicamente), el Enlace Mágico se transforma. En lugar de mostrar el botón de aprobar, despliega un **Checkout de pago** elegante y responsivo.

Dependiendo de cómo hayas configurado la cotización (Contado, Anticipo o Crédito), el sistema cobrará el monto correspondiente. El cliente tiene dos métodos de pago principales:

### 1. Transferencia Interbancaria (SPEI Dinámico)

Este es el método preferido para transacciones B2B de alto volumen.
- Al seleccionar "Transferencia", Cord genera una **CLABE interbancaria única** asociada exclusivamente a esa cotización específica (usando la infraestructura de *Customer Balance*).
- El cliente entra a su portal bancario y transfiere a esa CLABE.
- **Conciliación Mágica:** En el instante en que el dinero toca la cuenta, Cord detecta el depósito, cambia el estado de la cotización a "Pagada" y te envía una notificación (junto con el cliente). No necesitas cruzar comprobantes.

> **Cero Comisiones:** Los pagos por SPEI viajan a través de tu cuenta Connect Custom. Cord no cobra porcentaje por estas transacciones.

### 2. Tarjetas de Crédito y Débito

Para pagos rápidos o montos menores, el cliente puede usar su tarjeta.
- El formulario está impulsado por **Stripe Elements** bajo el capó, garantizando los más altos estándares de seguridad (PCI Compliance).
- Acepta Visa, Mastercard y American Express.
- Los fondos también caen directo a tu cuenta conectada. *(Nota: El procesador de pagos retendrá la comisión estándar de procesamiento de tarjetas, pero Cord no agrega fees adicionales).*

## Pagos Parciales y Anticipos

¿Qué pasa si configuraste un **Anticipo del 50%** en la cotización?
1. El checkout de pago inicial mostrará únicamente el monto del anticipo.
2. Una vez que el cliente paga ese 50%, la cotización se marca como "Anticipo Pagado".
3. Cuando llegue la fecha de entrega del proyecto, Cord enviará automáticamente un nuevo correo al cliente con un botón para "Liquidar Saldo", que lo llevará al checkout por el 50% restante.
