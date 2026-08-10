// POST /api/auth/logout — cierra la sesión actual.
//
// El handler GET se ELIMINÓ (ago 2026): un GET es una operación que cualquier
// sitio de terceros puede disparar sin permiso ("logout-CSRF") con solo
// `<img src="https://cordhq.app/api/auth/logout">` — no hay Origin que
// validar en una carga de imagen, y GET nunca entraba al chequeo CSRF del
// middleware (que solo mira POST/PATCH/PUT/DELETE). El único caller real
// (CustomOrgSwitcher) ya hace un POST real.
export const prerender = false;

import type { APIRoute } from 'astro';
import { invalidateSession, SESSION_COOKIE, clearSessionCookies } from '../../../lib/auth';

export const POST: APIRoute = async ({ cookies }) => {
    try {
        const sessionToken = cookies.get(SESSION_COOKIE)?.value;
        if (sessionToken) {
            await invalidateSession(sessionToken);
        }
        clearSessionCookies(cookies);
        cookies.delete('cord_active_org', { path: '/' });
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error('[auth/logout]', error);
        return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
    }
};
