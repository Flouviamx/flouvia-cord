// El cliente del negocio en su cuenta conectada (cargos directos).
//
// Los métodos guardados para el cobro automático viven en un Customer de la
// cuenta CONECTADA, no de la plataforma: el negocio es el comercio del cargo,
// y un mandato SEPA o ACH firmado con él no sirve para otra cuenta. Por eso la
// fila guarda también la cuenta: si el negocio rehace su alta de cobros, el
// Customer anterior ya no existe para la nueva y se crea otro.

import { stripe } from '../billing';
import { sql, withOrgTx } from '../db';
import { resumenMetodo, type ResumenMetodo } from './metodos';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * El Customer del cliente en la cuenta conectada, creándolo la primera vez.
 * Lleva el correo del cliente porque el proveedor manda ahí los avisos que la
 * domiciliación exige (el aviso de cada cargo SEPA y la confirmación del
 * mandato ACH). Idempotente por cliente y cuenta: dos pestañas no crean dos.
 */
export async function asegurarCustomer(orgId: string, clienteId: string, account: string): Promise<string> {
    const [[c]] = await withOrgTx(orgId, sql`
        select id, empresa, contacto, email, stripe_customer_id, stripe_customer_account
          from clientes where id = ${clienteId} and org_id = ${orgId}`);
    if (!c) throw new Error('Cliente no encontrado.');
    if (c.stripe_customer_id && c.stripe_customer_account === account) return String(c.stripe_customer_id);
    const email = String(c.email || '').trim();
    const customer = await stripe('/v1/customers', {
        name: String(c.empresa || c.contacto || '').slice(0, 250),
        ...(EMAIL.test(email) ? { email } : {}),
        'metadata[cord_cliente_id]': clienteId,
        'metadata[cord_org_id]': orgId,
    }, 'POST', { stripeAccount: account, idempotencyKey: `cord-cliente-${clienteId}-${account}` });
    if (!customer?.id) throw new Error('El proveedor no devolvió el cliente.');
    await withOrgTx(orgId, sql`
        update clientes set stripe_customer_id = ${customer.id}, stripe_customer_account = ${account}
         where id = ${clienteId} and org_id = ${orgId}`);
    return String(customer.id);
}

/** El método de pago en la cuenta conectada, resumido (sin número completo). */
export async function leerMetodo(account: string, paymentMethodId: string): Promise<{ id: string; customer: string | null; resumen: ResumenMetodo } | null> {
    if (!/^pm_[A-Za-z0-9]+$/.test(paymentMethodId)) return null;
    const pm = await stripe(`/v1/payment_methods/${encodeURIComponent(paymentMethodId)}`, undefined, 'GET', { stripeAccount: account });
    const resumen = resumenMetodo(pm);
    if (!pm?.id || !resumen) return null;
    return { id: String(pm.id), customer: typeof pm.customer === 'string' ? pm.customer : (pm.customer?.id ?? null), resumen };
}

/**
 * Desvincula el método del Customer. En domiciliación esto además da de baja
 * el mandato: es lo que el proveedor pide hacer cuando el titular revoca la
 * autorización. Un método que ya no existe cuenta como desvinculado.
 */
export async function desvincularMetodo(account: string, paymentMethodId: string): Promise<void> {
    if (!/^pm_[A-Za-z0-9]+$/.test(paymentMethodId)) return;
    try {
        await stripe(`/v1/payment_methods/${encodeURIComponent(paymentMethodId)}/detach`, undefined, 'POST', { stripeAccount: account });
    } catch (error: any) {
        if (error?.code === 'resource_missing' || error?.code === 'payment_method_unexpected_state') return;
        throw error;
    }
}
