---
title: "[EN] Cambiar plan de suscripción Cord"
description: "Administra tu plan de facturación de Cord, licencias adicionales y facturación."
category: "Account & Team"
order: 4
---

El modelo de ingresos recurrentes requiere automatización de cobros (recurring billing). Cord cuenta con un motor de suscripciones avanzado.

### Crear Planes y Productos

1. Ve a **Suscripciones > Productos**.
2. Crea tu producto principal (ej. "Plataforma SaaS Enterprise").
3. Crea un **Plan de Cobro** asociado al producto. Puedes definir ciclos Mensuales, Trimestrales o Anuales.

### Modelos de Precios
Cord soporta esquemas complejos de suscripción SaaS:
- **Tarifa Fija (Flat Rate):** El clásico $99 USD/mes.
- **Basado en Asientos (Per Seat):** $15 USD por cada usuario activo que registre el cliente en tu app.
- **Uso Escalonado (Tiered/Metered):** Cobro dinámico por consumo (ej. Los primeros 1,000 correos son gratis, los siguientes cuestan $0.05c c/u).

El sistema intentará hacer el cargo a la tarjeta del cliente automáticamente al renovarse el ciclo. Si la tarjeta falla, activará un proceso de *Dunning* (Recordatorios de Cobranza), reintentando el cargo los días 3, 5 y 7. Si fracasa finalmente, cancelará la membresía y te enviará un webhook para que cortes el acceso en tu app.
