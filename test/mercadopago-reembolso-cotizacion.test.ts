// Webhook de Mercado Pago: el reembolso del cobro de una COTIZACIÓN que ya se
// facturó también llega al ledger de la factura (como el de Stripe). Antes solo
// tocaba `cobro_reembolsos` y la factura seguía pagada con el dinero ya devuelto.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ tx: vi.fn(), system: vi.fn(), record: vi.fn(), fetch: vi.fn(), audit: vi.fn() }));
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.join('?'), values }),
    withOrgTx: m.tx, withSystemTx: m.system, logAudit: m.audit,
}));
vi.mock('../src/lib/mercadopago', () => ({
    fetchMpPayment: m.fetch, MP_INVOICE_REF: 'fac:', mpSignatureValid: () => true, mpWebhookSecret: () => 'secreto',
}));
vi.mock('../src/lib/fiscal/reconciliation', () => ({ recordMpInvoiceRefund: m.record }));
vi.mock('../src/lib/fiscal/payments', () => ({ applyPayment: vi.fn() }));
vi.mock('../src/lib/webhooks', () => ({ dispatchInvoiceEvent: vi.fn() }));
vi.mock('../src/lib/posthog-server', () => ({ trackPaymentReceived: vi.fn() }));
vi.mock('../src/lib/after', () => ({ after: () => {} }));
vi.mock('../src/lib/cobros-settle', () => ({ settleQuoteCobro: vi.fn() }));
vi.mock('../src/lib/ops-alert', () => ({ sendOpsAlert: vi.fn() }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn() } }));

import { POST } from '../src/pages/api/mercadopago/webhook';

const COBRO = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
    vi.clearAllMocks();
    m.system.mockResolvedValue([[{ id: COBRO, org_id: 'org-1', cotizacion_id: 'cot-1', mp_payment_id: 'mp_9' }]]);
    m.tx.mockImplementation(async (_org: string, ...queries: Array<{ text: string }>) => queries.map((q) =>
        q.text.includes('from cotizacion_cobros') ? [{ id: COBRO, cotizacion_id: 'cot-1' }] : []));
    m.fetch.mockResolvedValue({
        id: 'mp_9', status: 'refunded', monto: 100, moneda: 'MXN', referencia: COBRO, metodo: 'credit_card',
        reembolsos: [{ id: 'r1', monto: 100, status: 'succeeded' }],
    });
});

describe('reembolso de Mercado Pago de un cobro de cotización', () => {
    it('se registra en la cotización y también en la factura que la cobró', async () => {
        const res = await POST({
            request: new Request(`https://cordhq.app/api/mercadopago/webhook?data.id=${COBRO}&type=payment`, { method: 'POST', body: '{}' }),
            url: new URL(`https://cordhq.app/api/mercadopago/webhook?data.id=${COBRO}&type=payment`),
        } as any);
        expect(res.status).toBe(200);
        const textos = m.tx.mock.calls.flatMap((c) => c.slice(1).map((q: { text: string }) => q.text));
        expect(textos.some((t) => t.includes('insert into cobro_reembolsos'))).toBe(true);
        expect(m.record).toHaveBeenCalledWith('org-1', { id: 'r1', paymentId: 'mp_9', amount: 100, currency: 'MXN', status: 'succeeded' });
    });
    it('un fallo al llevarlo a la factura no impide registrar la cotización', async () => {
        m.record.mockRejectedValue(new Error('db'));
        const res = await POST({
            request: new Request(`https://cordhq.app/api/mercadopago/webhook?data.id=${COBRO}&type=payment`, { method: 'POST', body: '{}' }),
            url: new URL(`https://cordhq.app/api/mercadopago/webhook?data.id=${COBRO}&type=payment`),
        } as any);
        expect(res.status).toBe(200);
        expect(m.audit).toHaveBeenCalled();
    });
});
