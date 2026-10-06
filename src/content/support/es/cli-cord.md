---
title: "Usar el CLI de Cord"
description: "Conecta tu terminal desde el navegador, configura tu cuenta, integra tu proyecto y prueba webhooks en tu máquina."
category: "Desarrolladores"
---

El CLI de Cord (`@flouviahq/cli`) es la herramienta de terminal para integrar Cord en tu proyecto. Solo trabaja en **modo prueba**: nada de lo que hagas con él toca datos reales.

### La forma más rápida: el asistente

```bash
npx @flouviahq/cli
```

Te guía paso a paso con menús: conecta tu terminal, configura tu cuenta con IA, integra tu proyecto (instala el SDK, crea las rutas y guarda las llaves en tu `.env.local`) y deja los webhooks escuchando. Al final te muestra un resumen de lo que quedó listo.

### Instalar e iniciar sesión

```bash
npm install -g @flouviahq/cli
cord login
```

`cord login` abre tu navegador con un código de confirmación. Revisa que sea el mismo que ves en la terminal y pulsa **Autorizar**. Necesitas permiso de Ajustes en la empresa. La terminal recibe sola una llave de prueba restringida: puede usar los simuladores, leer eventos y proponer configuraciones, y vence en 90 días. Aparece en el dock de **Desarrolladores › API** como `CLI · <tu equipo>`, donde puedes revocarla.

- ¿Trabajas por SSH sin navegador? `cord login --no-browser` imprime la dirección para abrirla en otro equipo.
- ¿Prefieres pegar una llave tuya? `cord login --api-key`.

### Los comandos principales

| Comando | Para qué |
|---|---|
| `cord setup` | Propone la configuración de tu cuenta a partir de tu sitio y tu lista de precios. La apruebas en el navegador. |
| `cord init` | Detecta tu framework y deja la ruta de webhooks con la firma verificada. |
| `cord listen --forward-to http://localhost:3000/api/webhooks/cord` | Reenvía los webhooks de prueba a tu servidor local. |
| `cord trigger quote.approved` | Dispara un evento de prueba. |
| `cord simulate fiscal pac_caido` | La próxima factura de prueba falla como si el PAC no respondiera. |
| `cord events tail` | Muestra los eventos conforme ocurren. |
| `cord whoami` / `cord logout` | Muestra la empresa conectada / borra la llave guardada. |

### Problemas comunes

- **"El código venció":** el código dura 10 minutos. Vuelve a correr `cord login`.
- **"Esa es una llave en vivo":** el CLI rechaza llaves `sk_live_` a propósito. Usa una de prueba.
- **No ves la pantalla de autorizar:** tu usuario necesita el permiso de Ajustes en la empresa. Pídeselo al administrador.

Más detalle en la [guía del CLI](https://docs.cordhq.app/docs/desarrolladores/herramientas/cli).
