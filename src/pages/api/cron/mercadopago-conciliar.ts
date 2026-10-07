// GET /api/cron/mercadopago-conciliar — red de seguridad del webhook de
// Mercado Pago.
//
// El webhook es el camino rápido, pero un aviso se puede perder: el proveedor
// caído durante todos sus reintentos, una organización que se desconectó y se
// volvió a conectar, un aviso que llegó antes de un despliegue. Este cron busca
// en el proveedor cada referencia de Cord que sigue abierta (cobros pendientes
// y facturas con saldo, con preferencia en los últimos 45 días) y aplica lo que
// encuentre con el MISMO código que el webhook (src/lib/mercadopago-cobro.ts),
// idempotente por el índice único del id del pago.
//
// Mismo patrón que /api/cron/billing-reconcile: el descubrimiento cross-org es
// una función estrecha, y cada pago se aplica en el carril de su organización.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, withOrgTx } from '../../../lib/db';
import { assertCronAuth } from '../../../lib/cron-auth';
import { reqContext } from '../../../lib/context';
import { searchMpPayments } from '../../../lib/mercadopago';
import { processMpPayment } from '../../../lib/mercadopago-cobro';
import { log } from '../../../lib/log';

/** Tope por corrida: cada referencia es una llamada al proveedor. */
const LIMITE = 300;
/** Presupuesto de tiempo: lo que no alcance se revisa mañana (todo es idempotente). */
const PRESUPUESTO_MS = 240_000;

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    let referencias: Array<{ org_id: string; mp_user_id: string | null; referencia: string }>;
    try {
        referencias = await sql`select org_id, mp_user_id, referencia from cord_mp_referencias_abiertas(45, ${LIMITE})` as any;
    } catch (err) {
        log.error('no se pudieron listar las referencias abiertas de Mercado Pago', { route: 'mercadopago-conciliar', err });
        return json({ error: 'No se pudo conciliar Mercado Pago.' }, 500);
    }

    let aplicados = 0;
    let fallidas = 0;
    let sinCredenciales = 0;
    let revisadas = 0;
    const limiteTiempo = Date.now() + PRESUPUESTO_MS;
    for (const r of referencias) {
        if (Date.now() > limiteTiempo) break;
        revisadas += 1;
        const orgId = String(r.org_id);
        try {
            const encontrados = await reqContext.run({ userId: null, orgId, actor: 'system' }, () =>
                searchMpPayments(orgId, String(r.referencia)));
            if (!encontrados.ok) {
                if (encontrados.reason === 'sin_credenciales') sinCredenciales += 1;
                else fallidas += 1;
                continue;
            }
            for (const pago of encontrados.payments) {
                // Solo lo que mueve el ledger: un pago aprobado, o uno que ya se
                // devolvió o se revirtió (el webhook pudo no verlo).
                if (!['approved', 'refunded', 'charged_back', 'in_mediation'].includes(pago.status)) continue;
                const res = await reqContext.run({ userId: null, orgId, actor: 'system' }, () =>
                    processMpPayment(orgId, r.mp_user_id ? String(r.mp_user_id) : null, pago));
                if (res.propio) aplicados += 1;
            }
            // Revisada: la próxima corrida empieza por las que llevan más tiempo
            // sin revisarse. Una falla temporal NO la marca: vuelve a ir primero.
            const ref = String(r.referencia);
            await reqContext.run({ userId: null, orgId, actor: 'system' }, () => ref.startsWith('fac:')
                ? withOrgTx(orgId, sql`update documentos_fiscales set mp_revisado_at = now() where id = ${ref.slice(4)}::uuid and org_id = ${orgId}`)
                : withOrgTx(orgId, sql`update cotizacion_cobros set mp_revisado_at = now() where id = ${ref}::uuid and org_id = ${orgId}`));
        } catch (err) {
            fallidas += 1;
            log.error('no se pudo conciliar una referencia de Mercado Pago', { route: 'mercadopago-conciliar', orgId, err });
        }
    }

    return json({
        ok: fallidas === 0,
        revisadas,
        pendientes_para_manana: referencias.length - revisadas,
        limite_alcanzado: referencias.length >= LIMITE,
        pagos_revisados: aplicados,
        sin_credenciales: sinCredenciales,
        fallidas,
    }, fallidas ? 500 : 200);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
}
