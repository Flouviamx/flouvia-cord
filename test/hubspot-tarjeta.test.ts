import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ sql: vi.fn(), withOrgTx: vi.fn() }));
vi.mock('../src/lib/public-links', () => ({ publicDocumentUrl: vi.fn() }));
const { importe, tonoEstado, fechaCorta } = await import('../src/lib/integraciones/hubspot/tarjeta');

describe('tarjeta de Cord en HubSpot', () => {
    it('el importe siempre lleva su divisa', () => {
        expect(importe(184300, 'MXN', 'es')).toContain('MXN');
        expect(importe(1200.5, 'USD', 'en')).toContain('USD');
        expect(importe(1000, 'JPY', 'en')).not.toContain('.00');
    });

    it('el tono separa cerrado, perdido y en juego', () => {
        expect(tonoEstado('paid')).toBe('success');
        expect(tonoEstado('approved')).toBe('success');
        expect(tonoEstado('rejected')).toBe('danger');
        expect(tonoEstado('viewed')).toBe('warning');
        expect(tonoEstado('draft')).toBe('default');
    });

    it('una fecha inválida no rompe la tarjeta', () => {
        expect(fechaCorta('no-es-fecha', 'es')).toBe('');
        expect(fechaCorta('2026-09-28T10:00:00Z', 'en')).toContain('2026');
    });
});
