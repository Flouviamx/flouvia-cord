// Lee los identificadores de Stripe de src/lib/billing.ts (PLAN_PRICES,
// METER_PRICES y METERS) para el entorno de la llave: test o live. Nunca los
// copia ni los inventa: billing.ts es la única fuente (los price_id no son
// secretos, pero duplicarlos en un script es cómo un plan termina cobrando
// con el Price de otro).
//
// Devuelve los campos EN EL ORDEN del archivo, incluidos los vacíos (`''`):
// un id vacío es un medidor todavía no configurado en Stripe (p. ej. `us_tax`
// antes de correr scripts/stripe-us-tax-meter.mjs), no un error.
import assert from 'node:assert/strict';

const PLANES = ['starter', 'pro', 'scale', 'developer'];

function variante(source, symbol, testMode) {
    const start = source.indexOf(`export const ${symbol}`);
    assert.ok(start >= 0, `No se encontró ${symbol} en src/lib/billing.ts.`);
    const end = source.indexOf('\n};', start);
    const block = source.slice(start, end + 3);
    const marker = block.indexOf('} : {');
    assert.ok(marker >= 0, `${symbol} no conserva la separación test/live.`);
    return testMode ? block.slice(0, marker) : block.slice(marker + 5);
}

const campos = (texto) => [...texto.matchAll(/(\w+):\s*'([^']*)'/g)].map((m) => [m[1], m[2]]);

/**
 * @returns {{
 *   planPrices: Record<string, Record<string, string>>,
 *   meterPrices: Record<string, Array<[string, string]>>,
 *   meters: Array<[string, string]>,
 * }}
 */
export function billingIds(source, testMode) {
    const porPlan = (symbol) => {
        const out = {};
        for (const [, plan, fields] of variante(source, symbol, testMode).matchAll(/^\s*(starter|pro|scale|developer):\s*\{([^}]*)\}/gm)) {
            out[plan] = campos(fields);
        }
        for (const plan of PLANES) assert.ok(out[plan], `${symbol} no tiene el plan ${plan}.`);
        return out;
    };
    const planPrices = Object.fromEntries(Object.entries(porPlan('PLAN_PRICES')).map(([plan, fields]) => [plan, Object.fromEntries(fields)]));
    return { planPrices, meterPrices: porPlan('METER_PRICES'), meters: campos(variante(source, 'METERS', testMode)) };
}

/** Los Price medidos de una dimensión, por plan (`''` = sin configurar). */
export function meterPricesOf(ids, dim) {
    return Object.fromEntries(PLANES.map((plan) => [plan, (ids.meterPrices[plan].find(([d]) => d === dim) ?? [dim, ''])[1]]));
}

export const meterIdOf = (ids, dim) => (ids.meters.find(([d]) => d === dim) ?? [dim, ''])[1];
