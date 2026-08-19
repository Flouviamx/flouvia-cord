// GET /api/billing/invoices/:id/pdf — descarga del comprobante de un cobro.
//
// Se PROXYA en vez de entregar el enlace del procesador. Dos razones, y ninguna
// es estética: mandar al cliente a un dominio ajeno es justo lo que este trabajo
// vino a quitar (regla 14), y un enlace firmado que sale del servidor puede
// reenviarse — el proxy exige sesión y pertenencia en cada descarga.
export const prerender = false;

import type { APIRoute } from 'astro';
import { billingContext, fetchOwned, json } from '../../../../../lib/billing-surface';

export const GET: APIRoute = async ({ params }) => {
    const gate = await billingContext();
    if ('denied' in gate) return gate.denied;
    const { customer } = gate.ctx;

    // fetchOwned es lo único que impide que un id de factura ajeno se descargue.
    const owned = await fetchOwned(`/v1/invoices/${params.id}`, customer);
    if ('denied' in owned) return owned.denied;

    const url = owned.object?.invoice_pdf;
    if (!url) return json({ error: 'Ese cobro todavía no tiene comprobante.' }, 404);

    const upstream = await fetch(url);
    if (!upstream.ok || !upstream.body) {
        return json({ error: 'No pudimos descargar el comprobante. Intenta de nuevo.' }, 502);
    }

    const name = owned.object?.number ? `cord-${owned.object.number}.pdf` : 'cord-comprobante.pdf';
    return new Response(upstream.body, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${name}"`,
            'Cache-Control': 'private, no-store',
        },
    });
};
