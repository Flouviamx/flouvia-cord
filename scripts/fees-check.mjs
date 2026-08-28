import assert from 'node:assert/strict';
import {
    assertFeeMargin,
    assertSubscriptionFeePrecision,
    computeFee,
    computeSubscriptionFee,
    describeFee,
    describeSubscriptionFee,
    FEE_TERMS_VERSION,
    isFeeScheduleActive,
    FEE_SCHEDULES,
    feesApplyTo,
    scheduleFor,
    subscriptionFeePercentFor,
    SUBSCRIPTION_APPLICATION_FEE_PERCENT,
} from '../src/lib/fees.ts';

assertFeeMargin();
assertSubscriptionFeePrecision();
assert.deepEqual(computeFee({ amountCents: 1, metodo: 'card', moneda: 'MXN' }), {
    blendedTotalCents: 348, applicationFeeCents: 0, feeBaseCents: 0, feeIvaCents: 0, stripeCostEstimateCents: 348,
});
const card = computeFee({ amountCents: 100_000, metodo: 'card', moneda: 'MXN' });
assert.equal(card.applicationFeeCents, 464);
assert.equal(card.feeBaseCents, 400);
assert.equal(card.feeIvaCents, 64);
const spei = computeFee({ amountCents: 100_000, metodo: 'spei', moneda: 'MXN' });
assert.equal(spei.applicationFeeCents, 1_160);
const speiAtCap = computeFee({ amountCents: 5_000_000, metodo: 'spei', moneda: 'MXN' });
assert.equal(speiAtCap.applicationFeeCents, 58_000);
assert.equal(speiAtCap.blendedTotalCents, 58_812);
const speiAboveCap = computeFee({ amountCents: 50_000_000, metodo: 'spei', moneda: 'MXN' });
assert.equal(speiAboveCap.applicationFeeCents, 58_000);
assert.equal(speiAboveCap.blendedTotalCents, 58_812);
assert.equal(computeFee({ amountCents: 100_000, metodo: 'card', moneda: 'USD' }).applicationFeeCents, 0);
assert.equal(computeFee({ amountCents: 100_000, metodo: 'card', moneda: 'MXN', enabled: false }).applicationFeeCents, 0);
assert.deepEqual(computeSubscriptionFee(100_000, 'MXN'), { applicationFeeCents: 464, feeBaseCents: 400, feeIvaCents: 64 });
assert.equal(computeSubscriptionFee(100_000, 'MXN', false).applicationFeeCents, 0);
// Tarifa mexicana pactada con Stripe MX, no un IVA genérico: fuera de MXN no se cobra.
assert.equal(computeSubscriptionFee(100_000, 'USD').applicationFeeCents, 0);
assert.match(describeFee('card'), /IVA$/);
assert.match(describeFee('spei'), /máximo \$588\.12/);
assert.equal(describeSubscriptionFee(), describeFee('card'));
assert.equal(isFeeScheduleActive(true, FEE_TERMS_VERSION), true);
assert.equal(isFeeScheduleActive(true, 'cord-pagos-legacy'), false);
assert.equal(isFeeScheduleActive(false, FEE_TERMS_VERSION), false);

// `application_fee_percent` viaja SERIALIZADO en el form-encoded y Stripe acepta
// dos decimales. La constante valía 0.46399999999999997 (punto flotante), lo que
// rompía el envío Y las dos comparaciones de reutilización de
// subscription-intent.ts, que cancelaban y recreaban la iguala en cada visita.
// Se afirma sobre el string, que es lo que de verdad se manda.
assert.equal(String(SUBSCRIPTION_APPLICATION_FEE_PERCENT), '0.46');
assert.equal(SUBSCRIPTION_APPLICATION_FEE_PERCENT, 0.46);
assert.equal(subscriptionFeePercentFor('MXN'), 0.46);

// ── Tarifas por divisa ──────────────────────────────────────────────────────
// La tarifa dejó de ser un par de constantes globales con un `if (moneda !==
// 'MXN')` escondido dentro de computeFee. Lo que se afirma aquí es el contrato
// de esa tabla, no sus números: los de fuera de MXN todavía no existen.

// México es la única divisa con tarifa vigente HOY. Si esto cambia, es una
// decisión de negocio y este assert es el que obliga a actualizar la doc.
const activas = Object.entries(FEE_SCHEDULES).filter(([, s]) => s.enabled).map(([c]) => c);
assert.deepEqual(activas, ['MXN'], `divisas con comisión activa: ${activas.join(', ')}`);

// Una divisa declarada pero sin negociar no cobra NADA por ningún camino.
for (const moneda of ['USD', 'EUR', 'GBP', 'CAD', 'BRL']) {
    assert.equal(feesApplyTo(moneda), false, `${moneda} no debería cobrar comisión`);
    assert.equal(scheduleFor(moneda), null);
    assert.equal(computeFee({ amountCents: 100_000, metodo: 'card', moneda }).applicationFeeCents, 0);
    assert.equal(computeSubscriptionFee(100_000, moneda).applicationFeeCents, 0);
    assert.equal(subscriptionFeePercentFor(moneda), null);
    assert.equal(describeFee('card', moneda), null, `${moneda} no debe describir una tarifa que no cobra`);
}

// Una divisa que Cord ni siquiera declara se comporta igual: fail-closed.
assert.equal(feesApplyTo('JPY'), false);
assert.equal(computeFee({ amountCents: 100_000, metodo: 'card', moneda: 'JPY' }).applicationFeeCents, 0);

// SPEI es un riel mexicano: no tiene tarifa en ninguna otra divisa, ni siquiera
// si un día se activa esa divisa.
assert.equal(FEE_SCHEDULES.MXN.stripeCost.spei !== undefined, true);
for (const [moneda, schedule] of Object.entries(FEE_SCHEDULES)) {
    if (moneda === 'MXN') continue;
    assert.equal(schedule.cordRate.spei, undefined, `SPEI no debe existir en ${moneda}`);
}

// El impuesto del 16% es el IVA MEXICANO, no una constante global: una divisa
// sin tarifa no puede arrastrarlo.
for (const [moneda, schedule] of Object.entries(FEE_SCHEDULES)) {
    if (schedule.enabled) continue;
    assert.equal(schedule.taxBps, 0, `${moneda} no puede declarar impuesto sin tarifa vigente`);
    assert.equal(schedule.verificado, null);
}

// Activar una divisa sin sus números reales tiene que ROMPER, no cobrar cero en
// silencio. Se prueba de verdad, mutando una copia y comprobando que lanza.
{
    const original = FEE_SCHEDULES.EUR;
    FEE_SCHEDULES.EUR = { ...original, enabled: true };
    assert.throws(() => assertFeeMargin(), /EUR/, 'activar EUR sin números debe lanzar');
    FEE_SCHEDULES.EUR = original;
    assertFeeMargin(); // y restaurarlo debe volver a pasar
}

process.stdout.write('fees-check: ok\n');
