// POST /api/cli/login { host } — `cord login` pide un código. Público: la
// terminal todavía no tiene credencial. No lee cookies.
export const prerender = false;

import type { APIRoute } from 'astro';
import { strictRateLimit, tooMany } from '../../../lib/ratelimit';
import { trustedIp } from '../../../lib/ip';
import { startLogin, LOGIN_TTL_SECONDS } from '../../../lib/cli-login';

export const POST: APIRoute = async ({ request }) => {
    const rl = await strictRateLimit(`cli-login:${trustedIp(request)}`, 10, 600);
    if (!rl.ok) return tooMany(rl.retryAfter);
    let body: any = {};
    try { body = await request.json(); } catch { /* host opcional */ }
    const { deviceCode, userCode } = await startLogin(String(body?.host ?? ''));
    const url = new URL('/app/cli/autorizar', request.url);
    url.searchParams.set('codigo', userCode);
    return json({ device_code: deviceCode, user_code: userCode, verification_url: url.href, interval: 2, expires_in: LOGIN_TTL_SECONDS });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
