// GET /api/billing/invoices — historial de cobros de la suscripción a Cord.
//
// Sustituye el "Historial de facturas" del Customer Portal. Se lee EN VIVO y no
// se espeja en la base: no otorga acceso a nada, y una copia local sería un
// segundo estado que se desincroniza en silencio.
export const prerender = false;

import type { APIRoute } from 'astro';
import { stripe } from '../../../lib/billing';
import { billingContext, json } from '../../../lib/billing-surface';
import { fromMinorUnits } from '../../../lib/currency';

export const GET: APIRoute = async () => {
    const gate = await billingContext();
    if ('denied' in gate) return gate.denied;
    const { customer } = gate.ctx;

    try {
        const list = await stripe('/v1/invoices', { customer, limit: '24' }, 'GET');
        return json({
            invoices: (list?.data ?? [])
                // Los borradores no son un cobro: mostrarlos haría que el negocio
                // creyera que debe algo que todavía no existe.
                .filter((inv: any) => inv.status && inv.status !== 'draft')
                .map((inv: any) => ({
                    id: inv.id,
                    number: inv.number ?? null,
                    status: inv.status,
                    created: inv.created,
                    // La divisa sale de la factura, no de la que derivaríamos hoy
                    // del país: un cobro viejo en pesos se muestra en pesos aunque
                    // la cuenta hoy facture en dólares (regla 21).
                    currency: String(inv.currency || '').toUpperCase(),
                    total: fromMinorUnits(Number(inv.total || 0), String(inv.currency || 'mxn')),
                    amountDue: fromMinorUnits(Number(inv.amount_due || 0), String(inv.currency || 'mxn')),
                    hasPdf: Boolean(inv.invoice_pdf),
                    // El concepto es lo que vuelve legible una fila de historial:
                    // "Plan Developer" dice qué se pagó, "$0.00" no dice nada.
                    concepto: inv.lines?.data?.[0]?.description
                        ?? inv.lines?.data?.[0]?.price?.nickname
                        ?? null,
                })),
        });
    } catch {
        return json({ error: 'No pudimos cargar tus comprobantes. Intenta de nuevo.' }, 502);
    }
};
