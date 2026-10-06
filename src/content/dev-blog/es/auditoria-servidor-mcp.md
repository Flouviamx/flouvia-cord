---
title: "Auditamos nuestro servidor MCP: lo que encontramos y cómo lo arreglamos"
description: "Una escalada de permisos en el transporte SSE, un contrato de salida que no se cumplía, importes sin divisa y siete herramientas nuevas. La auditoría completa del servidor MCP de Cord."
date: "2026.10.06"
type: "BLOG"
topic: "Security"
authors:
  - "CORD ENG"
readTime: "7 MIN"
---
El servidor MCP de Cord conecta asistentes como Claude o Cursor con los datos reales de un negocio: cotizaciones, facturas, cartera vencida. Con una llave de escritura, también envía cotizaciones y registra pagos. Es decir: un modelo de lenguaje actuando con las credenciales de una empresa. Lo auditamos de punta a punta y esto es lo que salió.

## 1. Una llave de lectura podía escribir

Cord expone MCP por dos transportes: HTTP sin estado (`POST /api/mcp`) y el SSE heredado (`GET /api/mcp/sse` para abrir la sesión y `POST /api/mcp/message` para mandar mensajes). La sesión SSE guarda la organización, la llave y el permiso con que se abrió.

El problema estaba en `/api/mcp/message`. Comprobaba que la llave que manda el mensaje fuera **de la misma organización** que la sesión, y después ejecutaba la herramienta con el **permiso guardado en la sesión**. Una llave de solo lectura de la misma empresa que conociera un sessionId podía ejecutar herramientas de escritura con la sesión de otra llave.

El arreglo es una línea, pero es la línea correcta: la sesión pertenece a una llave, no a una organización.

```ts
if (session.orgId !== auth.orgId || session.keyId !== auth.keyId) {
  return rpcErrRes(null, -32001, 'Esta API key no corresponde a la sesión.', 403);
}
// y se ejecuta con auth.scope, el permiso de quien llama, no el de la sesión
```

Tiene su test: una llave de lectura con el sessionId de una de escritura recibe 403 y la herramienta no se ejecuta.

## 2. Un contrato de salida que no se cumplía

Las 19 herramientas declaraban `outputSchema`. En la versión 2025-06-18 del protocolo, declararlo obliga a devolver `structuredContent` que cumpla ese esquema. Cord devolvía solo texto. Además, los esquemas tenían `additionalProperties: false` y un `next_cursor` tipado como string que en realidad puede ser `null`: un cliente que valida habría rechazado respuestas correctas.

Ahora toda herramienta responde con las dos cosas: `structuredContent` para el cliente que valida, y el mismo JSON compacto como texto para el que no. Los esquemas de salida son abiertos: un campo nuevo no rompe a nadie. Y el texto ya no va indentado, lo que ahorra tokens en cada llamada.

## 3. Importes sin divisa

Cord tiene una regla: un monto sin divisa es un número, no dinero. Las herramientas de cotizaciones, productos y clientes devolvían `total: 12500` sin decir de qué. Un agente que asume pesos le reporta mal a un negocio que vende en dólares. Hoy cada importe viaja con su `moneda`.

## 4. Errores que no llegaban al modelo

Una herramienta de cobranza lanzaba un error genérico cuando el plan no la incluía. El servidor lo trataba como fallo interno y el modelo recibía "Error interno del servidor", sin forma de explicarle al usuario qué pasaba. Encima el mensaje nombraba el plan equivocado. Ahora los límites de plan se reportan como error de negocio, con el nombre del plan que de verdad se necesita, leído del mismo contrato que usa el resto de Cord.

De paso encontramos que el índice de la documentación devolvía el stack trace completo cuando fallaba. Ya no.

## 5. Siete herramientas nuevas

Pasamos de 19 a 26. Las nuevas están pensadas para que un agente pueda integrar Cord, no solo operarlo:

| Herramienta | Para qué |
|---|---|
| `contexto_cuenta` | Negocio, país, divisa, plan y si la llave es de prueba o en vivo. La primera llamada. |
| `proponer_configuracion` | Propone perfil, impuestos y catálogo desde el sitio del negocio. Devuelve un link; una persona aprueba. |
| `estado_configuracion` | Si esa propuesta ya se aprobó, y qué se aplicó. |
| `validar_datos_fiscales` | RFC, régimen y uso de CFDI, NIF o EIN con las mismas reglas que al facturar. |
| `validar_apariencia` | Revisa un `appearance` de Cord Elements antes de ponerlo en código. |
| `simular_evento` | Dispara un webhook de prueba por el motor real. Solo con llave de prueba. |
| `buscar_documentacion` | Busca en la documentación y devuelve las páginas con extracto y URL. |

Ninguna cambia ajustes de la cuenta directamente. `proponer_configuracion` deja una propuesta que una persona aprueba en Cord, igual que la del onboarding.

## 6. Una API que se describe sola

Un agente que escribe código contra una API lee su especificación. De los 343 campos de nuestro OpenAPI, 279 no tenían descripción: el agente tenía que adivinar qué era `terminos`, si `total` incluía impuestos o en qué unidad venía `rate`.

Ahora hay un glosario, `FIELD_DOCS`, que describe cada nombre de campo de la API, y el generador lo aplica a cada propiedad sin descripción propia. El paso de CI que compara la especificación con el código falla si una propiedad o parámetro queda sin describir. Agregar un campo sin explicarlo ya no compila.

## Lo que no cambió, a propósito

- **Ninguna herramienta timbra facturas.** Crear un borrador sí; emitirlo ante la autoridad fiscal es irreversible y lo dispara una persona.
- **El texto que escribe el cliente final** en el link público le llega al modelo marcado como `cliente_externo` y delimitado, para que lo reporte y no lo siga como instrucción.
- **Las acciones que llegan al cliente** (enviar, aprobar, rechazar, registrar pago) llevan `destructiveHint`, así un cliente MCP bien configurado pide confirmación antes de ejecutarlas.

Si conectas Cord a tu asistente, pídele primero `contexto_cuenta`. Lo demás sale de ahí.
