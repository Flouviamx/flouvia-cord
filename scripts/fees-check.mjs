import assert from 'node:assert/strict';
import {
    assertFeeMargin,
    computeFee,
    computeSubscriptionFee,
    describeFee,
    describeSubscriptionFee,
    FEE_TERMS_VERSION,
    isFeeScheduleActive,
} from '../src/lib/fees.ts';

assertFeeMargin();
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
assert.deepEqual(computeSubscriptionFee(100_000), { applicationFeeCents: 464, feeBaseCents: 400, feeIvaCents: 64 });
assert.equal(computeSubscriptionFee(100_000, false).applicationFeeCents, 0);
assert.match(describeFee('card'), /IVA$/);
assert.match(describeFee('spei'), /máximo \$588\.12/);
assert.equal(describeSubscriptionFee(), describeFee('card'));
assert.equal(isFeeScheduleActive(true, FEE_TERMS_VERSION), true);
assert.equal(isFeeScheduleActive(true, 'cord-pagos-legacy'), false);
assert.equal(isFeeScheduleActive(false, FEE_TERMS_VERSION), false);
process.stdout.write('fees-check: ok\n');
