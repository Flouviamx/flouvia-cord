# Cord para n8n

Nodo comunitario de n8n construido sobre la API pública v1 de Cord. Es JavaScript
plano a propósito: n8n carga los archivos que declara `package.json`, así que no
hay paso de compilación que mantener ni un `dist` que se pueda quedar viejo.

## Qué incluye

- **Credencial Cord API**: llave secreta (`sk_live_` o `sk_test_`), guardada como
  contraseña y probada contra `GET /v1/me`.
- **Cord Trigger**: n8n registra el webhook en Cord al activar el flujo y lo borra
  al desactivarlo. Verifica `X-Cord-Signature-V1` con el cuerpo crudo, acepta las
  dos firmas de una rotación de secreto y descarta entregas fuera de tolerancia.
- **Cord**: clientes (crear, actualizar, obtener, buscar), cotizaciones (crear,
  obtener, buscar, enviar, marcar pagada) y tareas (crear).

## Desarrollo

```bash
npm test          # estructura del paquete, catálogo de eventos y firma
npm run sync      # recopia el catálogo de eventos desde integrations/zapier
```

El catálogo de eventos vive en `integrations/zapier/lib/events.js` y aquí se lleva
una copia, porque este paquete se publica solo a npm. El test falla si las dos
listas se separan.

## Publicar

```bash
npm publish --access public
```

Para que aparezca en el buscador de nodos comunitarios de n8n, el paquete debe
llamarse `n8n-nodes-cord` y llevar la keyword `n8n-community-node-package`, que ya
están en `package.json`. Quien lo publique necesita una cuenta de npm con acceso a
ese nombre.
