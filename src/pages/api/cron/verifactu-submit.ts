// GET /api/cron/verifactu-submit — outbox de Verifactu: envía a la AEAT los
// registros ya encadenados (SpainVerifactuProvider) que siguen `pendiente`.
// El encadenamiento es síncrono al emitir; este cron es SOLO el envío, para
// que una caída de la AEAT nunca bloquee la emisión de una factura.
//
// VERI*FACTU exige remisión "inmediata" por definición legal, así que lo
// ideal sería correr cada pocos minutos — pero el plan de Vercel de Cord solo
// permite crons diarios (vercel.json: una vez al día). Mientras ese sea el
// plan, el backlog se acumula hasta la siguiente corrida diaria; sube la
// frecuencia en vercel.json en cuanto el plan lo permita.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { orgsConVerifactuActivo, submitPendingForOrg } from '../../../lib/fiscal/verifactu/submit';
import { log } from '../../../lib/log';
import { reqContext } from '../../../lib/context';

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    // Carril de SISTEMA: orgsConVerifactuActivo() barre TODAS las organizaciones
    // para encontrar las españolas con Verifactu encendido. El envío de cada una
    // (submitPendingForOrg) vuelve a withOrgTx con su propio org_id.
    return reqContext.run({ userId: null, cronScope: true }, async () => {
    try {
        const orgs = await orgsConVerifactuActivo();
        const results = [];
        for (const orgId of orgs) {
            try {
                results.push(await submitPendingForOrg(orgId));
            } catch (error) {
                // Una org que falla no puede tumbar el envío de las demás.
                log.error('verifactu-submit: fallo no controlado para una org', { route: 'cron/verifactu-submit', orgId, err: error });
                results.push({ orgId, enviados: 0, aceptados: 0, aceptadosConErrores: 0, rechazados: 0, error: 'fallo no controlado' });
            }
        }
        const totals = results.reduce((acc, r) => ({
            enviados: acc.enviados + r.enviados,
            aceptados: acc.aceptados + r.aceptados,
            aceptadosConErrores: acc.aceptadosConErrores + r.aceptadosConErrores,
            rechazados: acc.rechazados + r.rechazados,
        }), { enviados: 0, aceptados: 0, aceptadosConErrores: 0, rechazados: 0 });

        return new Response(JSON.stringify({ ok: true, orgs: orgs.length, ...totals, results }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        log.error('error no controlado', { route: 'cron/verifactu-submit', err: error });
        return new Response(JSON.stringify({ error: 'No se pudo correr el envío de Verifactu.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }
    });
};
