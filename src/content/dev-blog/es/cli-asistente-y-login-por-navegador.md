---
title: "cord login sin copiar llaves, y un asistente que integra Cord por ti"
description: "Cómo construimos el flujo de dispositivo del CLI de Cord, por qué la terminal recibe una llave restringida de un solo uso y qué hace el asistente de npx @flouviahq/cli."
date: "2026.10.06"
type: "DOCS"
topic: "DX"
authors:
  - "CORD ENG"
readTime: "8 MIN"
featured: true
---
El primer contacto con una plataforma de pagos suele ser el peor: entrar al panel, encontrar la sección de llaves, copiar una cadena de 50 caracteres, pegarla en un `.env` y esperar no haberla subido a GitHub. Queríamos que con Cord fuera un comando:

```bash
npx @flouviahq/cli
```

## El flujo de dispositivo

`cord login` usa el mismo patrón que la televisión cuando te pide entrar desde tu teléfono (el flujo de dispositivo del RFC 8628):

1. La terminal pide un código a `POST /api/cli/login`. Cord genera dos cosas: un **device code** de 32 bytes aleatorios que solo conoce la terminal, y un **user code** corto, como `WXYZ-2346`, para que lo veas tú.
2. La terminal abre tu navegador en `/app/cli/autorizar?codigo=WXYZ-2346`. Ahí, con tu sesión normal de Cord, confirmas que el código es el mismo que ves en la terminal y pulsas **Autorizar**.
3. Mientras tanto la terminal pregunta cada dos segundos a `POST /api/cli/login/claim` con su device code. En cuanto apruebas, recibe la llave.

Algunas decisiones que no son obvias:

- **En la base solo vive el sha256 del device code.** Si alguien leyera la tabla, no podría reclamar nada.
- **El user code no usa letras que se confundan** al dictarlas (0 y O, 1, I y L, 5 y S). Son 8 caracteres de un alfabeto de 25.
- **La tabla no tiene políticas de acceso.** Tiene seguridad a nivel de fila forzada y ninguna política, así que ninguna consulta directa la ve. Solo se toca por cuatro funciones `security definer` acotadas: crear, buscar, decidir y reclamar.
- **La llave se entrega una sola vez.** Se guarda cifrada hasta que la terminal la reclama; en ese momento el registro pasa a `reclamado` y el secreto se borra. El código vence en 10 minutos.
- **La terminal solo abre en el navegador una dirección del mismo origen que la API.** El servidor no decide a qué sitio te manda.

## Una llave que no puede hacer daño

La terminal no recibe una llave de administrador. Recibe una **llave restringida de prueba** (`rk_test_`) con tres permisos: usar los simuladores, leer eventos y proponer configuraciones. Vence en 90 días y aparece en el panel de API como `CLI · <tu equipo>`, donde la puedes revocar.

Las llaves restringidas de Cord tienen un nivel por recurso, derivado de la ruta. Una ruta nueva de la API nace prohibida para ellas hasta que alguien decide a qué recurso pertenece, y un test falla si una ruta queda sin recurso.

Como las llaves de prueba cuentan contra el límite del plan, **reconectar el mismo equipo revoca la llave anterior** de ese equipo. Una terminal, una llave.

## Una sola autorización para todo

Tu proyecto también necesita una llave para que su servidor hable con Cord. Cuando el asistente va a integrar un proyecto, la pantalla de autorizar muestra una casilla más: **"Crear también una llave para este proyecto"**. Si la dejas marcada, Cord crea una Secret Key de prueba, la cifra junto con la del CLI y las entrega juntas una sola vez. El asistente la escribe en tu `.env.local`.

Si tu plan ya no tiene lugar para otra llave, el CLI igual queda conectado y la página te lo dice; nada se rompe a medias.

## El asistente

Sin comando, el CLI abre un asistente con menús, indicadores de progreso y un resumen final. Paso a paso:

1. **Conecta la terminal** con el flujo de arriba.
2. **Te pregunta qué hacer**: configurar la cuenta con IA, integrar el proyecto y probar webhooks.
3. **Configura tu cuenta**: lee tu sitio y tu lista de precios, te muestra la propuesta y espera a que la apruebes en el navegador.
4. **Integra el proyecto**: detecta el framework (Next.js, Astro, Express, Laravel, Django, Flask o FastAPI), te muestra exactamente qué va a hacer y, si aceptas, instala el SDK con tu gestor de paquetes y crea dos rutas: la que verifica la firma de cada webhook y un proxy para Cord Elements.
5. **Escucha webhooks**: abre una sesión de prueba, guarda su secreto en tu `.env.local` y reenvía cada evento a tu servidor local.

Tres reglas que el asistente nunca rompe:

- **No sobrescribe archivos.** Si la ruta ya existe, la deja y te avisa.
- **Solo escribe llaves en un archivo de entorno que git ignora.** Si no encuentra uno, no escribe nada y te dice qué variable agregar.
- **No toca las demás líneas de tu `.env`.** Actualiza o agrega solo las variables de Cord.

```text
◆  Esto es lo que voy a hacer
│  +  instalar    @flouviahq/node @flouviahq/elements  · con npm
│  +  crear       app/api/webhooks/cord/route.ts       · verifica la firma de cada webhook
│  +  crear       app/api/cord/[...path]/route.ts      · proxy seguro para Cord Elements
│  ~  escribir    .env.local                           · CORD_SECRET_KEY de prueba
```

## Sin dependencias

La interfaz usa `@clack/prompts`, pero el paquete publicado no depende de nada: esbuild lo empaqueta junto con el resto en un solo archivo al compilar. Instalar el CLI no trae un árbol de dependencias nuevo a tu máquina.

## Pruébalo

```bash
npx create-next-app@latest mi-tienda --ts --app
cd mi-tienda
npx @flouviahq/cli
```

Al terminar, `npm run dev` en una terminal y `npx @flouviahq/cli trigger quote.approved` en otra: el evento llega a tu ruta, firmado, y la terminal te muestra el 200.
