import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ tx: vi.fn(), dispatch: vi.fn() }));

vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.join('?'), values }),
    withOrgTx: m.tx, reqIp: () => '10.0.0.1', logAudit: vi.fn(),
}));
vi.mock('../src/lib/org-entitlements', () => ({ requireResourceCapacity: vi.fn(), resourceLimitError: vi.fn() }));
vi.mock('../src/lib/webhooks', () => ({ dispatchEvent: m.dispatch }));
vi.mock('../src/lib/after', () => ({ after: vi.fn() }));

const { patchClientContact } = await import('../src/lib/actions/clients');

const ID = '11111111-1111-4111-8111-111111111111';
const ctx = { orgId: 'org-a', origin: 'https://cordhq.app', actor: 'api:k1', source: 'api' as const };
const ACTUAL = {
    id: ID, empresa: 'ACME', contacto: 'Ana', email: 'viejo@acme.test', telefono: '555', rfc: 'AAA010101AAA',
    terminos_default: 'net30', limite_credito: 50000, nivel: 'oro', descuento_pct: 10,
    regimen_fiscal: '601', uso_cfdi: 'G03', cp_fiscal: '64000', country_code: 'MX',
    direccion_line1: 'Calle 1', direccion_line2: null, ciudad: 'Monterrey', region: 'NL',
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('patchClientContact', () => {
    it('solo cambia lo enviado y nunca crédito, nivel ni descuento', async () => {
        m.tx.mockResolvedValueOnce([[ACTUAL]]).mockResolvedValueOnce([[{ ...ACTUAL, email: 'nuevo@acme.test' }]]);
        const out = await patchClientContact(ctx, ID, { email: 'nuevo@acme.test', descuento_pct: 95, limite: 1, nivel: 'platino' });
        expect(out.status).toBe(200);
        const update = m.tx.mock.calls[1][1];
        expect(update.text).toContain('update clientes set');
        expect(update.values).toEqual(expect.arrayContaining(['ACME', 'Ana', 'nuevo@acme.test', 'net30', 50000, 'oro', 10, '601', '64000', 'Monterrey']));
        expect(update.values).not.toContain(95);
        expect(update.values.slice(-2)).toEqual([ID, 'org-a']);
    });

    it('un cliente de otra org o un id inválido responde 404 sin actualizar', async () => {
        m.tx.mockResolvedValueOnce([[]]);
        expect((await patchClientContact(ctx, ID, { email: 'x@y.test' })).status).toBe(404);
        expect((await patchClientContact(ctx, 'abc', { email: 'x@y.test' })).status).toBe(404);
        expect(m.tx).toHaveBeenCalledTimes(1);
        expect(m.tx.mock.calls[0][1].values).toEqual([ID, 'org-a']);
    });
});
