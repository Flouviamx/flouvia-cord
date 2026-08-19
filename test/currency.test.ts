// Regla 21: "Un monto sin divisa es un número, no dinero."
//
// El caso que originó la regla fue `Math.round(x * 100)` aplicado a todas las
// divisas. Estos tests fijan el contrato para que no vuelva: en JPY cobraría
// cien veces de más y en KWD cien veces de menos.

import { describe, it, expect } from 'vitest';
import {
    DEFAULT_CURRENCY,
    currencyDecimals,
    fromMinorUnits,
    isSupportedCurrency,
    normalizeCurrency,
    stripeCurrency,
    stripeSupportsCurrency,
    toMinorUnits,
} from '../src/lib/currency';

describe('normalizeCurrency', () => {
    it('acepta un ISO 4217 válido sin importar formato', () => {
        expect(normalizeCurrency('usd')).toBe('USD');
        expect(normalizeCurrency('  eur  ')).toBe('EUR');
    });

    it('cae al default ante basura, vacío o nulo', () => {
        for (const v of [null, undefined, '', 'XX', 'PESOS', '$', 123, {}]) {
            expect(normalizeCurrency(v)).toBe(DEFAULT_CURRENCY);
        }
    });

    it('respeta un fallback explícito', () => {
        expect(normalizeCurrency('nope', 'EUR')).toBe('EUR');
        // Un fallback vacío es cómo FXService detecta "divisa no reconocida".
        expect(normalizeCurrency('nope', '')).toBe('');
    });

    it('no confunde un código inventado con uno real', () => {
        expect(isSupportedCurrency('XYZ')).toBe(false);
        expect(isSupportedCurrency('MXN')).toBe(true);
    });
});

describe('currencyDecimals', () => {
    it('da 2 decimales a la mayoría', () => {
        for (const c of ['MXN', 'USD', 'EUR', 'GBP', 'BRL']) {
            expect(currencyDecimals(c)).toBe(2);
        }
    });

    it('da 0 decimales a las divisas donde el centavo ES la unidad', () => {
        for (const c of ['JPY', 'CLP', 'KRW', 'VND', 'XAF']) {
            expect(currencyDecimals(c)).toBe(0);
        }
    });

    it('da 3 decimales a las del Golfo', () => {
        for (const c of ['KWD', 'BHD', 'JOD', 'OMR', 'TND']) {
            expect(currencyDecimals(c)).toBe(3);
        }
    });
});

describe('toMinorUnits', () => {
    it('convierte las divisas de 2 decimales como se espera', () => {
        expect(toMinorUnits(10.5, 'MXN')).toBe(1050);
        expect(toMinorUnits(1000, 'USD')).toBe(100_000);
        expect(toMinorUnits(0.01, 'EUR')).toBe(1);
    });

    it('NO multiplica por 100 las divisas sin decimales', () => {
        // Este es el bug que la regla 21 documenta: ×100 cobraría 100_000 yenes.
        expect(toMinorUnits(1000, 'JPY')).toBe(1000);
        expect(toMinorUnits(50_000, 'CLP')).toBe(50_000);
    });

    it('usa 3 decimales en KWD y fuerza el último dígito a 0 (lo exige Stripe)', () => {
        expect(toMinorUnits(10.5, 'KWD')).toBe(10_500);
        // 10.505 → 10505 escalado → redondeado a la centena → 10510
        expect(toMinorUnits(10.505, 'KWD') % 10).toBe(0);
    });

    it('redondea al centavo más cercano en vez de truncar', () => {
        expect(toMinorUnits(10.555, 'MXN')).toBe(1056);
        expect(toMinorUnits(10.554, 'MXN')).toBe(1055);
    });

    it('lanza en vez de mandar basura al procesador de pagos', () => {
        expect(() => toMinorUnits(Number.NaN, 'MXN')).toThrow();
        expect(() => toMinorUnits(Number.POSITIVE_INFINITY, 'MXN')).toThrow();
        expect(() => toMinorUnits(1e18, 'MXN')).toThrow();
    });

    it('devuelve siempre un entero seguro', () => {
        for (const [amount, cur] of [[10.5, 'MXN'], [1000, 'JPY'], [10.5, 'KWD']] as const) {
            expect(Number.isSafeInteger(toMinorUnits(amount, cur))).toBe(true);
        }
    });
});

describe('fromMinorUnits', () => {
    it('es la inversa exacta de toMinorUnits', () => {
        const casos: [number, string][] = [
            [10.5, 'MXN'], [1000, 'JPY'], [0.01, 'USD'], [10.5, 'KWD'], [999.99, 'EUR'],
        ];
        for (const [amount, cur] of casos) {
            expect(fromMinorUnits(toMinorUnits(amount, cur), cur)).toBeCloseTo(amount, 3);
        }
    });
});

describe('soporte de Stripe', () => {
    it('rechaza las divisas que Stripe no liquida', () => {
        for (const c of ['CUP', 'KPW', 'IRR', 'SYP', 'VES']) {
            expect(stripeSupportsCurrency(c)).toBe(false);
        }
    });

    it('acepta las divisas normales', () => {
        for (const c of ['MXN', 'USD', 'EUR', 'JPY']) {
            expect(stripeSupportsCurrency(c)).toBe(true);
        }
    });

    it('falla cerrado ante un código inválido', () => {
        expect(stripeSupportsCurrency('XXX')).toBe(false);
        expect(stripeSupportsCurrency('')).toBe(false);
    });

    it('manda el código en minúsculas, como pide la API', () => {
        expect(stripeCurrency('MXN')).toBe('mxn');
        expect(stripeCurrency('basura')).toBe('mxn'); // vía default
    });
});
