// GET /api/onboarding/progress — devuelve el avance de configuración de la org
// activa (mismos pasos que getSetupProgress). Lo consume el widget flotante de
// onboarding para AUTO-MARCAR pasos como completados al detectar cambios en la BD
// (polling + refresco al volver a la pestaña), sin recargar la página.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getSetupProgress } from '../../../lib/queries';

export const GET: APIRoute = async () => {
    try {
        const setup = await getSetupProgress();
        return new Response(JSON.stringify(setup), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    } catch {
        return new Response(JSON.stringify({ error: 'No disponible' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
