---
title: "Usar la API de Cord desde Node.js"
description: "Cómo llamar la API REST de Cord desde tu backend de Node.js o TypeScript, con o sin el SDK oficial."
category: "Desarrolladores"
---

El SDK oficial para tu backend es `@flouviahq/node`. Es un paquete aparte de Cord Elements (que vive en el navegador), sin dependencias, y corre en Node 20+, Bun, Deno, Cloudflare Workers y Vercel. Si usabas `@flouviahq/elements/server` con `CordAPI`, sigue funcionando, pero ya no recibe cambios.

### Instalación

```bash
npm install @flouviahq/node
```

### Crear y listar

```typescript
import { Cord, CordError } from '@flouviahq/node';

const cord = new Cord(process.env.CORD_SECRET_KEY!); // sk_live_..., sk_test_... o rk_...

try {
  const quote = await cord.quotes.create({
    cliente: { empresa: 'Acme', email: 'compras@acme.mx' },
    items: [{ descripcion: 'Instalación', cantidad: 1, precio_unitario: 12500, tax_rate: 0.16 }],
    base_currency: 'MXN',
  });
  console.log(quote.folio, quote.link_publico);
} catch (err) {
  if (err instanceof CordError) console.error(err.code, err.requestId);
}

for await (const invoice of cord.invoices.listAll({ estado: 'open' })) {
  console.log(invoice.numero, invoice.saldo);
}
```

El SDK reintenta solo los errores de red, 429 y 5xx, y cada operación lleva una `Idempotency-Key` que se repite en sus reintentos: nunca crea dos veces lo mismo.

### Verificar webhooks

```typescript
import { constructEvent } from '@flouviahq/node';

export async function POST(req: Request) {
  const event = await constructEvent(await req.text(), req.headers, process.env.CORD_WEBHOOK_SECRET!);
  // event.event: 'quote.approved', 'invoice.paid', ...
  return new Response('ok');
}
```

Pásale el cuerpo **crudo** de la petición. Un aviso con la firma alterada o con más de 5 minutos de antigüedad se rechaza. Para probarlos en tu máquina, usa `cord listen` del [CLI](/docs/desarrolladores/herramientas/cli).

### Sin el SDK

La API de Cord es REST estándar, así que también puedes llamarla con `fetch`:

```typescript
const res = await fetch('https://cordhq.app/api/v1/cotizaciones', {
  headers: { Authorization: `Bearer ${process.env.CORD_SECRET_KEY}` },
});
const body = await res.json();
if (!res.ok) throw new Error(`${body.code}: ${body.error} (${body.request_id})`);
```

**Recuerda:**
- Los importes van en la unidad de la divisa del documento (`1500` en MXN es $1,500.00), no en centavos, y siempre con su divisa.
- Crear cotizaciones, clientes o productos requiere una llave con permiso de **escritura**. Una llave restringida (`rk_`) solo puede tocar los recursos que le diste.
- Si reintentas una creación por tu cuenta, manda el mismo header `Idempotency-Key` en cada intento.
