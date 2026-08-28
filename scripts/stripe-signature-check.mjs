import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// ── El HANDLER, no sólo el helper ───────────────────────────────────────────
//
// Los asserts de arriba prueban la matemática del HMAC. No probaban lo único
// que de verdad decide si un evento falso entra: que el handler se niegue a
// procesar cuando NO hay secreto configurado.
//
// El bug real: el 500 por configuración faltante estaba condicionado a
// `process.env.VERCEL`, así que fuera de Vercel —un contenedor, un preview
// self-hosted, un runner apuntando a la base buena— el handler procesaba
// eventos SIN FIRMA como si fueran de Stripe. Verificado reintroduciendo la
// condición antes de escribir este check: con ella presente, este assert falla.
const handler = readFileSync(new URL('../src/pages/api/stripe/webhook.ts', import.meta.url), 'utf8');

const guard = handler.match(/if \(![A-Z_]*WH_SECRET && ![A-Z_]*CONNECT_WH_SECRET\)[^\n]*\{/);
assert.ok(guard, 'el webhook debe rechazar cuando faltan AMBOS secretos');

// Negativo: el guard no puede depender del entorno de despliegue.
const guardLine = handler.slice(handler.indexOf(guard[0]), handler.indexOf(guard[0]) + 200);
assert.ok(
    !/process\.env\.VERCEL/.test(guardLine),
    'la verificación de firma no puede estar condicionada a process.env.VERCEL',
);

// La verificación no puede quedar detrás de un `if (WH_SECRET || CONNECT_WH_SECRET)`:
// eso la vuelve opcional justo cuando no hay secretos.
assert.ok(
    !/if \([A-Z_]*WH_SECRET \|\| [A-Z_]*CONNECT_WH_SECRET\) \{/.test(handler),
    'la verificación de firma no puede ser condicional a que exista un secreto',
);

// Y sigue exigiendo firma válida antes de parsear el evento.
assert.ok(/firma inválida/.test(handler), 'el webhook debe responder 400 a una firma inválida');
assert.ok(
    handler.indexOf('firma inválida') < handler.indexOf('JSON.parse(raw)'),
    'la firma se verifica ANTES de parsear el payload',
);

// Cada secreto abre su propio carril: un evento firmado con el de Connect y sin
// `event.account` caería en los handlers de facturación de la PLATAFORMA, que
// conceden y quitan planes. `signatureSource` se calculaba y no se usaba.
assert.ok(
    /signatureSource === 'connect' && !event\.account/.test(handler),
    'un evento firmado con el secreto de Connect debe exigir event.account',
);

console.log('Verificación de firma Stripe correcta.');
