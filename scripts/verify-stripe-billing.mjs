// Auditoría read-only de la configuración real de Stripe. No crea, cambia ni
// cancela objetos. Usa la misma STRIPE_SECRET_KEY que la app.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const key = process.env.STRIPE_SECRET_KEY || '';
assert.ok(key, 'Falta STRIPE_SECRET_KEY.');
const source = readFileSync(new URL('../src/lib/billing.ts', import.meta.url), 'utf8');
const testMode = key.startsWith('sk_test_') || key.startsWith('rk_test_');

function variantIds(symbol, prefix) {
  const start = source.indexOf(`export const ${symbol}`);
  assert.ok(start >= 0, `No se encontró ${symbol}.`);
  const end = source.indexOf('\n};', start);
  const block = source.slice(start, end + 3);
  const marker = block.indexOf('} : {');
  assert.ok(marker >= 0, `${symbol} no conserva la separación test/live.`);
  const variant = testMode ? block.slice(0, marker) : block.slice(marker + 5);
  return [...variant.matchAll(new RegExp(`'(${prefix}_[^']+)'`, 'g'))].map((match) => match[1]);
}

const basePriceIds = variantIds('PLAN_PRICES', 'price');
const meterPriceIds = variantIds('METER_PRICES', 'price');
const meterIds = variantIds('METERS', testMode ? 'mtr_test' : 'mtr');
assert.equal(basePriceIds.length, 8, 'Deben existir 8 prices base (4 planes por 2 ciclos).');
assert.equal(meterPriceIds.length, 15, 'Deben existir 15 prices medidos.');
assert.equal(meterIds.length, 4, 'Deben existir 4 meters.');
assert.equal(new Set([...basePriceIds, ...meterPriceIds]).size, 23, 'Hay price ids duplicados.');

async function stripe(path, params = {}) {
  const url = new URL(`https://api.stripe.com${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.append(name, String(value));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${data?.error?.code || response.status}`);
  return data;
}

const meters = await Promise.all(meterIds.map((id) => stripe(`/v1/billing/meters/${id}`)));
for (const meter of meters) {
  assert.equal(meter.status, 'active', `Meter ${meter.id} inactivo.`);
  assert.equal(meter.default_aggregation?.formula, 'sum', `Meter ${meter.id} debe agregar por sum.`);
}

const meterSet = new Set(meterIds);
const prices = await Promise.all([...basePriceIds, ...meterPriceIds].map((id) => stripe(`/v1/prices/${id}`)));
if (process.env.BILLING_AUDIT_DETAILS === '1') {
  console.log(prices.map((price) => ({
    id: price.id,
    interval: price.recurring?.interval,
    usage: price.recurring?.usage_type,
    amount: price.unit_amount_decimal ?? price.unit_amount,
  })));
}
const expectedBaseAmounts = [24000, 240000, 59000, 590000, 139000, 1390000, 299000, 2990000];
const expectedBaseIntervals = ['month', 'year', 'month', 'year', 'month', 'year', 'month', 'year'];
const expectedMeterAmounts = [0.6, 400, 300, 0.6, 30000, 350, 300, 0.4, 30000, 300, 200, 0.4, 20000, 250, 150];
const expectedProducts = ['prod_Ui3vQBd5goOHQ1', 'prod_Ui45gzUJYA3O2w', 'prod_Ui4AQicrCoCMUt', 'prod_Ui4Iff1aimaK0y'];
// Paridad 20:1 con la escalera MXN de arriba. Los base cuadran con src/lib/precios.ts
// (12/30/70/150 al mes, ×10 al año). Un importe que se mueva aquí y no allá deja a
// la landing anunciando un precio que el cobro no respeta — que es exactamente el
// bug que este archivo existe para que no vuelva.
const expectedBaseAmountsUsd = [1200, 12000, 3000, 30000, 7000, 70000, 15000, 150000];
const expectedMeterAmountsUsd = [0.03, 20, 15, 0.03, 1500, 17.5, 15, 0.02, 1500, 15, 10, 0.02, 1000, 12.5, 7.5];
// Cord cobra en dos divisas: MXN a México, USD al resto (src/lib/plan-currency.ts).
// La base sigue siendo MXN —es la divisa original de los Price, con suscripciones
// vivas— y USD viaja como `currency_options` sobre el MISMO Price. Sin esa opción,
// una suscripción creada con `currency: 'usd'` falla en el momento del cobro, así
// que el orden es inamovible: scripts/add-usd-currency-options.mjs ANTES de
// desplegar el checkout en USD.
for (const price of prices) {
  assert.equal(price.active, true, `Price ${price.id} inactivo.`);
  assert.equal(price.currency, 'mxn', `Price ${price.id} no está en MXN.`);
  assert.ok(
    price.currency_options?.usd,
    `Price ${price.id} no tiene opción USD. Corre: node scripts/add-usd-currency-options.mjs --apply`,
  );
  assert.ok(price.recurring, `Price ${price.id} no es recurrente.`);
  const isMeterPrice = meterPriceIds.includes(price.id);
  if (isMeterPrice) {
    assert.equal(price.recurring.interval, 'month', `Price medido ${price.id} debe ser mensual.`);
    assert.equal(price.recurring.usage_type, 'metered', `Price ${price.id} no está metered.`);
    assert.ok(meterSet.has(price.recurring.meter), `Price ${price.id} apunta a un meter ajeno.`);
    assert.ok(Number(price.unit_amount_decimal ?? price.unit_amount) > 0, `Price ${price.id} no tiene tarifa positiva.`);
  } else {
    assert.equal(price.recurring.usage_type, 'licensed', `Price base ${price.id} debe ser licensed.`);
    assert.ok(['month', 'year'].includes(price.recurring.interval), `Intervalo inválido en ${price.id}.`);
    assert.ok(Number(price.unit_amount_decimal ?? price.unit_amount) > 0, `Price base ${price.id} no tiene importe.`);
  }
}
for (let index = 0; index < basePriceIds.length; index++) {
  const price = prices[index];
  const planIndex = Math.floor(index / 2);
  assert.equal(Number(price.unit_amount_decimal ?? price.unit_amount), expectedBaseAmounts[index], `Importe base incorrecto en ${price.id}.`);
  assert.equal(Number(price.currency_options.usd.unit_amount_decimal ?? price.currency_options.usd.unit_amount), expectedBaseAmountsUsd[index], `Importe base USD incorrecto en ${price.id}.`);
  assert.equal(price.recurring.interval, expectedBaseIntervals[index], `Ciclo base incorrecto en ${price.id}.`);
  assert.equal(typeof price.product === 'string' ? price.product : price.product?.id, expectedProducts[planIndex], `Producto base incorrecto en ${price.id}.`);
}
for (let index = 0; index < meterPriceIds.length; index++) {
  const price = prices[basePriceIds.length + index];
  assert.equal(Number(price.unit_amount_decimal ?? price.unit_amount), expectedMeterAmounts[index], `Tarifa medida incorrecta en ${price.id}.`);
  assert.equal(Number(price.currency_options.usd.unit_amount_decimal ?? price.currency_options.usd.unit_amount), expectedMeterAmountsUsd[index], `Tarifa medida USD incorrecta en ${price.id}.`);
}

const endpointPage = await stripe('/v1/webhook_endpoints', { limit: 100 });
const endpoint = endpointPage.data.find((item) => item.status === 'enabled' && item.url === 'https://cordhq.app/api/stripe/webhook' && item.application == null);
assert.ok(endpoint, 'No existe un webhook de plataforma activo para cordhq.app.');
const requiredEvents = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'customer.subscription.created', 'customer.subscription.updated',
  'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed',
  'invoice.payment_action_required', 'invoice.marked_uncollectible', 'invoice.voided',
];
const receivesAll = endpoint.enabled_events.includes('*');
const missingEvents = requiredEvents.filter((event) => !receivesAll && !endpoint.enabled_events.includes(event));
assert.deepEqual(missingEvents, [], `Webhook sin eventos requeridos: ${missingEvents.join(', ')}`);

const portals = await stripe('/v1/billing_portal/configurations', { active: true, limit: 10 });
const portal = portals.data.find((config) => config.is_default) ?? portals.data[0];
assert.ok(portal, 'No hay una configuración activa de Customer Portal.');
assert.equal(portal.features?.payment_method_update?.enabled, true, 'Portal no permite actualizar el método de pago.');
assert.equal(portal.features?.invoice_history?.enabled, true, 'Portal no permite consultar facturas.');
assert.equal(portal.features?.subscription_cancel?.enabled, true, 'Portal no permite cancelar la suscripción.');
// Stripe no permite cambiar desde Portal una suscripción con usage-based
// billing. Cord lo hace con pending updates/schedules en /api/billing/subscribe.
assert.equal(portal.features?.subscription_update?.enabled, false, 'Los cambios de plan medidos deben pasar por el flujo autoritativo de Cord.');

console.log(`Stripe Billing real: ${prices.length} prices, ${meters.length} meters, webhook y portal verificados en modo ${testMode ? 'test' : 'live'}.`);
