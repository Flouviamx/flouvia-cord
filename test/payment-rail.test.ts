import { describe, expect, it } from 'vitest';
import { availableRails, canCollectOnline, onlinePaymentsSetup, primaryRail } from '../src/lib/payment-rail';

const stripe = { stripeAccountId: 'acct_1', stripeChargesEnabled: true, aceptaTarjeta: true };

describe('availableRails', () => {
    it('Cord Payments va primero cuando la cuenta tiene los dos rieles', () => {
        const org = { ...stripe, mpChargesEnabled: true, country: 'MX' };
        expect(availableRails(org)).toEqual(['cord_payments', 'mercadopago']);
        expect(primaryRail(org)).toBe('cord_payments');
    });

    it('solo Cord Payments: es el único riel', () => {
        expect(availableRails({ ...stripe, country: 'US' })).toEqual(['cord_payments']);
    });

    it('en un país sin Connect, Mercado Pago es el único riel', () => {
        const org = { mpChargesEnabled: true, country: 'CO' };
        expect(availableRails(org)).toEqual(['mercadopago']);
        expect(primaryRail(org)).toBe('mercadopago');
        expect(canCollectOnline(org)).toBe(true);
    });

    it('una credencial de Mercado Pago de un país sin riel no abre cobros', () => {
        expect(availableRails({ mpChargesEnabled: true, country: 'ES' })).toEqual([]);
        expect(availableRails({ mpChargesEnabled: true, country: null })).toEqual([]);
    });

    it('Cord Payments exige método aceptado y cobros habilitados, como antes', () => {
        expect(availableRails({ stripeAccountId: 'acct_1', stripeChargesEnabled: true, aceptaTarjeta: false, cobroSpeiAuto: false })).toEqual([]);
        expect(availableRails({ stripeAccountId: 'acct_1', stripeChargesEnabled: false, aceptaTarjeta: true })).toEqual([]);
        expect(availableRails({ stripeAccountId: null, stripeChargesEnabled: true, aceptaTarjeta: true })).toEqual([]);
        expect(availableRails({ stripeAccountId: 'acct_1', stripeChargesEnabled: true, cobroSpeiAuto: true })).toEqual(['cord_payments']);
    });

    it('sin ningún riel no se cobra en línea', () => {
        expect(availableRails({})).toEqual([]);
        expect(primaryRail({})).toBeNull();
        expect(canCollectOnline({})).toBe(false);
    });
});

describe('onlinePaymentsSetup', () => {
    it('donde existe Cord Payments el texto habla de Cord Payments, aunque también haya Mercado Pago', () => {
        expect(onlinePaymentsSetup('MX', { stripe: false, mercadopago: false })).toEqual({ done: false, copy: 'online_cobros' });
        expect(onlinePaymentsSetup('BR', { stripe: false, mercadopago: false }).copy).toBe('online_cobros');
        expect(onlinePaymentsSetup('US', { stripe: false, mercadopago: false }).copy).toBe('online_cobros');
    });

    it('donde solo hay Mercado Pago el paso habla de él, y con Stripe nunca se completaría', () => {
        for (const pais of ['CO', 'AR', 'CL', 'PE']) {
            expect(onlinePaymentsSetup(pais, { stripe: false, mercadopago: false })).toEqual({ done: false, copy: 'online_cobros_mp' });
            expect(onlinePaymentsSetup(pais, { stripe: false, mercadopago: true })).toEqual({ done: true, copy: 'online_cobros_mp' });
        }
    });

    it('con cualquier riel activo el paso está cumplido', () => {
        expect(onlinePaymentsSetup('MX', { stripe: true, mercadopago: false }).done).toBe(true);
        expect(onlinePaymentsSetup('MX', { stripe: false, mercadopago: true }).done).toBe(true);
    });

    it('una credencial de Mercado Pago en un país sin ese riel no cuenta', () => {
        expect(onlinePaymentsSetup('ES', { stripe: false, mercadopago: true }).done).toBe(false);
    });
});
