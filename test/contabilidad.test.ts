import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ sql: vi.fn(() => ''), withOrgTx: vi.fn() }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../src/lib/crypto-secret', () => ({ decryptSecret: (v: string) => v, encryptRequiredSecret: (v: string) => v }));

const { lineasDe, TIPOS } = await import('../src/lib/integraciones/contabilidad/service');

describe('las líneas que entran a la contabilidad', () => {
    it('contabiliza el precio negociado con su descuento, no el de lista', () => {
        expect(lineasDe([
            { descripcion: 'Camisa', cantidad: 10, precio_unitario: 200, precio_negociado: 150, descuento_pct: 10 },
        ])).toEqual([
            { descripcion: 'Camisa', cantidad: 10, precio: 135, importe: 1350 },
        ]);
    });

    it('un precio negociado de cero es un precio, no un campo vacío', () => {
        const [l] = lineasDe([{ descripcion: 'Muestra', cantidad: 2, precio_unitario: 500, precio_negociado: 0 }]);
        expect(l.precio).toBe(0);
        expect(l.importe).toBe(0);
    });

    it('el importe cuadra con cantidad por precio, redondeado a dos decimales', () => {
        const [l] = lineasDe([{ descripcion: 'Servicio', cantidad: 3, precio_unitario: 33.333 }]);
        expect(l.precio).toBe(33.33);
        expect(l.importe).toBe(99.99);
    });

    it('un descuento mayor a cien no produce un importe negativo', () => {
        // Un importe negativo en los libros de alguien es una nota de crédito
        // que nadie pidió.
        const [l] = lineasDe([{ descripcion: 'Regalo', cantidad: 1, precio_unitario: 300, descuento_pct: 130 }]);
        expect(l.precio).toBe(0);
        expect(l.importe).toBe(0);
    });

    it('datos ilegibles entran en cero en vez de NaN', () => {
        const [l] = lineasDe([{ descripcion: undefined, cantidad: 'dos', precio_unitario: 'mil' }]);
        expect(l).toEqual({ descripcion: 'Concepto', cantidad: 0, precio: 0, importe: 0 });
    });
});

describe('los tipos de vínculo', () => {
    it('cada proveedor tiene los suyos, y no se mezclan', () => {
        // Compartir un tipo entre proveedores haría que el vínculo de QuickBooks
        // se leyera como el de Xero y se contabilizara dos veces.
        expect(TIPOS.quickbooks).toEqual({ cliente: 'qbo_customer', factura: 'qbo_invoice' });
        expect(TIPOS.xero).toEqual({ cliente: 'xero_contact', factura: 'xero_invoice' });
        const todos = Object.values(TIPOS).flatMap((t) => [t.cliente, t.factura]);
        expect(new Set(todos).size).toBe(todos.length);
    });
});
