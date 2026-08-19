#!/usr/bin/env node
// scripts/add-usd-currency-options.mjs
//
// Agrega la opción USD a los Price de los planes de Cord.
//
// Cord cobra MXN a los negocios mexicanos y USD al resto (`src/lib/plan-currency.ts`).
// En Stripe eso son `currency_options` sobre los MISMOS Price: no se crean precios
// paralelos porque los existentes ya tienen suscripciones live y duplicarlos partiría
// el catálogo en dos.
//
// La operación es ADITIVA: no cambia el importe MXN ni toca ninguna suscripción
// vigente. Sólo agrega una alternativa que se usa cuando la suscripción nace en USD.
//
// DRY-RUN POR DEFECTO. Imprime el plan y sale. Para escribir: --apply
//
//   node --env-file-if-exists=.env scripts/add-usd-currency-options.mjs
//   node --env-file-if-exists=.env scripts/add-usd-currency-options.mjs --apply
//
// Es idempotente: un Price que ya tiene `currency_options.usd` se salta y se
// reporta. Nunca en silencio.

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) {
    console.error('Falta STRIPE_SECRET_KEY.');
    process.exit(1);
}
const APPLY = process.argv.includes('--apply');
const LIVE = KEY.startsWith('sk_live_') || KEY.startsWith('rk_live_');

async function stripe(path, body, method = 'GET') {
    const res = await fetch(`https://api.stripe.com${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${KEY}`,
            ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        ...(body ? { body: new URLSearchParams(body).toString() } : {}),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json?.error?.message || ''}`);
    return json;
}

// ── Tarifas USD ───────────────────────────────────────────────────────────────
// Paridad 20:1 con la escalera MXN, que es la que ya está en producción. Los
// importes base son los que publica `src/lib/precios.ts` (12/30/70/150 al mes,
// ×10 al año por los dos meses gratis). Las tarifas medidas conservan los
// decimales exactos (17.5, 12.5, 7.5): redondearlas movería la escalera relativa
// entre planes, que es una decisión comercial, no de conversión.
//
// `unit_amount` va en centavos enteros; `unit_amount_decimal` admite fracciones
// de centavo, que es como están hoy las tarifas de API en MXN (0.6, 0.4).
const BASE = [
    { plan: 'starter',   cycle: 'mensual', id: 'price_1TidnNQuD2ZBXFA9dOWBavAE', usd: 1200 },
    { plan: 'starter',   cycle: 'anual',   id: 'price_1TiekaQuD2ZBXFA9yPYD1WKq', usd: 12000 },
    { plan: 'pro',       cycle: 'mensual', id: 'price_1Tidx3QuD2ZBXFA99FzBCdJ2', usd: 3000 },
    { plan: 'pro',       cycle: 'anual',   id: 'price_1TielcQuD2ZBXFA9fPd8XoXx', usd: 30000 },
    { plan: 'scale',     cycle: 'mensual', id: 'price_1Tie2WQuD2ZBXFA9bd6aMdZr', usd: 7000 },
    { plan: 'scale',     cycle: 'anual',   id: 'price_1TiemaQuD2ZBXFA9AQBqsypx', usd: 70000 },
    { plan: 'developer', cycle: 'mensual', id: 'price_1Tie9aQuD2ZBXFA95j6ahOSd', usd: 15000 },
    { plan: 'developer', cycle: 'anual',   id: 'price_1TienBQuD2ZBXFA9hEP9OwYR', usd: 150000 },
];

const METERED = [
    { plan: 'starter',   dim: 'api',      id: 'price_1Tie8yQuD2ZBXFA95QlmfbIj', usd: '0.03' },
    { plan: 'starter',   dim: 'ia',       id: 'price_1TidsnQuD2ZBXFA9uGEPbBhF', usd: '20' },
    { plan: 'starter',   dim: 'timbrado', id: 'price_1TiduZQuD2ZBXFA91xtzCz0B', usd: '15' },
    { plan: 'pro',       dim: 'api',      id: 'price_1Tie1sQuD2ZBXFA98nejH9l4', usd: '0.03' },
    { plan: 'pro',       dim: 'usuario',  id: 'price_1TidxsQuD2ZBXFA9t1S7Uang', usd: '1500' },
    { plan: 'pro',       dim: 'ia',       id: 'price_1TidyJQuD2ZBXFA9CXUvMZIs', usd: '17.5' },
    { plan: 'pro',       dim: 'timbrado', id: 'price_1TidylQuD2ZBXFA9WIRLTZ0L', usd: '15' },
    { plan: 'scale',     dim: 'api',      id: 'price_1Tie7OQuD2ZBXFA9RtEcbu8s', usd: '0.02' },
    { plan: 'scale',     dim: 'usuario',  id: 'price_1U45ebQuD2ZBXFA97TI8pA55', usd: '1500' },
    { plan: 'scale',     dim: 'ia',       id: 'price_1Tie5VQuD2ZBXFA9JUizxrkk', usd: '15' },
    { plan: 'scale',     dim: 'timbrado', id: 'price_1Tie5wQuD2ZBXFA9hLTY2QKi', usd: '10' },
    { plan: 'developer', dim: 'api',      id: 'price_1TieClQuD2ZBXFA9dNGVeRox', usd: '0.02' },
    { plan: 'developer', dim: 'usuario',  id: 'price_1TieA8QuD2ZBXFA9ZmaQ58oj', usd: '1000' },
    { plan: 'developer', dim: 'ia',       id: 'price_1TieAmQuD2ZBXFA9NZ9980yq', usd: '12.5' },
    { plan: 'developer', dim: 'timbrado', id: 'price_1TieBOQuD2ZBXFA9WJhCjCkG', usd: '7.5' },
];

console.log(`Modo Stripe: ${LIVE ? 'LIVE' : 'TEST'}`);
console.log(APPLY ? 'ESCRITURA (--apply)\n' : 'DRY-RUN — nada se escribe. Usa --apply para aplicar.\n');

let added = 0, skipped = 0, failed = 0;

async function ensureUsd({ plan, dim, cycle, id, usd }, decimal) {
    const label = `${plan}/${dim ?? cycle}`.padEnd(20);
    let price;
    try {
        price = await stripe(`/v1/prices/${id}`);
    } catch (e) {
        console.log(`✗ ${label} ${id}  no se pudo leer: ${e.message}`);
        failed++;
        return;
    }
    const mxn = price.unit_amount_decimal ?? price.unit_amount;
    if (price.currency_options?.usd) {
        const current = price.currency_options.usd.unit_amount_decimal ?? price.currency_options.usd.unit_amount;
        console.log(`· ${label} ${id}  ya tiene USD (${current}) — se salta`);
        skipped++;
        return;
    }
    if (!APPLY) {
        console.log(`+ ${label} ${id}  MXN ${String(mxn).padEnd(9)} → USD ${usd}`);
        added++;
        return;
    }
    const field = decimal ? 'currency_options[usd][unit_amount_decimal]' : 'currency_options[usd][unit_amount]';
    try {
        await stripe(`/v1/prices/${id}`, { [field]: String(usd) }, 'POST');
        console.log(`✓ ${label} ${id}  MXN ${String(mxn).padEnd(9)} → USD ${usd}`);
        added++;
    } catch (e) {
        console.log(`✗ ${label} ${id}  ${e.message}`);
        failed++;
    }
}

console.log('── Precios base ──');
for (const row of BASE) await ensureUsd(row, false);
console.log('\n── Precios medidos (excedente) ──');
for (const row of METERED) await ensureUsd(row, true);

console.log(`\n${APPLY ? 'Aplicados' : 'Por aplicar'}: ${added} · Ya tenían USD: ${skipped} · Fallidos: ${failed}`);
if (failed) {
    console.error('\nHubo precios que no quedaron con opción USD. NO despliegues el cobro en USD hasta resolverlos.');
    process.exit(1);
}
