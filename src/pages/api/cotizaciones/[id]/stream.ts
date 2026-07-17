// GET /api/cotizaciones/[id]/stream — SSE del detalle del vendedor (tiempo real).
// Reemplaza el polling de 8s a /presence: empuja el mismo par (online/convCount)
// pero por push en vez de por intervalo, y además el texto del último mensaje
// nuevo para poder mostrarlo sin recargar. Requiere sesión (misma protección que
// el resto de /api/cotizaciones/*, gated por middleware — no público).
//   event: presence { online, convCount }
//   event: message  { detalle }   — nueva línea de conversación (comment/counter/reply)
//   event: ping     {}
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';

const encoder = new TextEncoder();
const POLL_MS = 3000;
const HEARTBEAT_MS = 20000;
const MAX_MS = 270000;

export const GET: APIRoute = async ({ params, request }) => {
    const orgId = await getActiveOrgId();
    const id = params.id ?? '';
    const [row] = await sql`select id from cotizaciones where id = ${id} and org_id = ${orgId}`;
    if (!row) return new Response('not found', { status: 404 });

    let closed = false;
    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: unknown) => {
                if (closed) return;
                try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
                catch { closed = true; }
            };
            send('ready', {});

            let lastOnline: boolean | null = null;
            let lastConvCount: number | null = null;
            let lastMsgTs: string = new Date().toISOString();
            let lastHeartbeat = Date.now();
            const started = Date.now();

            request.signal.addEventListener('abort', () => { closed = true; });

            while (!closed && !request.signal.aborted && Date.now() - started < MAX_MS) {
                try {
                    const [r] = await sql`select viewer_last_seen from cotizaciones where id = ${id} and org_id = ${orgId}`;
                    const seen = r?.viewer_last_seen ? new Date(r.viewer_last_seen as string).getTime() : 0;
                    const online = seen > 0 && (Date.now() - seen) < 30000;

                    const [ev] = await sql`select count(*)::int as n from eventos where cotizacion_id = ${id} and org_id = ${orgId} and tipo in ('comment','counter','reply')`;
                    const [cm] = await sql`select count(*)::int as n from cotizacion_comentarios where cotizacion_id = ${id} and org_id = ${orgId}`;
                    const convCount = (Number(ev?.n) || 0) + (Number(cm?.n) || 0);

                    if (online !== lastOnline) { lastOnline = online; send('presence', { online, convCount }); }
                    else if (convCount !== lastConvCount) { send('presence', { online, convCount }); }
                    lastConvCount = convCount;

                    const msgs = await sql`select detalle, created_at from eventos
                        where cotizacion_id = ${id} and org_id = ${orgId}
                          and tipo in ('comment','counter') and created_at > ${lastMsgTs}
                        order by created_at asc limit 20`;
                    if (msgs.length) {
                        lastMsgTs = String(msgs[msgs.length - 1].created_at);
                        for (const m of msgs) send('message', { detalle: m.detalle });
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
