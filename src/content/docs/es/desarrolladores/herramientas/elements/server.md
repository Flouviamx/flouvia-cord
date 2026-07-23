---
title: "Cord Elements Server SDK"
description: "Verifica webhooks y realiza llamadas a la API de Cord de forma segura desde tu backend de Node.js o Edge."
---

<header class="content-header">
  <h1 class="page-title">Server SDK</h1>
  <p class="page-subtitle">Poder para tu backend: validación criptográfica y acceso directo a la API con tu Clave Secreta.</p>
</header>

El SDK de Cord Elements no es solo para el navegador. También expone un módulo dedicado al servidor (`@flouviahq/elements/server`) diseñado para ejecutarse en entornos de Node.js, Next.js Route Handlers, o entornos de ejecución perimetral (Edge Runtimes como Cloudflare Workers).

## Instalación

```bash
npm install @flouviahq/elements
```

## Configurar el Cliente

Importa `CordAPI` y provee tu **Clave Secreta** (`sk_live_...`).

> **Advertencia:** Nunca importes el Server SDK ni expongas tu Clave Secreta en entornos de frontend.

```ts
import { CordAPI } from '@flouviahq/elements/server';

const cord = new CordAPI(process.env.CORD_SECRET_KEY);
```

## Verificar Webhooks

Uno de los principales casos de uso del Server SDK es la verificación de firmas criptográficas (HMAC) provenientes de Cord. Esto garantiza que el webhook entrante fue emitido genuinamente por nuestros servidores y no es un atacante intentando inyectar datos falsos.

### Node.js o Next.js Route Handler

Para verificar un webhook de manera síncrona, utiliza `cord.webhooks.constructEvent()`. Debes proporcionarle el payload crudo (`raw text`), los encabezados de la petición, y tu **Secreto de Webhook** (configurable en Ajustes > Desarrolladores).

El SDK revisa automáticamente las firmas de mitigación contra ataques de repetición (Replay Attacks) verificando `X-Cord-Signature-V1` y descartando eventos antiguos mediante una tolerancia de tiempo (por defecto 300 segundos).

```ts
// app/api/webhooks/cord/route.ts
import { CordAPI } from '@flouviahq/elements/server';

const cord = new CordAPI(process.env.CORD_SECRET_KEY!);

export async function POST(req: Request) {
  // 1. Obtener el texto en bruto
  const body = await req.text();
  
  try {
    // 2. Construir y validar el evento
    const event = cord.webhooks.constructEvent(
      body, 
      req.headers, 
      process.env.CORD_WEBHOOK_SECRET!
    );
    
    // event es fuertemente tipado
    // { event: 'quote.paid', created_at: '...', data: { folio, status, ... } }
    
    if (event.event === 'quote.paid') {
      console.log(`¡La cotización ${event.data.folio} fue pagada exitosamente!`);
    }
    
    return new Response('Webhook recibido correctamente', { status: 200 });
  } catch (err) {
    // La firma es inválida o expiró
    return new Response('Firma inválida', { status: 400 });
  }
}
```

### Edge Runtimes (Cloudflare Workers, Vercel Edge)

En entornos donde el módulo nativo `node:crypto` no está disponible, el SDK expone un método alternativo basado en la API estándar `WebCrypto` (`crypto.subtle`). Utiliza `constructEventAsync()`:

```ts
const event = await cord.webhooks.constructEventAsync(
  body, 
  req.headers, 
  process.env.CORD_WEBHOOK_SECRET!
);
```

## API REST Directa

El objeto `CordAPI` expone submódulos fuertemente tipados que envuelven los métodos de nuestra API REST oficial. Todos los métodos devuelven Promesas y manejan correctamente el formato JSON.

### Crear una cotización

```ts
const quote = await cord.quotes.create({ 
  items: [
    { 
      descripcion: 'Implementación Técnica B2B', 
      cantidad: 1, 
      precio_unitario: 50000 
    }
  ] 
});

console.log('ID de la Cotización:', quote.id);
console.log('Folio Visible:', quote.folio);
console.log('Link para el Cliente:', quote.link_publico);
```

## Errores Tipados (`CordError`)

El Server SDK abandona el concepto de arrojar un `Error` genérico de JavaScript. Todos los errores provenientes de una petición de red fallida o una validación lanzarán un `CordError` estructurado.

Esto permite crear flujos de recuperación o analíticas mucho más precisas basadas en el `code`.

```ts
import { CordError } from '@flouviahq/elements/server';

try {
  await cord.quotes.create(data);
} catch (err) {
  if (err instanceof CordError) {
    console.error('Status HTTP:', err.status); // ej. 400
    console.error('Código del API:', err.code); // ej. 'invalid_request', 'rate_limited'
    console.error('Mensaje Legible:', err.message);
  }
}
```
