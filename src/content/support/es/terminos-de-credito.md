---
title: "Añadir términos de crédito (Net 30/60)"
description: "Guía para emitir facturas con crédito comercial a clientes recurrentes."
category: "Cotizaciones"
order: 3
---

No todas las transacciones se pagan de contado. En el entorno B2B corporativo, dar facilidades de financiamiento a corto plazo (ej. Pagar a 30 días) es estándar de la industria. Cord automatiza la gestión de estos acuerdos.

### Configurar Términos de Pago (Net 30/60/90)

Al crear una cotización, en la barra lateral derecha verás la sección de **Condiciones de Pago**.
1. Cambia el selector de "De Contado (PUE)" a "A Crédito (PPD)".
2. Introduce la vigencia del crédito (ej. Net 30, lo que significa 30 días naturales a partir de la emisión de la factura).

**Lo que pasa por debajo del capó:**
- La cotización indicará claramente al comprador sus fechas límite de pago.
- Cuando el cliente acepta, se timbra el CFDI con método `PPD` (Pago en Parcialidades).
- El sistema de cobranza inteligente de Cord programará la fecha de vencimiento y enviará correos de recordatorio de cobro automáticos los días 25, 29 y 31 para asegurar la recolección sin que tu equipo de finanzas mueva un dedo.
