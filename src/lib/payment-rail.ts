// src/lib/payment-rail.ts
// Qué riel de cobro en línea tiene una organización, y en qué ORDEN se ofrece.
//
// Cord tiene dos: Cord Payments (Stripe Connect) y Mercado Pago. Hasta que
// existió el segundo, "¿esta cuenta puede cobrar en línea?" era una condición
// sobre Stripe repetida a mano en seis archivos — y por eso una cuenta de
// Colombia con Mercado Pago conectado seguía sin ver un botón de pago. Aquí vive
// la decisión, una sola vez.
//
// PRIORIDAD: Cord Payments va primero. Donde una cuenta tiene los dos (México y
// Brasil), es el riel que se ofrece por defecto y el de Mercado Pago queda como
// alternativa; donde solo hay uno, ese es el único.

import { supportsMercadoPago, supportsOnlinePayments } from './countries';

export type PaymentRail = 'cord_payments' | 'mercadopago';

export interface RailOrg {
    stripeAccountId?: string | null;
    stripeChargesEnabled?: boolean | null;
    aceptaTarjeta?: boolean | null;
    cobroSpeiAuto?: boolean | null;
    mpChargesEnabled?: boolean | null;
    country?: string | null;
}

/** Rieles disponibles, de mayor a menor prioridad. Vacío = no se cobra en línea. */
export function availableRails(org: RailOrg): PaymentRail[] {
    const rails: PaymentRail[] = [];
    // La condición de Cord Payments es la que ya existía, sin cambios: cuenta
    // conectada, cobros habilitados y al menos un método aceptado.
    if (org.stripeAccountId && org.stripeChargesEnabled && (org.aceptaTarjeta || org.cobroSpeiAuto)) {
        rails.push('cord_payments');
    }
    // Mercado Pago exige además que el país tenga riel: una credencial vieja de
    // un país que se retiró no debe seguir abriendo cobros.
    if (org.mpChargesEnabled && supportsMercadoPago(String(org.country ?? ''))) {
        rails.push('mercadopago');
    }
    return rails;
}

/** El riel por defecto, o null si no hay ninguno. */
export const primaryRail = (org: RailOrg): PaymentRail | null => availableRails(org)[0] ?? null;

/** ¿La cuenta puede cobrar en línea por cualquier riel? */
export const canCollectOnline = (org: RailOrg): boolean => availableRails(org).length > 0;

export interface OnlinePaymentsSetup {
    /** Con CUALQUIER riel activo el paso está cumplido: el objetivo es poder cobrar en línea. */
    done: boolean;
    /** Qué texto lleva el paso. Cord Payments es la prioridad; solo donde no existe se habla de Mercado Pago. */
    copy: 'online_cobros' | 'online_cobros_mp';
}

/**
 * El paso "cobros en línea" de la guía de configuración, por país.
 *
 * Con Stripe como única condición, el paso era IMPOSIBLE en Colombia, Argentina,
 * Chile y Perú: Stripe no abre cuentas ahí, así que la guía de esas cuentas no
 * podía llegar al 100% nunca. Donde Cord Payments existe (aunque Mercado Pago
 * también) el texto sigue hablando de Cord Payments; solo donde Mercado Pago es
 * el único riel habla de él, y lo dice.
 */
export function onlinePaymentsSetup(country: string, ready: { stripe: boolean; mercadopago: boolean }): OnlinePaymentsSetup {
    const mpAplica = supportsMercadoPago(country);
    const soloMercadoPago = mpAplica && !supportsOnlinePayments(country);
    return {
        done: ready.stripe || (ready.mercadopago && mpAplica),
        copy: soloMercadoPago ? 'online_cobros_mp' : 'online_cobros',
    };
}
