---
title: "Usar la API de Cord desde Node.js"
description: "Cómo llamar la API REST de Cord desde tu backend de Node.js o TypeScript, con o sin el SDK oficial."
category: "Desarrolladores"
---

Cord publica un SDK oficial de Node.js/TypeScript dentro del mismo paquete que usa el frontend: `@flouviahq/elements`. Su punto de entrada `/server` expone un cliente REST tipado (`CordAPI`) y el verificador de firmas de webhooks — no necesitas instalar un paquete aparte para tu backend.

### Instalación

```bash
npm install @flouviahq/elements
```

### Cliente `CordAPI`

```typescript
import { CordAPI, CordError } from '@flouviahq/elements/server';

const cord = new CordAPI(process.env.CORD_SECRET_KEY); // sk_live_... o sk_test_...

try {
  const quote = await cord.quotes.create({
    cliente_id: 'id-del-cliente',   // opcional
    terminos: 'net30',
    vigencia_dias: 15,
    send: true,                     // envía el link al correo del cliente
    items: [
      { descripcion: 'Horas de desarrollo', cantidad: 10, precio_unitario: 1500 }
    ],
  });
  console.log(quote.folio, quote.link_publico); // ej. COT-0149  https://cordhq.app/q/abc123
} catch (err) {
  if (err instanceof CordError) {
    // err.code: 'invalid_request' | 'missing_key' | 'invalid_key' | 'insufficient_scope'
    //         | 'rate_limited' | 'network_error' | 'server_error' | 'unknown' | ...
    console.error(err.status, err.code, err.message);
  }
}
```

`cord.quotes`, `cord.clients` y `cord.products` exponen `create()`/`list()` sobre `/cotizaciones`, `/clientes` y `/productos` respectivamente; `link_publico` en la respuesta ya viene absoluto (no hace falta anteponer el dominio).

### Verificar webhooks con el mismo cliente

El SDK trae el verificador de firma listo para usar (ver [Verificar firmas de webhooks](/soporte/firmas-webhooks) para el detalle del mecanismo):

```typescript
// Ejemplo con un Route Handler de Next.js
export async function POST(req: Request) {
  const body = await req.text();
  try {
    const event = cord.webhooks.constructEvent(body, req.headers, process.env.CORD_WEBHOOK_SECRET!);
    if (event.event === 'quote.paid') { /* ... */ }
    return new Response('ok');
  } catch {
    return new Response('Firma inválida', { status: 400 });
  }
}
```

### Sin el SDK

La API de Cord es REST estándar, así que también puedes llamarla directamente con `fetch` (incluido en Node 18+) sin instalar nada:

```typescript
const BASE = 'https://cordhq.app/api/v1';

async function cord(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${process.env.CORD_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Cord API ${res.status}`);
  return body;
}
```

**Recuerda:**
- Los montos van en **pesos** (`1500` = $1,500.00), no en centavos.
- Crear cotizaciones, clientes o productos requiere una llave con alcance de **escritura**.
