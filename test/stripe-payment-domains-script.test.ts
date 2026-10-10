// scripts/stripe-payment-domains.mjs contra un Stripe simulado: solo lectura y
// modo test por defecto, llave live rechazada sin --live, registro por cuenta
// conectada con `Stripe-Account` e idempotente. Nunca se corre contra Stripe
// desde las pruebas.
import { describe, expect, it, vi } from 'vitest';
import { registrarDominiosDeCobro, DOMINIO_CANONICO } from '../scripts/stripe-payment-domains.mjs';

function fakeStripe(cuentas: Array<{ id: string; charges_enabled: boolean }>) {
    const dominios = new Map<string, any[]>();
    const posts: Array<{ path: string; account: string | null; key: string | null; body: Record<string, string> }> = [];
    let n = 0;
    const fetchImpl = vi.fn(async (input: any, init: any = {}) => {
        const url = new URL(String(input));
        const method = init.method || 'GET';
        const account = init.headers?.['Stripe-Account'] ?? null;
        const ok = (data: any) => Response.json(data);
        if (url.pathname === '/v1/accounts' && method === 'GET') return ok({ data: cuentas, has_more: false });
        const una = /^\/v1\/accounts\/(.+)$/.exec(url.pathname);
        if (una) {
            const c = cuentas.find((x) => x.id === una[1]);
            return c ? ok(c) : Response.json({ error: { code: 'account_invalid' } }, { status: 404 });
        }
        if (url.pathname === '/v1/payment_method_domains') {
            if (!account) return Response.json({ error: { code: 'platform_domain' } }, { status: 400 });
            const lista = dominios.get(account) ?? [];
            dominios.set(account, lista);
            if (method === 'GET') return ok({ data: lista.filter((d) => d.domain_name === url.searchParams.get('domain_name')), has_more: false });
            const body = Object.fromEntries(new URLSearchParams(init.body));
            posts.push({ path: url.pathname, account, key: init.headers['Idempotency-Key'] ?? null, body });
            const pmd = { id: `pmd_${++n}`, domain_name: body.domain_name, enabled: true, apple_pay: { status: 'active' }, google_pay: { status: 'active' } };
            lista.push(pmd);
            return ok(pmd);
        }
        return Response.json({ error: { code: 'unexpected' } }, { status: 500 });
    });
    return { fetchImpl, posts, dominios };
}

const CUENTAS = [{ id: 'acct_A', charges_enabled: true }, { id: 'acct_B', charges_enabled: false }];

describe('stripe:payment-domains', () => {
    it('por defecto es dry-run: lee y no escribe nada', async () => {
        const s = fakeStripe(CUENTAS);
        const r = await registrarDominiosDeCobro({ key: 'sk_test_x', fetchImpl: s.fetchImpl as any });
        expect(r).toMatchObject({ modo: 'test', aplicado: false });
        expect(r.cuentas).toEqual([{ cuenta: 'acct_A', dominios: [expect.objectContaining({ dominio: DOMINIO_CANONICO, accion: 'crearia' })] }]);
        expect(s.posts).toEqual([]);
    });
    it('rechaza una llave live sin --live y una llave inválida', async () => {
        const s = fakeStripe(CUENTAS);
        await expect(registrarDominiosDeCobro({ key: 'sk_live_x', fetchImpl: s.fetchImpl as any })).rejects.toThrow(/LIVE/);
        await expect(registrarDominiosDeCobro({ key: 'pk_test_x', fetchImpl: s.fetchImpl as any })).rejects.toThrow(/STRIPE_SECRET_KEY/);
        expect(s.fetchImpl).not.toHaveBeenCalled();
        const live = await registrarDominiosDeCobro({ key: 'sk_live_x', allowLive: true, fetchImpl: s.fetchImpl as any });
        expect(live.modo).toBe('live');
    });
    it('con --apply registra en cada cuenta que cobra, con Stripe-Account y clave determinística, y es idempotente', async () => {
        const s = fakeStripe(CUENTAS);
        const custom = new Map([['acct_A', 'pagos.acme.com']]);
        const r1 = await registrarDominiosDeCobro({ key: 'sk_test_x', apply: true, customDomains: custom, extraDomains: ['cord-git-x.vercel.app'], fetchImpl: s.fetchImpl as any });
        expect(r1.cuentas.map((c) => c.cuenta)).toEqual(['acct_A']);
        expect(s.posts.map((p) => [p.account, p.body.domain_name, p.key])).toEqual([
            ['acct_A', 'cordhq.app', 'cord-pmd:acct_A:cordhq.app'],
            ['acct_A', 'pagos.acme.com', 'cord-pmd:acct_A:pagos.acme.com'],
            ['acct_A', 'cord-git-x.vercel.app', 'cord-pmd:acct_A:cord-git-x.vercel.app'],
        ]);
        const r2 = await registrarDominiosDeCobro({ key: 'sk_test_x', apply: true, customDomains: custom, extraDomains: ['cord-git-x.vercel.app'], fetchImpl: s.fetchImpl as any });
        expect(r2.cuentas[0].dominios.every((d: any) => d.accion === 'existente')).toBe(true);
        expect(s.posts).toHaveLength(3);
        expect(r2.atencion).toBe(0);
    });
    it('--all incluye cuentas sin cobros activos y --account limita a una', async () => {
        const s = fakeStripe(CUENTAS);
        const todas = await registrarDominiosDeCobro({ key: 'sk_test_x', all: true, fetchImpl: s.fetchImpl as any });
        expect(todas.cuentas.map((c) => c.cuenta)).toEqual(['acct_A', 'acct_B']);
        const una = await registrarDominiosDeCobro({ key: 'sk_test_x', all: true, accounts: ['acct_B'], fetchImpl: s.fetchImpl as any });
        expect(una.cuentas.map((c) => c.cuenta)).toEqual(['acct_B']);
    });
    it('rechaza un --domain que no es un hostname público y un --account mal formado', async () => {
        const s = fakeStripe(CUENTAS);
        await expect(registrarDominiosDeCobro({ key: 'sk_test_x', extraDomains: ['https://x.com/pay'], fetchImpl: s.fetchImpl as any })).rejects.toThrow(/Dominio inválido/);
        await expect(registrarDominiosDeCobro({ key: 'sk_test_x', accounts: ['org-a'], fetchImpl: s.fetchImpl as any })).rejects.toThrow(/acct_/);
        expect(s.fetchImpl).not.toHaveBeenCalled();
    });
});
