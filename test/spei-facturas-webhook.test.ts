// Webhook firmado de Connect para SPEI en facturas: el pago completo se asienta
// con su método real (el complemento de pago de México declara la forma con
// él), y los avisos de fondeo parcial o saldo sobrante NO tocan el ledger.
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    sql: vi.fn(), tx: vi.fn(), apply: vi.fn(), fee: vi.fn(), dispatch: vi.fn(), alert: vi.fn(), track: vi.fn(),
    parcial: vi.fn(), sobrante: vi.fn(), stripe: vi.fn(),
}));
vi.mock('../src/lib/db', () => ({ sql: m.sql, withOrgTx: m.tx, logAudit: vi.fn() }));
vi.mock('../src/lib/billing', () => ({ stripe: m.stripe, METER_PRICES: {}, PRICE_TO_PLAN: {}, retrieveAccount: vi.fn() }));
vi.mock('../src/lib/queries', () => ({ invalidateMoneyCaches: vi.fn() }));
vi.mock('../src/lib/kyc-evidencia', () => ({ cerrarVeredictoKyc: vi.fn() }));
vi.mock('../src/lib/webhooks', () => ({ dispatchQuoteEvent: vi.fn(), dispatchPaymentPartial: vi.fn(), dispatchInvoiceEvent: m.dispatch }));
vi.mock('../src/lib/notify', () => ({ notifyQuoteEvent: vi.fn() }));
vi.mock('../src/lib/posthog-server', () => ({ trackPaymentReceived: m.track, trackServer: vi.fn() }));
vi.mock('../src/lib/ops-alert', () => ({ sendOpsAlert: m.alert }));
vi.mock('../src/lib/email', () => ({ sendEmail: vi.fn(), siteOrigin: () => 'https://cordhq.app' }));
vi.mock('../src/lib/fiscal/payments', () => ({ applyPayment: m.apply }));
vi.mock('../src/lib/invoice-payment-fees', () => ({ reconcileInvoiceCommission: m.fee }));
vi.mock('../src/lib/cobros/spei', () => ({ transferenciaParcial: m.parcial, saldoSinAplicar: m.sobrante }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const DOC = '11111111-1111-4111-8111-111111111111';
const pagoSpei = {
    id: 'pi_spei', status: 'succeeded', currency: 'mxn', amount: 100000, amount_received: 100000,
    customer: 'cus_factura', latest_charge: 'ch_spei', payment_method_types: ['customer_balance'],
    metadata: { documento_id: DOC, invoice_number: 'F-10' },
};
let n = 0;
async function deliver(object: any, type: string) {
    const { POST } = await import('../src/pages/api/stripe/webhook');
    const raw = JSON.stringify({ id: `evt_spei_${++n}`, type, account: 'acct_seller', data: { object } });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', 'connect-secret').update(`${t}.${raw}`).digest('hex');
    return POST({ request: new Request('https://cordhq.app/api/stripe/webhook', { method: 'POST', body: raw,
        headers: { 'stripe-signature': `t=${t},v1=${sig}` } }) } as any);
}

beforeEach(() => {
    vi.resetModules(); vi.resetAllMocks();
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'platform-secret'); vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'connect-secret');
    m.sql.mockImplementation(async (s: TemplateStringsArray) => {
        const q = s.join('?');
        if (q.includes('cord_resolve_org_for_connected_account')) return [{ id: 'org-seller' }];
        if (q.includes('stripe_events')) return [{ id: 'evt' }];
        return [];
    });
    m.tx.mockImplementation(async (_org, ...q) => q.map(() => []));
    m.apply.mockResolvedValue({ ok: true, justPaid: true }); m.fee.mockResolvedValue('settled');
    m.dispatch.mockResolvedValue(undefined); m.alert.mockResolvedValue(undefined); m.track.mockResolvedValue(undefined);
    m.parcial.mockResolvedValue(undefined); m.sobrante.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('payment_intent.succeeded de un SPEI de factura', () => {
    it('asienta el pago a ESA factura con método spei, sin consultar al proveedor por el método', async () => {
        expect((await deliver(pagoSpei, 'payment_intent.succeeded')).status).toBe(200);
        expect(m.apply).toHaveBeenCalledTimes(1);
        expect(m.apply).toHaveBeenCalledWith('org-seller', DOC, expect.objectContaining({
            monto: 1000, currency: 'MXN', metodo: 'spei', stripePaymentIntentId: 'pi_spei',
        }));
        expect(m.dispatch).toHaveBeenCalledWith('org-seller', DOC, 'invoice.paid');
        // La comisión de SPEI se concilia igual que la de tarjeta (llave: el PI).
        expect(m.fee).toHaveBeenCalledWith('org-seller', DOC, expect.objectContaining({ id: 'pi_spei' }), 'acct_seller');
        expect(m.stripe).not.toHaveBeenCalled();
        expect(m.track).toHaveBeenCalledWith('org-seller', 1000, 'MXN', 'spei', false, undefined, false, false,
            expect.objectContaining({ payment_id: 'pi_spei', invoice_id: DOC, payment_kind: 'invoice' }));
    });

    it('un pago con tarjeta sigue asentándose como stripe', async () => {
        await deliver({ ...pagoSpei, id: 'pi_card', payment_method_types: ['card'], customer: null }, 'payment_intent.succeeded');
        expect(m.apply).toHaveBeenCalledWith('org-seller', DOC, expect.objectContaining({ metodo: 'stripe', stripePaymentIntentId: 'pi_card' }));
    });

    it('un reintento del mismo pago no vuelve a avisar invoice.paid', async () => {
        m.apply.mockResolvedValueOnce({ ok: true, justPaid: true }).mockResolvedValueOnce({ ok: true, justPaid: false, duplicate: true });
        await deliver(pagoSpei, 'payment_intent.succeeded');
        await deliver(pagoSpei, 'payment_intent.succeeded');
        expect(m.dispatch).toHaveBeenCalledTimes(1);
    });
});

describe('avisos que no son pagos', () => {
    it('payment_intent.partially_funded no asienta nada: solo lo cuenta', async () => {
        const parcial = { ...pagoSpei, status: 'requires_action', amount_received: 0,
            next_action: { display_bank_transfer_instructions: { amount_remaining: 30000 } } };
        expect((await deliver(parcial, 'payment_intent.partially_funded')).status).toBe(200);
        expect(m.parcial).toHaveBeenCalledWith(expect.objectContaining({ id: 'pi_spei' }), 'acct_seller');
        expect(m.apply).not.toHaveBeenCalled();
        expect(m.dispatch).not.toHaveBeenCalled();
    });

    it('cash_balance.funds_available no asienta nada: solo lo cuenta', async () => {
        const saldo = { object: 'cash_balance', customer: 'cus_factura', available: { mxn: 25000 } };
        expect((await deliver(saldo, 'cash_balance.funds_available')).status).toBe(200);
        expect(m.sobrante).toHaveBeenCalledWith(saldo, 'acct_seller');
        expect(m.apply).not.toHaveBeenCalled();
    });

    it('si el aviso falla, el evento se libera para el reintento', async () => {
        m.parcial.mockRejectedValueOnce(new Error('db caída'));
        expect((await deliver({ ...pagoSpei, status: 'requires_action' }, 'payment_intent.partially_funded')).status).toBe(500);
    });
});
