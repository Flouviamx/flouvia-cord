import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ sql: vi.fn(), tx: vi.fn(), track: vi.fn(), jobs: [] as Promise<unknown>[] }));
vi.mock('../src/lib/db', () => ({ sql: m.sql, withOrgTx: m.tx }));
vi.mock('../src/lib/posthog-server', () => ({ trackServer: m.track }));
vi.mock('../src/lib/after', () => ({ after: (p: Promise<unknown>) => { m.jobs.push(p); } }));
import { hasFiscalStamp, logInvoiceEvent } from '../src/lib/fiscal/timeline';
const mx = { country_code: 'MX', status: 'issued', provider: 'facturapi',
    fiscal_id: '11111111-2222-3333-4444-555555555555', provider_data: { livemode: true } };
const es = { country_code: 'ES', status: 'issued', provider: 'verifactu',
    provider_data: { regulatory_status: 'verifactu', verifactu: { huella: 'A'.repeat(64), envioEstado: 'pendiente' } } };
beforeEach(() => { vi.resetAllMocks(); m.jobs.length = 0; });
describe('evidencia fiscal para analíticas', () => {
    it.each([mx, es])('cuenta el registro real del proveedor ($country_code)', document => {
        expect(hasFiscalStamp(document)).toBe(true);
    });
    it.each([
        { ...mx, fiscal_id: null }, { ...mx, fiscal_id: 'simulado' },
        { ...mx, provider_data: { simulado: true } }, { ...mx, provider_data: { livemode: false } },
        { ...mx, status: 'error' }, { ...mx, provider_data: { regulatory_status: 'commercial_only' } },
        { ...es, provider: 'cord', provider_data: { regulatory_status: 'commercial_only' } },
        { ...es, provider_data: { regulatory_status: 'verifactu' } },
        { ...es, provider_data: { regulatory_status: 'verifactu', verifactu: { huella: '' } } },
    ])('no infiere timbrado por país (%#)', document => {
        expect(hasFiscalStamp(document)).toBe(false);
    });
    it('emite el valor derivado de la evidencia, sin esperar a la red', async () => {
        m.tx.mockResolvedValueOnce([]).mockResolvedValueOnce([[{
            ...es, provider: 'cord', provider_data: { regulatory_status: 'commercial_only' }, total: 100, currency: 'EUR',
        }]]);
        let finish!: (value: boolean) => void;
        m.track.mockReturnValue(new Promise<boolean>(resolve => { finish = resolve; }));
        await logInvoiceEvent('org', 'doc', 'issued', 'Emitida');
        expect(m.track).toHaveBeenCalledWith('invoice_finalized', 'org', expect.objectContaining({ has_fiscal_stamp: false }), false, false);
        finish(true);
        await Promise.all(m.jobs);
    });
    it('conserva el timeline y tolera una caída de PostHog', async () => {
        m.tx.mockResolvedValueOnce([]).mockResolvedValueOnce([[mx]]);
        m.track.mockRejectedValue(new Error('offline'));
        await expect(logInvoiceEvent('org', 'doc', 'issued', 'Emitida')).resolves.toBeUndefined();
        await expect(Promise.all(m.jobs)).resolves.toBeDefined();
        expect(m.tx).toHaveBeenCalledTimes(2);
    });
});
