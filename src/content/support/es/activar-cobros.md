---
title: "Cómo activar los cobros en línea"
description: "Guía paso a paso para configurar tu cuenta y recibir pagos con tarjeta o SPEI desde tus cotizaciones."
category: "Pagos y Depósitos"
order: 1
---

Para permitir que tus clientes paguen tus cotizaciones directamente desde el link público, necesitas activar los cobros en línea. Cord se integra con **Stripe Connect** para procesar estos pagos, lo que significa que el dinero cae directamente a tu cuenta bancaria y Cord cobra **0% de comisión**.

### Pasos para activar los cobros

1. En Cord, ve a **Ajustes › Cobros**.
2. Verás el panel de **Cobros en línea**. Completa el formulario embebido (Onboarding de Stripe) con los datos de tu negocio, representante legal y la cuenta bancaria donde deseas recibir los fondos.
3. Una vez completado, Stripe verificará tu información (KYC). Este proceso suele ser rápido.
4. Cuando el estado cambie a **"¡Todo listo, ya puedes cobrar!"**, tus clientes verán el botón de pago en tus cotizaciones.

### Métodos de pago disponibles

Una vez activa tu cuenta, puedes habilitar o deshabilitar estos métodos desde la misma pantalla de Ajustes:

- **Tarjeta de crédito y débito**: Se procesa al instante (Visa, Mastercard, Amex).
- **Transferencia SPEI automática**: Stripe genera una CLABE única para cada cotización. Cuando el cliente transfiere, la cotización se marca como pagada automáticamente.
- **Transferencia bancaria manual**: Muestra tu CLABE habitual. Tú debes confirmar manualmente cuándo recibes el pago. (Este método no requiere Stripe).

### Comisiones y tiempos de depósito

- **Cord no cobra comisión** por procesar tus pagos. Solo asumes las tarifas estándar de procesamiento de Stripe.
- Los tiempos de depósito (payouts) dependen enteramente de Stripe y tu historial con ellos. Por lo general, los fondos se transfieren automáticamente a tu banco en un par de días hábiles.
