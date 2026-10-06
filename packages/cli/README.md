# @flouviahq/cli

CLI de desarrollo de [Cord](https://cordhq.app). Trabaja solo con llaves de prueba: nada de lo que hagas toca datos reales.

```bash
npx @flouviahq/cli   # el asistente: conecta, configura e integra paso a paso
```

O comando por comando:

```bash
npm install -g @flouviahq/cli
cord login     # abre tu navegador, confirmas el código y la terminal queda conectada
cord setup     # Cord propone la configuración de tu cuenta; tú la apruebas en el navegador
cord init      # detecta tu framework y deja el webhook verificado listo
```

## Iniciar sesión

`cord login` abre tu navegador con un código de confirmación. Revisa que coincida con el de la terminal y autoriza: la terminal recibe una llave restringida de prueba (simuladores, eventos y proponer configuraciones) que vence en 90 días. Se entrega una sola vez y puedes revocarla en Desarrolladores › API.

Sin navegador, `cord login --no-browser` imprime la dirección. Para pegar una llave tuya, `cord login --api-key`.

## Configurar tu cuenta con IA

```bash
cord setup --sitio tuempresa.com --descripcion "Distribuidora de materiales" --archivo precios.xlsx
```

Sin opciones te pregunta. Cord lee tu sitio, tu descripción y tu lista de precios (`.csv`, `.xlsx`, `.pdf` o foto, hasta 3 MB) y propone perfil, marca, impuestos, catálogo y plantillas. La revisión se abre en tu navegador: nada se aplica hasta que la apruebas, y la terminal muestra el resultado.

## Webhooks en tu localhost

```bash
cord listen --forward-to http://localhost:3000/api/webhooks/cord
```

Cord no puede llegar a tu máquina, así que el CLI abre una sesión en la sandbox: los eventos pasan por el mismo motor de entrega que en producción (firma, versión de la API) y el CLI los reenvía a tu servidor con los headers de firma reales. Al arrancar imprime el secreto de la sesión: ponlo en `CORD_WEBHOOK_SECRET` y verifica con `constructEvent` de `@flouviahq/node` como en producción.

Por seguridad solo reenvía a `localhost`; para otro host usa `--allow-remote`. `--events quote.paid,invoice.paid` limita los eventos. La sesión vence en 24 horas y se cierra con Ctrl+C.

## Simular

```bash
cord trigger invoice.paid                 # dispara un evento con datos de ejemplo
cord trigger quote.approved --objeto <id> # con los datos reales de una cotización de prueba
cord simulate fiscal pac_caido            # la próxima emisión falla como si el PAC no respondiera
cord simulate quote <id> vencer           # la cotización vence
cord events tail --type quote.paid        # muestra los eventos conforme ocurren
```

La llave se guarda en `~/.config/cord/config.json` con permisos `0600`. También acepta `--api-key` o `CORD_API_KEY`.
