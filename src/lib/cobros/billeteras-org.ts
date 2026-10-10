// Registro de los dominios de cobro (Apple Pay y Google Pay) para la cuenta
// conectada de UNA organización. El contrato y las fuentes están en
// ./billeteras.ts; aquí solo se decide qué dominios le tocan y se llama al
// proveedor con la llave de la plataforma y `Stripe-Account`.
//
// Lo disparan:
//   - el webhook `account.updated` cuando la cuenta puede cobrar;
//   - la verificación del dominio propio del negocio cuando queda activo;
//   - `npm run stripe:payment-domains` para las cuentas que ya existían.
//
// Nace APAGADO: sin `CORD_WALLETS_ENABLED=true` no registra nada por su
// cuenta, porque registrar el dominio es lo que hace aparecer las billeteras a
// los clientes de ese negocio. El script sí registra cuando un operador lo
// corre con `--apply`.
//
// Nunca lanza: registrar un dominio es una mejora de conversión, no una
// condición para cobrar. Un fallo queda en el log y el script lo repite.

import { stripe } from '../billing';
import { sql, withOrgTx } from '../db';
import { log } from '../log';
import { canonicalPublicOrigin } from '../public-links';
import { domainsEnabled } from '../vercel-domains';
import { readCustomerDomain } from '../customer-domains';
import {
    asegurarDominiosDeCobro, dominiosDeCobro, requiereAtencion,
    type EstadoDominioDeCobro, type LlamadaStripe,
} from './billeteras';

/** ¿Registra Cord los dominios por su cuenta (webhook y dominio propio)? */
export function billeterasActivas(): boolean {
    return (import.meta.env.CORD_WALLETS_ENABLED || process.env.CORD_WALLETS_ENABLED) === 'true';
}

const llamarStripe: LlamadaStripe = (ruta, { metodo = 'GET', params, cuenta, idempotencia }) =>
    stripe(ruta, params, metodo, { stripeAccount: cuenta, ...(idempotencia ? { idempotencyKey: idempotencia } : {}) });

/**
 * El dominio propio del negocio si está activo. Uno a medio verificar no se
 * registra todavía: la verificación que lo active vuelve a llamar aquí.
 */
async function dominioPropioActivo(orgId: string): Promise<string | null> {
    if (!domainsEnabled()) return null;
    try {
        const d = await readCustomerDomain(orgId);
        return d && d.status === 'active' && !d.removing ? d.hostname : null;
    } catch {
        return null;
    }
}

/** Los dominios donde el cliente de esta organización ve el formulario de pago. */
export async function dominiosDeCobroDeOrg(orgId: string): Promise<string[]> {
    return dominiosDeCobro({
        canonico: new URL(canonicalPublicOrigin()).hostname,
        propio: await dominioPropioActivo(orgId),
    });
}

/**
 * Deja registrados los dominios de cobro en la cuenta conectada de la
 * organización. `cuentaEsperada` evita registrar en una cuenta que el negocio
 * ya reemplazó cuando el aviso llega tarde.
 */
export async function sincronizarDominiosDeCobro(orgId: string, cuentaEsperada?: string): Promise<EstadoDominioDeCobro[] | null> {
    if (!billeterasActivas()) return null;
    try {
        const [rows] = await withOrgTx(orgId, sql`
            select stripe_account_id, stripe_charges_enabled, sandbox_of
              from orgs where id = ${orgId}`);
        const org = rows[0];
        const cuenta = String(org?.stripe_account_id || '');
        if (!cuenta || !org?.stripe_charges_enabled || org?.sandbox_of) return null;
        if (cuentaEsperada && cuenta !== cuentaEsperada) return null;

        const resultados = await asegurarDominiosDeCobro({ cuenta, dominios: await dominiosDeCobroDeOrg(orgId), llamar: llamarStripe });
        for (const r of resultados) {
            if (r.accion === 'creado') log.info('dominio de cobro registrado', { orgId, route: 'billeteras', dominio: r.dominio, applePay: r.applePay, googlePay: r.googlePay });
            if (requiereAtencion(r)) log.warn('dominio de cobro requiere atención', { orgId, route: 'billeteras', dominio: r.dominio, accion: r.accion, applePay: r.applePay, googlePay: r.googlePay, motivo: r.motivo });
        }
        return resultados;
    } catch (error) {
        log.error('no se pudieron registrar los dominios de cobro', { orgId, route: 'billeteras', err: error });
        return null;
    }
}
