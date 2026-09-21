// /api/cron/workflows — dos trabajos, en este orden:
//
//   1. Emitir el tic de los workflows PROGRAMADOS a los que ya les tocaba.
//   2. Recoger las esperas y reintentos que ya vencieron.
//
// Corre cada hora, no una vez al día: un horario que el negocio eligió ("cada
// lunes a las 9") no se puede honrar con un barrido diario, y una espera
// condicionada revisaría una vez al día lo que ya se cumplió por la mañana.
//
// El barrido cross-org solo descubre organizaciones; cada una se procesa en su
// propio carril (regla 30).
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, withOrgTx, withSystemTx } from '../../../lib/db';
import { reqContext } from '../../../lib/context';
import { log } from '../../../lib/log';
import { processOrgRuns } from '../../../lib/workflows/engine';
import { enqueueScheduledRun } from '../../../lib/workflows/queue';
import { sanitizeDefinition } from '../../../lib/workflows/definition';
import { nextScheduleAt, scheduleEventData } from '../../../lib/workflows/schedule';
import { recordDomainEvent } from '../../../lib/domain-events';
import { SCHEDULE_TRIGGER } from '../../../lib/workflows/catalog';

const MAX_ORGS = 200;
const MAX_TICS = 200;

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    const tics = await emitirProgramados();

    const orgIds = await reqContext.run({ userId: null, cronScope: true }, async () => {
        const [rows] = await withSystemTx(sql`
            select org_id from workflow_runs
             where status in ('queued', 'waiting', 'running') and run_at <= now()
             group by org_id
             order by min(run_at)
             limit ${MAX_ORGS}`);
        return rows.map((r) => String(r.org_id));
    });

    let procesadas = 0;
    for (const orgId of orgIds) {
        procesadas += await reqContext.run({ userId: null, orgId }, () => processOrgRuns(orgId, 50));
    }
    return new Response(JSON.stringify({ ok: true, organizaciones: orgIds.length, ejecuciones: procesadas, tics }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
    });
};

/**
 * Tic de los workflows programados. `next_run_at` se AVANZA antes de emitir
 * (regla 25): al revés, un fallo entre emitir y guardar deja el tic elegible
 * otra vez y el equipo recibe el mismo resumen dos veces.
 *
 * El evento se emite para UN workflow, no para el tipo: cada programado tiene
 * su propio horario, así que un tic compartido dispararía a los demás fuera de
 * hora. Por eso `enqueueScheduledRun` y no el encolado normal por disparador.
 */
async function emitirProgramados(): Promise<number> {
    const pendientes = await reqContext.run({ userId: null, cronScope: true }, async () => {
        const [rows] = await withSystemTx(sql`
            select w.id, w.org_id, w.version, w.publicado, w.next_run_at,
                   coalesce(o.zona_horaria, 'America/Mexico_City') as zona,
                   coalesce(o.idioma, 'es-MX') as idioma
              from workflows w
              join orgs o on o.id = w.org_id
             where w.estado = 'active'
               and w.trigger_publicado = ${SCHEDULE_TRIGGER}
               and w.next_run_at is not null
               and w.next_run_at <= now()
               and o.sandbox_of is null
               and o.owner_id::text <> '00000000-0000-0000-0000-000000000000'
             order by w.next_run_at
             limit ${MAX_TICS}`);
        return rows;
    });

    let emitidos = 0;
    for (const w of pendientes) {
        const orgId = String(w.org_id);
        const zona = String(w.zona);
        const def = sanitizeDefinition(w.publicado);
        const previsto = new Date(String(w.next_run_at));
        const siguiente = def.schedule ? nextScheduleAt(def.schedule, zona, new Date()) : null;

        const [avanzado] = await withOrgTx(orgId, sql`
            update workflows set next_run_at = ${siguiente ? siguiente.toISOString() : null}
             where id = ${w.id} and org_id = ${orgId} and next_run_at = ${previsto.toISOString()}
            returning id`);
        // Si otra corrida ya lo avanzó, este tic no es nuestro.
        if (!avanzado.length) continue;

        try {
            const eventId = await reqContext.run({ userId: null, orgId, actor: 'system' }, () =>
                recordDomainEvent(orgId, SCHEDULE_TRIGGER, {
                    workflow_id: w.id,
                    ...scheduleEventData(previsto, zona, String(w.idioma)),
                }, 'system'));
            if (eventId && await enqueueScheduledRun(orgId, String(w.id), Number(w.version), def, eventId)) emitidos++;
        } catch (err) {
            log.error('no se pudo emitir el tic de un workflow programado', { route: 'cron/workflows', orgId, err });
        }
    }
    return emitidos;
}
