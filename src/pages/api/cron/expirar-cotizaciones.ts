// GET /api/cron/expirar-cotizaciones — vence cotizaciones `sent`/`viewed` cuya
// vigencia ya pasó.
//
// Antes de este cron, una cotización enviada nunca cambiaba de status por sí
// sola aunque su fecha de vigencia quedara muy atrás — seguía viva ('sent'/
// 'viewed') indefinidamente. Dos consecuencias reales: (1) el cliente podía
// seguir aprobando/rechazando vía /q/[token] una cotización técnicamente
// vencida (alive = ['sent','viewed'].includes(status) en esa ruta), y (2)
// getPricingSuggestion() ya clasifica 'expired' como cotización PERDIDA en su
// cálculo de win-rate (queries.ts) pero ningún código escribía jamás ese
// status — la clasificación nunca se activaba. Este cron cierra ambos huecos
// y dispara el webhook `quote.expired` para integraciones (CRM/ERP) que
// necesiten saber cuándo una cotización caducó sin decisión del cliente.
//
// Corre diario (ver vercel.json). `vigencia < current_date` se compara del
// lado de SQL — no hay que lidiar con el gotcha de columnas `date` como
// objeto Date del lado de JS (ver venceDia() en cobros.ts), porque nunca
// sale de Postgres.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, logAudit } from '../../../lib/db';
import { dispatchQuoteEvent } from '../../../lib/webhooks';

const CRON_SECRET = import.meta.env.CRON_SECRET || process.env.CRON_SECRET;

export const GET: APIRoute = async ({ request }) => {
    if (CRON_SECRET) {
        const auth = request.headers.get('authorization') || '';
        if (auth !== `Bearer ${CRON_SECRET}`) return json({ error: 'No autorizado' }, 401);
    }

    // Excluye orgs sandbox (entorno de prueba) y la org demo — mismo criterio
    // que recordatorios.ts/cobranza.ts.
    const rows = await sql`
        update cotizaciones c
           set status = 'expired'
          from orgs o
         where c.org_id = o.id
           and c.status in ('sent', 'viewed')
           and c.vigencia is not null
           and c.vigencia < current_date
           and o.sandbox_of is null
           and o.owner_id::text <> '00000000-0000-0000-0000-000000000000'
        returning c.id, c.org_id, c.folio`;

    for (const r of rows) {
        const orgId = r.org_id as string;
        const id = r.id as string;
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${orgId}, ${id}, 'expired', 'Cotización vencida — pasó su fecha de vigencia sin decisión del cliente')`;
        await logAudit(orgId, { accion: 'cotizacion.vencida', entidad: 'cotizacion', entidad_id: id, detalle: r.folio as string });
        // Secuencial (no after()): el volumen típico es bajo y el cron no
        // tiene presión de latencia de respuesta al usuario — mismo patrón
        // que recordatorios.ts/cobranza.ts (await por fila en un for).
        await dispatchQuoteEvent(orgId, id, 'quote.expired');
    }

    return json({ vencidas: rows.length });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
