import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ tx: vi.fn() }));
vi.mock('../src/lib/db', () => ({ sql: (parts: TemplateStringsArray, ...values: any[]) => ({ text: parts.join('?'), values }), withOrgTx: m.tx, withSystemTx: vi.fn() }));
vi.mock('../src/lib/org-entitlements', () => ({ getEntitlementContext: vi.fn() }));
let billing: typeof import('../src/lib/billing');
beforeEach(async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
    billing = await import('../src/lib/billing');
    m.tx.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('uses the preexisting customer currency before the first paid webhook arrives', async () => {
    m.tx.mockResolvedValue([[{ country_code: 'ES', billing_currency: null, stripe_customer_id: 'cus_fixture' }]]);
    const request = vi.fn(async () => Response.json({ id: 'cus_fixture', currency: 'usd' }));
    vi.stubGlobal('fetch', request);
    expect(await billing.platformCurrencyForOrg('org_fixture')).toBe('USD');
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]).toBeDefined();
    expect(m.tx.mock.calls[0][0]).toBe('org_fixture');
});
it('uses the confirmed billing currency without fetching or modifying the customer', async () => {
    m.tx.mockResolvedValue([[{ country_code: 'MX', billing_currency: 'eur', stripe_customer_id: 'cus_fixture' }]]);
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    expect(await billing.platformCurrencyForOrg('org_fixture')).toBe('EUR');
    expect(request).not.toHaveBeenCalled();
});
it('uses the EUR market tariff when the customer has no invoice currency yet', async () => {
    m.tx.mockResolvedValue([[{ country_code: 'ES', billing_currency: null, stripe_customer_id: 'cus_fixture' }]]);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ currency: null })));
    expect(await billing.platformCurrencyForOrg('org_fixture')).toBe('EUR');
});
it('fails closed on an unknown established customer currency', async () => {
    m.tx.mockResolvedValue([[{ country_code: 'ES', billing_currency: null, stripe_customer_id: 'cus_fixture' }]]);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ currency: 'gbp' })));
    await expect(billing.platformCurrencyForOrg('org_fixture')).rejects.toThrow('requiere revisión');
});
it('fails closed on an unknown established database currency', async () => {
    m.tx.mockResolvedValue([[{ country_code: 'ES', billing_currency: 'gbp', stripe_customer_id: null }]]);
    await expect(billing.platformCurrencyForOrg('org_fixture')).rejects.toThrow('requiere revisión');
});
it('refuses to invent Developer EUR prices', () => {
    expect(() => billing.priceFor('developer', 'mensual', 'EUR')).toThrow();
    expect(() => billing.meterPricesFor('developer', 'EUR')).toThrow();
    expect(billing.priceFor('pro', 'anual', 'EUR')).toBe(billing.PLAN_PRICES.pro.anual);
    expect(billing.meterPricesFor('pro', 'EUR')).toHaveLength(4);
});
