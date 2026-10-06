---
title: "Configura tu cuenta con IA"
description: "Cord lee tu sitio, tu descripción y tu lista de precios, y propone tu configuración para que la apruebes."
category: "Cuenta y Equipo"
---

En lugar de llenar Ajustes campo por campo, puedes darle a Cord tres cosas y dejar que proponga la configuración completa. Nada se aplica hasta que tú la apruebas.

### Dónde está

- **Al crear tu cuenta:** aparece justo después del alta.
- **Después:** en **Ajustes > General > Configurar con IA**.

### Qué le das

1. **Tu sitio web** (opcional): de ahí salen el nombre, el contacto, el logo y el color de tu marca.
2. **A qué se dedica tu negocio** (opcional): cómo cobras, a qué plazo y qué impuestos manejas, en tus palabras.
3. **Tu lista de precios** (opcional): Excel, CSV, PDF o foto, hasta 3 MB.

Con una basta, pero entre más le des, mejor queda.

### Qué revisas

Cord te muestra la propuesta por secciones: marca, datos del negocio, cotizaciones, impuestos, catálogo y mensajes. Puedes cambiar cualquier campo, quitar el logo y desmarcar productos. Los impuestos nuevos llegan **desmarcados**: márcalos solo si de verdad los manejas. Al pulsar **Aplicar**, Cord los guarda con las mismas validaciones que Ajustes y te muestra qué se aplicó.

### Lo que conviene saber

- **Valida antes de proponer.** Un identificador fiscal que no pasa la validación de tu país, un correo inválido o una tasa fuera de rango se descartan, y la revisión te dice por qué.
- **No sube tu certificado ni activa cobros.** El CSD en México, el certificado de Verifactu en España y Cord Payments siguen siendo pasos tuyos.
- **Límite:** hasta seis propuestas al día por empresa. Cada una vence en 7 días si no la aplicas. No consume tus créditos de IA del plan.
- **Si estás en el entorno de prueba** y abres una propuesta, Cord te pide salir: la propuesta configura tu cuenta real.

### Desde la terminal o un agente

Si trabajas con un desarrollador o con un asistente de IA, la misma propuesta se puede pedir con `cord setup` del [CLI de Cord](/soporte/cli-cord) o con la herramienta `proponer_configuracion` del [servidor MCP](/soporte/conectar-ia-mcp). En los dos casos te llega un link a esta misma revisión.
