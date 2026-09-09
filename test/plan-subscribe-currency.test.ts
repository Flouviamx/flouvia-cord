import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ tx: vi.fn(), stripe: vi.fn(), currency: vi.fn() }));
vi.mock('../src/lib/db', () => ({ sql: (parts: TemplateStringsArray, ...values: any[]) => ({ text: parts.join('?'), values }), withOrgTx: m.tx, getActiveOrgId: async () => 'org_fixture', logAudit: vi.fn(), reqIp: () => '127.0.0.1' }));
vi.mock('../src/lib/queries', () => ({ requirePerm: async () => null, getOrg: async () => ({ email: 'fixture@example.test', nombre: 'Fixture' }) }));
vi.mock('../src/lib/context', () => ({ currentLocale: () => 'es' }));
vi.mock('../src/lib/email', () => ({ siteOrigin: () => 'https://cordhq.app' }));
vi.mock('../src/lib/ratelimit', () => ({ strictRateLimit: async () => ({}), strictLimitResponse: () => null }));
vi.mock('../src/lib/billing', () => ({ STRIPE_KEY: 'sk_test_fixture', PLAN_PRICES: {}, METER_PRICES: {}, isPaidPlan: (p: string) => ['starter', 'pro', 'scale', 'developer'].includes(p), getOrCreateCustomer: async () => 'cus_fixture', stripe: m.stripe, priceFor: (_p: string, cycle: string) => `price_${cycle}`, meterPricesFor: () => ['price_api', 'price_usuario', 'price_ia', 'price_timbrado'], platformCurrencyForOrg: m.currency }));
import { POST } from '../src/pages/api/billing/subscribe';
const request = (body: any) => POST({ request: new Request('https://cordhq.app/api/billing/subscribe', { method: 'POST', body: JSON.stringify({ plan: 'pro', ui: 'element', expectedCurrency: 'EUR', ...body }) }) } as any);
beforeEach(() => {
    vi.clearAllMocks(); m.tx.mockResolvedValue([[]]); m.currency.mockResolvedValue('EUR');
    m.stripe.mockImplementation(async (path: string) => path.startsWith('/v1/customers/') ? { currency: null } : { id: 'sub_fixture', status: 'incomplete', latest_invoice: { confirmation_secret: { client_secret: 'secret_fixture' } } });
});
it.each(['mensual', 'anual'])('creates a %s EUR subscription with all usage prices and idempotency', async cycle => {
    expect((await request({ cycle })).status).toBe(200);
    const call = m.stripe.mock.calls.find(([path]) => path === '/v1/subscriptions')!;
    expect(call[1]).toMatchObject({ currency: 'eur', 'items[0][price]': `price_${cycle}`, 'items[4][price]': 'price_timbrado', payment_behavior: 'default_incomplete' });
    expect(call[3].idempotencyKey).toMatch(/^billing-subscription:/);
});
it('rejects a currency mismatch before creating a payable subscription', async () => {
    m.stripe.mockResolvedValue({ currency: 'usd' });
    const result = await request({});
    expect(result.status).toBe(409); expect(await result.json()).toMatchObject({ code: 'currency_changed' });
    expect(m.stripe.mock.calls.every(([, , method]) => method === 'GET')).toBe(true);
    expect(m.tx.mock.calls.every(([, query]) => !query.text.includes('insert'))).toBe(true);
});
it('keeps the existing USD currency when the customer reviewed USD', async () => {
    m.stripe.mockImplementation(async (path: string) => path.startsWith('/v1/customers/') ? { currency: 'usd' } : { id: 'sub_fixture', latest_invoice: { confirmation_secret: { client_secret: 'secret_fixture' } } });
    expect((await request({ expectedCurrency: 'USD' })).status).toBe(200);
    expect(m.stripe.mock.calls.find(([path]) => path === '/v1/subscriptions')![1].currency).toBe('usd');
});
it('rejects an unknown established currency instead of charging EUR', async () => {
    m.stripe.mockResolvedValue({ currency: 'gbp' });
    expect((await request({})).status).toBe(409);
    expect(m.stripe.mock.calls).toHaveLength(1);
});
