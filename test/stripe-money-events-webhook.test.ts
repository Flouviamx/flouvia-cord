import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    sql: vi.fn(), tx: vi.fn(), audit: vi.fn(), stripe: vi.fn(), dispatch: vi.fn(),
    state: { duplicate: false, before: null as Record<string, unknown> | null },
}));
vi.mock('../src/lib/db', () => ({ sql: mocks.sql, withOrgTx: mocks.tx, logAudit: mocks.audit }));
vi.mock('../src/lib/billing', () => ({ stripe: mocks.stripe, METER_PRICES: {}, PRICE_TO_PLAN: {}, retrieveAccount: vi.fn() }));
vi.mock('../src/lib/queries', () => ({ invalidateMoneyCaches: vi.fn() }));
vi.mock('../src/lib/kyc-evidencia', () => ({ cerrarVeredictoKyc: vi.fn() }));
vi.mock('../src/lib/webhooks', () => ({ dispatchQuoteEvent: vi.fn(), dispatchPaymentPartial: vi.fn(), dispatchInvoiceEvent: vi.fn(), dispatchEvent: mocks.dispatch }));
vi.mock('../src/lib/notify', () => ({ notifyQuoteEvent: vi.fn() }));
vi.mock('../src/lib/posthog-server', () => ({ trackPaymentReceived: vi.fn(), trackServer: vi.fn() }));
vi.mock('../src/lib/ops-alert', () => ({ sendOpsAlert: vi.fn() }));
vi.mock('../src/lib/email', () => ({ sendEmail: vi.fn(), siteOrigin: () => 'https://cordhq.app' }));
vi.mock('../src/lib/fiscal/payments', () => ({ applyPayment: vi.fn() }));
vi.mock('../src/lib/fiscal/reconciliation', () => ({ recordInvoiceRefund: vi.fn() }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn() } }));

const QUOTE = '3f1c9a52-7b8e-4d21-9c0a-5e6f7a8b9c0d';

async function deliver(type: string, object: Record<string, unknown>, account = 'acct_seller') {
    const { POST } = await import('../src/pages/api/stripe/webhook');
    const raw = JSON.stringify({ id: `evt_${type}`, type, account, data: { object } });
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', 'connect-secret').update(`${timestamp}.${raw}`).digest('hex');
    return POST({ request: new Request('https://cordhq.app/api/stripe/webhook', {
        method: 'POST', body: raw, headers: { 'stripe-signature': `t=${timestamp},v1=${sig}` },
    }) } as any);
}

const emitted = () => mocks.dispatch.mock.calls.map((c) => [c[1], c[2]] as [string, Record<string, unknown>]);

beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    mocks.state.duplicate = false;
    mocks.state.before = null;
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'platform-secret');
    vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'connect-secret');
    mocks.sql.mockImplementation(async (strings: TemplateStringsArray) => {
        const text = strings.join('?');
        if (text.includes('cord_resolve_org_for_connected_account')) return [{ id: 'org-seller' }];
        if (text.includes('stripe_events')) return [{ id: 'evt' }];
        if (text.includes('from domain_events')) return mocks.state.duplicate ? [{ id: 'evento-previo' }] : [];
        if (text.includes('select id from cotizacion_cobros')) return [{ id: 'cobro-1' }];
        if (text.includes('from cotizacion_cobros cc')) return [{ id: QUOTE, folio: 'COT-00104', empresa: 'Stark Industries' }];
        if (text.includes('insert into cobro_disputas')) return [{ id: 'disputa-1' }];
        if (text.includes('insert into payouts')) return [{ id: 'deposito-1' }];
        if (text.includes('from orgs where id')) return mocks.state.before ? [mocks.state.before] : [];
        if (text.includes('update orgs set')) return [{ id: 'org-seller' }];
        return [];
    });
    mocks.tx.mockImplementation(async (_org: string, ...queries: unknown[]) => Promise.all(queries));
});
afterEach(() => vi.unstubAllEnvs());

describe('contracargos', () => {
    const dispute = { id: 'dp_1', charge: 'ch_1', amount: 20000, currency: 'mxn', reason: 'fraudulent', status: 'needs_response', evidence_details: { due_by: 1790000000 } };

    it('abre dispute.created con la cotización ligada', async () => {
        expect((await deliver('charge.dispute.created', dispute)).status).toBe(200);
        expect(emitted()).toEqual([['dispute.created', expect.objectContaining({
            id: 'disputa-1', referencia: 'dp_1', monto: 200, moneda: 'MXN', motivo: 'fraudulent',
            cotizacion_id: QUOTE, folio: 'COT-00104', cliente: 'Stark Industries',
        })]]);
    });

    it('cierra con dispute.closed y su resultado', async () => {
        await deliver('charge.dispute.closed', { ...dispute, status: 'won' });
        expect(emitted()).toEqual([['dispute.closed', expect.objectContaining({ estado: 'won', referencia: 'dp_1' })]]);
    });

    it('no emite en actualizaciones intermedias ni dos veces el mismo contracargo', async () => {
        await deliver('charge.dispute.updated', dispute);
        expect(emitted()).toEqual([]);
        mocks.state.duplicate = true;
        await deliver('charge.dispute.created', dispute);
        expect(emitted()).toEqual([]);
    });
});

describe('depósitos', () => {
    const payout = { id: 'po_1', amount: 53000, currency: 'mxn', status: 'paid', arrival_date: 1790000000, method: 'standard' };

    it('emite payout.paid con monto y llegada', async () => {
        await deliver('payout.paid', payout);
        expect(emitted()).toEqual([['payout.paid', expect.objectContaining({ id: 'deposito-1', referencia: 'po_1', monto: 530, moneda: 'MXN', metodo: 'standard' })]]);
    });

    it('emite payout.failed con el motivo', async () => {
        await deliver('payout.failed', { ...payout, status: 'failed', failure_message: 'Cuenta cerrada' });
        expect(emitted()).toEqual([['payout.failed', expect.objectContaining({ motivo_falla: 'Cuenta cerrada' })]]);
    });

    it('no emite mientras el depósito va en camino', async () => {
        await deliver('payout.updated', { ...payout, status: 'in_transit' });
        expect(emitted()).toEqual([]);
    });
});

describe('reembolsos', () => {
    it.each([['succeeded', 'refund.succeeded'], ['failed', 'refund.failed']])('estado %s emite %s', async (status, type) => {
        mocks.stripe.mockResolvedValue({ id: 're_1', charge: 'ch_1', payment_intent: 'pi_1', amount: 5000, currency: 'mxn', status, reason: 'requested_by_customer' });
        await deliver('refund.updated', { id: 're_1' });
        expect(emitted()).toEqual([[type, expect.objectContaining({ referencia: 're_1', monto: 50, moneda: 'MXN', cotizacion_id: QUOTE })]]);
    });

    it('un reembolso pendiente no emite', async () => {
        mocks.stripe.mockResolvedValue({ id: 're_1', charge: 'ch_1', payment_intent: 'pi_1', amount: 5000, currency: 'mxn', status: 'pending' });
        await deliver('refund.updated', { id: 're_1' });
        expect(emitted()).toEqual([]);
    });
});

describe('cuenta de cobros', () => {
    const base = { id: 'org-seller', created_at: '2026-01-01', is_sandbox: false, is_demo: false };

    it('emite account.updated cuando la cuenta ya puede cobrar', async () => {
        mocks.state.before = { ...base, stripe_charges_enabled: false, stripe_payouts_enabled: false, stripe_disabled_reason: 'requirements.past_due', stripe_requirements: { currently_due: ['individual.id_number'] } };
        await deliver('account.updated', { id: 'acct_seller', charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: { currently_due: [] } });
        expect(emitted()).toEqual([['account.updated', { object: 'account', puede_cobrar: true, puede_depositar: true, motivo_bloqueo: null, pendientes: 0 }]]);
    });

    it('no emite si nada cambió', async () => {
        mocks.state.before = { ...base, stripe_charges_enabled: true, stripe_payouts_enabled: true, stripe_disabled_reason: null, stripe_requirements: JSON.stringify({ currently_due: [] }) };
        await deliver('account.updated', { id: 'acct_seller', charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements: { currently_due: [] } });
        expect(emitted()).toEqual([]);
    });
});
