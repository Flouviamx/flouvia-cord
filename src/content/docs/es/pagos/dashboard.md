---
title: "Dashboard de cobros"
description: "Monitorea tus ingresos, conoce tu saldo disponible y revisa las fechas de tus próximos depósitos."
---

<header class="content-header">
  <h1 class="page-title">Dashboard de cobros</h1>
  <p class="page-subtitle">Monitorea tus ingresos, conoce tu saldo disponible y revisa las fechas de tus próximos depósitos.</p>
</header>

## Vista general

Una vez que hayas activado los pagos en línea mediante la configuración de cobros y empieces a recibir ingresos, la página principal de **Cobros** (ubicada en el menú lateral de la app) se transformará en un dashboard financiero completo.

Este panel te da visibilidad total sobre tu flujo de caja en tiempo real, conectándose de forma directa con los datos de Stripe Connect.

### Métricas y KPIs

En la parte superior, encontrarás tres indicadores clave (KPIs) fundamentales:

1. **TOTAL COBRADO:** La suma de todos los pagos que has recibido a lo largo de la historia de tu cuenta a través de Cord. Este es un indicador global de ventas cobradas.
2. **SALDO DISPONIBLE:** El dinero que ya está liberado por Stripe y está listo para ser depositado en tu cuenta bancaria (o que ya está en proceso de depósito).
3. **EN CAMINO (Pendiente):** El dinero proveniente de pagos muy recientes (ej. pagos con tarjeta hechos hoy) que Stripe aún está liquidando. Este saldo pasará a estar disponible de forma automática, generalmente en un plazo de 2 a 7 días dependiendo de la configuración de tu cuenta.

## Historial y Depósitos

Debajo de los KPIs, el dashboard se divide en dos secciones principales:

### Depósitos (Payouts)
Muestra una lista de las transferencias de dinero que Stripe ha realizado hacia tu cuenta bancaria registrada. Cada registro indica la cantidad, la fecha de llegada estimada y el estado:
- **Programado:** El depósito se realizará en el futuro.
- **En camino:** Stripe ya envió los fondos a la red bancaria y deberían reflejarse pronto en tu cuenta.
- **Depositado:** Los fondos ya aterrizaron en tu banco de forma exitosa.

### Cobros Recientes
Una tabla que registra de forma detallada cada pago individual realizado por tus clientes en las distintas cotizaciones. Incluye:
- **Fecha:** Cuándo se realizó el pago.
- **Monto:** La cantidad exacta cobrada.
- **Método:** Si el pago fue realizado mediante "Tarjeta de crédito/débito", "Transferencia SPEI (Stripe)", o "Transferencia (Manual)".
- **Estado y Enlace:** Te permite identificar a qué cotización pertenece ese cobro y acceder directamente al documento para ver los detalles.

> **Sin conciliación manual:** Gracias a esta vista, ya no necesitas buscar depósitos en tu banca electrónica e intentar adivinar a qué factura pertenecen. Cada cobro se asocia automáticamente a su cotización y marca los documentos como pagados.
