// GET /api/cron/fiscal-latam — outbox de los rieles fiscales de LatAm (hoy:
// ARCA). Resuelve por CONSULTA los intentos que quedaron sin respuesta de la
// autoridad; nunca reenvía un pedido (latam/resolucion.ts).
//
// Corre cada hora desde .github/workflows/cord-crons.yml; el de vercel.json es
// el respaldo diario. Idempotente: un intento ya resuelto no se vuelve a tocar.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { reqContext } from '../../../lib/context';
import { log } from '../../../lib/log';
import { railConfig } from '../../../lib/fiscal/latam/config';
import { orgsConPendientes, resolverPendientesDeOrg, type ResultadoOrg } from '../../../lib/fiscal/latam/resolucion';
import { RIELES, type RailId } from '../../../lib/fiscal/latam/rieles';

// Por debajo del límite de la función y del --max-time 300 del workflow.
const PRESUPUESTO_MS = 240_000;

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;
    const deadline = Date.now() + PRESUPUESTO_MS;

    return reqContext.run({ userId: null, cronScope: true }, async () => {
        try {
            const results: (ResultadoOrg & { rail: RailId })[] = [];
            for (const rail of Object.keys(RIELES) as RailId[]) {
                if (!railConfig(rail).habilitado) continue;
                for (const orgId of await orgsConPendientes(rail)) {
                    if (Date.now() >= deadline) break;
                    try {
                        results.push({ rail, ...(await resolverPendientesDeOrg(orgId, rail, deadline)) });
                    } catch (error) {
                        // Una organización que falla no tumba la corrida de las demás.
                        log.error('fiscal-latam: fallo no controlado para una org', { route: 'cron/fiscal-latam', orgId, rail, err: error });
                        results.push({ rail, orgId, revisados: 0, autorizados: 0, descartados: 0, sinResolver: 0, error: 'fallo no controlado' });
                    }
                }
            }
            const totals = results.reduce((acc, r) => ({
                revisados: acc.revisados + r.revisados,
                autorizados: acc.autorizados + r.autorizados,
                descartados: acc.descartados + r.descartados,
                sinResolver: acc.sinResolver + r.sinResolver,
            }), { revisados: 0, autorizados: 0, descartados: 0, sinResolver: 0 });
            return new Response(JSON.stringify({ ok: true, orgs: results.length, ...totals, results }), {
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            });
        } catch (error) {
            log.error('fiscal-latam: el barrido falló', { route: 'cron/fiscal-latam', err: error });
            return new Response(JSON.stringify({ ok: false, error: 'No se pudo completar el barrido.' }), {
                status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            });
        }
    });
};
