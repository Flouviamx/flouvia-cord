---
title: "La interfaz"
description: "Navega el modulo de Presupuestos de Cord: creacion de cedulas, modales, duplicacion, escenarios y limites de tu plan freemium."
---

<header class="content-header">
  <h1 class="page-title">La interfaz</h1>
  <p class="page-subtitle">Aprende a navegar por el modulo de Presupuestos: creacion, duplicacion, estados y los limites de tu plan.</p>
</header>

La interfaz del modulo de presupuestos de Cord esta organizada en dos ecosistemas principales: Cedulas (presupuestos maestros por periodo) y Herramientas (calculadoras de analisis financiero como VPN, TIR y EOQ). La creacion de un presupuesto sigue un flujo guiado de dos pasos que elimina el lienzo en blanco.

*Ultima actualizacion: julio 2026*

## Navegación principal

El módulo de Presupuestos en Cord está dividido en dos grandes ecosistemas (puedes alternar entre ellos usando las pestañas superiores):

1. **Cédulas:** Tu lista principal de presupuestos maestros guardados. Aquí es donde planeas tus meses.
2. **Herramientas:** Calculadoras de análisis financiero rápido (Evaluación de Proyectos, Inventarios y Variaciones) para la toma de decisiones. *(Disponible a partir del Plan Profesional)*.

## Creando un presupuesto

Al presionar el botón **+ Nuevo presupuesto**, se abrirá un modal de dos pasos diseñado para que no tengas que empezar con un lienzo en blanco.

**Paso 1: Elige el tipo**  
Cord te presentará un menú visual con el *Plan Financiero Completo* (Nuestra recomendación principal) y las 7 plantillas individuales (Ventas, Producción, Efectivo, etc.).

**Paso 2: Define el horizonte**  
En el segundo paso, nombrarás tu cédula y elegirás los **periodos a planear**. Cord incluye botones rápidos para pre-rellenar los campos con un *Trimestre*, *6 meses* o el *Año completo*. 

> **Pro Tip:**
> Los periodos deben escribirse en el formato `Mes Año` separados por comas (ej. *Ene 2026, Feb 2026*). Esto es crucial para que el sistema pueda emparejar automáticamente las columnas de tu presupuesto con tus transacciones de Stripe y mostrarte la métrica de **Presupuesto vs. Real**.

## Duplicar cédulas

¿Quieres modelar un escenario optimista vs. uno pesimista? ¿O tal vez ya se acabó el año y necesitas presupuestar el siguiente? El botón de **Duplicar** (el icono de copiado a la derecha de cada cédula) es tu mejor amigo.

Al hacer clic, Cord te dará dos opciones:
- **Mismos periodos:** Crea una copia exacta (ej. Ene 2026 a Dic 2026). Útil para modelar un "Escenario Pesimista" sin romper el original.
- **Recorrer al año siguiente (`shiftYears`):** La magia de Cord. Copiará toda tu estructura de filas, fórmulas y valores, pero recorrerá mágicamente todos los encabezados de columna al año próximo (ej. Ene 2026 se convierte en Ene 2027). Así, el año nuevo comienza fresco y listo para compararse contra la realidad, sin perder una sola de tus reglas de negocio.

## Límites de tu plan (Freemium)

Cord democratiza la planeación financiera, pero protege el poder computacional intensivo para los clientes de pago.

- **Plan Gratuito:** Tienes derecho a crear y mantener **1 Cédula activa**. Ideal para presupuestar un proyecto en específico.
- **Plan Starter:** El límite se amplía a **3 Cédulas**.
- **Plan Profesional:** Desbloquea **Cédulas ilimitadas**, acceso al Wizard de **Plan Financiero Completo** (la cascada automática), habilita la conexión en vivo de **Presupuesto vs. Real**, y te da acceso completo a la pestaña de **Herramientas de Análisis**.
