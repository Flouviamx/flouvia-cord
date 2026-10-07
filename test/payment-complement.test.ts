import { afterEach, describe, expect, it, vi } from 'vitest';
import { MexicoSatProvider } from '../src/lib/fiscal/providers/MexicoSatProvider';
import { satFormFor } from '../src/lib/fiscal/payment-complement';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const recipient = { legalName: 'Cliente SA de CV', taxId: 'AAA010101AAA', taxSystem: '601', address: { postalCode: '06600', countryCode: 'MX' } };
const summary = { uuid: '39c85a3f-275b-4341-b259-e8971d9f8a94', installment: 2, last_balance: 245.6, amount: 100, currency: 'MXN', taxes: [{ base: 86.21, type: 'IVA', rate: 0.16 }] };

describe('complemento de pago (CFDI tipo P)', () => {
    it('usa el payment-summary del PAC tal cual como documento relacionado', async () => {
        const calls: { url: string; init?: RequestInit }[] = [];
        globalThis.fetch = vi.fn(async (url: any, init?: any) => {
            calls.push({ url: String(url), init });
            if (String(url).includes('/payment-summary')) return new Response(JSON.stringify(summary), { status: 200 });
            return new Response(JSON.stringify({ id: 'inv_p_1', uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', livemode: true }), { status: 200 });
        }) as any;
        const res = await new MexicoSatProvider().issuePaymentComplement({
            facturapiInvoiceId: 'fac_123', providerApiKey: 'sk_test_x', recipient: recipient as any,
            amount: 100, paymentForm: '04', paidAt: new Date(Date.now() - 86_400_000).toISOString(),
            reference: 'pi_123', idempotencyKey: 'rep:doc:pago:v1', externalId: 'pago-1',
        });
        expect(res.success).toBe(true);
        expect(res.fiscalId).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
        expect(calls[0].url).toContain('/invoices/fac_123/payment-summary?amount=100');
        const body = JSON.parse(String(calls[1].init?.body));
        expect(body.type).toBe('P');
        expect(body.idempotency_key).toBe('rep:doc:pago:v1');
        expect(body.complements[0].type).toBe('pago');
        const pago = body.complements[0].data[0];
        expect(pago.payment_form).toBe('04');
        expect(pago.related_documents).toEqual([summary]);
        // Pago de ayer: se declara su fecha real (no futura).
        expect(typeof pago.date).toBe('string');
        expect(pago.numOperacion).toBe('pi_123');
        expect(body.customer.tax_id).toBe('AAA010101AAA');
    });

    it('un fallo del PAC no menciona al proveedor y queda reintentable', async () => {
        globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ message: 'Facturapi: error interno' }), { status: 502 })) as any;
        const res = await new MexicoSatProvider().issuePaymentComplement({
            facturapiInvoiceId: 'fac_123', providerApiKey: 'sk_test_x', recipient: recipient as any,
            amount: 100, paymentForm: '03', paidAt: new Date().toISOString(), idempotencyKey: 'k', externalId: 'p',
        });
        expect(res.success).toBe(false);
        expect(res.error).not.toMatch(/facturapi/i);
        expect(res.rawProviderData?.retry_safe).toBe(true);
    });

    it('traduce el método del cobro al catálogo c_FormaPago', () => {
        expect(satFormFor('stripe')).toBe('04');
        expect(satFormFor('spei')).toBe('03');
        expect(satFormFor('efectivo')).toBe('01');
        expect(satFormFor('cheque')).toBe('02');
        expect(satFormFor('otro')).toBe('99');
    });
});
