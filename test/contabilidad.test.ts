import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ sql: vi.fn(() => ''), withOrgTx: vi.fn() }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../src/lib/crypto-secret', () => ({ decryptSecret: (v: string) => v, encryptRequiredSecret: (v: string) => v }));

const { lineasDe, lineasDeSnapshot, TIPOS, avisoDe } = await import('../src/lib/integraciones/contabilidad/service');
const { buscarTasa, cuadra, tasasDe, subtotalDe, impuestoDe } = await import('../src/lib/integraciones/contabilidad/impuestos');

describe('las líneas salen de la factura, no de la cotización', () => {
    it('lee el snapshot de la factura, que es el que existe siempre', () => {
        // Forma real de `line_items_snapshot`: los importes son SIN impuesto.
        expect(lineasDeSnapshot([
            { description: 'Pruebas 1', quantity: 1, unitPrice: 7431.63, subtotal: 7431.63, taxAmount: 1189.06, total: 8620.69, taxRate: 0.16 },
        ])).toEqual([
            { descripcion: 'Pruebas 1', cantidad: 1, precio: 7431.63, importe: 7431.63, tasa: 0.16, impuesto: 1189.06 },
        ]);
    });

    it('una factura sin cotización tiene líneas igual', () => {
        // El caso que rompió en producción: Cord Invoicing emite facturas
        // directas con cotizacion_id en nulo. Leer la cotización daba cero
        // líneas y se descartaban en silencio como "sin líneas".
        const lineas = lineasDeSnapshot([{ description: 'Prueba', quantity: 2, unitPrice: 862.07 }]);
        expect(lineas).toHaveLength(1);
        expect(lineas[0]).toEqual({ descripcion: 'Prueba', cantidad: 2, precio: 862.07, importe: 1724.14, tasa: 0, impuesto: 0 });
    });

    it('un snapshot vacío o ausente no inventa líneas', () => {
        expect(lineasDeSnapshot([])).toEqual([]);
        expect(lineasDeSnapshot(null)).toEqual([]);
        expect(lineasDeSnapshot('[]')).toEqual([]);
    });

    it('datos ilegibles del snapshot entran en cero, nunca en NaN', () => {
        const [l] = lineasDeSnapshot([{ description: null, quantity: 'dos', unitPrice: 'mil' }]);
        expect(l).toEqual({ descripcion: 'Concepto', cantidad: 0, precio: 0, importe: 0, tasa: 0, impuesto: 0 });
    });

    it('el impuesto de la línea es el que quedó en la factura, no uno recalculado', () => {
        const [l] = lineasDeSnapshot([{ description: 'Varilla', quantity: 3, unitPrice: 33.33, taxRate: 0.16, taxAmount: 16 }]);
        expect(l.impuesto).toBe(16);
    });

    it('una línea exenta viaja con tasa cero, no sin tasa', () => {
        const [l] = lineasDeSnapshot([{ description: 'Libro', quantity: 1, unitPrice: 100, taxRate: 0, taxAmount: 0 }]);
        expect(l.tasa).toBe(0);
        expect(l.impuesto).toBe(0);
    });
});

describe('las líneas que entran a la contabilidad', () => {
    it('contabiliza el precio negociado con su descuento, no el de lista', () => {
        expect(lineasDe([
            { descripcion: 'Camisa', cantidad: 10, precio_unitario: 200, precio_negociado: 150, descuento_pct: 10 },
        ])).toEqual([
            { descripcion: 'Camisa', cantidad: 10, precio: 135, importe: 1350, tasa: 0, impuesto: 0 },
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
        expect(l).toEqual({ descripcion: 'Concepto', cantidad: 0, precio: 0, importe: 0, tasa: 0, impuesto: 0 });
    });

    it('una línea sin tasa propia lleva la del documento; una exenta conserva su cero', () => {
        const [sin, exenta] = lineasDe([
            { descripcion: 'Cemento', cantidad: 2, precio_unitario: 100, tax_rate: null },
            { descripcion: 'Flete', cantidad: 1, precio_unitario: 50, tax_rate: 0 },
        ], 0.16);
        expect(sin).toMatchObject({ tasa: 0.16, impuesto: 32 });
        expect(exenta).toMatchObject({ tasa: 0, impuesto: 0 });
    });
});

describe('el impuesto que entra a la contabilidad', () => {
    const opciones = [
        { id: 'NONE', pct: 0 },
        { id: 'OUTPUT', pct: 16 },
        { id: 'OUTPUT2', pct: 8 },
    ];

    it('cada tasa de Cord busca la tasa idéntica de la contabilidad', () => {
        expect(buscarTasa(opciones, 0.16)).toBe('OUTPUT');
        expect(buscarTasa(opciones, 0.08)).toBe('OUTPUT2');
        expect(buscarTasa(opciones, 0)).toBe('NONE');
    });

    it('sin una tasa idéntica no se aproxima', () => {
        // Asentar un 15% donde Cord cobró 16% deja los libros mal para siempre.
        expect(buscarTasa(opciones, 0.15)).toBeNull();
        expect(buscarTasa(opciones, 0.1599)).toBeNull();
    });

    it('las tasas repetidas se buscan una sola vez', () => {
        const l = (tasa: number) => ({ descripcion: 'x', cantidad: 1, precio: 1, importe: 1, tasa, impuesto: tasa });
        expect(tasasDe([l(0.16), l(0.16), l(0), l(0.08)])).toEqual([0.16, 0, 0.08]);
    });

    it('el total cuadra con un centavo de holgura por línea, y no más', () => {
        expect(cuadra(196469.2, 196469.2, 4)).toBe(true);
        expect(cuadra(196469.24, 196469.2, 4)).toBe(true);
        expect(cuadra(169370, 196469.2, 4)).toBe(false);
        expect(cuadra(undefined, 100, 1)).toBe(false);
    });

    it('A-001048 llega con su IVA: subtotal más impuesto es el total de Cord', () => {
        const lineas = [
            { descripcion: 'Cemento gris 50kg', cantidad: 120, precio: 182, importe: 21840, tasa: 0.16, impuesto: 3494.4 },
            { descripcion: 'Varilla corrugada 3/8"', cantidad: 340, precio: 168.5, importe: 57290, tasa: 0.16, impuesto: 9166.4 },
            { descripcion: 'Block hueco 15x20x40', cantidad: 2400, precio: 14.2, importe: 34080, tasa: 0.16, impuesto: 5452.8 },
            { descripcion: 'Arena de río m3', cantidad: 180, precio: 312, importe: 56160, tasa: 0.16, impuesto: 8985.6 },
        ];
        expect(subtotalDe(lineas)).toBe(169370);
        expect(impuestoDe(lineas)).toBe(27099.2);
        expect(subtotalDe(lineas) + impuestoDe(lineas)).toBe(196469.2);
    });

    it('el aviso de la tarjeta sale del último error, y solo si es de impuesto', () => {
        expect(avisoDe('impuesto:0.16')).toEqual({ motivo: 'impuesto', tasa: 0.16 });
        expect(avisoDe('impuesto')).toEqual({ motivo: 'impuesto', tasa: null });
        expect(avisoDe('retenciones')).toEqual({ motivo: 'retenciones', tasa: null });
        expect(avisoDe('auth')).toBeNull();
        expect(avisoDe(null)).toBeNull();
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
