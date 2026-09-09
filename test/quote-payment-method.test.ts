import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ tx: vi.fn(), claim: vi.fn(), publish: vi.fn(), limit: vi.fn() }));
vi.mock('../src/lib/db', () => ({ resolvePublicQuote: async () => ({ id: 'quote-a', orgId: 'org-a' }), withOrgTx: m.tx, sql: (s: TemplateStringsArray, ...values: any[]) => ({ text: s.join('?'), values }) }));
vi.mock('../src/lib/quote-payment-attempts', async original => ({ ...await original<any>(), claimQuotePaymentAttempt: m.claim, publishQuotePaymentAttempt: m.publish }));
vi.mock('../src/lib/connect-security', () => ({ limitPublicPayment: m.limit }));
vi.mock('../src/lib/cobros', () => ({ dueDateFor: () => new Date(), isoDay: () => '2026-01-01', venceDia: (s: string) => s, materializeAnticipoCobros: vi.fn() }));
vi.mock('../src/lib/posthog-server', () => ({ trackServer: vi.fn() }));
vi.mock('../src/lib/after', () => ({ after: vi.fn() }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn() } }));
import { QuotePaymentConflict } from '../src/lib/quote-payment-attempts';
const quote = { id: 'quote-a', org_id: 'org-a', folio: 'Q-1', total: 1000, status: 'approved', base_currency: 'MXN', stripe_account_id: 'acct-a', stripe_charges_enabled: true, acepta_tarjeta: true, cobro_spei_auto: true, checkout_v2: true, org_nombre: 'Empresa' };
let cobro: any, fetchMock: ReturnType<typeof vi.fn>;
const instructions = { display_bank_transfer_instructions: { amount_remaining: 100000, reference: 'REF1', currency: 'mxn', financial_addresses: [{ spei: { clabe: '012345678901234567', bank_name: 'Banco' } }] } };
const previous = (extra = {}) => ({ id: 'pi_previous', status: 'requires_action', amount: 100000, amount_received: 0, currency: 'mxn', application_fee_amount: 0, payment_method_types: ['customer_balance'], next_action: instructions, ...extra });
const newIntent = (extra = {}) => ({ id: 'pi_new', status: 'requires_payment_method', amount: 100000, currency: 'mxn', client_secret: 'new_secret', ...extra });
const response = (body: any, status = 200) => Response.json(body, { status });
async function pay(method = 'card') {
    const { POST } = await import('../src/pages/api/q/[token]/payment-intent');
    return POST({ params: { token: 'quote-token' }, request: new Request('https://cordhq.app/api/q/quote-token/payment-intent', { method: 'POST', body: JSON.stringify({ metodo: method }) }) } as any);
}
beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
    cobro = { id: 'cobro-a', tipo: 'total', monto: 1000, status: 'pendiente', stripe_payment_intent_id: 'pi_previous' };
    m.tx.mockImplementation(async (_org, query) => {
        if (query.text.includes('select c.id')) return [[quote]];
        if (query.text.includes('select id, tipo')) return [[{ ...cobro }]];
        return [[{ id: 'cobro-a' }]];
    });
    m.limit.mockResolvedValue(null); m.claim.mockResolvedValue({ id: 'attempt-a', paymentIntentId: null }); m.publish.mockResolvedValue(undefined);
    fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('switching quote payment methods', () => {
    it('confirms cancellation of unused SPEI before creating a card intent', async () => {
        fetchMock.mockResolvedValueOnce(response(previous())).mockResolvedValueOnce(response(previous({ status: 'canceled' }))).mockResolvedValueOnce(response(newIntent()));
        expect(await (await pay()).json()).toMatchObject({ clientSecret: 'new_secret' });
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['https://api.stripe.com/v1/payment_intents/pi_previous', 'https://api.stripe.com/v1/payment_intents/pi_previous/cancel', 'https://api.stripe.com/v1/payment_intents']);
        expect(fetchMock.mock.calls[1][1].headers['Idempotency-Key']).toBe('cord-quote-cancel-pi_previous');
        expect(m.publish).toHaveBeenCalledOnce();
    });
    it.each(['processing', 'requires_capture', 'succeeded'])('does not replace an intent in %s', async status => {
        fetchMock.mockResolvedValue(response(previous({ status })));
        const result = await pay(); expect(result.status).toBe(409); expect(await result.json()).toMatchObject({ code: 'payment_pending' });
        expect(fetchMock).toHaveBeenCalledOnce(); expect(m.claim).not.toHaveBeenCalled();
    });
    it('keeps the existing SPEI customer when switching to card', async () => {
        fetchMock.mockResolvedValueOnce(response(previous({ customer: 'cus_existing' })))
            .mockResolvedValueOnce(response(previous({ status: 'canceled' })))
            .mockResolvedValueOnce(response(newIntent()));
        expect((await pay()).status).toBe(200);
        expect(new URLSearchParams(fetchMock.mock.calls[2][1].body).get('customer')).toBe('cus_existing');
        expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/customers'))).toBe(false);
    });
    it.each([{ amount_received: 20000 }, { next_action: { display_bank_transfer_instructions: { amount_remaining: 80000 } } }])('does not switch a partially funded SPEI: %j', async partial => {
        fetchMock.mockResolvedValue(response(previous(partial)));
        expect((await pay()).status).toBe(409); expect(fetchMock).toHaveBeenCalledOnce();
    });
    it('fails closed when the previous lookup fails, including 404', async () => {
        fetchMock.mockResolvedValue(response({ error: { message: 'sensitive upstream error' } }, 404));
        const result = await pay(); expect(result.status).toBe(502); expect(await result.text()).not.toContain('sensitive');
        expect(fetchMock).toHaveBeenCalledOnce(); expect(m.claim).not.toHaveBeenCalled();
    });
    it('reads the authoritative state after an uncertain cancellation', async () => {
        fetchMock.mockResolvedValueOnce(response(previous())).mockRejectedValueOnce(new Error('response lost'))
            .mockResolvedValueOnce(response(previous({ status: 'canceled' }))).mockResolvedValueOnce(response(newIntent()));
        expect((await pay()).status).toBe(200); expect(fetchMock).toHaveBeenCalledTimes(4);
    });
    it('blocks replacement if a cancellation races a completed payment', async () => {
        fetchMock.mockResolvedValueOnce(response(previous())).mockResolvedValueOnce(response({ error: {} }, 400))
            .mockResolvedValueOnce(response(previous({ status: 'succeeded' })));
        expect((await pay()).status).toBe(409); expect(m.claim).not.toHaveBeenCalled();
    });
    it('does not interpret a successful HTTP response as confirmed cancellation', async () => {
        fetchMock.mockImplementation(async () => response(previous()));
        expect((await pay()).status).toBe(409); expect(fetchMock).toHaveBeenCalledTimes(3); expect(m.claim).not.toHaveBeenCalled();
    });
    it('reuses matching SPEI instructions without creating or canceling anything', async () => {
        fetchMock.mockResolvedValue(response(previous()));
        expect(await (await pay('spei')).json()).toMatchObject({ instructions: { reference: 'REF1' } });
        expect(fetchMock).toHaveBeenCalledOnce(); expect(m.claim).not.toHaveBeenCalled();
    });
    it('preserves the customer link and publishes the new intent before confirming SPEI', async () => {
        cobro.stripe_payment_intent_id = null;
        fetchMock.mockImplementation(async (url, init) => {
            if (url.endsWith('/customers')) return response({ id: 'cus_a' });
            if (url.endsWith('/confirm')) { expect(m.publish).toHaveBeenCalledOnce(); return response(newIntent({ status: 'requires_action', next_action: instructions })); }
            expect(new URLSearchParams(init.body).has('confirm')).toBe(false);
            return response(newIntent());
        });
        expect((await pay('spei')).status).toBe(200);
        expect(fetchMock.mock.calls.at(-1)![0]).toContain('/pi_new/confirm');
    });
    it('does not confirm SPEI or expose a secret if publishing loses the race', async () => {
        cobro.stripe_payment_intent_id = null;
        fetchMock.mockResolvedValueOnce(response({ id: 'cus_a' })).mockResolvedValueOnce(response(newIntent()));
        m.publish.mockRejectedValue(new QuotePaymentConflict('payment_changed'));
        const result = await pay('spei'); expect(result.status).toBe(409); expect(await result.text()).not.toContain('new_secret');
        expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/confirm'))).toBe(false);
    });
    it('recovers a durably stored intent instead of creating another', async () => {
        cobro.stripe_payment_intent_id = null; m.claim.mockResolvedValue({ id: 'attempt-a', paymentIntentId: 'pi_recovered' });
        fetchMock.mockResolvedValue(response(newIntent({ id: 'pi_recovered' })));
        expect((await pay()).status).toBe(200);
        expect(fetchMock.mock.calls[0][0]).toContain('/payment_intents/pi_recovered');
        expect(fetchMock).toHaveBeenCalledOnce();
    });
    it('does not delete or recreate payable rows after a quote total changes', async () => {
        cobro.monto = 800;
        expect((await pay()).status).toBe(409); expect(fetchMock).not.toHaveBeenCalled();
        expect(m.tx.mock.calls.some(([, q]) => /delete|insert/.test(q.text))).toBe(false);
    });
    it('honors the conditional check when reusing an existing intent', async () => {
        fetchMock.mockResolvedValue(response(previous()));
        m.tx.mockImplementation(async (_org, q) => q.text.includes('select c.id') ? [[quote]] : q.text.includes('select id, tipo') ? [[cobro]] : [[]]);
        expect((await pay('spei')).status).toBe(409);
    });
    it('rejects competing methods before the losing request can create an intent', async () => {
        cobro.stripe_payment_intent_id = null; let claimed: string | null = null;
        m.claim.mockImplementation(async ({ request }) => {
            const method = request.get('payment_method_types[0]');
            if (claimed && claimed !== method) throw new QuotePaymentConflict('payment_changed');
            claimed = method; return { id: 'one-attempt', paymentIntentId: null };
        });
        fetchMock.mockImplementation(async url => url.endsWith('/customers') ? response({ id: 'cus_a' }) : response(newIntent()));
        const results = await Promise.all([pay(), pay('spei')]);
        expect(results.map(r => r.status).sort()).toEqual([200, 409]);
        expect(fetchMock.mock.calls.filter(([url]) => url === 'https://api.stripe.com/v1/payment_intents')).toHaveLength(1);
    });
});

it('preserves the creation key and payload when the provider response is lost', async () => {
    cobro.stripe_payment_intent_id = null;
    fetchMock.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce(response(newIntent()));
    expect((await pay()).status).toBe(502);
    expect((await pay()).status).toBe(200);
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetchMock.mock.calls[1][1].headers['Idempotency-Key']);
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
});
it('does not send another creation after an unresolved attempt expires', async () => {
    cobro.stripe_payment_intent_id = null;
    m.claim.mockRejectedValue(new QuotePaymentConflict('payment_review_required'));
    const result = await pay(); expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({ code: 'payment_review_required' });
    expect(fetchMock).not.toHaveBeenCalled();
});
