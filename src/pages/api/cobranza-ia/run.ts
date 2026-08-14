// /api/cobranza-ia/run — ejecución MANUAL del agente sobre la org activa.
// Llama al mismo motor que el cron (src/lib/agents/cobranza-run.ts). Antes esto
// vivía como `run_cobranza` en /api/agentes y era un clon divergente del cron.
//   POST {}                → corre de verdad
//   POST { dryRun: true }  → solo calcula a quién le tocaría (widget "En la mira")
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { runCobranzaOrg } from '../../../lib/agents/cobranza-run';
import { rateLimit } from '../../../lib/ratelimit';
import { requireEntitlement } from '../../../lib/org-entitlements';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobranza');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const entitlementDenied = await requireEntitlement(orgId, 'collections_ai');
    if (entitlementDenied) return entitlementDenied;
    let body: any = {};
    try { body = await request.json(); } catch { /* body opcional */ }
    const dryRun = !!body.dryRun;

    // Cada corrida real gasta cuota de IA y manda correos a clientes: 5/hora es
    // de sobra para un disparo manual y acota el daño de un doble clic nervioso.
    if (!dryRun) {
        const rl = await rateLimit(`cobranza-ia-run:${orgId}`, 5, 3600);
        if (!rl.ok) return json({ error: 'Ya corriste el agente varias veces esta hora. Espera un poco.' }, 429);
    }

    try {
        const res = await runCobranzaOrg(orgId, { dryRun });
        if (!dryRun) {
            await logAudit(orgId, {
                accion: 'cobranza_ia.ejecutado', entidad: 'org', entidad_id: orgId,
                detalle: `${res.procesadas} procesadas · ${res.borradores} borradores · ${res.enviados} enviados`,
                ip: reqIp(request),
            });
        }
        return json({ ok: true, ...res });
    } catch (e: any) {
        return json({ error: e?.message || 'No se pudo ejecutar el agente' }, 500);
    }
};
