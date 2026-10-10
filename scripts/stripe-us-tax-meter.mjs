#!/usr/bin/env node
// scripts/stripe-us-tax-meter.mjs
//
// Crea en Stripe lo que el excedente del sales tax automático de EE. UU.
// necesita para cobrarse: el billing meter `cord_us_tax_transaction`, un
// producto y un Price MEDIDO por plan (Starter, Profesional, Scale,
// Developer) con la tarifa por venta registrada en MXN (moneda base de los
// Price de Cord), USD y EUR como `currency_options` sobre el MISMO Price
// (regla 21; Developer sin EUR: se negocia por ventas). Las cifras salen de
// `US_TAX_OVERAGE_MINOR` en src/lib/plan-overage-pricing.ts: MXN 15.00,
// USD 0.75, EUR 0.70.
//
// NO toca suscripciones (eso es scripts/stripe-us-tax-items.mjs) ni escribe
// billing.ts: imprime los ids para pegarlos ahí. Mientras billing.ts los tenga
// vacíos, la app trata la cuota incluida como tope duro.
//
// Seguro por defecto:
//   - DRY-RUN por defecto (`--dry-run` explícito es igual): solo lee y dice
//     qué crearía. Para escribir: `--apply`.
//   - Una llave LIVE se rechaza salvo `--live` explícito.
//   - Idempotente: encuentra el meter por `event_name`, el producto por su id
//     fijo y cada Price por su `lookup_key` (`cord_us_tax_<plan>`); lo que ya
//     existe con otra tarifa o con otro meter DETIENE el script — nunca se
//     sobrescribe un Price, porque puede tener suscripciones vivas.
//
//   npm run stripe:us-tax-meter                 # test, solo lectura
//   npm run stripe:us-tax-meter -- --apply      # test, crea lo que falta
//   npm run stripe:us-tax-meter -- --apply --live   # LIVE (solo con aprobación)
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { US_TAX_OVERAGE_MINOR } from '../src/lib/plan-overage-pricing.ts';
import { billingIds, meterIdOf, meterPricesOf } from './lib/billing-ids.mjs';

export const US_TAX_EVENT_NAME = 'cord_us_tax_transaction';
export const US_TAX_PRODUCT_ID = 'cord_us_tax_overage';
export const US_TAX_PLANES = ['starter', 'pro', 'scale', 'developer'];
const STRIPE_VERSION = '2025-06-30.basil';
const lookupKey = (plan) => `cord_us_tax_${plan}`;

export class StripeScriptError extends Error {}

/** Valida la llave: test siempre; live solo con `allowLive`. */
export function modoDeLlave(key, allowLive) {
    if (!/^(sk|rk)_(live|test)_/.test(key || '')) throw new StripeScriptError('Falta una STRIPE_SECRET_KEY válida (sk_test_… o sk_live_…).');
    const live = /^(sk|rk)_live_/.test(key);
    if (live && !allowLive) throw new StripeScriptError('La llave es LIVE. Este script corre en modo test por defecto; para live agrega --live (solo con aprobación).');
    return live ? 'live' : 'test';
}

export function stripeClient(key, fetchImpl = fetch) {
    return async function request(path, { method = 'GET', params, idempotencyKey } = {}) {
        const url = new URL(`https://api.stripe.com${path}`);
        const body = params ? new URLSearchParams(params) : null;
        if (method === 'GET' && body) for (const [k, v] of body) url.searchParams.append(k, v);
        const response = await fetchImpl(url, {
            method,
            headers: {
                Authorization: `Bearer ${key}`,
                'Stripe-Version': STRIPE_VERSION,
                ...(method !== 'GET' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
                ...(idempotencyKey && method !== 'GET' ? { 'Idempotency-Key': idempotencyKey } : {}),
            },
            ...(method !== 'GET' && body ? { body: body.toString() } : {}),
        });
        const data = await response.json();
        if (!response.ok) {
            const error = new StripeScriptError(`${method} ${path}: ${data?.error?.code || data?.error?.message || response.status}`);
            error.status = response.status;
            throw error;
        }
        return data;
    };
}

/** Tarifas esperadas por plan, en unidades mínimas. Developer no tiene EUR. */
export function tarifaEsperada(plan) {
    return {
        mxn: US_TAX_OVERAGE_MINOR.MXN,
        usd: US_TAX_OVERAGE_MINOR.USD,
        ...(plan === 'developer' ? {} : { eur: US_TAX_OVERAGE_MINOR.EUR }),
    };
}

const importe = (o) => (o ? Number(o.unit_amount_decimal ?? o.unit_amount) : NaN);

/** Lo que tiene que cumplir un Price existente; lista de diferencias (vacía = bien). */
export function diferenciasDePrice(price, plan, meterId, productId) {
    const t = tarifaEsperada(plan);
    const d = [];
    if (price.active !== true) d.push('inactivo');
    if (price.currency !== 'mxn') d.push(`moneda base ${price.currency}`);
    if (importe(price) !== t.mxn) d.push(`MXN ${importe(price)}`);
    if (importe(price.currency_options?.usd) !== t.usd) d.push(`USD ${importe(price.currency_options?.usd)}`);
    if (t.eur !== undefined && importe(price.currency_options?.eur) !== t.eur) d.push(`EUR ${importe(price.currency_options?.eur)}`);
    if (price.recurring?.usage_type !== 'metered' || price.recurring?.interval !== 'month') d.push('no es medido mensual');
    if (meterId && price.recurring?.meter !== meterId) d.push(`meter ${price.recurring?.meter}`);
    const producto = typeof price.product === 'string' ? price.product : price.product?.id;
    if (productId && producto !== productId) d.push(`producto ${producto}`);
    return d;
}

async function todos(request, path, params) {
    const out = [];
    let starting_after;
    for (;;) {
        const page = await request(path, { params: { limit: '100', ...params, ...(starting_after ? { starting_after } : {}) } });
        out.push(...(page.data ?? []));
        if (!page.has_more || !page.data?.length) return out;
        starting_after = page.data[page.data.length - 1].id;
    }
}

/**
 * @returns {Promise<{ modo: string, aplicado: boolean, meter: string|null, producto: string|null,
 *   prices: Record<string, string|null>, acciones: string[] }>}
 */
export async function ensureUsTaxBilling({ key, apply = false, allowLive = false, fetchImpl = fetch, source }) {
    const modo = modoDeLlave(key, allowLive);
    const request = stripeClient(key, fetchImpl);
    const acciones = [];

    // Lo que billing.ts ya dice, para no dejar dos verdades.
    const enCodigo = source ? billingIds(source, modo === 'test') : null;
    const meterEnCodigo = enCodigo ? meterIdOf(enCodigo, 'us_tax') : '';
    const pricesEnCodigo = enCodigo ? meterPricesOf(enCodigo, 'us_tax') : {};

    // 1. Meter, por event_name (único en la cuenta).
    const meters = (await todos(request, '/v1/billing/meters', {})).filter((m) => m.event_name === US_TAX_EVENT_NAME);
    const activo = meters.find((m) => m.status === 'active');
    if (!activo && meters.length) throw new StripeScriptError(`Existe un meter ${US_TAX_EVENT_NAME} inactivo (${meters[0].id}). Reactívalo o decide en Stripe antes de crear otro.`);
    let meterId = activo?.id ?? null;
    if (activo) {
        if (activo.default_aggregation?.formula !== 'sum') throw new StripeScriptError(`El meter ${activo.id} no agrega por sum.`);
        if (activo.customer_mapping?.event_payload_key !== 'stripe_customer_id' || activo.value_settings?.event_payload_key !== 'value') {
            throw new StripeScriptError(`El meter ${activo.id} no lee stripe_customer_id/value: no coincide con lo que manda src/lib/billing.ts.`);
        }
        acciones.push(`· meter ${activo.id} ya existe`);
    } else if (apply) {
        const creado = await request('/v1/billing/meters', {
            method: 'POST', idempotencyKey: 'cord-us-tax-meter:v1',
            params: {
                display_name: 'Cord · Sales tax automático (EE. UU.)',
                event_name: US_TAX_EVENT_NAME,
                'default_aggregation[formula]': 'sum',
                'customer_mapping[type]': 'by_id',
                'customer_mapping[event_payload_key]': 'stripe_customer_id',
                'value_settings[event_payload_key]': 'value',
            },
        });
        meterId = creado.id;
        acciones.push(`+ meter ${creado.id} creado`);
    } else {
        acciones.push(`+ crearía el meter ${US_TAX_EVENT_NAME}`);
    }
    if (meterEnCodigo && meterId && meterEnCodigo !== meterId) throw new StripeScriptError(`billing.ts tiene otro meter us_tax (${meterEnCodigo}) que el de Stripe (${meterId}).`);

    // 2. Producto, por id fijo.
    let productId = null;
    try {
        const p = await request(`/v1/products/${US_TAX_PRODUCT_ID}`);
        productId = p.id;
        acciones.push(`· producto ${p.id} ya existe`);
    } catch (error) {
        if (error.status !== 404) throw error;
        if (apply) {
            const p = await request('/v1/products', {
                method: 'POST', idempotencyKey: 'cord-us-tax-product:v1',
                params: { id: US_TAX_PRODUCT_ID, name: 'Cord · Sales tax automático (EE. UU.)', 'metadata[cord_dimension]': 'us_tax' },
            });
            productId = p.id;
            acciones.push(`+ producto ${p.id} creado`);
        } else {
            acciones.push(`+ crearía el producto ${US_TAX_PRODUCT_ID}`);
        }
    }

    // 3. Un Price medido por plan, por lookup_key.
    const prices = {};
    for (const plan of US_TAX_PLANES) {
        const t = tarifaEsperada(plan);
        const page = await request('/v1/prices', { params: { 'lookup_keys[]': lookupKey(plan), 'expand[]': 'data.currency_options' } });
        const existente = (page.data ?? [])[0];
        if (existente) {
            const d = diferenciasDePrice(existente, plan, meterId, productId);
            if (d.length) throw new StripeScriptError(`El Price ${existente.id} (${plan}) ya existe con diferencias: ${d.join(', ')}. No se sobrescribe.`);
            prices[plan] = existente.id;
            acciones.push(`· price ${plan} ${existente.id} ya existe`);
        } else if (apply) {
            const creado = await request('/v1/prices', {
                method: 'POST', idempotencyKey: `cord-us-tax-price:${plan}:v1`,
                params: {
                    currency: 'mxn',
                    unit_amount: String(t.mxn),
                    'currency_options[usd][unit_amount]': String(t.usd),
                    ...(t.eur !== undefined ? { 'currency_options[eur][unit_amount]': String(t.eur) } : {}),
                    'recurring[interval]': 'month',
                    'recurring[usage_type]': 'metered',
                    'recurring[meter]': meterId,
                    product: productId,
                    lookup_key: lookupKey(plan),
                    nickname: `Sales tax automático (EE. UU.) · ${plan}`,
                    'metadata[cord_dimension]': 'us_tax',
                    'metadata[cord_plan]': plan,
                },
            });
            prices[plan] = creado.id;
            acciones.push(`+ price ${plan} ${creado.id} creado (MXN ${t.mxn / 100}, USD ${t.usd / 100}${t.eur !== undefined ? `, EUR ${t.eur / 100}` : ''})`);
        } else {
            prices[plan] = null;
            acciones.push(`+ crearía el price ${plan} (MXN ${t.mxn / 100}, USD ${t.usd / 100}${t.eur !== undefined ? `, EUR ${t.eur / 100}` : ''})`);
        }
        const codigo = pricesEnCodigo[plan];
        if (codigo && prices[plan] && codigo !== prices[plan]) throw new StripeScriptError(`billing.ts tiene otro Price us_tax para ${plan} (${codigo}) que el de Stripe (${prices[plan]}).`);
    }
    return { modo, aplicado: apply, meter: meterId, producto: productId, prices, acciones };
}

/** El bloque a pegar en src/lib/billing.ts (METERS y METER_PRICES de ese modo). */
export function bloqueParaBilling(r) {
    if (!r.meter || Object.values(r.prices).some((p) => !p)) return null;
    const lado = r.modo === 'test' ? 'la rama isTest (antes de `} : {`)' : 'la rama live (después de `} : {`)';
    return [
        `En src/lib/billing.ts, ${lado}:`,
        `  METERS:        us_tax: '${r.meter}',`,
        ...US_TAX_PLANES.map((plan) => `  METER_PRICES.${plan.padEnd(9)} us_tax: '${r.prices[plan]}',`),
    ].join('\n');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const args = new Set(process.argv.slice(2));
    const apply = args.has('--apply');
    try {
        const source = readFileSync(new URL('../src/lib/billing.ts', import.meta.url), 'utf8');
        const r = await ensureUsTaxBilling({ key: process.env.STRIPE_SECRET_KEY || '', apply, allowLive: args.has('--live'), source });
        console.log(`Modo Stripe: ${r.modo.toUpperCase()} — ${apply ? 'ESCRITURA (--apply)' : 'DRY-RUN: nada se escribió; usa --apply para crear.'}`);
        for (const a of r.acciones) console.log(a);
        const bloque = bloqueParaBilling(r);
        if (bloque) console.log(`\n${bloque}\n\nDespués: npm run stripe:us-tax-items (dry-run) y el orden de docs/estado/negocio-billing.md.`);
    } catch (error) {
        // Los mensajes nunca incluyen la llave: solo ruta y código del error.
        console.error(error instanceof StripeScriptError ? error.message : `Fallo inesperado: ${error?.message || error}`);
        process.exitCode = 1;
    }
}
