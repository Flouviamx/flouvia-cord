// app/api/cord/cotizaciones/route.ts — el proxy que <CordProvider proxyUrl>
// apunta. La sk_... vive SOLO aquí (variable de entorno de servidor, nunca
// prefijada NEXT_PUBLIC_) — el navegador nunca la ve.
import { CordAPI } from '@flouviahq/elements/server';

const cord = new CordAPI(process.env.CORD_SECRET_KEY);

export async function POST(req: Request) {
  const body = await req.json();

  try {
    // Reenvía tal cual — el SDK del navegador ya arma el payload real
    // (cliente_id o el bloque `cliente` para find-or-create, items, notas,
    // términos, moneda, iva_incluido...). Aquí es donde agregarías tu propia
    // lógica de negocio (validar sesión, inyectar el vendedor, etc.) antes
    // de reenviar a Cord.
    const quote = await cord.quotes.create(body);
    // quote.token / quote.folio / quote.link_publico ya llegan definidos y
    // link_publico ya es absoluto — no hace falta parsearlo a mano.
    return Response.json(quote);
  } catch (err: any) {
    return Response.json({ error: err?.message ?? 'Error al crear la cotización' }, { status: err?.status ?? 500 });
  }
}
