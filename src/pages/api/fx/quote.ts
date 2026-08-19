// GET /api/fx/quote?base=USD&fiscal=MXN&amount=1000&buffer=2
// Devuelve la tasa spot en vivo + tasa con cobertura (buffer) + monto convertido
// + vigencia del lock. Ruta interna (protegida por el middleware de sesión).
// La usa el editor de cotizaciones para mostrar el FX antes de guardar.
//
// Si no hay una tasa REAL, responde 503 con un mensaje accionable. Nunca
// devuelve una tasa inventada: lo que se muestra aquí es lo que después se
// congela en la cotización y se declara en la factura.
export const prerender = false;

import type { APIRoute } from 'astro';
import { FXService, FXUnavailableError } from '../../../lib/fx/FXService';
import { isSupportedCurrency } from '../../../lib/currency';

export const GET: APIRoute = async ({ url }) => {
    const base = (url.searchParams.get('base') || 'MXN').toUpperCase();
    const fiscal = (url.searchParams.get('fiscal') || base).toUpperCase();
    const amount = Number(url.searchParams.get('amount')) || 0;
    const buffer = Number(url.searchParams.get('buffer')) || 0;

    if (!isSupportedCurrency(base) || !isSupportedCurrency(fiscal)) {
        return json({ error: 'Moneda no reconocida.' }, 400);
    }

    try {
        const fx = await FXService.getExchangeRate({
            baseCurrency: base, fiscalCurrency: fiscal, amount, bufferPct: buffer,
        });
        return json(fx, 200);
    } catch (error) {
        if (error instanceof FXUnavailableError) {
            return json({ error: error.message, code: 'fx_unavailable' }, 503);
        }
        return json({ error: 'No pudimos calcular el tipo de cambio.' }, 502);
    }
};

function json(data: unknown, status: number) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
}
