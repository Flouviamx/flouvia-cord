import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sql: vi.fn(), tx: vi.fn(), audit: vi.fn(), stripe: vi.fn() }));
vi.mock('../src/lib/db', () => ({ sql: mocks.sql, withOrgTx: mocks.tx, logAudit: mocks.audit }));
vi.mock('../src/lib/billing', () => ({ stripe: mocks.stripe, METER_PRICES: {}, PRICE_TO_PLAN: {}, retrieveAccount: vi.fn() }));
vi.mock('../src/lib/queries', () => ({ invalidateMoneyCaches: vi.fn() }));
vi.mock('../src/lib/kyc-evidencia', () => ({ cerrarVeredictoKyc: vi.fn() }));
vi.mock('../src/lib/webhooks', () => ({ dispatchQuoteEvent: vi.fn(), dispatchPaymentPartial: vi.fn(), dispatchInvoiceEvent: vi.fn() }));
vi.mock('../src/lib/notify', () => ({ notifyQuoteEvent: vi.fn() }));
vi.mock('../src/lib/posthog-server', () => ({ trackPaymentReceived: vi.fn(), trackServer: vi.fn() }));
vi.mock('../src/lib/ops-alert', () => ({ sendOpsAlert: vi.fn() }));
vi.mock('../src/lib/email', () => ({ sendEmail: vi.fn(), siteOrigin: () => 'https://cordhq.app' }));
vi.mock('../src/lib/fiscal/payments', () => ({ applyPayment: vi.fn() }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn() } }));

const queries: Array<{ text: string; values: unknown[] }> = [];
async function deliver(object: Record<string, unknown>, account: string | null = 'acct_seller') {
    const { POST } = await import('../src/pages/api/stripe/webhook');
    const raw = JSON.stringify({ id: 'evt_refund_fixture', type: 'refund.updated', account: account ?? undefined, data: { object } });
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', account ? 'connect-secret' : 'platform-secret').update(`${timestamp}.${raw}`).digest('hex');
    return POST({ request: new Request('https://cordhq.app/api/stripe/webhook', {
        method: 'POST', body: raw, headers: { 'stripe-signature': `t=${timestamp},v1=${sig}` },
    }) } as any);
}

beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks(); queries.length = 0;
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'platform-secret');
    vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'connect-secret');
    mocks.sql.mockImplementation(async (strings, ...values) => {
        const text = strings.join('?'); queries.push({ text, values });
        if (text.includes('cord_resolve_org_for_connected_account')) return [{ id: 'org-seller' }];
        if (text.includes('select id from cotizacion_cobros')) return [{ id: 'cobro-1' }];
        if (text.includes('stripe_events')) return [{ id: 'evt_refund_fixture' }];
        return [];
    });
    mocks.tx.mockImplementation(async (_org, ...queries) => Promise.all(queries));
});
afterEach(() => vi.unstubAllEnvs());

describe('despacho de refund.updated', () => {
    it.each(['pending', 'succeeded', 'failed'])('persiste el estado %s de Cord Payments', async status => {
        mocks.stripe.mockResolvedValue({ id: 're_fixture', charge: 'ch_fixture', payment_intent: 'pi_fixture', amount: 10000, currency: 'mxn', status });
        const result = await deliver({ id: 're_fixture', charge: 'ch_fixture', payment_intent: 'pi_fixture', amount: 10000, currency: 'mxn', status });
        expect(result.status).toBe(200);
        const insert = queries.find(q => q.text.includes('insert into cobro_reembolsos'));
        expect(insert?.values).toContain(status);
        expect(mocks.audit).toHaveBeenCalledWith('org-seller', expect.objectContaining({ entidad_id: 're_fixture' }));
        expect(queries.some(q => q.text.includes('update build_bids'))).toBe(false);
    });
    it('conserva el efecto de Build para sus reembolsos', async () => {
        const result = await deliver({ id: 're_build', status: 'succeeded', metadata: {
            flow: 'cord_build_bid_refund', bid_id: 'f6b96d1d-d252-4a61-8e20-c17f284c3d5a',
        } }, null);
        expect(result.status).toBe(200);
        expect(queries.some(q => q.text.includes('update build_bids'))).toBe(true);
        expect(queries.some(q => q.text.includes('insert into cobro_reembolsos'))).toBe(false);
    });
    it('no confirma el evento si falla la actualización de reembolsos', async () => {
        mocks.tx.mockRejectedValue(new Error('database unavailable'));
        const result = await deliver({ id: 're_fixture', charge: 'ch_fixture', status: 'succeeded' });
        expect(result.status).toBe(500);
        expect(queries.some(q => q.text.includes('delete from stripe_events'))).toBe(true);
        expect(queries.some(q => q.text.includes('set processed_at = now()'))).toBe(false);
    });
    it('concilia un refund de factura aunque no exista cobro de cotización', async () => {
        const base = mocks.sql.getMockImplementation()!;
        mocks.sql.mockImplementation((strings, ...values) => strings.join('?').includes('select id from cotizacion_cobros') ? Promise.resolve([]) : base(strings, ...values));
        mocks.stripe.mockResolvedValue({ id: 're_invoice', payment_intent: 'pi_invoice', amount: 4000, currency: 'mxn', status: 'succeeded' });
        expect((await deliver({ id: 're_invoice', status: 'pending' })).status).toBe(200);
        const entry = queries.find(q => q.text.includes('insert into documento_reembolsos'));
        expect(entry?.values).toContain(40);
        expect(entry?.values).toContain('succeeded');
        expect(mocks.stripe).toHaveBeenCalledWith('/v1/refunds/re_invoice', undefined, 'GET', { stripeAccount: 'acct_seller' });
    });
    it('el estado vigente prevalece sobre el snapshot viejo del evento', async () => {
        mocks.stripe.mockResolvedValue({ id: 're_invoice', payment_intent: 'pi_invoice', amount: 4000, currency: 'mxn', status: 'failed' });
        expect((await deliver({ id: 're_invoice', status: 'succeeded' })).status).toBe(200);
        expect(queries.find(q => q.text.includes('insert into documento_reembolsos'))?.values).toContain('failed');
    });
    it('no confirma el webhook cuando no puede consultar el reembolso', async () => {
        mocks.stripe.mockRejectedValue(new Error('provider unavailable'));
        expect((await deliver({ id: 're_invoice' })).status).toBe(500);
        expect(queries.some(q => q.text.includes('insert into documento_reembolsos'))).toBe(false);
        expect(queries.some(q => q.text.includes('delete from stripe_events'))).toBe(true);
    });

});
