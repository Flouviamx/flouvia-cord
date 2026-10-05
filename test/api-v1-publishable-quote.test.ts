import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/apikey', () => ({ withApiAuth: (_: string, h: unknown) => h }));
vi.mock('../src/lib/db', () => ({ getActiveOrgId: async () => 'org-a', reqIp: () => '10.0.0.1' }));
vi.mock('../src/lib/queries', () => ({ getCotizacionesPage: vi.fn() }));
vi.mock('../src/lib/cotizaciones', () => ({ createCotizacion: vi.fn(), QuoteError: class extends Error {} }));
vi.mock('../src/lib/public-links', () => ({ publicDocumentUrl: async () => 'x' }));

const { publishableQuoteInput } = await import('../src/pages/api/v1/cotizaciones');

describe('cotización creada con una pk_', () => {
    it('no puede enviar correos', async () => {
        const res = publishableQuoteInput({ send: true, items: [] });
        expect(res).toBeInstanceOf(Response);
        expect((res as Response).status).toBe(403);
        expect((await (res as Response).json()).code).toBe('insufficient_scope');
    });

    it('descarta costo, precio negociado, cliente_id y divisa fiscal', () => {
        const r = publishableQuoteInput({
            cliente_id: '11111111-1111-1111-1111-111111111111',
            fiscal_currency: 'USD',
            anticipo_pct: 90,
            items: [{ descripcion: 'Tornillo', cantidad: 2, precio_unitario: 10, precio_negociado: 1, costo_unitario: 9, tax_rate: 0.16 }],
        });
        expect(r).toEqual({
            cliente: undefined, terminos: undefined, vigencia_dias: undefined, notas: undefined,
            base_currency: undefined, iva_incluido: undefined, send: false,
            items: [{ producto_id: undefined, descripcion: 'Tornillo', cantidad: 2, precio_unitario: 10, tax_rate: 0.16 }],
        });
    });
});
