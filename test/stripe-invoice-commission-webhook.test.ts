import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ sql: vi.fn(), tx: vi.fn(), apply: vi.fn(), fee: vi.fn(), dispatch: vi.fn(), alert: vi.fn(), track: vi.fn() }));
vi.mock('../src/lib/db', () => ({ sql: m.sql, withOrgTx: m.tx, logAudit: vi.fn() }));
vi.mock('../src/lib/billing', () => ({ stripe: vi.fn(), METER_PRICES: {}, PRICE_TO_PLAN: {}, retrieveAccount: vi.fn() }));
vi.mock('../src/lib/queries', () => ({ invalidateMoneyCaches: vi.fn() }));
vi.mock('../src/lib/kyc-evidencia', () => ({ cerrarVeredictoKyc: vi.fn() }));
vi.mock('../src/lib/webhooks', () => ({ dispatchQuoteEvent: vi.fn(), dispatchPaymentPartial: vi.fn(), dispatchInvoiceEvent: m.dispatch }));
vi.mock('../src/lib/notify', () => ({ notifyQuoteEvent: vi.fn() }));
vi.mock('../src/lib/posthog-server', () => ({ trackPaymentReceived: m.track, trackServer: vi.fn() }));
vi.mock('../src/lib/ops-alert', () => ({ sendOpsAlert: m.alert }));
vi.mock('../src/lib/email', () => ({ sendEmail: vi.fn(), siteOrigin: () => 'https://cordhq.app' }));
vi.mock('../src/lib/fiscal/payments', () => ({ applyPayment: m.apply }));
vi.mock('../src/lib/invoice-payment-fees', () => ({ reconcileInvoiceCommission: m.fee }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn() } }));
const queries: string[] = [];
const payment = { id: 'pi_invoice', status: 'succeeded', currency: 'mxn', amount: 100000, amount_received: 100000, latest_charge: 'ch_invoice', metadata: { documento_id: 'doc_invoice' } };
async function deliver(object: any = payment, type = 'payment_intent.succeeded') {
    const { POST } = await import('../src/pages/api/stripe/webhook');
    const raw = JSON.stringify({ id: 'evt_invoice', type, account: 'acct_seller', data: { object } });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', 'connect-secret').update(`${t}.${raw}`).digest('hex');
    return POST({ request: new Request('https://cordhq.app/api/stripe/webhook', { method: 'POST', body: raw,
        headers: { 'stripe-signature': `t=${t},v1=${sig}` } }) } as any);
}
beforeEach(() => {
    vi.resetModules(); vi.resetAllMocks(); queries.length = 0;
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'platform-secret'); vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', 'connect-secret');
    m.sql.mockImplementation(async (s: TemplateStringsArray) => {
        const q = s.join('?'); queries.push(q);
        if (q.includes('cord_resolve_org_for_connected_account')) return [{ id: 'org-seller' }];
        if (q.includes('stripe_events') || q.includes('update comisiones')) return [{ id: 'evt_invoice' }];
        return [];
    });
    m.tx.mockImplementation(async (_org, ...q) => Promise.all(q));
    m.apply.mockResolvedValue({ ok: true, justPaid: true }); m.fee.mockResolvedValue('settled');
    m.dispatch.mockResolvedValue(undefined); m.alert.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe('comisiones de factura por webhook firmado', () => {
    it('concilia la factura y su comisión en la cuenta conectada antes de confirmar', async () => {
        expect((await deliver()).status).toBe(200);
        expect(m.apply).toHaveBeenCalledWith('org-seller', 'doc_invoice', expect.objectContaining({ monto: 1000, stripePaymentIntentId: 'pi_invoice' }));
        expect(m.fee).toHaveBeenCalledWith('org-seller', 'doc_invoice', payment, 'acct_seller');
        expect(m.apply.mock.invocationCallOrder[0]).toBeLessThan(m.fee.mock.invocationCallOrder[0]);
        expect(queries.some(q => q.includes('set processed_at = now()'))).toBe(true);
    });
    it('libera el evento si falla la comisión y vuelve a conciliar en el reintento', async () => {
        m.fee.mockRejectedValueOnce(new Error('provider unavailable'));
        m.apply.mockResolvedValueOnce({ ok: true, justPaid: true }).mockResolvedValueOnce({ ok: true, justPaid: false });
        expect((await deliver()).status).toBe(500);
        expect(queries.some(q => q.includes('delete from stripe_events'))).toBe(true);
        expect(queries.some(q => q.includes('set processed_at = now()'))).toBe(false);
        expect(m.dispatch).toHaveBeenCalledWith('org-seller', 'doc_invoice', 'invoice.paid');
        expect(m.dispatch.mock.invocationCallOrder[0]).toBeLessThan(m.fee.mock.invocationCallOrder[0]);
        expect((await deliver()).status).toBe(200);
        expect(m.fee).toHaveBeenCalledTimes(2);
        expect(m.dispatch).toHaveBeenCalledTimes(1);
        expect(m.track).toHaveBeenCalledTimes(1);
    });
    it('no registra comisión si el pago no pudo aplicarse a la factura', async () => {
        m.apply.mockResolvedValue({ ok: false, error: 'Documento inválido' });
        expect((await deliver()).status).toBe(500);
        expect(m.fee).not.toHaveBeenCalled(); expect(m.dispatch).not.toHaveBeenCalled();
    });
    it('avisa de un desglose incierto sin negar un pago ya confirmado', async () => {
        m.fee.mockResolvedValue('needs_review');
        expect((await deliver()).status).toBe(200);
        expect(m.alert).toHaveBeenCalledWith('Comisión de factura pendiente de revisión', expect.stringContaining('pi_invoice'));
        expect(m.dispatch).toHaveBeenCalledTimes(1);
    });
    it('no aplica una factura cuando la cuenta no pertenece a una organización', async () => {
        m.sql.mockImplementation(async (s: TemplateStringsArray) => s.join('?').includes('stripe_events') ? [{ id: 'evt_invoice' }] : []);
        expect((await deliver()).status).toBe(200);
        expect(m.apply).not.toHaveBeenCalled(); expect(m.fee).not.toHaveBeenCalled();
    });
});

it('application_fee.created tardío conserva revisión, saldo pendiente y devolución en SQL', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    try {
        await db.exec(`create table comisiones(id text, org_id text, stripe_application_fee_id text, stripe_charge_id text,
            status text, refunded_cents integer, updated_at timestamptz);
            insert into comisiones values
            ('review','org-seller','fee_invoice','ch_invoice','needs_review',0,null),
            ('pending','org-seller','fee_invoice','ch_invoice','pending',0,null),
            ('refund','org-seller','fee_invoice','ch_invoice','fee_refunded',100,null);`);
        const fallback = m.sql.getMockImplementation()!;
        m.sql.mockImplementation(async (s: TemplateStringsArray, ...values: any[]) => {
            if (!s.join('').includes('update comisiones')) return fallback(s, ...values);
            const text = s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, '');
            return (await db.query(text, values)).rows;
        });
        expect((await deliver({ id: 'fee_invoice', account: 'acct_seller', charge: 'ch_invoice', amount: 464 }, 'application_fee.created')).status).toBe(200);
        expect((await db.query('select id,status,refunded_cents from comisiones order by id')).rows).toEqual([
            { id: 'pending', status: 'pending', refunded_cents: 0 },
            { id: 'refund', status: 'fee_refunded', refunded_cents: 100 },
            { id: 'review', status: 'needs_review', refunded_cents: 0 },
        ]);
    } finally { await db.close(); }
}, 15000);
