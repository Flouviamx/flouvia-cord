// GET /api/cron/webhooks-limpieza — retención del outbox de webhooks salientes.
// Corre diario (ver vercel.json). Borra en LOTES ACOTADOS, nunca un DELETE
// gigante: `ctid = any(array(select ctid ... limit N))` — un DELETE sin límite
// sobre una tabla de alto volumen puede tardar minutos y le pega al WAL.
//
// Política:
//   webhook_deliveries: > 30 días, todos los endpoints; + tope de 500 filas
//     más recientes POR endpoint (uno muy "chatty" no debe inflar la tabla
//     entre corridas — se procesan hasta 50 endpoints "calientes" por día,
//     autocorrectivo si algún día hay más excedente del que cabe en un batch).
//   webhook_events: succeeded/canceled > 30 días; failed > 90 días (la UI de
//     "Reintentar" y redeliver() los necesitan más tiempo — ver webhook-delivery.ts).
//
// Como el resto de los crons de este proyecto (recordatorios/intereses/cobranza),
// usa `sql` directo sin withOrgTx/withSystemTx: es trabajo de mantenimiento
// cross-org, no tenant-facing, y corre con el rol de Neon que ya bypasea RLS
// (BYPASSRLS) — RLS es defensa en profundidad aquí, no el mecanismo de acceso.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql } from '../../../lib/db';

const BATCH = 5000;
const MAX_BATCHES = 20; // techo por categoría por corrida (≤100k filas/día/categoría)

// Repite un DELETE por lotes hasta vaciar la categoría o agotar MAX_BATCHES —
// nunca todo de un solo tirón.
async function deleteBatched(query: (batch: number) => Promise<any[]>): Promise<number> {
    let total = 0;
    for (let i = 0; i < MAX_BATCHES; i++) {
        const deleted = await query(BATCH);
        total += deleted.length;
        if (deleted.length < BATCH) break; // ya no queda más de esta categoría
    }
    return total;
}

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    // ── webhook_deliveries: > 30 días ──
    const deliveriesPorEdad = await deleteBatched((batch) => sql`
        delete from webhook_deliveries
        where ctid = any(array(
            select ctid from webhook_deliveries
            where created_at < now() - interval '30 days'
            limit ${batch}
        ))
        returning id`);

    // ── webhook_deliveries: tope de 500 más recientes por endpoint ──
    let deliveriesPorTope = 0;
    let hotHooks: any[] = [];
    try {
        hotHooks = await sql`
            select webhook_id from webhook_deliveries
            group by webhook_id having count(*) > 500
            limit 50`;
    } catch { hotHooks = []; }
    for (const h of hotHooks) {
        const deleted = await sql`
            delete from webhook_deliveries
            where ctid = any(array(
                select ctid from webhook_deliveries
                where webhook_id = ${h.webhook_id}
                order by created_at desc
                offset 500
                limit 2000
            ))
            returning id`;
        deliveriesPorTope += deleted.length;
    }

    // ── webhook_events: succeeded/canceled > 30 días ──
    const eventosResueltos = await deleteBatched((batch) => sql`
        delete from webhook_events
        where ctid = any(array(
            select ctid from webhook_events
            where estado in ('succeeded', 'canceled') and updated_at < now() - interval '30 days'
            limit ${batch}
        ))
        returning id`);

    // ── webhook_events: failed > 90 días ──
    const eventosFallidos = await deleteBatched((batch) => sql`
        delete from webhook_events
        where ctid = any(array(
            select ctid from webhook_events
            where estado = 'failed' and updated_at < now() - interval '90 days'
            limit ${batch}
        ))
        returning id`);

    return json({
        deliveries_por_edad: deliveriesPorEdad,
        deliveries_por_tope: deliveriesPorTope,
        endpoints_con_tope_aplicado: hotHooks.length,
        events_resueltos: eventosResueltos,
        events_fallidos: eventosFallidos,
    });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
