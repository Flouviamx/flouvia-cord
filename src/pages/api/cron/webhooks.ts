// GET /api/cron/webhooks — sweeper del outbox de webhooks salientes.
// Reclama trabajo VENCIDO (invocaciones que murieron a media entrega, y
// fallos programados para reintento) de webhook_events y lo entrega, siguiendo
// el calendario de backoff exponencial (ver src/lib/webhook-delivery.ts). Es
// la red de seguridad del patrón outbox: la entrega inmediata ya corre inline
// justo después de encolar (flushNow vía after()) — este cron solo recoge lo
// que esa entrega inmediata no logró resolver. Corre 1 vez al día (ver
// vercel.json) — el plan actual de Vercel rechaza CUALQUIER cron con
// frecuencia sub-diaria (se probó "cada minuto" y "cada 5 min", ambos
// tumbaban el deploy completo antes de crear el deployment; solo pasó al
// quedar en 1x/día, ver docs/historial-platform-api.md). Esto solo retrasa
// el REINTENTO de fallas de entrega (la entrega normal sigue siendo
// inline/instantánea) — subir de plan permitiría volver a una frecuencia
// más agresiva. Protegido con CRON_SECRET, igual que el resto de crons.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { reqContext } from '../../../lib/context';
import { runSweep } from '../../../lib/webhook-delivery';


export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    // Marca este request como carril de SISTEMA — es lo que permite a
    // runSweep()/claimDue() usar withSystemTx (RLS cross-org) sin que una ruta
    // de usuario normal pueda hacer lo mismo por accidente (ver db.ts).
    const result = await reqContext.run({ userId: null, cronScope: true }, () => runSweep());
    return json(result);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
