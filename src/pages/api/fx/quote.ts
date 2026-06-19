// GET /api/fx/quote?base=USD&fiscal=MXN&amount=1000&buffer=2
// Devuelve la tasa spot en vivo + tasa con cobertura (buffer) + monto convertido
// + vigencia del lock. Ruta interna (protegida por el middleware de sesión).
// La usa el editor de cotizaciones para mostrar el FX antes de guardar.
export const prerender = false;

import type { APIRoute } from 'astro';
import { FXService } from '../../../lib/fx/FXService';

export const GET: APIRoute = async ({ url }) => {
    const base = (url.searchParams.get('base') || 'MXN').toUpperCase();
    const fiscal = (url.searchParams.get('fiscal') || base).toUpperCase();
    const amount = Number(url.searchParams.get('amount')) || 0;
    const buffer = Number(url.searchParams.get('buffer')) || 0;

    const fx = await FXService.getExchangeRate({
        baseCurrency: base, fiscalCurrency: fiscal, amount, bufferPct: buffer,
    });

    return new Response(JSON.stringify(fx), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
