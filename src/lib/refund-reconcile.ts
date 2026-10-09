// src/lib/refund-reconcile.ts
// Un reembolso cuyo resultado no se supo NO es un reembolso fallido.
//
// Antes, cualquier error al pedir el reembolso —incluida una red caída o un 5xx
// del proveedor DESPUÉS de que el reembolso ya se había creado— marcaba la fila
// como `failed`. Eso liberaba el saldo reembolsable y el vendedor podía volver a
// devolver el mismo dinero. Y como la fila no tenía el id del proveedor, el
// webhook insertaba una segunda fila para el mismo reembolso.
//
// Ahora:
//   - solo un rechazo DEFINITIVO del proveedor (4xx que no sea 409/429) marca
//     `failed`;
//   - todo lo demás deja la fila en `pending`, reteniendo el saldo;
//   - cada reembolso lleva en su metadata el id de su fila (`cord_refund_id`), y
//     el webhook y esta conciliación la encuentran por ahí;
//   - antes de autorizar otro reembolso del mismo cobro se concilian las filas
//     inciertas contra el proveedor.

import { sql, withOrgTx } from './db';
import { stripe } from './billing';
import { log } from './log';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Estados de reembolso que todavía comprometen saldo del cobro. */
export const REFUND_HOLDING_STATUSES = ['pending', 'succeeded', 'pending_manual', 'requires_action'] as const;

/**
 * ¿El proveedor dijo que NO? Un 4xx es una respuesta definitiva sobre ESTA
 * petición, salvo 409 (conflicto de idempotencia: otra petición con la misma
 * llave pudo haber pasado) y 429 (no se procesó todavía). Sin código HTTP —red,
 * timeout, respuesta ilegible— no se sabe qué pasó.
 */
export function esRechazoDefinitivo(error: unknown): boolean {
    const status = Number((error as any)?.stripeStatus);
    if (!Number.isInteger(status)) return false;
    return status >= 400 && status < 500 && status !== 409 && status !== 429;
}

/** El id de la fila de Cord que viaja en la metadata del reembolso, si es válido. */
export function cordRefundIdDe(refund: any): string | null {
    const id = String(refund?.metadata?.cord_refund_id || '');
    return UUID.test(id) ? id : null;
}

/** Pasado este tiempo sin rastro en el proveedor, la petición no llegó nunca. */
const MINUTOS_SIN_RASTRO = 15;

/**
 * Resuelve las filas `pending` sin id del proveedor de un cobro: busca su
 * reembolso en el proveedor por `cord_refund_id`. Si aparece, la fila toma su
 * id y su estado; si no aparece y ya pasó el margen, la petición nunca llegó y
 * la fila se marca `failed` (libera el saldo). Nunca se vuelve a pedir el
 * reembolso: eso podría crearlo tarde.
 */
export async function conciliarReembolsosInciertos(
    orgId: string,
    cobroId: string,
    ctx: { account: string | null; paymentIntentId: string | null },
): Promise<void> {
    const [inciertos] = await withOrgTx(orgId, sql`
        select id, (created_at < now() - make_interval(mins => ${MINUTOS_SIN_RASTRO})) as vencida
          from cobro_reembolsos
         where org_id = ${orgId} and cobro_id = ${cobroId}
           and status = 'pending' and stripe_refund_id is null and manual = false and mp_refund_id is null`);
    if (!inciertos.length || !ctx.account || !ctx.paymentIntentId) return;

    let refunds: any[] = [];
    try {
        const page = await stripe('/v1/refunds', { payment_intent: ctx.paymentIntentId, limit: '100' }, 'GET', { stripeAccount: ctx.account });
        refunds = Array.isArray(page?.data) ? page.data : [];
    } catch (err) {
        // Sin respuesta del proveedor no se decide nada: las filas siguen
        // reteniendo el saldo hasta la próxima conciliación.
        log.warn('no se pudieron leer los reembolsos para conciliar', { route: 'refund-reconcile', orgId, cobroId, err });
        return;
    }
    for (const fila of inciertos) {
        const encontrado = refunds.find((r) => cordRefundIdDe(r) === fila.id);
        if (encontrado) {
            await withOrgTx(orgId, sql`
                update cobro_reembolsos
                   set stripe_refund_id = ${String(encontrado.id)}, status = ${String(encontrado.status || 'pending')},
                       failure_reason = ${encontrado.failure_reason || null}, updated_at = now()
                 where id = ${fila.id} and org_id = ${orgId} and stripe_refund_id is null`);
        } else if (fila.vencida) {
            await withOrgTx(orgId, sql`
                update cobro_reembolsos set status = 'failed', failure_reason = 'no_llego_al_proveedor', updated_at = now()
                 where id = ${fila.id} and org_id = ${orgId} and status = 'pending' and stripe_refund_id is null`);
        }
    }
}
