// GET /api/cron/us-tax — registra las ventas de EE. UU. con sales tax por
// dirección que todavía no están en la declaración del negocio.
//
// La factura registra su venta al emitirse (fiscal/invoices.ts); este cron
// recoge lo que quedó: una cotización cobrada por cualquier riel (link,
// Mercado Pago, pago manual), un registro que falló por red, o un documento
// que ya no coincide con su cálculo y hay que conciliar. Corre cada hora desde
// .github/workflows/cord-crons.yml (diario en vercel.json, de respaldo).
//
// Carril de SISTEMA solo para descubrir qué organizaciones tienen la
// preferencia; el trabajo de cada una vuelve a withOrgTx (regla 30).
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { reqContext } from '../../../lib/context';
import { log } from '../../../lib/log';
import { orgsConUsTax, sweepUsTaxForOrg } from '../../../lib/us-tax/calculo';

const PRESUPUESTO_MS = 240_000;

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;
    const deadline = Date.now() + PRESUPUESTO_MS;

    return reqContext.run({ userId: null, cronScope: true }, async () => {
        try {
            const orgs = await orgsConUsTax();
            const totales = { registradas: 0, pendientes: 0, errores: 0, sinCuota: 0 };
            for (const orgId of orgs) {
                if (Date.now() >= deadline) break;
                try {
                    const r = await sweepUsTaxForOrg(orgId);
                    totales.registradas += r.registradas;
                    totales.pendientes += r.pendientes;
                    totales.errores += r.errores;
                    // Ventas que esperan cupo de la cuota mensual del plan.
                    totales.sinCuota += r.sinCuota;
                } catch (error) {
                    // Una organización que falla no detiene a las demás.
                    log.error('us-tax: fallo no controlado para una org', { route: 'cron/us-tax', orgId, err: error });
                    totales.errores++;
                }
            }
            return new Response(JSON.stringify({ ok: true, orgs: orgs.length, ...totales }), {
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            });
        } catch (error) {
            log.error('error no controlado', { route: 'cron/us-tax', err: error });
            return new Response(JSON.stringify({ error: 'No se pudo correr el registro de ventas de sales tax.' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            });
        }
    });
};
