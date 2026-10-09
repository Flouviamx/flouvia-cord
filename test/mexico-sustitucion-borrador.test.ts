// El borrador que sustituye a un CFDI: copia los conceptos a su precio BRUTO y
// hereda el descuento de documento tal cual (con su cupón, sin revalidarlo),
// para que el sustituto timbre el mismo importe que el original.
import { beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ tx: vi.fn(), draft: vi.fn(), event: vi.fn() }));
vi.mock('../src/lib/db', () => ({ withOrgTx: m.tx, sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.join('?'), values }) }));
vi.mock('../src/lib/fiscal/invoices', () => ({ createInvoiceDraft: m.draft, releaseInvoicePaymentAttempts: vi.fn() }));
vi.mock('../src/lib/fiscal/timeline', () => ({ logInvoiceEvent: m.event }));
import { createSubstitutionDraft } from '../src/lib/fiscal/sustitucion';

const original = (extra = {}) => ({
    id: 'orig-a', country_code: 'MX', document_type: 'cfdi_40', status: 'issued', lifecycle: 'open', provider_data: {},
    cliente_id: 'cli-a', cotizacion_id: 'cot-a', currency: 'MXN', invoice_number: 'F-000001', notes: null,
    cfdi_uso: 'G03', cfdi_forma_pago: null, has_credit_notes: false, sustituto_vivo: null,
    line_items_snapshot: [
        { description: 'Servicio', quantity: 2, unitPrice: 45, taxRate: 0.16, subtotal: 90, taxAmount: 14.4, total: 104.4, discount: 10, productKey: '81111500', unitKey: 'E48' },
        { description: 'Flete', quantity: 1, unitPrice: 180, taxRate: 0, subtotal: 180, taxAmount: 0, total: 180, discount: 20 },
    ],
    descuento: { tipo: 'porcentaje', valor: 10, codigo: 'BIENVENIDA', cupon_id: '9d2c1b4a-1e2f-4a3b-8c4d-5e6f7a8b9c0d' },
    descuento_total: 30,
    ...extra,
});
beforeEach(() => { vi.clearAllMocks(); m.draft.mockResolvedValue({ ok: true, documentId: 'doc-b' }); });

it('con descuento: precio bruto por concepto y la misma definición heredada', async () => {
    m.tx.mockResolvedValueOnce([[original()]]);
    expect(await createSubstitutionDraft('org-a', 'orig-a')).toMatchObject({ ok: true, documentId: 'doc-b' });
    const input = m.draft.mock.calls[0][1];
    expect(input.items.map((i: any) => [i.cantidad, i.precioUnitario, i.productKey, i.unitKey])).toEqual([
        [2, 50, '81111500', 'E48'], [1, 200, null, null],
    ]);
    expect(input.descuento).toBeUndefined();
    expect(input.descuentoHeredado).toEqual({ def: original().descuento, total: 30, currency: 'MXN' });
    expect(input).toMatchObject({ sustituyeA: 'orig-a', cotizacionId: 'cot-a', documentMode: 'fiscal', cfdiUso: 'G03' });
});

it('sin descuento: el neto del snapshot es el precio', async () => {
    m.tx.mockResolvedValueOnce([[original({ descuento: null, descuento_total: 0 })]]);
    await createSubstitutionDraft('org-a', 'orig-a');
    const input = m.draft.mock.calls[0][1];
    expect(input.items.map((i: any) => i.precioUnitario)).toEqual([45, 180]);
    expect(input.descuentoHeredado).toBeNull();
});
