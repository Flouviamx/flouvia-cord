---
title: "Cobranza automática con IA"
description: "Un agente que, al vencer el crédito, recuerda el pago con el link real y negocia cuotas."
category: "Pagos y Depósitos"
order: 5
---

La cobranza autónoma de Cord es un agente de Inteligencia Artificial que persigue tu cartera vencida por ti, con tono profesional y sin que tu equipo mueva un dedo. **Está desactivada por defecto**: solo entra en acción cuando tú la activas para tu negocio.

### Cuándo actúa

El agente solo escribe cuando el crédito de una cotización **realmente venció**. La fecha de vencimiento se calcula desde la aprobación más los días del término (contado o Net 7, 15, 30, 45, 60 o 90), con unos días de gracia antes del primer recordatorio. A un cliente al corriente nunca lo molesta.

### Qué hace

1. **Recordatorio con link de pago real.** Cada correo incluye un botón que lleva directo al pago del monto exacto pendiente (tarjeta, o SPEI si tu negocio cobra en pesos mexicanos), directo a tu banco. Si no tienes cobros en línea activos, el botón lleva al link público con tus datos de transferencia.
2. **Tono adaptativo.** El agente ajusta el tono según los días de atraso: amable al principio, más firme conforme pasa el tiempo.
3. **Negocia cuotas si hace falta.** Si el cliente lleva varios días vencido y no puede pagar de golpe, el agente puede acordar un plan de 2 o 3 cuotas mensuales que suman exactamente el adeudo (sin descuentos), y crea automáticamente los cobros pagables de cada cuota.

### Dónde está

El agente vive dentro de **Cobranza**. En el menú lateral, abre **Cobranza** (grupo **Ingresos**, atajo `G` y luego `B`): justo debajo aparece **Agente IA**, con sangría, mientras estás en Cobranza o en el propio agente. También llegas con la pestaña del agente, arriba de la página de Cobranza, o escribiendo "agente" en el buscador de la barra superior (`⌘ K` en Mac, `Ctrl K` en Windows).

En **Ajustes › Inteligencia artificial** ves si está apagado, en aprobación o en automático, con un botón que te lleva a su pantalla.

### Cómo activarla

1. Entra a **Cobranza › Agente IA**. La primera vez te muestra a cuántas cuentas les escribiría hoy y un ejemplo de su correo.
2. Pulsa **Activar con aprobación**. En este modo el agente redacta y deja cada correo en la **Bandeja de aprobación**: nada sale hasta que lo apruebas, y antes puedes editarlo, pedirle que lo reescriba o descartarlo.
3. Cuando confíes en su redacción, cámbialo a **Automático** y los correos salen solos. La bandeja muestra entonces solo los que no se pudieron entregar.

Con **Configurar**, en la misma pantalla, ajustas el modo, el tono, los días de espera y a quién no escribirle. Puedes desactivarlo en cualquier momento. Activarlo o configurarlo requiere el permiso de Ajustes; si no lo tienes, pídeselo a un administrador.

> [!NOTE]
> Al activar esta función autorizas a Cord a contactar a tus clientes en tu nombre respecto a saldos vencidos. Asegúrate de tener una relación comercial legítima y datos de cartera correctos. El agente usa IA y su redacción puede variar.
