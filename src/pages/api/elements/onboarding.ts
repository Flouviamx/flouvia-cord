// GET /api/elements/onboarding → { sandbox, steps, completo } (sesión, permiso ajustes)
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { getOnboarding } from '../../../lib/elements-onboarding';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;
    const data = await getOnboarding(await getActiveOrgId());
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
};
