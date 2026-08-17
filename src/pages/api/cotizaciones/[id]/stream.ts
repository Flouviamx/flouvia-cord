// GET /api/cotizaciones/[id]/stream — SSE del detalle del vendedor (tiempo real).
// Reemplaza el polling de 8s a /presence: empuja el mismo par (online/convCount)
// pero por push en vez de por intervalo, y además el texto del último mensaje
// nuevo para poder mostrarlo sin recargar. Requiere sesión (misma protección que
// el resto de /api/cotizaciones/*, gated por middleware — no público).
//   event: presence { online, convCount, seccion, escribiendo }
//   event: message  { detalle }   — nueva línea de conversación (comment/counter/reply)
//   event: ping     {}
//
// Además ESCRIBE la presencia del vendedor: mientras esta conexión vive, el
// miembro del equipo está "en el documento", y el link público del cliente lo
// muestra en línea. Es lo que convierte la presencia en mutua — antes solo el
// vendedor veía al cliente, nunca al revés, y saber que hay alguien del otro
// lado es justo lo que anima al cliente a preguntar en vez de abandonar.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../../lib/db';
import { requireEntitlement } from '../../../../lib/org-entitlements';
import { currentUserId } from '../../../../lib/context';
import { presenciaQuery, toPresencia, PRESENCE_WINDOW_MS } from '../../../../lib/atencion';

const encoder = new TextEncoder();
const POLL_MS = 3000;
const HEARTBEAT_MS = 20000;
const MAX_MS = 270000;

export const GET: APIRoute = async ({ params, request }) => {
    const orgId = await getActiveOrgId();
    const subscriptionDenied = await requireEntitlement(orgId, 'live_presence');
    if (subscriptionDenied) return subscriptionDenied;
    const id = params.id ?? '';
    const [row] = await sql`select id from cotizaciones where id = ${id} and org_id = ${orgId}`;
    if (!row) return new Response('not found', { status: 404 });

    // Identidad del vendedor para su fila de presencia. Se resuelve una sola vez.
    const userId = currentUserId();
    const actorKey = userId ? `u:${userId}` : null;
    let nombre: string | null = null;
    if (userId) {
        const [m] = await sql`select nombre, email from org_members
            where org_id = ${orgId} and user_id = ${userId} and estado = 'activo' limit 1`;
        nombre = (m?.nombre as string) || (m?.email as string) || null;
    }

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
                    // Latido del vendedor: existir en esta tabla ES estar presente.
                    if (actorKey) {
                        await withOrgTx(orgId, sql`
                            insert into cotizacion_visitantes
                                (org_id, cotizacion_id, actor_key, rol, nombre,
                                 primera_vez, ultima_vez, last_seen)
                            values (${orgId}, ${id}, ${actorKey}, 'seller', ${nombre}, now(), now(), now())
                            on conflict (cotizacion_id, actor_key) do update set
                                nombre     = coalesce(excluded.nombre, cotizacion_visitantes.nombre),
                                ultima_vez = now(),
                                last_seen  = now()`);
                    }

                    const [presRows, ev, cm, msgs] = await withOrgTx(orgId,
                        presenciaQuery(id, orgId),
                        sql`select count(*)::int as n from eventos
                             where cotizacion_id = ${id} and org_id = ${orgId}
                               and tipo in ('comment','counter','reply')`,
                        sql`select count(*)::int as n from cotizacion_comentarios
                             where cotizacion_id = ${id} and org_id = ${orgId}`,
                        sql`select detalle, created_at from eventos
                             where cotizacion_id = ${id} and org_id = ${orgId}
                               and tipo in ('comment','counter') and created_at > ${lastMsgTs}
                             order by created_at asc limit 20`,
                    );

                    const presencia = toPresencia(presRows);
                    const online = presencia.clientes > 0;
                    const convCount = (Number(ev[0]?.n) || 0) + (Number(cm[0]?.n) || 0);
                    const payload = {
                        online,
                        convCount,
                        seccion: presencia.seccionCliente,
                        escribiendo: presencia.clienteEscribiendo,
                    };

                    if (online !== lastOnline) { lastOnline = online; send('presence', payload); }
                    else if (convCount !== lastConvCount) { send('presence', payload); }
                    lastConvCount = convCount;

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

            // Salida limpia: el vendedor deja de estar presente en cuanto cierra
            // la pestaña, sin esperar a que expire la ventana de PRESENCE_WINDOW_MS.
            if (actorKey) {
                try {
                    await withOrgTx(orgId, sql`
                        update cotizacion_visitantes
                           set last_seen = now() - ${`${PRESENCE_WINDOW_MS} milliseconds`}::interval
                         where cotizacion_id = ${id} and org_id = ${orgId} and actor_key = ${actorKey}`);
                } catch { /* mejor esfuerzo: si falla, la ventana lo apaga sola */ }
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
