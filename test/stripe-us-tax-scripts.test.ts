// Los scripts que configuran en Stripe el excedente del sales tax de EE. UU.
// (scripts/stripe-us-tax-meter.mjs y scripts/stripe-us-tax-items.mjs) contra un
// Stripe simulado: solo lectura por defecto, llave live rechazada sin --live,
// idempotentes, sin sobrescribir un Price existente y sin tocar suscripciones
// con un cambio programado. Nunca se corren contra Stripe desde las pruebas.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { bloqueParaBilling, ensureUsTaxBilling, US_TAX_EVENT_NAME } from '../scripts/stripe-us-tax-meter.mjs';
import { ensureUsTaxItems } from '../scripts/stripe-us-tax-items.mjs';
import { billingIds, meterIdOf, meterPricesOf } from '../scripts/lib/billing-ids.mjs';

const SOURCE = readFileSync(new URL('../src/lib/billing.ts', import.meta.url), 'utf8');

function fakeStripe(options: { live?: boolean } = {}) {
    const state = {
        meters: [] as any[], products: new Map<string, any>(), prices: new Map<string, any>(),
        subscriptions: [] as any[], posts: [] as Array<{ path: string; body: Record<string, string>; key: string | null }>,
    };
    let n = 0;
    const fetchImpl = vi.fn(async (input: any, init: any = {}) => {
        const url = new URL(String(input));
        const method = init.method || 'GET';
        const body = method === 'POST' ? Object.fromEntries(new URLSearchParams(init.body)) : {};
        if (method === 'POST') state.posts.push({ path: url.pathname, body, key: init.headers['Idempotency-Key'] ?? null });
        const ok = (data: any) => Response.json(data);
        if (url.pathname === '/v1/billing/meters') {
            if (method === 'GET') return ok({ data: state.meters, has_more: false });
            const m = { id: `mtr_${++n}`, status: 'active', event_name: body.event_name, default_aggregation: { formula: body['default_aggregation[formula]'] },
                customer_mapping: { event_payload_key: body['customer_mapping[event_payload_key]'] }, value_settings: { event_payload_key: body['value_settings[event_payload_key]'] } };
            state.meters.push(m);
            return ok(m);
        }
        const prod = /^\/v1\/products\/(.+)$/.exec(url.pathname);
        if (prod) return state.products.has(prod[1]) ? ok(state.products.get(prod[1])) : Response.json({ error: { code: 'resource_missing' } }, { status: 404 });
        if (url.pathname === '/v1/products') {
            const p = { id: body.id, name: body.name };
            state.products.set(p.id, p);
            return ok(p);
        }
        if (url.pathname === '/v1/prices' && method === 'GET') {
            const lk = url.searchParams.get('lookup_keys[]');
            return ok({ data: [...state.prices.values()].filter((p) => p.lookup_key === lk) });
        }
        if (url.pathname === '/v1/prices') {
            const p = {
                id: `price_${++n}`, active: true, livemode: !!options.live, currency: body.currency, unit_amount: Number(body.unit_amount),
                currency_options: {
                    usd: { unit_amount: Number(body['currency_options[usd][unit_amount]']) },
                    ...(body['currency_options[eur][unit_amount]'] ? { eur: { unit_amount: Number(body['currency_options[eur][unit_amount]']) } } : {}),
                },
                recurring: { interval: body['recurring[interval]'], usage_type: body['recurring[usage_type]'], meter: body['recurring[meter]'] },
                product: body.product, lookup_key: body.lookup_key,
            };
            state.prices.set(p.id, p);
            return ok(p);
        }
        const price = /^\/v1\/prices\/(.+)$/.exec(url.pathname);
        if (price) return state.prices.has(price[1]) ? ok(state.prices.get(price[1])) : Response.json({ error: { code: 'resource_missing' } }, { status: 404 });
        if (url.pathname === '/v1/subscriptions') return ok({ data: state.subscriptions, has_more: false });
        if (url.pathname === '/v1/subscription_items') {
            const sub = state.subscriptions.find((s) => s.id === body.subscription);
            sub.items.data.push({ id: `si_${++n}`, price: state.prices.get(body.price) });
            return ok({ id: `si_${n}` });
        }
        throw new Error(`ruta no simulada: ${method} ${url.pathname}`);
    });
    return { state, fetchImpl };
}

describe('scripts/stripe-us-tax-meter.mjs', () => {
    it('rechaza una llave live sin --live y una llave inválida', async () => {
        const { fetchImpl } = fakeStripe();
        await expect(ensureUsTaxBilling({ key: 'sk_live_x', fetchImpl, source: SOURCE })).rejects.toThrow(/--live/);
        await expect(ensureUsTaxBilling({ key: 'pk_test_x', fetchImpl, source: SOURCE })).rejects.toThrow(/STRIPE_SECRET_KEY/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('por defecto solo lee: dice qué crearía y no escribe nada', async () => {
        const { state, fetchImpl } = fakeStripe();
        const r = await ensureUsTaxBilling({ key: 'sk_test_x', fetchImpl, source: SOURCE });
        expect(r).toMatchObject({ modo: 'test', aplicado: false, meter: null });
        expect(state.posts).toEqual([]);
        expect(r.acciones.filter((a) => a.startsWith('+'))).toHaveLength(6);
        expect(bloqueParaBilling(r)).toBeNull();
    });

    it('con --apply crea meter, producto y un Price por plan con MXN/USD/EUR (sin EUR en Developer); repetir no crea nada', async () => {
        const { state, fetchImpl } = fakeStripe();
        const r = await ensureUsTaxBilling({ key: 'sk_test_x', apply: true, fetchImpl, source: SOURCE });
        expect(state.meters).toHaveLength(1);
        expect(state.meters[0]).toMatchObject({ event_name: US_TAX_EVENT_NAME, default_aggregation: { formula: 'sum' } });
        const prices = [...state.prices.values()];
        expect(prices).toHaveLength(4);
        for (const p of prices) {
            expect(p).toMatchObject({ currency: 'mxn', unit_amount: 1500, recurring: { interval: 'month', usage_type: 'metered', meter: r.meter } });
            expect(p.currency_options.usd.unit_amount).toBe(75);
            expect(p.currency_options.eur?.unit_amount).toBe(p.lookup_key === 'cord_us_tax_developer' ? undefined : 70);
        }
        // Cada creación con su Idempotency-Key determinística.
        expect(state.posts.every((p) => p.key && p.key.startsWith('cord-us-tax-'))).toBe(true);
        expect(bloqueParaBilling(r)).toContain(`us_tax: '${r.meter}'`);

        state.posts.length = 0;
        const otra = await ensureUsTaxBilling({ key: 'sk_test_x', apply: true, fetchImpl, source: SOURCE });
        expect(state.posts).toEqual([]);
        expect(otra.prices).toEqual(r.prices);
    });

    it('un Price existente con otra tarifa detiene el script en vez de sobrescribirlo', async () => {
        const { state, fetchImpl } = fakeStripe();
        await ensureUsTaxBilling({ key: 'sk_test_x', apply: true, fetchImpl, source: SOURCE });
        const pro = [...state.prices.values()].find((p) => p.lookup_key === 'cord_us_tax_pro');
        pro.currency_options.usd.unit_amount = 50;
        state.posts.length = 0;
        await expect(ensureUsTaxBilling({ key: 'sk_test_x', apply: true, fetchImpl, source: SOURCE })).rejects.toThrow(/USD 50.*No se sobrescribe/);
        expect(state.posts).toEqual([]);
    });
});

describe('scripts/stripe-us-tax-items.mjs', () => {
    // billing.ts con los ids us_tax llenos, como quedaría tras el script anterior.
    function sourceConIds(prices: Record<string, string>, meter: string) {
        let s = SOURCE;
        const test = s.slice(0, s.indexOf('} : {', s.indexOf('export const METER_PRICES')));
        let filled = test;
        for (const [plan, id] of Object.entries(prices)) {
            filled = filled.replace(new RegExp(`(\\n\\s*${plan}:\\s*\\{[^\\n]*)us_tax: ''`), `$1us_tax: '${id}'`);
        }
        s = filled + s.slice(test.length);
        return s.replace("    us_tax:   '',\n} : {", `    us_tax:   '${meter}',\n} : {`);
    }

    it('lee billing.ts para el modo de la llave', () => {
        const ids = billingIds(SOURCE, true);
        expect(meterIdOf(ids, 'us_tax')).toBe('');
        expect(Object.values(meterPricesOf(ids, 'us_tax'))).toEqual(['', '', '', '']);
        expect(ids.planPrices.pro.mensual).toMatch(/^price_/);
        const lleno = billingIds(sourceConIds({ starter: 'price_a', pro: 'price_b', scale: 'price_c', developer: 'price_d' }, 'mtr_test_x'), true);
        expect(meterPricesOf(lleno, 'us_tax')).toEqual({ starter: 'price_a', pro: 'price_b', scale: 'price_c', developer: 'price_d' });
        expect(meterIdOf(lleno, 'us_tax')).toBe('mtr_test_x');
        // La rama live no se toca al llenar la de test.
        expect(meterIdOf(billingIds(sourceConIds({ starter: 'price_a', pro: 'price_b', scale: 'price_c', developer: 'price_d' }, 'mtr_test_x'), false), 'us_tax')).toBe('');
    });

    it('sin los ids en billing.ts no hace nada', async () => {
        const { fetchImpl } = fakeStripe();
        await expect(ensureUsTaxItems({ key: 'sk_test_x', fetchImpl, source: SOURCE })).rejects.toThrow(/billing\.ts no tiene el Price us_tax/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('agrega el item solo a suscripciones vivas de Cord que no lo tienen; omite cambios programados y monedas sin opción', async () => {
        const fake = fakeStripe();
        const r = await ensureUsTaxBilling({ key: 'sk_test_x', apply: true, fetchImpl: fake.fetchImpl, source: SOURCE });
        const source = sourceConIds(r.prices as Record<string, string>, r.meter!);
        const ids = billingIds(SOURCE, true);
        const base = (plan: string) => ({ id: `si_base_${plan}`, price: { id: ids.planPrices[plan].mensual } });
        fake.state.subscriptions.push(
            { id: 'sub_pro', status: 'active', currency: 'usd', metadata: { org_id: 'o1' }, items: { data: [base('pro')] } },
            { id: 'sub_ya', status: 'active', currency: 'usd', items: { data: [base('starter'), { id: 'si_x', price: { id: r.prices.starter } }] } },
            { id: 'sub_cancelada', status: 'canceled', currency: 'usd', items: { data: [base('pro')] } },
            { id: 'sub_programada', status: 'active', currency: 'mxn', schedule: 'sub_sched_1', items: { data: [base('scale')] } },
            { id: 'sub_dev_eur', status: 'active', currency: 'eur', items: { data: [base('developer')] } },
            { id: 'sub_ajena', status: 'active', currency: 'usd', items: { data: [{ id: 'si_y', price: { id: 'price_de_otro_producto' } }] } },
        );
        fake.state.posts.length = 0;

        const seco = await ensureUsTaxItems({ key: 'sk_test_x', fetchImpl: fake.fetchImpl, source });
        expect(seco).toMatchObject({ aplicado: false, revisadas: 4, yaTenian: 1 });
        expect(seco.agregadas).toEqual(['sub_pro (pro, USD, org o1)']);
        expect(seco.omitidas.map((o) => o.sub)).toEqual(['sub_programada', 'sub_dev_eur']);
        expect(fake.state.posts).toEqual([]);

        const hecho = await ensureUsTaxItems({ key: 'sk_test_x', apply: true, fetchImpl: fake.fetchImpl, source });
        expect(hecho.agregadas).toHaveLength(1);
        expect(fake.state.posts).toEqual([{
            path: '/v1/subscription_items', key: `cord-us-tax-item:sub_pro:${r.prices.pro}`,
            body: { subscription: 'sub_pro', price: r.prices.pro, proration_behavior: 'none' },
        }]);
        // Idempotente: la segunda corrida ya no agrega nada.
        fake.state.posts.length = 0;
        const otra = await ensureUsTaxItems({ key: 'sk_test_x', apply: true, fetchImpl: fake.fetchImpl, source });
        expect(otra).toMatchObject({ yaTenian: 2, agregadas: [] });
        expect(fake.state.posts).toEqual([]);
    });

    it('rechaza una llave live sin --live', async () => {
        const { fetchImpl } = fakeStripe({ live: true });
        await expect(ensureUsTaxItems({ key: 'rk_live_x', fetchImpl, source: SOURCE })).rejects.toThrow(/--live/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
