// GET /api/cron/fiscal-plataforma — Francia: cola de la emisión por plataforma
// autorizada (src/lib/fiscal/transmision/cola.ts). Envía las facturas entre
// empresas, el e-reporting de las operaciones con particulares y con el
// extranjero y los cobros cuya TVA es exigible al cobro; resuelve por CONSULTA
// lo que quedó sin respuesta (nunca reenvía) y, como respaldo del webhook,
// consulta las altas en curso.
//
// Corre cada hora desde .github/workflows/cord-crons.yml; el de vercel.json es
// el respaldo diario (el plan de Vercel solo admite crons diarios). Idempotente.
// Con el riel apagado responde `omitido: apagado` sin tocar nada.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { reqContext } from '../../../lib/context';
import { log } from '../../../lib/log';
import { paConfig } from '../../../lib/fiscal/transmision/config';
import { orgsPa, procesarOrgPa, type ResultadoPaOrg } from '../../../lib/fiscal/transmision/cola';

// Por debajo del límite de la función y del --max-time 300 del workflow.
const PRESUPUESTO_MS = 240_000;

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;
    const deadline = Date.now() + PRESUPUESTO_MS;
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
        status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

    if (!paConfig().habilitado) return json({ ok: true, omitido: 'apagado', orgs: 0 });

    // Carril de SISTEMA solo para descubrir las organizaciones; el trabajo de
    // cada una (procesarOrgPa) vuelve a withOrgTx con su org_id.
    return reqContext.run({ userId: null, cronScope: true }, async () => {
        try {
            const results: ResultadoPaOrg[] = [];
            for (const orgId of await orgsPa()) {
                if (Date.now() >= deadline) break;
                results.push(await procesarOrgPa(orgId, { deadline }));
            }
            const totales = results.reduce((acc, r) => ({
                encolados: acc.encolados + r.encolados,
                bloqueados: acc.bloqueados + r.bloqueados,
                enviados: acc.enviados + r.enviados,
                aceptados: acc.aceptados + r.aceptados,
                rechazados: acc.rechazados + r.rechazados,
                inciertos: acc.inciertos + r.inciertos,
            }), { encolados: 0, bloqueados: 0, enviados: 0, aceptados: 0, rechazados: 0, inciertos: 0 });
            return json({ ok: true, orgs: results.length, ...totales, results: results.filter((r) => r.omitido !== 'sin_alta') });
        } catch (error) {
            log.error('fr-pa: el barrido falló', { route: 'cron/fiscal-plataforma', err: error });
            return json({ ok: false, error: 'No se pudo completar el barrido.' }, 500);
        }
    });
};
