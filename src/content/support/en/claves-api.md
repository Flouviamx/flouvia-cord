---
title: "[EN] Autenticación y Claves API (API Keys)"
description: "Aprende a generar y autenticar tus peticiones a la API REST de Cord."
category: "Developers"
order: 1
---

Tus Claves de API son la puerta de entrada a tu cuenta. Trátalas con el mismo cuidado que la contraseña de tu base de datos.

### Entornos (Live vs Test)

En la sección **Desarrolladores > Claves API** encontrarás dos pares de llaves:
- **Test Mode (`sk_test_...`):** Úsalas para desarrollar. No generan cargos reales a tarjetas ni timbran facturas reales ante el SAT (las simulan).
- **Live Mode (`sk_live_...`):** Úsalas en tu entorno de producción. Todo cargo es real y todo CFDI tiene validez legal.

### Rotación de Llaves
Si sospechas que tu llave secreta se ha filtrado (ej. se subió por error a GitHub):
1. Ingresa inmediatamente al panel de Claves API.
2. Haz clic en el botón de los tres puntos junto a tu llave viva y selecciona **"Rotar Clave (Roll Key)"**.
3. El sistema te dará una llave nueva al instante y tienes la opción de que la vieja deje de funcionar de inmediato, o darle un periodo de gracia de 24 horas para que actualices tus servidores sin tirar tu aplicación en producción.
