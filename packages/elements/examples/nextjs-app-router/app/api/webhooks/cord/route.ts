// app/api/webhooks/cord/route.ts — verifica los webhooks de Cord con el cuerpo crudo.
// En desarrollo: cord listen --forward-to http://localhost:3000/api/webhooks/cord
import { constructEvent, CordWebhookSignatureError } from '@flouviahq/node';

export async function POST(req: Request) {
  let event;
  try {
    event = await constructEvent(await req.text(), req.headers, process.env.CORD_WEBHOOK_SECRET!);
  } catch (err) {
    if (err instanceof CordWebhookSignatureError) return new Response('Firma inválida', { status: 400 });
    throw err;
  }

  switch (event.event) {
    case 'quote.paid':
      console.log(`Cotización ${event.data.folio} pagada: ${event.data.total} ${event.data.moneda}`);
      break;
    case 'invoice.paid':
      console.log(`Factura ${event.data.numero} pagada; saldo ${event.data.saldo} ${event.data.moneda}`);
      break;
    case 'payment.partial':
      console.log(`Anticipo de ${event.data.monto}; faltan ${event.data.saldo_pendiente}`);
      break;
  }
  return new Response('ok');
}
