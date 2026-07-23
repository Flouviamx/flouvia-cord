---
title: "Anticipo y saldo"
description: "Aprende cómo fraccionar el cobro de una cotización para recibir un porcentaje por adelantado y cobrar el resto después."
---

<header class="content-header">
  <h1 class="page-title">Anticipo y saldo</h1>
  <p class="page-subtitle">Aprende cómo fraccionar el cobro de una cotización para recibir un porcentaje por adelantado y cobrar el resto después.</p>
</header>

## El modelo de pago fraccionado

En proyectos de servicios (agencias, consultoras, software), es muy común no cobrar el 100% por adelantado, sino requerir un anticipo (ej. 50%) para iniciar el trabajo y liquidar el saldo a la entrega.

En plataformas de facturación tradicionales, esto te obliga a generar **dos links de pago distintos** o duplicar la factura. En Cord, la cotización es **inteligente** y maneja los pagos en rebanadas sin que tengas que hacer trabajo doble.

### Cómo configurar un anticipo

1. Abre el editor de cotizaciones.
2. En la barra lateral derecha, busca la sección de **Condiciones**.
3. Asegúrate de que el término de pago sea **Contado** (los anticipos no aplican para créditos Net 30/60).
4. Activa el campo de **"% de Anticipo"** e ingresa el porcentaje (por ejemplo, `50`).
5. Verás que la vista previa en vivo se actualiza al instante, mostrando al cliente exactamente cuánto va a pagar hoy para aprobar.

> **Tip de productividad:** Puedes ir a *Ajustes > Cotizaciones* y establecer un "Anticipo por defecto". Si pones 50%, todas tus nuevas cotizaciones vendrán preconfiguradas con ese modelo.

## ¿Qué ve el cliente?

Cuando el cliente abre el link público de la cotización, debajo del monto total verá un desglose claro:

- **Total del proyecto:** $10,000
- **Hoy pagas de anticipo (50%):** $5,000
- **Saldo:** $5,000 (Vence a la entrega)

### Mutación automática del botón de pago

La magia de la arquitectura de Cord (basada en PaymentIntents independientes) ocurre al momento del cobro:

1. **Primer cobro:** El cliente da clic en "Aprobar y Pagar". El botón le cobra **únicamente los $5,000** del anticipo. Al procesarse el pago, la cotización queda "Aprobada" y lista para que inicies a trabajar.
2. **Segundo cobro:** Semanas después, cuando estés listo para cobrar el saldo, el cliente puede **volver a entrar exactamente al mismo link** de la cotización original. El sistema detectará que el anticipo ya fue pagado, y el botón de pago habrá mutado automáticamente para cobrar el **Saldo restante**.

Tú no tuviste que enviar un segundo correo, ni generar un "link de pago para el saldo". Todo vive en el mismo ecosistema.
