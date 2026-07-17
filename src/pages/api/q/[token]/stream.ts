// GET /api/q/[token]/stream — SSE del link público (tiempo real de verdad).
// Reemplaza el hueco que tenía el chat de /q: antes el cliente NUNCA se
// enteraba de una respuesta del vendedor sin recargar. Empuja:
//   event: message  { detalle }        — nueva respuesta del vendedor (tipo 'reply')
//   event: status   { status }         — la cotización cambió de estado (ej. paid)
//   event: ping     {}                 — heartbeat cada ~20s (mantiene vivos los proxies)
// Sin auth (el token es el secreto, mismo patrón que el resto de /api/q/[token]).
// Internamente es polling a la BD cada ~2.5s DENTRO de una sola conexión larga
// (Fluid Compute lo soporta bien) — no requiere infra nueva (Redis pub/sub, etc.).
// El cliente reconecta solo (EventSource) si la conexión se cierra por el límite
// de duración o por red.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';

const encoder = new TextEncoder();
const POLL_MS = 2500;
const HEARTBEAT_MS = 20000;
const MAX_MS = 270000; // ~4.5 min; el cliente reabre la conexión sola

export const GET: APIRoute = async ({ params, request }) => {
    const token = params.token ?? '';
    const rl = await rateLimit(`q:stream:${token}`, 60, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const rows = await sql`select id, org_id, status from cotizaciones where public_token = ${token}`;
    if (!rows.length) return new Response('not found', { status: 404 });
    const c = rows[0] as { id: string; org_id: string; status: string };

    let closed = false;
    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: unknown) => {
                if (closed) return;
                try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
                catch { closed = true; }
            };
            send('ready', {});

            let lastMsgTs: string = new Date().toISOString();
            let lastStatus = c.status;
            let lastHeartbeat = Date.now();
            const started = Date.now();

            request.signal.addEventListener('abort', () => { closed = true; });

            while (!closed && !request.signal.aborted && Date.now() - started < MAX_MS) {
                try {
                    const msgs = await sql`select detalle, created_at from eventos
                        where cotizacion_id = ${c.id} and org_id = ${c.org_id}
                          and tipo = 'reply' and created_at > ${lastMsgTs}
                        order by created_at asc limit 20`;
                    if (msgs.length) {
                        lastMsgTs = String(msgs[msgs.length - 1].created_at);
                        for (const m of msgs) send('message', { detalle: m.detalle });
                    }
                    const [statusRow] = await sql`select status from cotizaciones where id = ${c.id}`;
                    if (statusRow && statusRow.status !== lastStatus) {
                        lastStatus = statusRow.status as string;
                        send('status', { status: lastStatus });
                    }
                } catch { /* fallo transitorio de BD — reintenta el siguiente ciclo */ }

                if (Date.now() - lastHeartbeat > HEARTBEAT_MS) {
                    send('ping', {});
                    lastHeartbeat = Date.now();
                }
                await new Promise((r) => setTimeout(r, POLL_MS));
            }
            try { controller.close(); } catch { /* ya cerrado */ }
        },
        cancel() { closed = true; },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
};
