import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ sql: vi.fn(), withOrgTx: vi.fn() }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('../src/lib/fiscal/invoices', () => ({ createInvoiceDraft: vi.fn() }));
vi.mock('../src/lib/integraciones/shopify/service', () => ({ accessToken: vi.fn(), registrarWebhooks: vi.fn(), upsertCliente: vi.fn() }));
const { mapearPedido, esPedidoDeCord } = await import('../src/lib/integraciones/shopify/facturas');

const money = (amount: string) => ({ presentment_money: { amount } });

describe('factura de un pedido de la tienda', () => {
    it('toma la divisa que pagó el cliente y descuenta lo asignado a cada línea', () => {
        const p = mapearPedido({
            currency: 'USD', presentment_currency: 'mxn', taxes_included: false,
            line_items: [{
                title: 'Varilla', variant_title: '3/8', quantity: 10, variant_id: 77,
                price_set: money('42.00'), discount_allocations: [{ amount_set: money('20.00') }],
                taxable: true, tax_lines: [{ rate: 0.16 }],
            }],
            shipping_lines: [{ title: 'Envío express', price_set: money('150.00'), tax_lines: [{ rate: 0.16 }] }],
        });
        expect(p.moneda).toBe('MXN');
        expect(p.impuestoIncluido).toBe(false);
        expect(p.lineas[0]).toMatchObject({ descripcion: 'Varilla · 3/8', cantidad: 10, precioUnitario: 40, taxRate: 0.16, varianteId: '77' });
        expect(p.lineas[1]).toMatchObject({ descripcion: 'Envío express', cantidad: 1, precioUnitario: 150, taxRate: 0.16 });
    });

    it('una línea exenta viaja en 0 y una sin impuesto informado cae a la tasa de la cuenta', () => {
        const p = mapearPedido({
            currency: 'MXN', line_items: [
                { title: 'Libro', quantity: 1, price: '100', taxable: false },
                { title: 'Default Title', quantity: 2, price: '50' },
            ],
        });
        expect(p.lineas[0].taxRate).toBe(0);
        expect(p.lineas[1]).toMatchObject({ descripcion: 'Producto', taxRate: null, precioUnitario: 50 });
    });

    it('omite líneas sin cantidad y envíos gratis', () => {
        const p = mapearPedido({ currency: 'USD', line_items: [{ title: 'X', quantity: 0, price: '5' }], shipping_lines: [{ title: 'Gratis', price: '0' }] });
        expect(p.lineas).toHaveLength(0);
    });

    it('reconoce los pedidos que creó Cord por su etiqueta', () => {
        expect(esPedidoDeCord({ tags: 'mayoreo, cord' })).toBe(true);
        expect(esPedidoDeCord({ tags: 'cordero' })).toBe(false);
        expect(esPedidoDeCord({})).toBe(false);
    });
});
