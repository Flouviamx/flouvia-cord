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
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, withOrgTx, withSystemTx } from '../../../lib/db';
import { reqContext } from '../../../lib/context';
import { notify } from '../../../lib/notify';
import { siteOrigin } from '../../../lib/email';
import { log } from '../../../lib/log';
import { registrarVencimiento, type QuoteExpiredRow } from '../../../lib/quote-expiry';
import { cronPeriod, runCronOnce } from '../../../lib/cron-runs';


export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;
    // Una vez al día: el aviso "por vencer" compara la fecha EXACTA (vigencia =
    // hoy + 3) y sin reclamo un segundo disparo el mismo día lo repetía.
    return runCronOnce(request, '/api/cron/expirar-cotizaciones', cronPeriod('dia'), () => run());
};

async function run(): Promise<Response> {
    // El carril de SISTEMA se enciende DESPUÉS de validar CRON_SECRET: el barrido
    // cruza organizaciones, así que no hay un org_id único que setear. El trabajo
    // por cotización de más abajo sí vuelve al carril normal withOrgTx.
    return reqContext.run({ userId: null, cronScope: true }, async () => {

    // Excluye orgs sandbox (entorno de prueba) y la org demo — mismo criterio
    // que recordatorios.ts/cobranza.ts.
    const [rows] = await withSystemTx(sql`
        update cotizaciones c
           set status = 'expired'
          from orgs o
         where c.org_id = o.id
           and c.status in ('sent', 'viewed')
           and c.vigencia is not null
           and c.vigencia < current_date
           and o.sandbox_of is null
           and o.owner_id::text <> '00000000-0000-0000-0000-000000000000'
        returning c.id, c.org_id, c.folio, c.total, c.base_currency, c.sent_at`);

    // El UPDATE de arriba ya confirmó todas: si el registro de una (evento,
    // webhook `quote.expired`) truena, las demás siguen. Antes la primera
    // excepción dejaba sin evento a todas las que venían detrás, para siempre.
    let fallidas = 0;
    for (const r of rows) {
        try {
            await registrarVencimiento(r as unknown as QuoteExpiredRow, { isSandbox: false, isDemo: false });
        } catch (err) {
            fallidas++;
            log.error('no se pudo registrar el vencimiento de una cotización', { route: 'cron/expirar-cotizaciones', orgId: r.org_id, err });
        }
    }

    // ── Aviso "por vencer" (evento quote_expiring de Ajustes › Notificaciones) ──
    // Exactamente 3 días antes de la vigencia. La coincidencia exacta de fecha
    // dispara una sola vez por cotización SOLO porque el reclamo diario de
    // cron_runs garantiza una corrida por día; si un día entero no corre, ese
    // aviso se pierde (la expiración de arriba no: es `vigencia < hoy`).
    const [porVencer] = await withSystemTx(sql`
        select c.id, c.org_id, c.folio, c.total, cl.empresa
        from cotizaciones c
        join orgs o on o.id = c.org_id
        left join clientes cl on cl.id = c.cliente_id
        where c.status in ('sent', 'viewed')
          and c.vigencia = current_date + 3
          and o.sandbox_of is null
          and o.owner_id::text <> '00000000-0000-0000-0000-000000000000'`);

    for (const r of porVencer) {
        try {
            await notify(r.org_id as string, 'quote_expiring', {
                folio: r.folio as string,
                cliente: (r.empresa as string) ?? null,
                total: Number(r.total ?? 0),
                link: `${siteOrigin()}/app/cotizaciones/${r.id}`,
            });
        } catch (err) {
            fallidas++;
            log.error('no se pudo avisar de una cotización por vencer', { route: 'cron/expirar-cotizaciones', orgId: r.org_id, err });
        }
    }

    return json({ vencidas: rows.length, porVencer: porVencer.length, fallidas });
    });
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
