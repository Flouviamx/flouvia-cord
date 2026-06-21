---
title: "Cord Node.js SDK"
description: "Instalación y uso de @cord/node en tu backend."
category: "Desarrolladores"
---

Para desarrolladores backend que utilizan Node.js o TypeScript, hemos creado una librería oficial que encapsula toda la lógica de autenticación, serialización y manejo de errores de nuestra API.

### Instalación

```bash
npm install @flouviamx/cord-node
# o con yarn
yarn add @flouviamx/cord-node
```

### Uso y Tipado Estricto (TypeScript)

El SDK provee autocompletado nativo e inferencia de tipos para todos los payloads de petición y respuesta.

```typescript
import Cord from '@flouviamx/cord-node';

const cord = new Cord(process.env.CORD_SECRET_KEY);

async function crearCotizacion() {
  try {
    const quote = await cord.quotes.create({
      customer_id: 'cus_123',
      currency: 'mxn',
      line_items: [
        { name: 'Horas de Desarrollo', quantity: 10, unit_price: 150000 }
      ]
    });
    console.log(quote.hosted_url);
  } catch (error) {
    if (error.type === 'CordInvalidRequestError') {
      console.error(error.message);
    }
  }
}
```

El SDK utiliza internamente `keep-alive` TCP y reintentos exponenciales bajo el capó para mitigar errores de red transitorios (502, 503, 504).
