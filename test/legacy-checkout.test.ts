import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ resolve: vi.fn(), tx: vi.fn(), limit: vi.fn(), fetch: vi.fn() }));
vi.mock('../src/lib/db', () => ({ resolvePublicQuote: m.resolve, withOrgTx: m.tx,
    sql: (s: TemplateStringsArray, ...values: any[]) => ({ text: s.join('?'), values }) }));
vi.mock('../src/lib/connect-security', () => ({ limitPublicPayment: m.limit }));
import { POST } from '../src/pages/api/q/[token]/checkout';
const quote = { id: 'quote-a', org_id: 'org-a', status: 'approved', base_currency: 'MXN', sandbox_of: null,
    stripe_account_id: 'acct_a', stripe_charges_enabled: true, acepta_tarjeta: true, cobro_spei_auto: true };
const call = () => POST({ params: { token: 'quote-token' }, request: new Request('https://cordhq.app/api/q/quote-token/checkout', { method: 'POST' }) } as any);
beforeEach(() => {
    vi.clearAllMocks(); m.resolve.mockResolvedValue({ id: 'quote-a', orgId: 'org-a' });
    m.tx.mockResolvedValue([[quote]]); m.limit.mockResolvedValue(null); vi.stubGlobal('fetch', m.fetch);
});
afterEach(() => vi.unstubAllGlobals());
describe('compatibilidad del checkout anterior', () => {
    it.each([false, true])('usa la pantalla actual con checkout_v2=%s sin crear objetos de dinero', async checkout_v2 => {
        m.tx.mockResolvedValue([[{ ...quote, checkout_v2 }]]);
        const response = await call(); expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ url: 'https://cordhq.app/q/quote-token/pay' });
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(m.tx).toHaveBeenCalledWith('org-a', expect.objectContaining({ values: ['quote-a', 'org-a'] }));
        expect(m.fetch).not.toHaveBeenCalled();
    });
    it('las llamadas simultáneas devuelven el mismo destino sin crear sesiones', async () => {
        const responses = await Promise.all([call(), call()]);
        expect(await responses[0].json()).toEqual(await responses[1].json());
        expect(m.fetch).not.toHaveBeenCalled();
    });
    it('rechaza un token inexistente sin consultar datos de otra organización', async () => {
        m.resolve.mockResolvedValue(null); expect((await call()).status).toBe(404);
        expect(m.tx).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled();
    });
    it('respeta el límite público antes de resolver el token', async () => {
        m.limit.mockResolvedValue(new Response('limited', { status: 429 }));
        expect((await call()).status).toBe(429); expect(m.resolve).not.toHaveBeenCalled();
    });
    it.each([
        [{ status: 'draft' }, 409], [{ status: 'paid' }, 409], [{ sandbox_of: 'org-live' }, 409],
        [{ stripe_charges_enabled: false }, 403], [{ stripe_account_id: null }, 403],
        [{ acepta_tarjeta: false, cobro_spei_auto: false }, 403],
    ])('conserva la protección de elegibilidad: %j', async (extra, status) => {
        m.tx.mockResolvedValue([[{ ...quote, ...extra }]]);
        expect((await call()).status).toBe(status); expect(m.fetch).not.toHaveBeenCalled();
    });
});
