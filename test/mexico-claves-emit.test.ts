// Cotización → CFDI: la clave SAT propia de la línea de la cotización gana
// sobre la del producto al congelar el snapshot del documento.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ tx: vi.fn(), finalize: vi.fn() }));
vi.mock('../src/lib/db', () => ({ withOrgTx: m.tx, withSystemTx: m.tx, sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }) }));
vi.mock('../src/lib/org-entitlements', () => ({ getEffectivePlan: async () => 'starter' }));
vi.mock('../src/lib/fiscal/invoices', () => ({ finalizeInvoice: m.finalize }));

import { emitFiscalDocument } from '../src/lib/fiscal/emit';

beforeEach(() => { m.tx.mockReset(); m.finalize.mockReset(); });

describe('emisión desde la cotización', () => {
    it('lee la clave de la línea y la del producto, y gana la de la línea', async () => {
        m.tx
            .mockResolvedValueOnce([
                [{ country_code: 'MX', iva_pct: 16, base_currency: 'MXN', org_moneda: 'MXN', fiscal_metadata: {}, cliente_id: 'cli-1', cliente_empresa: 'Cliente', retenciones_snapshot: [] }],
                [
                    { descripcion: 'Flete', cantidad: 1, precio_unitario: 100, precio_negociado: null, aprobado: true, tax_rate: 0.16,
                      linea_clave_sat: '78101800', linea_clave_unidad_sat: 'E48', clave_sat: '43231500', clave_unidad_sat: 'H87', producto_unidad: 'pieza' },
                    { descripcion: 'Software', cantidad: 1, precio_unitario: 50, precio_negociado: null, aprobado: true, tax_rate: 0.16,
                      linea_clave_sat: null, linea_clave_unidad_sat: null, clave_sat: '43231500', clave_unidad_sat: null, producto_unidad: 'hora' },
                ],
            ])
            .mockResolvedValueOnce([[], [{ id: 'doc-1' }]]);
        m.finalize.mockResolvedValue({ emitted: false, status: 'error', error: 'x' });
        await emitFiscalDocument('org-a', 'quote-1');
        expect(m.tx.mock.calls[0][2].text).toContain('ci.clave_sat as linea_clave_sat');
        const reserve = m.tx.mock.calls[1][2];
        const snapshot = JSON.parse(reserve.values.find((v: unknown) => typeof v === 'string' && v.startsWith('[{"description"')));
        expect(snapshot.map((l: any) => [l.productKey, l.unitKey])).toEqual([['78101800', 'E48'], ['43231500', 'HUR']]);
        expect(m.finalize).toHaveBeenCalledWith('org-a', 'doc-1');
    });
});
