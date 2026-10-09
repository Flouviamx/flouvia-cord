// GET /api/cron/spfe — cola de la factura electrónica entre empresarios por la
// solución pública de la AEAT (src/lib/fiscal/spfe/cola.ts): envía las
// facturas y los estados de cobro pendientes, resuelve por CONSULTA lo que
// quedó sin respuesta (nunca reenvía) y recoge lo que comunicó el cliente.
//
// Corre cada hora desde .github/workflows/cord-crons.yml; el de vercel.json es
// el respaldo diario (el plan de Vercel solo admite crons diarios). Idempotente.
// Mientras la AEAT no publique la especificación técnica del servicio, cada
// organización responde `omitido: transporte_no_publicado` sin tocar nada.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { reqContext } from '../../../lib/context';
import { log } from '../../../lib/log';
import { spfeConfig } from '../../../lib/fiscal/spfe/config';
import { orgsSpfe, procesarOrgSpfe, type ResultadoSpfeOrg } from '../../../lib/fiscal/spfe/cola';

// Por debajo del límite de la función y del --max-time 300 del workflow.
const PRESUPUESTO_MS = 240_000;

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;
    const deadline = Date.now() + PRESUPUESTO_MS;
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
        status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

    if (!spfeConfig().habilitado) return json({ ok: true, omitido: 'apagado', orgs: 0 });

    // Carril de SISTEMA solo para descubrir las organizaciones; el trabajo de
    // cada una (procesarOrgSpfe) vuelve a withOrgTx con su org_id.
    return reqContext.run({ userId: null, cronScope: true }, async () => {
        try {
            const results: ResultadoSpfeOrg[] = [];
            for (const orgId of await orgsSpfe()) {
                if (Date.now() >= deadline) break;
                results.push(await procesarOrgSpfe(orgId, { deadline }));
            }
            const totales = results.reduce((acc, r) => ({
                encolados: acc.encolados + r.encolados,
                enviados: acc.enviados + r.enviados,
                admitidos: acc.admitidos + r.admitidos,
                rechazados: acc.rechazados + r.rechazados,
                inciertos: acc.inciertos + r.inciertos,
            }), { encolados: 0, enviados: 0, admitidos: 0, rechazados: 0, inciertos: 0 });
            return json({ ok: true, orgs: results.length, ...totales, results });
        } catch (error) {
            log.error('spfe: el barrido falló', { route: 'cron/spfe', err: error });
            return json({ ok: false, error: 'No se pudo completar el barrido.' }, 500);
        }
    });
};
