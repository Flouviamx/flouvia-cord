---
title: "Reportar vulnerabilidades"
description: "Cómo funciona nuestro programa de Bug Bounty y divulgación responsable."
category: "Seguridad y Privacidad"
order: 3
---

En Cord creemos que la seguridad es un esfuerzo colectivo. Operamos un programa privado de divulgación responsable (Bug Bounty Program) para investigadores de ciberseguridad.

### Alcance del Programa

Los siguientes dominios y activos están dentro del alcance para pruebas de penetración:
- `cordhq.app` (aplicación web principal y la API en `cordhq.app/api`)
- El cotizador embebible (Cord Elements: `/embed`, `/q` y el paquete `@flouviahq/elements`).

**Fuera del alcance:** Denegación de Servicio Volumétrica (DDoS), Ingeniería Social contra empleados de Flouvia, y ataques físicos a nuestros servidores en AWS/Vercel.

### Cómo Reportar un Fallo

Si has encontrado un fallo de seguridad (ej. Inyección SQL, XSS, Bypass de Autenticación, Elevación de Privilegios):
1. Detén inmediatamente cualquier prueba que comprometa datos de otros usuarios.
2. Escribe un reporte detallado con pasos de reproducción precisos y una prueba de concepto (PoC).
3. Envía un correo encriptado por GPG a `security@flouvia.com`.

Nuestro equipo interno de DevSecOps te responderá en menos de 24 horas y, dependiendo de la criticidad calculada mediante la calculadora CVSS v3.1, se te ofrecerá una recompensa económica sustancial.
