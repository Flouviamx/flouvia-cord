# Changelog

## 1.1.0

- `cord login` inicia sesión desde el navegador con un código de confirmación: la terminal recibe una llave restringida de prueba (90 días) sin copiar nada. `--no-browser` imprime la dirección; `--api-key` sigue aceptando una llave pegada.
- Nuevo `cord setup`: propone la configuración de la cuenta (perfil, marca, impuestos, catálogo y plantillas) a partir de tu sitio, una descripción y tu lista de precios. Se aprueba en el navegador y la terminal muestra el resultado.
- `cord init` sugiere `cord setup` cuando la cuenta todavía está vacía.
- El navegador solo se abre con direcciones del mismo origen que la API.

## 1.0.0

- `cord init`, `login`, `listen`, `trigger`, `simulate` y `events tail`.
