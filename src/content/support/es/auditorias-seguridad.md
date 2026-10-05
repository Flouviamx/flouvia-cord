---
title: "Seguridad para equipos de cumplimiento"
description: "Qué controles de seguridad tiene Cord y cómo pedir información para un cuestionario o una revisión de proveedor."
category: "Seguridad y Privacidad"
---

Si tu equipo de TI o de cumplimiento está evaluando a Cord como proveedor, esto es lo que puedes revisar hoy.

### Controles documentados

La página [Seguridad](/docs/desarrolladores/esenciales/seguridad) describe con detalle técnico lo que Cord hace hoy: cifrado de secretos con AES-256-GCM, contraseñas con Argon2id, HTTPS obligatorio con HSTS, aislamiento entre organizaciones, llaves de API restringidas por recurso y por IP, webhooks firmados, bitácora de auditoría y plazos de retención.

### Tarjetas de pago

Cord no recibe ni guarda números de tarjeta ni CVC. Los captura el formulario del procesador de pagos en su propio dominio, y es ese procesador quien opera bajo PCI-DSS.

### Certificaciones y auditorías externas

Cord no tiene hoy una certificación como SOC 2 o ISO 27001 ni un reporte de pruebas de penetración de un tercero que podamos compartir. Cuando los tengamos, los publicaremos aquí.

### Cuestionarios de seguridad

Si necesitas completar un cuestionario de seguridad o de proveedor, escríbenos a `soporte@flouvia.com` y lo respondemos con base en los controles que existen hoy. Para reportar una falla, usa [Reportar vulnerabilidades](/soporte/reportar-vulnerabilidades).
