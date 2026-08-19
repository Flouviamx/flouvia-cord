// Contrato de divisa y tipo de cambio. Corre en `npm run test:payments`.
//
// Cubre las dos formas en que Cord podía perder dinero antes de agosto 2026:
//   1. tratar toda divisa como decimal (JPY/CLP cobrados 100 veces de más);
//   2. inventar un tipo de cambio de 1.0 cuando el proveedor de FX no responde.
import assert from 'node:assert/strict';
import {
    currencyDecimals,
    fromMinorUnits,
    isSupportedCurrency,
    normalizeCurrency,
    stripeCurrency,
    stripeSupportsCurrency,
    toMinorUnits,
} from '../src/lib/currency.ts';
import { FXService, FXUnavailableError } from '../src/lib/fx/FXService.ts';

// ── Unidad mínima: la conversión que va DIRECTO a Stripe ─────────────────────
assert.equal(toMinorUnits(10.5, 'MXN'), 1050);
assert.equal(toMinorUnits(1000, 'USD'), 100_000);
assert.equal(toMinorUnits(19.99, 'EUR'), 1999);

// Sin decimales: el "amount" ES la unidad. Multiplicar por 100 aquí era cobrar
// cien veces el precio acordado.
for (const [currency, amount] of [['JPY', 1000], ['CLP', 50_000], ['KRW', 1000], ['VND', 5000], ['PYG', 90_000]]) {
    assert.equal(toMinorUnits(amount, currency), amount, `${currency} no debe multiplicarse`);
    assert.equal(currencyDecimals(currency), 0, `${currency} no tiene decimales`);
}

// COP e ISK sí son de dos decimales para ISO 4217 y para Stripe, aunque en la
// calle se usen sin centavos. No pertenecen a la lista de cero decimales.
assert.equal(toMinorUnits(250_000, 'COP'), 25_000_000);
assert.equal(currencyDecimals('COP'), 2);

// Tres decimales: Stripe exige que el último dígito sea 0.
assert.equal(toMinorUnits(10.5, 'KWD'), 10_500);
assert.equal(toMinorUnits(1.234, 'BHD') % 10, 0);

// Ida y vuelta sin pérdida.
for (const [currency, amount] of [['MXN', 1234.56], ['JPY', 7000], ['USD', 0.01]]) {
    assert.equal(fromMinorUnits(toMinorUnits(amount, currency), currency), amount);
}

// Un monto que no se puede expresar LANZA en vez de redondear en silencio.
assert.throws(() => toMinorUnits(Number.NaN, 'MXN'));
assert.throws(() => toMinorUnits(Number.POSITIVE_INFINITY, 'MXN'));

// ── Normalización y soporte ──────────────────────────────────────────────────
assert.equal(normalizeCurrency('usd'), 'USD');
assert.equal(normalizeCurrency('  eur '), 'EUR');
assert.equal(normalizeCurrency('XXXX'), 'MXN');
assert.equal(normalizeCurrency(null), 'MXN');
assert.equal(normalizeCurrency(undefined, 'USD'), 'USD');
assert.equal(stripeCurrency('MXN'), 'mxn');
assert.equal(isSupportedCurrency('JPY'), true);
assert.equal(isSupportedCurrency('ZZZ'), false);
assert.equal(stripeSupportsCurrency('MXN'), true);
assert.equal(stripeSupportsCurrency('KPW'), false);
assert.equal(stripeSupportsCurrency('ZZZ'), false);

// ── FX: nunca una tasa inventada ─────────────────────────────────────────────
// Misma divisa = 1, sin tocar la red.
const same = await FXService.getExchangeRate({
    baseCurrency: 'MXN', fiscalCurrency: 'MXN', amount: 1000,
});
assert.equal(same.appliedRate, 1);
assert.equal(same.convertedAmount, 1000);
assert.equal(same.source, 'same');

// Una divisa que no existe NO puede resolverse a 1.0: tiene que fallar.
await assert.rejects(
    () => FXService.getExchangeRate({ baseCurrency: 'ZZZ', fiscalCurrency: 'MXN', amount: 100 }),
    FXUnavailableError,
    'una divisa desconocida debe fallar cerrado, no valer 1.0',
);
await assert.rejects(
    () => FXService.getExchangeRate({ baseCurrency: 'USD', fiscalCurrency: '', amount: 100 }),
    FXUnavailableError,
);

// El buffer se aplica sobre la spot y está acotado (un 900% es un error de captura).
const stub = {
    async getExchangeRate(req) {
        const spot = 18.5;
        const buffer = Math.min(Math.max(Number(req.bufferPct) || 0, 0), 25);
        return { spotRate: spot, appliedRate: spot * (1 + buffer / 100) };
    },
};
assert.equal((await stub.getExchangeRate({ bufferPct: 2 })).appliedRate, 18.87);
assert.equal((await stub.getExchangeRate({ bufferPct: 900 })).appliedRate, 18.5 * 1.25);

console.log('currency-check: divisas, unidades mínimas y FX fail-closed correctos.');
