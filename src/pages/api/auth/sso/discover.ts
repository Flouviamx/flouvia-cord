// GET /api/auth/sso/discover?domain=acme.com — ¿este dominio tiene SSO
// configurado? Alimenta la discovery del sign-in (Fase 7). Consulta SOLO por
// dominio, nunca por correo completo — filtra "acme.com usa SSO con Cord"
// (ya descubrible desde el metadata público de cualquier conexión) en vez de
// volverse un oráculo de existencia de cuentas por email.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { trustedIp } from '../../../../lib/ip';

export const GET: APIRoute = async ({ url, request }) => {
    const ip = trustedIp(request);
    const rl = await rateLimit(`sso-discover:${ip}`, 30, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const domain = (url.searchParams.get('domain') || '').trim().toLowerCase().replace(/^@/, '');
    if (!domain || domain.length > 253) return json({ sso: false });

    // Pantalla de entrada: quien pregunta todavía no tiene sesión ni
    // organización. La función acotada devuelve SOLO lo que la pantalla
    // necesita para decidir a dónde mandar el login.
    const rows = await sql`
        select connection_id, org_nombre, require_sso
          from cord_resolve_sso_domain(${domain})`;
    if (!rows.length) return json({ sso: false });

    const r = rows[0] as any;
    return json({ sso: true, connectionId: r.connection_id, orgName: r.org_nombre, required: !!r.require_sso });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
