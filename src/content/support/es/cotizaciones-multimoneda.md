---
title: "Cotizaciones multimoneda"
description: "Envía propuestas en USD, EUR o MXN."
category: "Cotizaciones"
---

Cord soporta nativamente la emisión de propuestas comerciales en más de 100 divisas. 

### ¿Cómo crear una cotización en otra moneda?

Al momento de redactar la cotización, en la sección de **Configuración Global** (panel derecho), verás un selector de Moneda (Currency).
1. Cambia de `MXN - Peso Mexicano` a `USD - Dólar Estadounidense` o `EUR - Euro`.
2. Todos los precios de tus conceptos ingresados se leerán bajo esa nueva divisa.

### Impacto en la Facturación y Pagos

- **Para tu cliente:** Recibirá el documento y la liga de pago mostrando dólares (ej. $10,000 USD). Si paga con tarjeta, su banco le hará el cargo en dólares o en su moneda local según su contrato bancario.
- **Para ti (Factura):** Cord timbrará automáticamente el CFDI ante el SAT indicando `Moneda: USD` e incluirá automáticamente el nodo de `TipoCambio` oficial del Diario Oficial de la Federación (DOF) del día del cobro. Esto asegura que el SAT reciba el valor correcto de los impuestos trasladados convertidos a pesos para tu declaración mensual.
- **Para ti (Dinero):** Nuestro motor de pagos liquidará la operación en tu cuenta bancaria mexicana **en Pesos (MXN)** usando una tasa cambiaria mayorista competitiva al momento de la captura.
