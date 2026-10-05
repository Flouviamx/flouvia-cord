# @flouviahq/node

SDK de servidor de [Cord](https://cordhq.app). Sin dependencias: corre en Node 20+, Bun, Deno, Cloudflare Workers y Vercel.

```bash
npm install @flouviahq/node
```

```ts
import { Cord } from '@flouviahq/node';

const cord = new Cord(process.env.CORD_SECRET_KEY!); // sk_live_… o sk_test_…

const quote = await cord.quotes.create({
  cliente: { empresa: 'Acme', email: 'compras@acme.mx' },
  items: [{ descripcion: 'Instalación', cantidad: 1, precio_unitario: 12500, tax_rate: 0.16 }],
  base_currency: 'MXN',
});
console.log(quote.folio, quote.link_publico);
```

Una secret key vive solo en tu servidor. El SDK se niega a correr en un navegador.

## Idempotencia y reintentos

Cada mutación lleva una `Idempotency-Key`, la misma en todos sus reintentos: un corte de red nunca crea dos cotizaciones ni registra dos pagos. Para atar la operación a tu propio identificador:

```ts
await cord.invoices.recordPayment(id, { monto: 5000, moneda: 'MXN' }, { idempotencyKey: `pago-${tuId}` });
```

Los reintentos (red, 429, 5xx) respetan `Retry-After`. Los errores son `CordError` con `status`, `code`, `requestId` y `docUrl`.

## Listas

```ts
const page = await cord.quotes.list({ status: 'sent', limit: 50 });
for await (const invoice of cord.invoices.listAll({ estado: 'open' })) {
  // recorre todas las páginas
}
```

## Webhooks

```ts
import { constructEvent } from '@flouviahq/node';

export async function POST(req: Request) {
  const event = await constructEvent(await req.text(), req.headers, process.env.CORD_WEBHOOK_SECRET!);
  switch (event.event) {
    case 'invoice.paid':
      event.data.saldo; // TypeScript sabe que es una factura
      break;
    case 'payment.partial':
      event.data.monto;
      break;
  }
  return new Response('ok');
}
```

- Usa el cuerpo **crudo**, nunca uno ya parseado.
- Exige `X-Cord-Signature-V1` (con timestamp, 5 minutos de tolerancia). La firma legacy sin timestamp solo se acepta con `{ allowLegacySignature: true }`.
- Durante una rotación de secreto llegan dos firmas; basta con que una cuadre.
- Deduplica por `event.id`: un reintento trae el mismo id.

## Proxy para Cord Elements

Con `proxyUrl`, el navegador habla con tu backend y tu backend con Cord:

```ts
// app/api/cord/[...path]/route.ts
import { createElementsProxy } from '@flouviahq/node';

const proxy = createElementsProxy({
  secretKey: process.env.CORD_SECRET_KEY!,
  authorizeClients: async (req) => !!(await getSession(req)), // sin esto, el CRM nunca se expone
});
export const GET = proxy;
export const POST = proxy;
```

```tsx
<CordProvider proxyUrl="/api/cord">…</CordProvider>
```

El proxy se trata como un endpoint hostil: solo atiende `elements/config`, `productos`, `cotizaciones` y `clientes`, solo desde tu origen, y sanea la cotización igual que una llave publicable (no envía correos ni fija costos) salvo que `authorizeSellerFields` lo permita para esa petición.

## Datos fiscales

```ts
import { validateFiscalReceptor } from '@flouviahq/node';

const r = validateFiscalReceptor({ country: 'MX', tax_id: 'EKU9003173C9', legal_name: 'ESCUELA KEMPER URGATE', regimen_fiscal: '601', uso_cfdi: 'G03', cp_fiscal: '86991' });
if (!r.ok) console.log(r.errors);
```

Es el mismo validador que usa Cord al guardar.
