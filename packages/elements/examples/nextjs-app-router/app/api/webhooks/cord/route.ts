// app/api/webhooks/cord/route.ts — verifica webhooks salientes de Cord
// (configúralos en Ajustes › Developers → Webhooks, apuntando aquí).
import { CordAPI } from '@flouviahq/elements/server';

const cord = new CordAPI(process.env.CORD_SECRET_KEY);

export async function POST(req: Request) {
  const body = await req.text();

  let event;
  try {
    // req.headers ya es un Headers real — constructEvent lo acepta directo.
    event = cord.webhooks.constructEvent(body, req.headers, process.env.CORD_WEBHOOK_SECRET!);
  } catch (err) {
    return new Response('Firma inválida', { status: 400 });
  }

  switch (event.event) {
    case 'quote.paid':
      // event.data: { id, folio, status, total, cliente, link_publico }
      console.log(`Cotización ${event.data.folio} pagada — $${event.data.total}`);
      break;
    case 'quote.approved':
      console.log(`Cotización ${event.data.folio} aprobada`);
      break;
    // quote.sent · quote.viewed · quote.rejected · invoice.stamped · ping
  }

  return new Response('ok');
}
