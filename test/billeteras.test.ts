// Apple Pay y Google Pay: el registro de los dominios de cobro en la cuenta
// conectada (cargos directos) y la política `payment` de las superficies de
// cobro. Contra un proveedor simulado: nunca se llama a Stripe desde aquí.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ tx: vi.fn(), stripe: vi.fn(), enabled: vi.fn(), read: vi.fn(), log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../src/lib/db', () => ({ withOrgTx: m.tx, sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.join('?'), values }) }));
vi.mock('../src/lib/billing', () => ({ stripe: m.stripe }));
vi.mock('../src/lib/log', () => ({ log: m.log }));
vi.mock('../src/lib/public-links', () => ({ canonicalPublicOrigin: () => 'https://cordhq.app' }));
vi.mock('../src/lib/vercel-domains', () => ({ domainsEnabled: m.enabled }));
vi.mock('../src/lib/customer-domains', () => ({ readCustomerDomain: m.read }));

import {
    asegurarDominiosDeCobro, claveDeRegistro, dominiosDeCobro, esSuperficieDeCobro, normalizarDominioDeCobro,
    politicaDePago, requiereAtencion, WALLETS_PAYMENT_ELEMENT, type LlamadaStripe,
} from '../src/lib/cobros/billeteras';
import { sincronizarDominiosDeCobro } from '../src/lib/cobros/billeteras-org';

/** Proveedor simulado de payment_method_domains, separado por cuenta conectada. */
function proveedor(inicial: Record<string, any[]> = {}) {
    const porCuenta = new Map(Object.entries(inicial).map(([k, v]) => [k, [...v]]));
    const posts: Array<{ ruta: string; cuenta: string; params?: Record<string, string>; idempotencia?: string }> = [];
    let n = 0;
    const llamar = vi.fn<LlamadaStripe>(async (ruta, { metodo = 'GET', params, cuenta, idempotencia }) => {
        const lista = porCuenta.get(cuenta) ?? [];
        porCuenta.set(cuenta, lista);
        if (metodo === 'GET' && ruta === '/v1/payment_method_domains') {
            return { data: lista.filter((d) => !params?.domain_name || d.domain_name === params.domain_name), has_more: false };
        }
        posts.push({ ruta, cuenta, params, idempotencia });
        if (ruta === '/v1/payment_method_domains') {
            const pmd = { id: `pmd_${++n}`, domain_name: params!.domain_name, enabled: true, apple_pay: { status: 'active' }, google_pay: { status: 'active' } };
            lista.push(pmd);
            return pmd;
        }
        const validar = /^\/v1\/payment_method_domains\/(.+)\/validate$/.exec(ruta);
        if (validar) {
            const pmd = lista.find((d) => d.id === decodeURIComponent(validar[1]));
            pmd.apple_pay = { status: 'active' };
            return pmd;
        }
        throw new Error(`ruta inesperada ${ruta}`);
    });
    return { llamar, posts, porCuenta };
}

describe('superficies de cobro y política payment', () => {
    it.each(['/q/abc123token/pay', '/i/abc123token', '/portal/abc123token', '/portal/abc123token/'])('%s delega payment a los marcos de Stripe', (path) => {
        expect(esSuperficieDeCobro(path)).toBe(true);
        expect(politicaDePago(path)).toBe('payment=(self "https://js.stripe.com" "https://*.js.stripe.com")');
    });
    it.each(['/q/abc123token', '/app', '/billing', '/app/checkout', '/embed/abc123token', '/i/abc123token/pdf', '/api/i/abc123token/payment-intent'])(
        '%s se queda con payment=(self)', (path) => {
            expect(esSuperficieDeCobro(path)).toBe(false);
            expect(politicaDePago(path)).toBe('payment=(self)');
        });
    it('el Payment Element deja las billeteras en automático', () => {
        expect(WALLETS_PAYMENT_ELEMENT).toEqual({ applePay: 'auto', googlePay: 'auto' });
    });
});

describe('dominios registrables', () => {
    it('normaliza hostnames públicos y rechaza lo que no puede llevar HTTPS de dominio', () => {
        expect(normalizarDominioDeCobro(' CordHQ.app. ')).toBe('cordhq.app');
        expect(normalizarDominioDeCobro('cotizaciones.acme.com.mx')).toBe('cotizaciones.acme.com.mx');
        for (const malo of ['https://cordhq.app', 'cordhq.app/i', 'cordhq.app:443', 'localhost', '127.0.0.1', '*.cordhq.app', '', null, 42]) {
            expect(normalizarDominioDeCobro(malo)).toBeNull();
        }
    });
    it('une canónico, propio y extra sin repetir', () => {
        expect(dominiosDeCobro({ canonico: 'cordhq.app', propio: 'Pagos.Acme.com', extra: ['cordhq.app', 'x.vercel.app', 'nope'] }))
            .toEqual(['cordhq.app', 'pagos.acme.com', 'x.vercel.app']);
    });
});

describe('asegurarDominiosDeCobro', () => {
    it('registra en la cuenta conectada con clave de idempotencia y no repite en la segunda corrida', async () => {
        const p = proveedor();
        const r1 = await asegurarDominiosDeCobro({ cuenta: 'acct_A', dominios: ['cordhq.app', 'pagos.acme.com'], llamar: p.llamar });
        expect(r1.map((r) => [r.dominio, r.accion, r.applePay, r.googlePay])).toEqual([
            ['cordhq.app', 'creado', 'active', 'active'], ['pagos.acme.com', 'creado', 'active', 'active'],
        ]);
        expect(p.posts).toEqual([
            { ruta: '/v1/payment_method_domains', cuenta: 'acct_A', params: { domain_name: 'cordhq.app' }, idempotencia: claveDeRegistro('acct_A', 'cordhq.app') },
            { ruta: '/v1/payment_method_domains', cuenta: 'acct_A', params: { domain_name: 'pagos.acme.com' }, idempotencia: claveDeRegistro('acct_A', 'pagos.acme.com') },
        ]);
        const r2 = await asegurarDominiosDeCobro({ cuenta: 'acct_A', dominios: ['cordhq.app', 'pagos.acme.com'], llamar: p.llamar });
        expect(r2.every((r) => r.accion === 'existente')).toBe(true);
        expect(p.posts).toHaveLength(2);
    });
    it('el dominio de una cuenta no cuenta para otra', async () => {
        const p = proveedor({ acct_A: [{ id: 'pmd_a', domain_name: 'cordhq.app', enabled: true, apple_pay: { status: 'active' }, google_pay: { status: 'active' } }] });
        const [r] = await asegurarDominiosDeCobro({ cuenta: 'acct_B', dominios: ['cordhq.app'], llamar: p.llamar });
        expect(r.accion).toBe('creado');
        expect(p.posts[0].cuenta).toBe('acct_B');
    });
    it('sin aplicar solo lee', async () => {
        const p = proveedor();
        const [r] = await asegurarDominiosDeCobro({ cuenta: 'acct_A', dominios: ['cordhq.app'], llamar: p.llamar, aplicar: false });
        expect(r.accion).toBe('crearia');
        expect(p.posts).toEqual([]);
    });
    it('no reactiva un dominio deshabilitado y lo marca para revisión', async () => {
        const p = proveedor({ acct_A: [{ id: 'pmd_x', domain_name: 'cordhq.app', enabled: false, apple_pay: { status: 'inactive' }, google_pay: { status: 'inactive' } }] });
        const [r] = await asegurarDominiosDeCobro({ cuenta: 'acct_A', dominios: ['cordhq.app'], llamar: p.llamar, validar: true });
        expect(r.accion).toBe('deshabilitado');
        expect(requiereAtencion(r)).toBe(true);
        expect(p.posts).toEqual([]);
    });
    it('valida un dominio inactivo solo cuando se pide, y conserva el motivo', async () => {
        const inactivo = { id: 'pmd_y', domain_name: 'cordhq.app', enabled: true, google_pay: { status: 'active' },
            apple_pay: { status: 'inactive', status_details: { error_message: 'domain not verified' } } };
        const p = proveedor({ acct_A: [inactivo] });
        const [sin] = await asegurarDominiosDeCobro({ cuenta: 'acct_A', dominios: ['cordhq.app'], llamar: p.llamar });
        expect(sin).toMatchObject({ accion: 'existente', applePay: 'inactive', motivo: 'domain not verified' });
        expect(p.posts).toEqual([]);
        const [con] = await asegurarDominiosDeCobro({ cuenta: 'acct_A', dominios: ['cordhq.app'], llamar: p.llamar, validar: true });
        expect(con).toMatchObject({ accion: 'validado', applePay: 'active' });
        expect(p.posts.map((x) => x.ruta)).toEqual(['/v1/payment_method_domains/pmd_y/validate']);
    });
    it('un fallo en un dominio no detiene a los demás', async () => {
        const p = proveedor();
        const llamar: LlamadaStripe = async (ruta, o) => {
            if (o.params?.domain_name === 'malo.acme.com') throw Object.assign(new Error('boom'), { code: 'rate_limit' });
            return p.llamar(ruta, o);
        };
        const r = await asegurarDominiosDeCobro({ cuenta: 'acct_A', dominios: ['malo.acme.com', 'cordhq.app', 'no valido'], llamar });
        expect(r.map((x) => [x.dominio, x.accion, x.motivo])).toEqual([
            ['malo.acme.com', 'error', 'rate_limit'], ['cordhq.app', 'creado', null], ['no valido', 'error', 'dominio inválido'],
        ]);
    });
    it('rechaza una cuenta que no es acct_', async () => {
        await expect(asegurarDominiosDeCobro({ cuenta: 'org-a', dominios: ['cordhq.app'], llamar: proveedor().llamar })).rejects.toThrow();
    });
});

describe('sincronizarDominiosDeCobro (organización)', () => {
    let org: Record<string, unknown>;
    afterEach(() => vi.unstubAllEnvs());
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('CORD_WALLETS_ENABLED', 'true');
        org = { stripe_account_id: 'acct_A', stripe_charges_enabled: true, sandbox_of: null };
        m.tx.mockImplementation(async () => [[org]]);
        m.enabled.mockReturnValue(true);
        m.read.mockResolvedValue({ hostname: 'pagos.acme.com', status: 'active', removing: false });
        const p = proveedor();
        m.stripe.mockImplementation((ruta: string, params: any, metodo: any, opts: any) =>
            p.llamar(ruta, { metodo, params, cuenta: opts.stripeAccount, idempotencia: opts.idempotencyKey }));
    });
    it('registra cordhq.app y el dominio propio activo en la cuenta del negocio', async () => {
        const r = await sincronizarDominiosDeCobro('org-a', 'acct_A');
        expect(r?.map((x) => [x.dominio, x.accion])).toEqual([['cordhq.app', 'creado'], ['pagos.acme.com', 'creado']]);
        const posts = m.stripe.mock.calls.filter((c) => c[2] === 'POST');
        expect(posts.map((c) => c[3])).toEqual([
            { stripeAccount: 'acct_A', idempotencyKey: 'cord-pmd:acct_A:cordhq.app' },
            { stripeAccount: 'acct_A', idempotencyKey: 'cord-pmd:acct_A:pagos.acme.com' },
        ]);
        expect(m.tx.mock.calls[0][0]).toBe('org-a');
    });
    it('omite el dominio propio pendiente o con los dominios apagados', async () => {
        m.read.mockResolvedValue({ hostname: 'pagos.acme.com', status: 'dns_pending', removing: false });
        expect((await sincronizarDominiosDeCobro('org-a'))?.map((x) => x.dominio)).toEqual(['cordhq.app']);
        m.read.mockResolvedValue({ hostname: 'pagos.acme.com', status: 'active', removing: false });
        m.enabled.mockReturnValue(false);
        expect((await sincronizarDominiosDeCobro('org-a'))?.map((x) => x.dominio)).toEqual(['cordhq.app']);
    });
    it.each([
        ['sin cuenta', { stripe_account_id: null }],
        ['cuenta sin cobros activos', { stripe_charges_enabled: false }],
        ['organización de prueba', { sandbox_of: 'org-real' }],
    ])('no llama al proveedor: %s', async (_caso, cambio) => {
        Object.assign(org, cambio);
        expect(await sincronizarDominiosDeCobro('org-a')).toBeNull();
        expect(m.stripe).not.toHaveBeenCalled();
    });
    it('nace apagado: sin CORD_WALLETS_ENABLED no lee la base ni llama al proveedor', async () => {
        vi.stubEnv('CORD_WALLETS_ENABLED', '');
        expect(await sincronizarDominiosDeCobro('org-a', 'acct_A')).toBeNull();
        expect(m.tx).not.toHaveBeenCalled();
        expect(m.stripe).not.toHaveBeenCalled();
    });
    it('ignora un aviso de una cuenta que el negocio ya reemplazó', async () => {
        expect(await sincronizarDominiosDeCobro('org-a', 'acct_VIEJA')).toBeNull();
        expect(m.stripe).not.toHaveBeenCalled();
    });
    it('nunca lanza: un fallo de la base queda en el log', async () => {
        m.tx.mockRejectedValue(new Error('db down'));
        await expect(sincronizarDominiosDeCobro('org-a')).resolves.toBeNull();
        expect(m.log.error).toHaveBeenCalled();
    });
    it('avisa en el log cuando una billetera queda inactiva', async () => {
        m.stripe.mockImplementation(async (_ruta: string, _p: any, metodo: any) => metodo === 'GET'
            ? { data: [{ id: 'pmd_1', domain_name: 'cordhq.app', enabled: true, apple_pay: { status: 'inactive', status_details: { error_message: 'x' } }, google_pay: { status: 'active' } }] }
            : { id: 'pmd_2', domain_name: 'pagos.acme.com', enabled: true, apple_pay: { status: 'active' }, google_pay: { status: 'active' } });
        await sincronizarDominiosDeCobro('org-a');
        expect(m.log.warn).toHaveBeenCalledWith('dominio de cobro requiere atención', expect.objectContaining({ dominio: 'cordhq.app', applePay: 'inactive' }));
    });
});
