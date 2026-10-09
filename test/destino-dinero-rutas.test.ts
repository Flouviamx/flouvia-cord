// Las rutas del destino del dinero que no cubren las pruebas de base de datos:
//   - "No fui yo" es público, de un solo uso y no confirma qué tokens existen;
//   - Ajustes no reabre los depósitos automáticos mientras Cord los controla;
//   - Mercado Pago no abre cobros durante su espera.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    rows: [] as any[], porToken: vi.fn(), revertir: vi.fn(), limite: vi.fn(), update: vi.fn(), retrieve: vi.fn(),
    audit: vi.fn(), queries: [] as Array<{ text: string; values: unknown[] }>,
}));
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.join('?'), values }),
    getActiveOrgId: async () => 'org-1',
    withOrgTx: async (_org: string, ...qs: Array<{ text: string; values: unknown[] }>) => {
        m.queries.push(...qs);
        return qs.map((q) => (/^\s*select/i.test(q.text) ? m.rows : []));
    },
}));
vi.mock('../src/lib/money-hold', () => ({ cambioPorToken: m.porToken }));
vi.mock('../src/lib/destino-dinero', () => ({ revertirCambio: m.revertir }));
vi.mock('../src/lib/ratelimit', () => ({
    strictRateLimit: m.limite,
    strictLimitResponse: (r: { ok: boolean }) => (r.ok ? null : new Response(null, { status: 429 })),
}));
vi.mock('../src/lib/ip', () => ({ trustedIp: () => '203.0.113.7' }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn() } }));
vi.mock('../src/lib/queries', () => ({ requirePerm: async () => null }));
vi.mock('../src/lib/billing', () => ({ retrieveAccount: m.retrieve, updateConnectAccount: m.update }));
vi.mock('../src/lib/connect-audit', () => ({ auditConnect: m.audit }));
vi.mock('../src/lib/connect-security', () => ({ limitConnectMutation: async () => null, limitConnectRead: async () => null }));
vi.mock('../src/lib/step-up', () => ({ requireFreshAuth: async () => null }));

const revertir = async (body: unknown) => {
    const { POST } = await import('../src/pages/api/dinero/revertir');
    return POST({ request: new Request('https://cordhq.app/api/dinero/revertir', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) } as any) as Promise<Response>;
};
const TOKEN = 'a'.repeat(43);

beforeEach(() => {
    vi.clearAllMocks();
    m.queries = [];
    m.limite.mockResolvedValue({ ok: true });
});

describe('POST /api/dinero/revertir', () => {
    it('un token que no existe, ya se usó o venció responde lo mismo: 404 sin detalle', async () => {
        m.porToken.mockResolvedValue(null);
        const res = await revertir({ token: TOKEN });
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'not_found' });
        expect(m.revertir).not.toHaveBeenCalled();
    });

    it('revierte con el carril de la organización del token y dice si quedó algo pendiente', async () => {
        const cambio = { orgId: 'org-9', id: 'c-1', tipo: 'banco', estado: 'en_espera', antes: {}, despues: {} };
        m.porToken.mockResolvedValue(cambio);
        m.revertir.mockResolvedValue({ revertido: true, pendientes: ['borrar_cuenta_nueva'] });
        const res = await revertir({ token: TOKEN });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, completo: false });
        expect(m.revertir).toHaveBeenCalledWith(cambio, { ip: '203.0.113.7' });
        expect(res.headers.get('Cache-Control')).toBe('no-store');
    });

    it('la carrera de dos clics: el segundo no revierte nada', async () => {
        m.porToken.mockResolvedValue({ orgId: 'org-9', id: 'c-1', tipo: 'banco', estado: 'en_espera', antes: {}, despues: {} });
        m.revertir.mockResolvedValue({ revertido: false, pendientes: [] });
        expect((await revertir({ token: TOKEN })).status).toBe(404);
    });

    it('tiene límite estricto por IP y rechaza un cuerpo que no es el esperado', async () => {
        m.limite.mockResolvedValue({ ok: false });
        expect((await revertir({ token: TOKEN })).status).toBe(429);
        expect(m.limite).toHaveBeenCalledWith('dinero-revertir:203.0.113.7', 10, 3600);
        m.limite.mockResolvedValue({ ok: true });
        expect((await revertir({ token: TOKEN, extra: 1 })).status).toBe(400);
        expect((await revertir({ token: 'corto' })).status).toBe(400);
    });
});

describe('frecuencia de depósito mientras Cord controla los depósitos', () => {
    const patch = async (body: unknown) => {
        const { PATCH } = await import('../src/pages/api/billing/connect/payout-schedule');
        return PATCH({ request: new Request('https://cordhq.app/x', { method: 'PATCH', body: JSON.stringify(body) }) } as any) as Promise<Response>;
    };

    it('bajo control NO escribe en Stripe: guarda la preferencia y la aplica Cord al soltar el control', async () => {
        m.rows = [{ stripe_account_id: 'acct_1', depositos_controlados: true }];
        const res = await patch({ interval: 'weekly', weekly_anchor: 'friday' });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ controlado: true });
        expect(m.update).not.toHaveBeenCalled();
        const guardado = m.queries.find((q) => q.text.includes('deposito_preferido'));
        expect(guardado?.values).toContain(JSON.stringify({ interval: 'weekly', weekly_anchor: 'friday' }));
    });

    it('sin control escribe en Stripe y también guarda la preferencia', async () => {
        m.rows = [{ stripe_account_id: 'acct_1', depositos_controlados: false }];
        m.update.mockResolvedValue({ settings: { payouts: { schedule: { interval: 'monthly', monthly_anchor: 15 } } } });
        expect((await patch({ interval: 'monthly', monthly_anchor: 15 })).status).toBe(200);
        expect(m.update).toHaveBeenCalledWith('acct_1', expect.objectContaining({ 'settings[payouts][schedule][interval]': 'monthly' }));
        expect(m.queries.some((q) => q.text.includes('deposito_preferido'))).toBe(true);
    });

    it('"manual" ya no se ofrece: dejaba el dinero atorado sin pantalla para pedirlo', async () => {
        m.rows = [{ stripe_account_id: 'acct_1', depositos_controlados: false }];
        expect((await patch({ interval: 'manual' })).status).toBe(400);
    });

    it('bajo control, la pantalla muestra lo que eligió el negocio, no el "manual" de Stripe', async () => {
        m.rows = [{ stripe_account_id: 'acct_1', depositos_controlados: true, deposito_preferido: { interval: 'weekly', weekly_anchor: 'monday' } }];
        m.retrieve.mockResolvedValue({ payouts_enabled: true, settings: { payouts: { schedule: { interval: 'manual' } } } });
        const { GET } = await import('../src/pages/api/billing/connect/payout-schedule');
        const res = await GET({ request: new Request('https://cordhq.app/x') } as any) as Response;
        expect(await res.json()).toMatchObject({ controlado: true, schedule: { interval: 'weekly', weekly_anchor: 'monday' } });
    });
});
