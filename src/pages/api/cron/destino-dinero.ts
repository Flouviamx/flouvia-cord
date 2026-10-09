// GET /api/cron/destino-dinero — cada hora pone en vigor los cambios de a dónde
// llega el dinero cuya espera terminó (src/lib/money-hold.ts): la cuenta
// bancaria nueva pasa a predeterminada en Stripe, la CLABE nueva es la que ve el
// cliente y Mercado Pago vuelve a cobrar. A cada dueño le avisa que el cambio
// ya está vigente. También reintenta los que el registro da por vigentes y el
// proveedor todavía no (src/lib/destino-dinero.ts).
//
// El descubrimiento cross-org es una función estrecha (regla 30) y el trabajo de
// cada organización corre en su carril.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { reqContext } from '../../../lib/context';
import { cambiosVencidos, type TipoCambio } from '../../../lib/money-hold';
import { entrarEnVigor } from '../../../lib/destino-dinero';
import { sendOpsAlert } from '../../../lib/ops-alert';
import { log } from '../../../lib/log';

const PRESUPUESTO_MS = 240_000;

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    let vencidos: Array<{ org_id: string; id: string; tipo: TipoCambio }>;
    try {
        vencidos = await cambiosVencidos(200);
    } catch (err) {
        log.error('no se pudieron listar los cambios de destino vencidos', { route: 'destino-dinero', err });
        return json({ error: 'No se pudieron revisar los cambios.' }, 500);
    }

    let vigentes = 0;
    let reintentos = 0;
    let fallidos = 0;
    const limite = Date.now() + PRESUPUESTO_MS;
    for (const c of vencidos) {
        if (Date.now() > limite) break;
        const orgId = String(c.org_id);
        try {
            const r = await reqContext.run({ userId: null, orgId, actor: 'system' }, () => entrarEnVigor(orgId, String(c.id)));
            if (r === 'vigente') vigentes += 1;
            if (r === 'reintento_aplicado') reintentos += 1;
        } catch (err) {
            // El registro dice vigente y el proveedor todavía no: la siguiente
            // corrida lo reintenta (`aplicado_at` sigue en null).
            fallidos += 1;
            log.error('no se pudo poner en vigor un cambio de destino', { route: 'destino-dinero', orgId, err });
        }
    }
    if (fallidos) await sendOpsAlert('Cambios de destino del dinero sin aplicar', `${fallidos} de ${vencidos.length} fallaron; se reintentan cada hora`);
    return json({ ok: fallidos === 0, revisados: vencidos.length, vigentes, reintentos, fallidos });
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
