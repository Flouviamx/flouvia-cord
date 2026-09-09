import assert from 'node:assert/strict';
import { EUR_MONTHLY, EUR_METER_MINOR } from '../../src/lib/plan-eur-rates.ts';

/** Reads the existing IDs for the selected Stripe environment; never creates IDs. */
export function euroPriceCatalog(source, testMode) {
    const result = [];
    for (const symbol of ['PLAN_PRICES', 'METER_PRICES']) {
        const start = source.indexOf(`export const ${symbol}`);
        assert.ok(start >= 0, `Falta ${symbol}`);
        const block = source.slice(start, source.indexOf('\n};', start));
        const split = block.indexOf('} : {');
        assert.ok(split > 0, 'Falta separación TEST/LIVE');
        const variant = testMode ? block.slice(0, split) : block.slice(split + 5);
        for (const [, plan, fields] of variant.matchAll(/^\s*(starter|pro|scale):\s*\{([^}]+)\}/gm)) {
            for (const [, dimension, id] of fields.matchAll(/(mensual|anual|api|ia|usuario|timbrado):\s*'(price_[^']+)'/g)) {
                const base = symbol === 'PLAN_PRICES';
                const amount = base ? String(EUR_MONTHLY[plan] * 100 * (dimension === 'anual' ? 10 : 1)) : EUR_METER_MINOR[plan][dimension];
                assert.ok(amount !== undefined);
                result.push({ id, plan, dimension, amount, base });
            }
        }
    }
    assert.equal(result.filter(p => p.base).length, 6);
    assert.equal(result.filter(p => !p.base).length, 11);
    assert.equal(new Set(result.map(p => p.id)).size, 17);
    return result;
}
