// Borrado real de una organización — compartido por DELETE /api/org (borrar
// la org activa) y DELETE /api/account (borrar orgs de las que el usuario es
// único dueño, como parte de borrar su cuenta personal). Ambos flujos
// terminan exactamente en el mismo camino: cancelar la suscripción de
// Stripe (best-effort), dejar constancia si había una cuenta Connect activa
// (Stripe no siempre permite borrarla vía API), y borrar la fila — las ~33
// tablas hijas ya tienen `on delete cascade` (ver db/schema.sql).
import { sql, withOrgTx } from './db';
import { stripe } from './billing';

import { log } from './log';
interface OrgToDelete {
    id: string;
    nombre: string;
    stripe_subscription_id?: string | null;
    stripe_account_id?: string | null;
}

export async function deleteOrgCascade(org: OrgToDelete): Promise<void> {
    await releaseOrgBilling(org);
    await withOrgTx(org.id, sql`delete from orgs where id = ${org.id}`);
}

/**
 * Lo que hay que soltar en el proveedor ANTES de borrar la fila: la suscripción
 * (si no, Stripe sigue cobrándole a una organización que ya no existe) y la
 * constancia de una cuenta Connect viva. Cord Ops la usa por separado porque
 * borra en su propio carril, con la bitácora en la misma transacción.
 */
export async function releaseOrgBilling(org: OrgToDelete): Promise<{ subscriptionCanceled: boolean; connectAccount: boolean }> {
    let subscriptionCanceled = false;
    if (org.stripe_subscription_id) {
        try {
            await stripe(`/v1/subscriptions/${org.stripe_subscription_id}`, {}, 'DELETE');
            subscriptionCanceled = true;
        } catch (e: any) {
            // Ya no existe del lado del proveedor: no queda nada que cobrar.
            if (e?.code === 'resource_missing') subscriptionCanceled = true;
            else log.error('no se pudo cancelar la suscripción al borrar la org', { route: 'org-delete', orgId: org.id, subscriptionId: org.stripe_subscription_id, err: e });
        }
    }
    if (org.stripe_account_id) {
        // No se intenta borrar la cuenta Connect vía API — un audit_log atado
        // a esta org desaparecería con ella (cascade), así que la constancia
        // real vive en los logs del servidor (Vercel), no en la BD.
        log.warn('org eliminada con cuenta Connect activa — revisar manualmente en el proveedor', { route: 'org-delete', orgId: org.id, orgNombre: org.nombre, connectAccountId: org.stripe_account_id });
    }
    return { subscriptionCanceled, connectAccount: Boolean(org.stripe_account_id) };
}
