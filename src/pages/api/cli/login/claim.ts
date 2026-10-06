// POST /api/cli/login/claim { device_code } — la terminal pregunta si ya se
// aprobó. La llave se entrega una sola vez. No lee cookies.
export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { claimLogin } from '../../../../lib/cli-login';

export const POST: APIRoute = async ({ request }) => {
    let body: any = {};
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const deviceCode = String(body?.device_code ?? '');
    const rl = await rateLimit(`cli-claim:${createHash('sha256').update(deviceCode).digest('hex').slice(0, 16)}`, 90, 600);
    if (!rl.ok) return tooMany(rl.retryAfter);
    const r = await claimLogin(deviceCode);
    if (r.estado === 'aprobado') return json({ estado: 'aprobado', api_key: r.apiKey, ...(r.projectKey ? { project_key: r.projectKey } : {}) });
    if (r.estado === 'invalido') return json({ estado: 'invalido', error: 'Ese código no existe. Vuelve a correr cord login.' }, 404);
    return json({ estado: r.estado });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
