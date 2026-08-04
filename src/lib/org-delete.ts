// Borrado real de una organización — compartido por DELETE /api/org (borrar
// la org activa) y DELETE /api/account (borrar orgs de las que el usuario es
// único dueño, como parte de borrar su cuenta personal). Ambos flujos
// terminan exactamente en el mismo camino: cancelar la suscripción de
// Stripe (best-effort), dejar constancia si había una cuenta Connect activa
// (Stripe no siempre permite borrarla vía API), y borrar la fila — las ~33
// tablas hijas ya tienen `on delete cascade` (ver db/schema.sql).
import { sql } from './db';
import { stripe } from './billing';

interface OrgToDelete {
    id: string;
    nombre: string;
    stripe_subscription_id?: string | null;
    stripe_account_id?: string | null;
}

export async function deleteOrgCascade(org: OrgToDelete): Promise<void> {
    if (org.stripe_subscription_id) {
        try {
            await stripe(`/v1/subscriptions/${org.stripe_subscription_id}`, {}, 'DELETE');
        } catch (e) {
            console.error(`[org-delete] no se pudo cancelar la suscripción ${org.stripe_subscription_id} de la org ${org.id}:`, e);
        }
    }
    if (org.stripe_account_id) {
        // No se intenta borrar la cuenta Connect vía API — un audit_log atado
        // a esta org desaparecería con ella (cascade), así que la constancia
        // real vive en los logs del servidor (Vercel), no en la BD.
        console.warn(`[org-delete] org ${org.id} (${org.nombre}) eliminada con cuenta Connect activa (${org.stripe_account_id}) — revisar manualmente en el dashboard de Stripe.`);
    }
    await sql`delete from orgs where id = ${org.id}`;
}
