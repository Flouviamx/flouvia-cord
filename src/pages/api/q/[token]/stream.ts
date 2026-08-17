// GET /api/q/[token]/stream — SSE del link público. El documento en vivo.
//
// Empuja:
//   event: ready     {}                          — conexión establecida
//   event: patch     { rev, status, total, ... } — el contenido cambió
//   event: presence  { vendedor, escribiendo }   — quién está del otro lado
//   event: message   { detalle }                 — respuesta nueva del vendedor
//   event: status    { status }                  — estado terminal (paid/rejected)
//   event: ping      {}                          — heartbeat, mantiene vivos los proxies
//
// Sin auth: el token es el secreto, mismo patrón que el resto de /api/q/[token].
//
// ── Por qué polling y no pub/sub ────────────────────────────────────────────
// Internamente esto sigue siendo polling a Neon DENTRO de una sola conexión
// larga (Fluid Compute lo soporta bien) — no requiere Redis ni infra nueva. Lo
// que lo vuelve barato es `cotizaciones.rev`: un contador que los triggers
// suben ante cualquier cambio real de contenido. El ciclo normal lee UN entero;
// solo cuando ese entero avanza se paga el snapshot completo.
//
// La cadencia se adapta a quién está mirando: 1s con vendedor y cliente juntos
// (es cuando se negocia y cada segundo se nota), 5s en reposo. El cliente cierra
// la conexión al ocultar la pestaña, así que una pestaña olvidada no consume.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, resolvePublicQuote, withOrgTx } from '../../../../lib/db';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { getLiveSnapshot } from '../../../../lib/queries';
import { presenciaQuery, toPresencia, type PresenciaSnapshot } from '../../../../lib/atencion';

const encoder = new TextEncoder();
const POLL_ACTIVO = 1000;    // vendedor y cliente presentes
const POLL_NORMAL = 2500;    // solo el cliente
const POLL_REPOSO = 5000;    // nadie del otro lado
const HEARTBEAT_MS = 20000;
const MAX_MS = 270000; // ~4.5 min; el cliente reabre la conexión sola

// Estados terminales: el markup difiere demasiado del vivo (pantalla de pagada,
// de rechazada), así que ahí sí se pide recargar en vez de parchear.
const TERMINALES = new Set(['paid', 'rejected', 'expired', 'invoiced']);

export const GET: APIRoute = async ({ params, request }) => {
    const token = params.token ?? '';
    const rl = await rateLimit(`q:stream:${token}`, 60, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const identity = await resolvePublicQuote(token);
    if (!identity) return new Response('not found', { status: 404 });
    const [rows] = await withOrgTx(identity.orgId, sql`
        select id, org_id, status, rev from cotizaciones
        where id = ${identity.id} and org_id = ${identity.orgId}`);
    if (!rows.length) return new Response('not found', { status: 404 });
    const c = rows[0] as { id: string; org_id: string; status: string; rev: string };

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
            let lastRev = Number(c.rev) || 1;
            let lastPresencia = '';
            let lastHeartbeat = Date.now();
            let espera = POLL_NORMAL;
            const started = Date.now();

            request.signal.addEventListener('abort', () => { closed = true; });

            while (!closed && !request.signal.aborted && Date.now() - started < MAX_MS) {
                try {
                    // ── Ciclo barato: un entero y la presencia ──
                    const [cab, presRows, msgs] = await withOrgTx(c.org_id,
                        sql`select rev, status from cotizaciones
                             where id = ${c.id} and org_id = ${c.org_id}`,
                        presenciaQuery(c.id, c.org_id),
                        sql`select detalle, created_at from eventos
                             where cotizacion_id = ${c.id} and org_id = ${c.org_id}
                               and tipo = 'reply' and created_at > ${lastMsgTs}
                             order by created_at asc limit 20`,
                    );

                    const fila = cab[0] as { rev: string; status: string } | undefined;
                    const presencia: PresenciaSnapshot = toPresencia(presRows);

                    if (msgs.length) {
                        lastMsgTs = String(msgs[msgs.length - 1].created_at);
                        for (const m of msgs) send('message', { detalle: m.detalle });
                    }

                    // Presencia: solo se empuja cuando cambia algo visible, para
                    // no repintar el indicador cada segundo.
                    const huella = JSON.stringify([
                        presencia.vendedor?.nombre ?? null,
                        !!presencia.vendedor,
                        presencia.vendedorEscribiendo,
                    ]);
                    if (huella !== lastPresencia) {
                        lastPresencia = huella;
                        send('presence', {
                            vendedor: presencia.vendedor?.nombre ?? null,
                            enLinea: !!presencia.vendedor,
                            escribiendo: presencia.vendedorEscribiendo,
                        });
                    }

                    if (fila) {
                        const rev = Number(fila.rev) || 1;
                        const status = fila.status as string;

                        // Un estado terminal cambia demasiado markup para parchearlo.
                        if (status !== lastStatus && TERMINALES.has(status)) {
                            lastStatus = status;
                            lastRev = rev;
                            send('status', { status });
                        } else if (rev !== lastRev) {
                            // ── Ciclo caro: solo cuando el contenido cambió ──
                            // `lastRev` avanza DESPUÉS del snapshot, nunca antes:
                            // si esta llamada falla, el catch de abajo se la traga
                            // y el siguiente ciclo tiene que volver a intentarlo.
                            // Avanzarlo primero convertía un fallo transitorio en
                            // un parche perdido para siempre — el cliente se
                            // quedaba viendo precios viejos sin señal de nada.
                            const snap = await getLiveSnapshot(c.org_id, c.id);
                            if (snap) {
                                send('patch', snap);
                                lastRev = rev;
                                lastStatus = status;
                            }
                        }
                    }

                    // Cadencia según quién está del otro lado.
                    espera = presencia.vendedor
                        ? POLL_ACTIVO
                        : (presencia.clientes > 0 ? POLL_NORMAL : POLL_REPOSO);
                } catch { /* fallo transitorio de BD — reintenta el siguiente ciclo */ }

                if (Date.now() - lastHeartbeat > HEARTBEAT_MS) {
                    send('ping', {});
                    lastHeartbeat = Date.now();
                }
                await new Promise((r) => setTimeout(r, espera));
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
