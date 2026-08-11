import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { parseStripeSignature, verifyStripeSignature } from '../src/lib/stripe-signature.ts';

const secret = 'whsec_test_secret';
const raw = JSON.stringify({ id: 'evt_test', type: 'payment_intent.succeeded' });
const now = 1_800_000_000;
const sign = (timestamp) => createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');

assert.equal(verifyStripeSignature(raw, `t=${now},v1=${sign(now)}`, secret, { nowSeconds: now }), true);
assert.equal(verifyStripeSignature(raw, `t=${now - 301},v1=${sign(now - 301)}`, secret, { nowSeconds: now }), false);
assert.equal(verifyStripeSignature(raw, `t=${now},v1=${'0'.repeat(64)},v1=${sign(now)}`, secret, { nowSeconds: now }), true);
assert.equal(verifyStripeSignature(raw, `t=${now},v1=${sign(now)},v1=${'f'.repeat(64)}`, secret, { nowSeconds: now }), true);
assert.deepEqual(parseStripeSignature(`t=${now},v1=abc==`), { timestamp: now, signatures: ['abc=='] });
assert.equal(verifyStripeSignature(raw, `t=${now},v1=abc==`, secret, { nowSeconds: now }), false);

console.log('Verificación de firma Stripe correcta.');
