// POST /api/dinero/revertir { token } — el botón "No fui yo" del correo que
// reciben los dueños cuando cambia a dónde llega el dinero (regla 38).
//
// Es público a propósito: quien lo usa puede no tener sesión, o tenerla robada.
// El token es la credencial (un solo uso, 30 días, se guarda su sha256) y lo
// único que permite es DESHACER y CONGELAR: nunca mover dinero hacia ningún
// lado. Por eso no exige sesión, pero sí un límite estricto por IP: un token
// adivinado al azar no existe (256 bits), y lo que se limita es el ruido.
//
// El GET de la página no cambia nada: los escáneres de enlaces de los correos
// corporativos abren cada link, y un "No fui yo" disparado por un escáner
// congelaría los depósitos de un negocio que no pidió nada.
export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { reqContext } from '../../../lib/context';
import { cambioPorToken } from '../../../lib/money-hold';
import { revertirCambio } from '../../../lib/destino-dinero';
import { strictLimitResponse, strictRateLimit } from '../../../lib/ratelimit';
import { trustedIp } from '../../../lib/ip';
import { parseJsonBody } from '../../../lib/validation';
import { log } from '../../../lib/log';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
});

const Esquema = z.object({ token: z.string().min(30).max(64) }).strict();

export const POST: APIRoute = async ({ request }) => {
    const ip = trustedIp(request);
    const limited = strictLimitResponse(await strictRateLimit(`dinero-revertir:${ip}`, 10, 3600));
    if (limited) return limited;

    const parsed = await parseJsonBody(request, Esquema);
    if (!parsed.ok) return json({ error: 'invalid' }, 400);

    const cambio = await cambioPorToken(parsed.data.token);
    // Mismo mensaje para "no existe", "ya se usó" y "venció": el endpoint no
    // confirma qué tokens existieron.
    if (!cambio) return json({ error: 'not_found' }, 404);

    try {
        const r = await reqContext.run({ userId: null, orgId: cambio.orgId, actor: 'system' }, () => revertirCambio(cambio, { ip }));
        if (!r.revertido) return json({ error: 'not_found' }, 404);
        return json({ ok: true, completo: r.pendientes.length === 0 });
    } catch (err) {
        log.error('no se pudo revertir un cambio de destino del dinero', { route: 'dinero-revertir', orgId: cambio.orgId, err });
        return json({ error: 'unavailable' }, 503);
    }
};
