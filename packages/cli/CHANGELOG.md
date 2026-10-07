# Changelog

## 1.2.1

- `cord init` en Laravel, Django, Flask y FastAPI deja un verificador de firma sin dependencias en lugar de sugerir los SDK de PHP y Python, que todavía no están publicados.

## 1.2.0

- `npx @flouviahq/cli` sin comando abre el asistente: conecta la terminal, configura la cuenta con IA, integra el proyecto (instala el SDK con tu gestor de paquetes, crea las rutas y escribe el `.env`) y deja los webhooks escuchando, con menús, indicadores de progreso y un resumen final.
- Al autorizar desde el asistente, Cord puede crear también una Secret Key de prueba para el proyecto y el asistente la guarda en tu archivo de entorno ignorado por git.
- `cord listen` guarda el secreto de la sesión con `--env-file .env.local`.
- Reconectar el mismo equipo revoca su llave anterior del CLI.
- Todos los comandos con la nueva interfaz; sigue sin dependencias en tiempo de ejecución.

## 1.1.0

- `cord login` inicia sesión desde el navegador con un código de confirmación: la terminal recibe una llave restringida de prueba (90 días) sin copiar nada. `--no-browser` imprime la dirección; `--api-key` sigue aceptando una llave pegada.
- Nuevo `cord setup`: propone la configuración de la cuenta (perfil, marca, impuestos, catálogo y plantillas) a partir de tu sitio, una descripción y tu lista de precios. Se aprueba en el navegador y la terminal muestra el resultado.
- `cord init` sugiere `cord setup` cuando la cuenta todavía está vacía.
- El navegador solo se abre con direcciones del mismo origen que la API.

## 1.0.0

- `cord init`, `login`, `listen`, `trigger`, `simulate` y `events tail`.
