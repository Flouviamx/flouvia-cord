// RFC 9116. Se genera para que Expires nunca quede vencido: siempre ~6 meses adelante.
import type { APIRoute } from 'astro';

export const prerender = false;

const SECURITY_CONTACT = 'security@flouvia.com';

export const GET: APIRoute = () => {
    const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    expires.setUTCHours(0, 0, 0, 0);
    const body = [
        `Contact: mailto:${SECURITY_CONTACT}`,
        `Expires: ${expires.toISOString()}`,
        'Preferred-Languages: es, en',
        'Canonical: https://cordhq.app/.well-known/security.txt',
        'Policy: https://cordhq.app/soporte/reportar-vulnerabilidades',
        '',
    ].join('\n');
    return new Response(body, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
    });
};
