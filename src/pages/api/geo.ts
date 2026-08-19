// GET /api/geo — país aproximado del visitante, para elegir la divisa con la que
// se le presentan los planes de Cord.
//
// Existe porque `/precios` es `prerender = true`: una página estática no puede
// leer headers. Este endpoint sí, y el cliente lo consulta una sola vez.
//
// Es una SUGERENCIA de presentación, nunca autorización ni el dato que se cobra.
// La divisa real de una suscripción sale de `orgs.country_code` en servidor
// (`platformCurrencyForOrg`), donde ya hay sesión y no hay nada que adivinar.
export const prerender = false;

import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
    const raw = request.headers.get('x-vercel-ip-country') || '';
    const country = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : null;
    return new Response(JSON.stringify({ country }), {
        headers: {
            'Content-Type': 'application/json',
            // Varía por visitante: una respuesta cacheada en un CDN compartido le
            // enseñaría el país del primero a todos los demás.
            'Cache-Control': 'private, no-store',
        },
    });
};
