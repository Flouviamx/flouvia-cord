// Add approved EUR alternatives to existing prices. No subscription changes.
// Read-only by default. --apply writes only missing currency_options.eur.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { euroPriceCatalog } from './lib/euro-price-catalog.mjs';

export async function ensureEuroPrices({ key, catalog, apply = false, fetchImpl = fetch }) {
    assert.ok(/^(sk|rk)_(live|test)_/.test(key || ''), 'Falta una llave de Stripe válida');
    const live = /^(sk|rk)_live_/.test(key);
    const request = async (row, body) => {
        const url = new URL(`https://api.stripe.com/v1/prices/${row.id}`);
        url.searchParams.set('expand[]', 'currency_options');
        const response = await fetchImpl(url, {
            method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key}`,
                ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `cord-eur:${row.id}:${row.amount}` } : {}) },
            ...(body ? { body: new URLSearchParams(body).toString() } : {}),
        });
        if (!response.ok) throw new Error(`No se pudo ${body ? 'actualizar' : 'leer'} el precio ${row.id}: HTTP ${response.status}`);
        return response.json();
    };
    const pending = [];
    // Validate the entire catalog before the first write. Fail on drift instead
    // of overwriting an existing tariff or mixing live and test environments.
    for (const row of catalog) {
        const price = await request(row);
        assert.equal(price.id, row.id);
        assert.equal(price.livemode, live);
        assert.equal(price.active, true);
        assert.equal(price.currency, 'mxn');
        assert.equal(price.recurring?.usage_type, row.base ? 'licensed' : 'metered');
        assert.equal(price.recurring?.interval, row.dimension === 'anual' ? 'year' : 'month');
        if (price.currency_options?.eur) {
            const value = price.currency_options.eur;
            assert.equal(Number(value.unit_amount_decimal ?? value.unit_amount), Number(row.amount), `Tarifa EUR existente distinta: ${row.id}`);
        } else pending.push(row);
    }
    let added = 0;
    if (apply) for (const row of pending) {
        const field = row.base ? 'unit_amount' : 'unit_amount_decimal';
        const price = await request(row, { [`currency_options[eur][${field}]`]: row.amount });
        const value = price.currency_options?.eur;
        assert.equal(Number(value?.unit_amount_decimal ?? value?.unit_amount), Number(row.amount), `No se confirmó EUR: ${row.id}`);
        added++;
    }
    return { mode: live ? 'LIVE' : 'TEST', catalog: catalog.length, missingBefore: pending.length, added, unchanged: catalog.length - pending.length };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const key = process.env.STRIPE_SECRET_KEY || '';
    const source = readFileSync(new URL('../src/lib/billing.ts', import.meta.url), 'utf8');
    const catalog = euroPriceCatalog(source, /^(sk|rk)_test_/.test(key));
    console.log(JSON.stringify(await ensureEuroPrices({ key, catalog, apply: process.argv.includes('--apply') })));
}
