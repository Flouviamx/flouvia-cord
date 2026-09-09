import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { platformCurrencyFor, normalizePlatformCurrency } from '../src/lib/plan-currency';
import { PLANES, precioAnualTotal } from '../src/lib/precios';
import { overagePriceLabel } from '../src/lib/plan-overage-pricing';
import { planCheckoutLink } from '../src/lib/plan-checkout-link';
import { euroPriceCatalog } from '../scripts/lib/euro-price-catalog.mjs';
import { ensureEuroPrices } from '../scripts/add-eur-currency-options.mjs';
const source = readFileSync(new URL('../src/lib/billing.ts', import.meta.url), 'utf8');
const catalog = euroPriceCatalog(source, false);

describe('EUR commercial contract', () => {
    it.each(['ES', 'DE', 'FR', ' es '])('uses EUR for a new organization in %s', country => expect(platformCurrencyFor(country)).toBe('EUR'));
    it.each(['MXN', 'USD', 'EUR'])('preserves established %s billing despite a country change', currency => expect(platformCurrencyFor('ES', currency)).toBe(currency));
    it('keeps other markets unchanged and normalizes provider codes', () => {
        expect(platformCurrencyFor('MX')).toBe('MXN');
        for (const country of ['US', 'CA', 'GB', 'BR', 'CO', null]) expect(platformCurrencyFor(country)).toBe('USD');
        expect(normalizePlatformCurrency(' eur ')).toBe('EUR');
        expect(normalizePlatformCurrency('GBP')).toBeNull();
    });
    it('publishes only the approved self-service base prices and annual totals', () => {
        expect(PLANES.map(p => p.precio.EUR)).toEqual([0, 12, 30, 70, undefined]);
        expect([12, 30, 70].map(n => precioAnualTotal(n))).toEqual([120, 300, 700]);
        expect(catalog.filter(p => p.base).map(p => Number(p.amount))).toEqual([1200, 12000, 3000, 30000, 7000, 70000]);
        expect(catalog).toHaveLength(17);
        expect(euroPriceCatalog(source, true).some(p => catalog.some(live => live.id === p.id))).toBe(false);
    });
    it('preserves fractional usage prices and API units', () => {
        expect(overagePriceLabel('pro', 'ia', 'EUR', 'en')).toContain('0.175');
        expect(overagePriceLabel('pro', 'api', 'EUR', 'en')).toContain('0.03');
        expect(overagePriceLabel('scale', 'api', 'EUR', 'en')).toContain('0.02');
        expect(overagePriceLabel('pro', 'usuario', 'EUR', 'en')).toContain('15.00');
        expect(overagePriceLabel('starter', 'usuario', 'EUR', 'es')).toBe('Tope duro');
        expect(overagePriceLabel('developer', 'ia', 'EUR', 'en')).toBe('Custom');
        expect(overagePriceLabel('pro', 'ia', 'MXN', 'es')).toContain('3.50');
    });
    it('carries annual selection through signup and replaces an existing cycle', () => {
        const link = planCheckoutLink('/registro?redirect_url=' + encodeURIComponent('/app/checkout?plan=pro&cycle=mensual'), 'anual');
        const target = new URL(new URL(link, 'https://cordhq.app').searchParams.get('redirect_url')!, 'https://cordhq.app');
        expect(target.searchParams.get('plan')).toBe('pro');
        expect(target.searchParams.getAll('cycle')).toEqual(['anual']);
        expect(planCheckoutLink('/app/checkout?plan=scale', 'anual')).toBe('/app/checkout?plan=scale&cycle=anual');
    });
});

function stripeFixture(existing = false) {
    const prices = new Map(catalog.map(row => [row.id, { id: row.id, livemode: true, active: true, currency: 'mxn', recurring: { usage_type: row.base ? 'licensed' : 'metered', interval: row.dimension === 'anual' ? 'year' : 'month' }, currency_options: { mxn: { unit_amount: 24000 }, usd: { unit_amount: 1200 }, ...(existing ? { eur: { unit_amount_decimal: row.amount } } : {}) } }]));
    const fetchImpl = vi.fn(async (input: string | URL | Request, init: any = {}) => {
        const url = new URL(input instanceof Request ? input.url : input);
        expect(url.searchParams.get('expand[]')).toBe('currency_options');
        const price: any = prices.get(url.pathname.split('/').pop()!);
        if (init.method === 'POST') {
            const params = new URLSearchParams(init.body);
            expect([...params.keys()]).toHaveLength(1);
            const amount = params.get('currency_options[eur][unit_amount]') ?? params.get('currency_options[eur][unit_amount_decimal]');
            expect(init.headers['Idempotency-Key']).toBe(`cord-eur:${price.id}:${amount}`);
            price.currency_options.eur = { unit_amount_decimal: amount };
        }
        return Response.json(price);
    });
    return { prices, fetchImpl };
}
describe('EUR price configuration safety', () => {
    it('is read-only by default', async () => {
        const fixture = stripeFixture();
        expect(await ensureEuroPrices({ key: 'sk_live_fixture', catalog, fetchImpl: fixture.fetchImpl })).toMatchObject({ catalog: 17, missingBefore: 17, added: 0 });
        expect(fixture.fetchImpl.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
    });
    it('adds exactly 17 approved alternatives and does not modify MXN/USD; rerun is a no-op', async () => {
        const fixture = stripeFixture();
        const options = { key: 'sk_live_fixture', catalog, apply: true, fetchImpl: fixture.fetchImpl };
        expect(await ensureEuroPrices(options)).toMatchObject({ added: 17 });
        for (const row of catalog) expect(fixture.prices.get(row.id)?.currency_options).toMatchObject({ mxn: { unit_amount: 24000 }, usd: { unit_amount: 1200 }, eur: { unit_amount_decimal: row.amount } });
        fixture.fetchImpl.mockClear();
        expect(await ensureEuroPrices(options)).toMatchObject({ added: 0, unchanged: 17 });
        expect(fixture.fetchImpl.mock.calls).toHaveLength(17);
    });
    it('validates the entire catalog before writing and refuses tariff drift', async () => {
        const fixture = stripeFixture();
        (fixture.prices.get(catalog.at(-1)!.id)!.currency_options as any).eur = { unit_amount: 999 };
        await expect(ensureEuroPrices({ key: 'sk_live_fixture', catalog, apply: true, fetchImpl: fixture.fetchImpl })).rejects.toThrow('Tarifa EUR existente distinta');
        expect(fixture.fetchImpl.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
    });
    it('refuses test/live environment mismatches', async () => {
        const fixture = stripeFixture();
        await expect(ensureEuroPrices({ key: 'sk_test_fixture', catalog, apply: true, fetchImpl: fixture.fetchImpl })).rejects.toThrow();
        expect(fixture.fetchImpl.mock.calls).toHaveLength(1);
    });
});

it('currency UI can leave Custom EUR overages and a late geo response cannot override a manual choice', async () => {
    const component = readFileSync(new URL('../src/components/landing/PlanCurrency.astro', import.meta.url), 'utf8');
    const script = component.slice(component.indexOf('>\n', component.indexOf('<script')) + 2, component.lastIndexOf('</script>'));
    let click: any, resolveGeo: any;
    const cell = { textContent: 'USD 0.125', getAttribute: (name: string) => ({ 'data-eur': 'Custom', 'data-usd': 'USD 0.125', 'data-mxn': 'MXN 2.50' }[name]) };
    const document = { querySelector: () => null, documentElement: { lang: 'en' }, querySelectorAll: (selector: string) => selector === '[data-table-price]' ? [cell] : [], addEventListener: (_: string, handler: any) => { click = handler; } };
    runInNewContext(script, { currencies: ['MXN', 'USD', 'EUR'], document, localStorage: { getItem: () => null, setItem: () => {} }, fetch: () => new Promise(resolve => { resolveGeo = resolve; }) });
    const choose = (currency: string) => click({ target: { closest: () => ({ getAttribute: () => currency }) } });
    choose('EUR'); expect(cell.textContent).toBe('Custom');
    choose('USD'); expect(cell.textContent).toBe('USD 0.125');
    choose('EUR');
    resolveGeo({ json: async () => ({ currency: 'MXN' }) });
    await new Promise(resolve => setImmediate(resolve));
    expect(cell.textContent).toBe('Custom');
});
