---
title: "Límites de peticiones (Rate limits)"
description: "Conoce los límites técnicos de la API de Cord y cómo manejar respuestas 429."
category: "Desarrolladores"
order: 4
---

# Límites de peticiones (Rate limits)

Para garantizar la estabilidad del sistema para todos nuestros usuarios, la API de Cord implementa límites de peticiones (Rate Limits).

## Límites Actuales
- Entorno de Pruebas (`Test`): 30 peticiones por segundo.
- Entorno de Producción (`Live`): 100 peticiones por segundo.

## Manejo de Excedentes
Si superas el límite, recibirás un código de estado HTTP `429 Too Many Requests`. Tu aplicación debe implementar estrategias de "Exponential Backoff" (retraso exponencial) para reintentar la petición minutos o segundos después.
