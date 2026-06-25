---
title: "Manejar múltiples empresas"
description: "Alterna entre distintas razones sociales desde una sola cuenta."
category: "Cuenta y Equipo"
---

Muchos corporativos operan a través de distintas entidades legales (RFCs) según la línea de negocio o el estado geográfico. Cord soporta arquitectura Multi-Tenant de forma nativa.

### Gestión Multi-Organización

Con un solo correo electrónico y contraseña (Single Sign-On de tu cuenta base), puedes ser administrador de múltiples empresas en Cord.

1. En tu panel izquierdo superior, haz clic en el nombre de tu empresa actual.
2. Selecciona **Añadir nueva Organización**.
3. Se desplegará un flujo de configuración fiscal virgen.

**Niveles de Aislamiento:**
Cada organización es una bóveda de datos 100% aislada. Tienen sus propios clientes, sus propias cotizaciones, sus propias llaves de API (`sk_live_...`), su propia configuración fiscal y **su propio CSD para timbrar bajo su RFC** (cada org es una organización independiente en Facturapi). Los cobros con tarjeta de cada org pasan por su propia cuenta de Stripe; Cord no dispersa fondos.

Para cambiar de contexto, simplemente utiliza el menú desplegable superior. El cambio es instantáneo y no requiere recargar la página.
