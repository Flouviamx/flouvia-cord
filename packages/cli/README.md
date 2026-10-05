# @flouviahq/cli

CLI de desarrollo de [Cord](https://cordhq.app). Trabaja solo con llaves de prueba (`sk_test_`): nada de lo que hagas toca datos reales.

```bash
npm install -g @flouviahq/cli
cord login
cord init      # detecta tu framework y deja el webhook verificado y el proxy listos
```

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
