import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({ sandbox: true, consumed: [] as unknown[][], delivered: [] as [string, string, Record<string, unknown>][] }));

vi.mock('../src/lib/db', () => ({
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }),
    withOrgTx: async (_org: string, ...qs: { text: string }[]) => qs.map((q) => {
        if (q.text.includes('sandbox_of is not null')) return [{ sandbox: m.sandbox }];
        if (q.text.includes('update sandbox_simulaciones')) return m.consumed.shift() ?? [];
        return [];
    }),
}));
vi.mock('../src/lib/queries', () => ({ markViewed: vi.fn() }));
vi.mock('../src/lib/quote-expiry', () => ({ registrarVencimiento: vi.fn() }));
vi.mock('../src/lib/webhooks', () => ({
    dispatchQuoteEvent: vi.fn(),
    dispatchInvoiceEvent: vi.fn(),
    deliverTestEvent: vi.fn(async (org: string, type: string, data: Record<string, unknown>) => { m.delivered.push([org, type, data]); }),
}));

const sim = await import('../src/lib/sandbox-sim');
const { testModeOnly } = await import('../src/lib/test-helpers-api');
const { WEBHOOK_EVENT_TYPES, WEBHOOK_EVENT_OBJECTS } = await import('../packages/elements/src/contract/webhook-events');

describe('guarda de test helpers', () => {
    const auth = (mode: 'live' | 'test', type: 'secret' | 'publishable') => ({ orgId: 'o', scope: 'write', mode, type, keyId: 'k', oauthClient: null }) as any;
    it('solo una sk_test_', async () => {
        expect(testModeOnly(auth('test', 'secret'))).toBeNull();
        expect((await testModeOnly(auth('live', 'secret'))!.json()).code).toBe('test_mode_only');
        expect((await testModeOnly(auth('test', 'publishable'))!.json()).code).toBe('insufficient_scope');
    });
});

describe('simulación fiscal', () => {
    beforeEach(() => { m.sandbox = true; m.consumed = []; m.delivered = []; });

    it('sin resultado pendiente la emisión simulada tiene éxito', async () => {
        expect(await sim.consumeFiscalOutcome('o')).toBe('exito');
        const r = sim.simulatedFiscalResponse('exito', 'abcdef12-0000', { regulatory: true, country: 'MX' });
        expect(r).toMatchObject({ success: true, provider: 'cord-sandbox', fiscalId: 'SIM-ABCDEF12' });
    });

    it.each(['pac_caido', 'receptor_invalido', 'certificado_vencido', 'timbre_duplicado'] as const)('%s produce un fallo con mensaje accionable', (resultado) => {
        const r = sim.simulatedFiscalResponse(resultado, 'doc', { regulatory: true, country: 'MX' });
        expect(r.success).toBe(false);
        expect(r.error).toBeTruthy();
        expect(r.error).not.toMatch(/facturapi|stripe|vercel|_KEY/i);
        expect(r.rawProviderData).toMatchObject({ simulado: true, simulacion: resultado });
    });

    it.each(['pac_caido', 'receptor_invalido', 'certificado_vencido', 'timbre_duplicado'] as const)('%s fuera de México no habla del SAT', (resultado) => {
        for (const country of ['ES', 'FR', 'US', 'CO']) {
            const r = sim.simulatedFiscalResponse(resultado, 'doc', { regulatory: country === 'ES', country });
            expect(r.success).toBe(false);
            expect(r.error, `${resultado} ${country}`).not.toMatch(/\bSAT\b|RFC|CFDI|timbr|sello digital/i);
        }
    });

    it('consume el resultado forzado una sola vez', async () => {
        m.consumed = [[{ resultado: 'pac_caido' }]];
        expect(await sim.consumeFiscalOutcome('o')).toBe('pac_caido');
        expect(await sim.consumeFiscalOutcome('o')).toBe('exito');
    });

    it('fuera de la sandbox no se puede forzar nada', async () => {
        m.sandbox = false;
        await expect(sim.setNextFiscalOutcome('o', 'pac_caido')).rejects.toBeInstanceOf(sim.NotSandboxError);
        await expect(sim.triggerTestEvent('o', 'quote.sent')).rejects.toBeInstanceOf(sim.NotSandboxError);
        await expect(sim.expireQuoteForTest('o', 'q')).rejects.toBeInstanceOf(sim.NotSandboxError);
    });
});

describe('eventos de prueba', () => {
    beforeEach(() => { m.sandbox = true; m.delivered = []; });

    it('los 41 eventos tienen datos de ejemplo con la forma de su objeto', async () => {
        for (const type of WEBHOOK_EVENT_TYPES) {
            expect(await sim.triggerTestEvent('o', type), type).toBe('ejemplo');
        }
        expect(m.delivered).toHaveLength(WEBHOOK_EVENT_TYPES.length);
        for (const [, type, data] of m.delivered) {
            const object = WEBHOOK_EVENT_OBJECTS[type as keyof typeof WEBHOOK_EVENT_OBJECTS];
            if (object !== 'quote' && object !== 'account') expect(data.object, type).toBe(object);
            if ('total' in data || 'monto' in data) expect(data.moneda, type).toBe('MXN');
        }
        const partial = m.delivered.find(([, t]) => t === 'payment.partial')![2];
        expect(partial).toMatchObject({ tipo: 'anticipo', saldo_pendiente: 5800 });
    });
});
