// GET /api/cron/verifactu-submit — outbox de Verifactu: envía a la AEAT los
// registros ya encadenados (SpainVerifactuProvider) que siguen `pendiente`.
// El encadenamiento es síncrono al emitir; este cron es SOLO el envío, para
// que una caída de la AEAT nunca bloquee la emisión de una factura.
//
// VERI*FACTU exige remisión inmediata, con un control de flujo (art. 16.2 de
// la Orden HAC/1177/2024): esperar el TiempoEsperaEnvio de la AEAT entre
// envíos salvo con 1000 registros acumulados. El primer intento lo hace el
// propio proveedor justo después de emitir; este cron recoge lo que quedó.
// Corre CADA HORA desde .github/workflows/cord-crons.yml (el plan de Vercel
// solo admite crons diarios; el de vercel.json queda de respaldo). Dos
// pasadas dentro de un presupuesto de tiempo: la primera da a cada
// organización un envío sin esperar —ninguna monopoliza la corrida—, la
// segunda vuelve sobre las que aún tienen pendientes y espera su turno de
// control de flujo mientras quede tiempo.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { orgsConVerifactuActivo, submitPendingForOrg, type SubmitOrgResult } from '../../../lib/fiscal/verifactu/submit';
import { log } from '../../../lib/log';
import { reqContext } from '../../../lib/context';

// Por debajo del límite de la función y del --max-time 300 del workflow.
const PRESUPUESTO_MS = 240_000;

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;
    const deadline = Date.now() + PRESUPUESTO_MS;

    // Carril de SISTEMA: orgsConVerifactuActivo() barre TODAS las organizaciones
    // para encontrar las españolas con Verifactu. El envío de cada una
    // (submitPendingForOrg) vuelve a withOrgTx con su propio org_id.
    return reqContext.run({ userId: null, cronScope: true }, async () => {
    try {
        const orgs = await orgsConVerifactuActivo();
        const porOrg = new Map<string, SubmitOrgResult[]>();
        const correr = async (orgId: string, permitirEspera: boolean) => {
            try {
                const r = await submitPendingForOrg(orgId, { deadline, permitirEspera });
                porOrg.set(orgId, [...(porOrg.get(orgId) ?? []), r]);
                return r;
            } catch (error) {
                // Una org que falla no puede tumbar el envío de las demás.
                log.error('verifactu-submit: fallo no controlado para una org', { route: 'cron/verifactu-submit', orgId, err: error });
                const r: SubmitOrgResult = {
                    orgId, enviados: 0, aceptados: 0, aceptadosConErrores: 0, rechazados: 0, bloqueados: 0, sinRespuesta: 0,
                    quedanPendientes: false, error: 'fallo no controlado',
                };
                porOrg.set(orgId, [...(porOrg.get(orgId) ?? []), r]);
                return r;
            }
        };

        const pendientes: string[] = [];
        for (const orgId of orgs) {
            if (Date.now() >= deadline) break;
            const r = await correr(orgId, false);
            if (r.quedanPendientes && !r.error) pendientes.push(orgId);
        }
        for (const orgId of pendientes) {
            if (Date.now() >= deadline) break;
            await correr(orgId, true);
        }

        const results = [...porOrg.values()].flat();
        const totals = results.reduce((acc, r) => ({
            enviados: acc.enviados + r.enviados,
            aceptados: acc.aceptados + r.aceptados,
            aceptadosConErrores: acc.aceptadosConErrores + r.aceptadosConErrores,
            rechazados: acc.rechazados + r.rechazados,
            bloqueados: acc.bloqueados + r.bloqueados,
            sinRespuesta: acc.sinRespuesta + r.sinRespuesta,
        }), { enviados: 0, aceptados: 0, aceptadosConErrores: 0, rechazados: 0, bloqueados: 0, sinRespuesta: 0 });

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
