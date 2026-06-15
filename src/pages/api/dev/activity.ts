// /api/dev/activity — actividad del API para refrescar la sección en vivo
// (Ajustes › Developers). Sesión + permiso 'ajustes'. GET → { recent, total24, … }.
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm, getApiActivity } from '../../../lib/queries';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;
    const data = await getApiActivity();
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
};
