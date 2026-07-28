// GET /api/cron/webhooks — sweeper del outbox de webhooks salientes.
// Reclama trabajo VENCIDO (invocaciones que murieron a media entrega, y
// fallos programados para reintento) de webhook_events y lo entrega, siguiendo
// el calendario de backoff exponencial (ver src/lib/webhook-delivery.ts). Es
// la red de seguridad del patrón outbox: la entrega inmediata ya corre inline
// justo después de encolar (flushNow vía after()) — este cron solo recoge lo
// que esa entrega inmediata no logró resolver. Pensado para correr cada minuto
// (ver vercel.json). Protegido con CRON_SECRET, igual que el resto de crons.
export const prerender = false;

import type { APIRoute } from 'astro';
import { reqContext } from '../../../lib/context';
import { runSweep } from '../../../lib/webhook-delivery';

const CRON_SECRET = import.meta.env.CRON_SECRET || process.env.CRON_SECRET;

export const GET: APIRoute = async ({ request }) => {
    if (CRON_SECRET) {
        const auth = request.headers.get('authorization') || '';
        if (auth !== `Bearer ${CRON_SECRET}`) return json({ error: 'No autorizado' }, 401);
    }

    // Marca este request como carril de SISTEMA — es lo que permite a
    // runSweep()/claimDue() usar withSystemTx (RLS cross-org) sin que una ruta
    // de usuario normal pueda hacer lo mismo por accidente (ver db.ts).
    const result = await reqContext.run({ userId: null, cronScope: true }, () => runSweep());
    return json(result);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
