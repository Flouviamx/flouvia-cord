---
title: "Conectar Claude, Cursor u otra IA con Cord (MCP)"
description: "Cómo darle a un asistente de IA acceso a tus cotizaciones, facturas y cobranza con el servidor MCP de Cord, y qué puede hacer."
category: "Desarrolladores"
---

El servidor MCP de Cord conecta asistentes como Claude Desktop, Claude Code o Cursor con los datos de tu negocio. La IA puede consultar, y si se lo permites, también crear y enviar.

### Conectarlo

1. Ve a **Ajustes > MCP** y copia el bloque de configuración para tu cliente (Claude Desktop, Cursor o URL directa).
2. Usa una llave de API: de **lectura** si solo quieres que consulte, de **escritura** si quieres que también cree borradores o envíe cotizaciones.
3. Antes de conectar nada, puedes probar cualquier herramienta de lectura en el probador de esa misma pantalla.

### Qué puede hacer

Son 26 herramientas. Algunas de las más útiles:

- **Consultar:** cotizaciones, facturas y su saldo, cartera vencida, clientes, productos, historial de eventos y un resumen del negocio.
- **Crear y enviar** (llave de escritura): cotizaciones y facturas en borrador, enviar una cotización, marcarla aprobada o pagada, dar de alta clientes, tareas y promesas de pago.
- **Configurar tu cuenta:** `proponer_configuracion` arma tu perfil, impuestos y catálogo desde tu sitio y te comparte un link para aprobarlo. La IA nunca lo aplica sola.
- **Ayudar a integrar:** busca en la documentación, valida un RFC o NIF antes de guardarlo y dispara webhooks de prueba (solo con llave de prueba).

### Lo que conviene saber

- **Las acciones que llegan al cliente** (enviar, aprobar, rechazar, registrar pago) están marcadas como de efecto real: un cliente MCP bien configurado te pide confirmación antes de ejecutarlas.
- **Ninguna herramienta timbra facturas** ni cambia ajustes de tu cuenta directamente.
- **Lo que escribe tu cliente** en el link público le llega a la IA marcado como mensaje externo, para que no lo siga como instrucción.
- **Cada llamada cuenta** como una petición de API de tu plan y aparece en el registro de actividad.

Detalle técnico en la [guía del servidor MCP](https://docs.cordhq.app/docs/desarrolladores/herramientas/mcp).
