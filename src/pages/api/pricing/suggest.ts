// GET /api/pricing/suggest?producto_id=&cliente_id=&precio_lista=
// Precio sugerido por historial real: win-rate por banda de descuento sobre
// las cotizaciones ya decididas de la org (ver getPricingSuggestion en
// queries.ts). Ruta interna, protegida por el middleware de sesión — solo
// lectura, no toca dinero ni escribe nada.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getPricingSuggestion } from '../../../lib/queries';

export const GET: APIRoute = async ({ url }) => {
    const productoId = url.searchParams.get('producto_id') || null;
    const clienteId = url.searchParams.get('cliente_id') || null;
    const precioLista = Number(url.searchParams.get('precio_lista')) || 0;

    if (precioLista <= 0) {
        return new Response(JSON.stringify({ error: 'precio_lista requerido' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const suggestion = await getPricingSuggestion({ productoId, clienteId, precioLista });

    return new Response(JSON.stringify(suggestion), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
