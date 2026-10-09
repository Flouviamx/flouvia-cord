// /api/fiscal/iopole/webhook — avisos de la plataforma autorizada (Francia):
// etapas del alta del negocio, estados del ciclo de vida de cada factura y
// eventos del e-reporting (src/lib/fiscal/transmision/).
//
//   GET   sonda: Iopole exige que la URL responda a un GET antes de aceptarla
//         como webhook ("Callback URL validation").
//   POST  aviso firmado. La firma HMAC se verifica sobre el cuerpo CRUDO y falla
//         cerrada (401); sin secreto configurado no se procesa nada (503).
//
// Pública (sin sesión) y exenta de CSRF, como el resto de los webhooks de
// proveedores (csrf-policy.ts, middleware.ts): la credencial es la firma. El
// id del aviso identifica, no autoriza (regla 30): eventos.ts resuelve la
// organización con funciones `security definer` y vuelve a withOrgTx.
//
// La respuesta es un JSON vacío: Iopole trata como fallo un cuerpo de texto
// ("OK", "received") y reintenta lo que no recibió 2xx en 60 s, así que el
// aviso se aplica antes de responder y un fallo devuelve 500 para que vuelva.
export const prerender = false;

import type { APIRoute } from 'astro';
import { reqContext } from '../../../../lib/context';
import { log } from '../../../../lib/log';
import { rateLimit } from '../../../../lib/ratelimit';
import { paConfig } from '../../../../lib/fiscal/transmision/config';
import { aplicarEvento } from '../../../../lib/fiscal/transmision/eventos';
import { interpretar, verificarFirma } from '../../../../lib/fiscal/transmision/iopole/webhook';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export const GET: APIRoute = async () => json({});

export const POST: APIRoute = async ({ request }) => {
    const config = paConfig();
    if (!config.habilitado || !config.webhookSecret) return json({ error: 'not_configured' }, 503);

    const cuerpo = new Uint8Array(await request.arrayBuffer());
    const url = new URL(request.url);
    const ok = verificarFirma({
        secreto: config.webhookSecret,
        metodo: request.method,
        rutaConConsulta: url.pathname + url.search,
        cabeceras: {
            timestamp: request.headers.get('x-timestamp'),
            firma: request.headers.get('x-signature'),
            checksum: request.headers.get('x-checksum'),
        },
        cuerpo,
    });
    if (!ok) return json({ error: 'bad_signature' }, 401);

    // Con la firma ya verificada, el límite solo acota el trabajo.
    const rl = await rateLimit('iopole-wh', 1200, 60);
    if (!rl.ok) return json({ error: 'rate_limited' }, 429);

    let payload: unknown;
    try { payload = JSON.parse(new TextDecoder().decode(cuerpo)); } catch { return json({}); }
    const evento = interpretar(payload);
    try {
        const r = await reqContext.run({ userId: null, actor: 'iopole' }, () => aplicarEvento(evento, 'iopole', config.entorno));
        if (!r.aplicado) log.info('fr-pa: aviso sin efecto', { route: 'api/fiscal/iopole/webhook', tipo: evento.tipo, razon: r.razon });
    } catch (error) {
        log.error('fr-pa: no se pudo aplicar un aviso de la plataforma', { route: 'api/fiscal/iopole/webhook', tipo: evento.tipo, err: error });
        return json({ error: 'retry' }, 500);
    }
    return json({});
};
