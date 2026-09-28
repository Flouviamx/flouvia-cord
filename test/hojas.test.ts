import { describe, expect, it } from 'vitest';
import {
    CABECERAS, columnaA1, columnasMonto, fechaEnZona, filaCotizacion, filaFactura, monto, rangoFila,
} from '../src/lib/integraciones/hojas/columnas';

const ORIGEN = 'https://cordhq.app';

describe('la fila es una fila de hoja, no un renglón de texto', () => {
    it('los importes salen como número para que la hoja pueda sumarlos', () => {
        const fila = filaCotizacion(
            { folio: 'COT-7', cliente: 'ACME', status: 'approved', base_currency: 'usd', subtotal: 1000, descuento: 100, iva: 144, total: 1044, cobrado: 500 },
            'America/Mexico_City', ORIGEN,
        );
        expect(fila.slice(6, 11)).toEqual([1000, 100, 144, 1044, 500]);
        for (const celda of fila.slice(6, 11)) expect(typeof celda).toBe('number');
        // La divisa viaja en su propia columna: pegarla al número escondería que
        // la columna mezcla monedas y un SUM daría un total que no existe.
        expect(fila[5]).toBe('USD');
    });

    it('un importe ilegible entra como cero, nunca como texto', () => {
        const fila = filaCotizacion({ folio: 'COT-8', total: 'mil pesos', subtotal: null, iva: undefined }, 'UTC', ORIGEN);
        expect(fila[6]).toBe(0);
        expect(fila[8]).toBe(0);
        expect(fila[9]).toBe(0);
    });

    it('redondea a dos decimales en vez de arrastrar el error del flotante', () => {
        expect(monto(0.1 + 0.2)).toBe(0.3);
        expect(monto('1234.567')).toBe(1234.57);
    });
});

describe('fechas en la zona de la organización', () => {
    it('usa la zona guardada, no la del servidor', () => {
        // Las 03:00 UTC del 2 de enero son todavía el 1 de enero en México.
        const instante = '2026-01-02T03:00:00Z';
        expect(fechaEnZona(instante, 'America/Mexico_City')).toBe('2026-01-01');
        expect(fechaEnZona(instante, 'Asia/Tokyo')).toBe('2026-01-02');
    });

    it('una zona inválida no deja la fila sin fecha', () => {
        expect(fechaEnZona('2026-01-02T03:00:00Z', 'Marte/Olympus')).toBe('2026-01-02');
    });

    it('sin fecha, celda vacía', () => {
        expect(fechaEnZona(null, 'UTC')).toBe('');
        expect(fechaEnZona('no es fecha', 'UTC')).toBe('');
    });
});

describe('el link del documento', () => {
    it('apunta al link público cuando hay token, y si no queda vacío', () => {
        expect(filaCotizacion({ folio: 'A', public_token: 'abc123' }, 'UTC', ORIGEN)[11]).toBe(`${ORIGEN}/q/abc123`);
        expect(filaFactura({ invoice_number: 'F-1', public_token: 'xyz' }, 'UTC', ORIGEN)[10]).toBe(`${ORIGEN}/i/xyz`);
        expect(filaCotizacion({ folio: 'A' }, 'UTC', ORIGEN)[11]).toBe('');
    });
});

describe('el rango se calcula con la cabecera real', () => {
    it('cada fila cubre exactamente las columnas que existen', () => {
        expect(filaCotizacion({}, 'UTC', ORIGEN)).toHaveLength(CABECERAS.cotizaciones.length);
        expect(filaFactura({}, 'UTC', ORIGEN)).toHaveLength(CABECERAS.facturas.length);
    });

    it('traduce el índice de columna a letra, también pasando la Z', () => {
        expect(columnaA1(0)).toBe('A');
        expect(columnaA1(11)).toBe('L');
        expect(columnaA1(25)).toBe('Z');
        expect(columnaA1(26)).toBe('AA');
    });

    it('el rango nombra la pestaña y la fila pedida', () => {
        // 12 columnas en cotizaciones: la última es L. Si alguien agrega una
        // columna, este rango crece solo en vez de cortar el dato.
        expect(rangoFila('Cotizaciones', 'cotizaciones', 7)).toBe('Cotizaciones!A7:L7');
        expect(rangoFila('Facturas', 'facturas', 2)).toBe('Facturas!A2:K2');
    });
});

describe('el texto no desborda la celda', () => {
    it('un nombre larguísimo se corta en vez de romper la escritura', () => {
        const fila = filaCotizacion({ folio: 'A', cliente: 'x'.repeat(500) }, 'UTC', ORIGEN);
        expect(String(fila[1])).toHaveLength(200);
    });
});

describe('las columnas de dinero se derivan de la cabecera', () => {
    it('señala exactamente las columnas con importes, en las dos pestañas', () => {
        const cot = columnasMonto('cotizaciones');
        expect(cot.map((i) => CABECERAS.cotizaciones[i]))
            .toEqual(['subtotal', 'descuento', 'impuestos', 'total', 'cobrado']);
        const fac = columnasMonto('facturas');
        expect(fac.map((i) => CABECERAS.facturas[i])).toEqual(['total', 'pagado', 'saldo']);
    });

    it('lo que apunta es dinero y nada más', () => {
        // Si alguien mueve una columna, el formato la sigue: se deriva del
        // nombre, no de un número escrito a mano.
        for (const i of columnasMonto('cotizaciones')) {
            expect(typeof filaCotizacion({ folio: 'A', subtotal: 1, descuento: 2, iva: 3, total: 4, cobrado: 5 }, 'UTC', ORIGEN)[i])
                .toBe('number');
        }
    });
});
