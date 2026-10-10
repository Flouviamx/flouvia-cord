#!/usr/bin/env node
// scripts/stripe-us-tax-items.mjs
//
// Agrega el item medido del sales tax automático de EE. UU. (`us_tax`) a las
// suscripciones VIVAS de Cord que todavía no lo tienen. Las suscripciones
// nuevas ya lo llevan desde el checkout (`meterPricesFor` en
// src/lib/billing.ts) y un cambio de plan lo agrega (`subscriptionChangeParams`);
// esto cubre las que nacieron antes.
//
// Sin el item, el excedente de esa organización no se cobraría (el meter event
// llega, pero ningún Price de su suscripción lo factura). Por eso el
// reconciliador diario avisa a Ops de cada suscripción a la que le falte
// ("Suscripción sin un medidor opcional"). Su ausencia NO baja el plan: es un
// medidor opcional (`OPTIONAL_METER_DIMS`).
//
// Los Price salen de src/lib/billing.ts (única fuente) para el modo de la
// llave: hay que llenarlos ahí ANTES de correr esto (ver
// scripts/stripe-us-tax-meter.mjs).
//
// Seguro por defecto:
//   - DRY-RUN por defecto (`--dry-run` explícito es igual). Para escribir: `--apply`.
//   - Una llave LIVE se rechaza salvo `--live` explícito.
//   - Idempotente: una suscripción que ya tiene el Price se salta, y cada alta
//     lleva `Idempotency-Key` determinística (suscripción + Price).
//   - No toca una suscripción con cambio programado (Subscription Schedule): su
//     siguiente fase reemplazaría los items. Se reporta; corre esto otra vez
//     cuando el cambio se aplique.
//   - Solo agrega un item medido (`proration_behavior=none`): no cambia el
//     precio base, el ciclo ni la moneda, y no genera cargo inmediato.
//
//   npm run stripe:us-tax-items                 # test, solo lectura
//   npm run stripe:us-tax-items -- --apply      # test, agrega
//   npm run stripe:us-tax-items -- --apply --live   # LIVE (solo con aprobación)
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { billingIds, meterPricesOf } from './lib/billing-ids.mjs';
import { StripeScriptError, modoDeLlave, stripeClient, US_TAX_PLANES } from './stripe-us-tax-meter.mjs';

const VIVAS = new Set(['active', 'past_due', 'unpaid', 'trialing']);
const idDe = (v) => (typeof v === 'string' ? v : v?.id ?? null);

/**
 * @returns {Promise<{ modo: string, aplicado: boolean, revisadas: number, agregadas: string[],
 *   yaTenian: number, omitidas: Array<{ sub: string, motivo: string }> }>}
 */
export async function ensureUsTaxItems({ key, apply = false, allowLive = false, fetchImpl = fetch, source }) {
    const modo = modoDeLlave(key, allowLive);
    const request = stripeClient(key, fetchImpl);
    const ids = billingIds(source, modo === 'test');

    const usTax = meterPricesOf(ids, 'us_tax');
    const faltan = US_TAX_PLANES.filter((plan) => !usTax[plan]);
    if (faltan.length) {
        throw new StripeScriptError(`src/lib/billing.ts no tiene el Price us_tax de: ${faltan.join(', ')} (modo ${modo}). Llénalo con la salida de scripts/stripe-us-tax-meter.mjs antes de agregarlo a las suscripciones.`);
    }
    const planPorPrice = new Map();
    for (const plan of US_TAX_PLANES) for (const id of Object.values(ids.planPrices[plan])) planPorPrice.set(id, plan);
    const usTaxIds = new Set(Object.values(usTax));

    // Los Price deben existir, estar activos, ser medidos y del modo correcto:
    // agregar a cientos de suscripciones un Price equivocado es caro de deshacer.
    const prices = {};
    for (const plan of US_TAX_PLANES) {
        const p = await request(`/v1/prices/${usTax[plan]}`, { params: { 'expand[]': 'currency_options' } });
        if (p.active !== true || p.recurring?.usage_type !== 'metered') throw new StripeScriptError(`El Price us_tax de ${plan} (${p.id}) no está activo o no es medido.`);
        if (p.livemode !== (modo === 'live')) throw new StripeScriptError(`El Price us_tax de ${plan} no es del modo ${modo}.`);
        prices[plan] = p;
    }

    const out = { modo, aplicado: apply, revisadas: 0, agregadas: [], yaTenian: 0, omitidas: [] };
    let starting_after;
    for (;;) {
        const page = await request('/v1/subscriptions', { params: { status: 'all', limit: '100', ...(starting_after ? { starting_after } : {}) } });
        for (const sub of page.data ?? []) {
            if (!VIVAS.has(String(sub.status))) continue;
            const items = sub.items?.data ?? [];
            const base = items.find((it) => planPorPrice.has(idDe(it.price)));
            if (!base) continue; // no es una suscripción de un plan de Cord
            out.revisadas++;
            const plan = planPorPrice.get(idDe(base.price));
            const objetivo = usTax[plan];
            const omitir = (motivo) => out.omitidas.push({ sub: sub.id, motivo });

            if (items.some((it) => idDe(it.price) === objetivo)) { out.yaTenian++; continue; }
            if (items.some((it) => usTaxIds.has(idDe(it.price)))) { omitir(`tiene el Price us_tax de otro plan (plan actual ${plan})`); continue; }
            if (items.length >= 20) { omitir('ya tiene 20 items'); continue; }
            if (sub.schedule) { omitir('tiene un cambio programado: correr de nuevo cuando se aplique'); continue; }
            const moneda = String(sub.currency || '').toLowerCase();
            const precio = prices[plan];
            if (moneda !== precio.currency && !precio.currency_options?.[moneda]) { omitir(`el Price us_tax de ${plan} no tiene opción ${moneda.toUpperCase()}`); continue; }

            if (apply) {
                await request('/v1/subscription_items', {
                    method: 'POST',
                    idempotencyKey: `cord-us-tax-item:${sub.id}:${objetivo}`,
                    params: { subscription: sub.id, price: objetivo, proration_behavior: 'none' },
                });
            }
            out.agregadas.push(`${sub.id} (${plan}, ${moneda.toUpperCase()}${sub.metadata?.org_id ? `, org ${sub.metadata.org_id}` : ''})`);
        }
        if (!page.has_more || !page.data?.length) break;
        starting_after = page.data[page.data.length - 1].id;
    }
    return out;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const args = new Set(process.argv.slice(2));
    const apply = args.has('--apply');
    try {
        const source = readFileSync(new URL('../src/lib/billing.ts', import.meta.url), 'utf8');
        const r = await ensureUsTaxItems({ key: process.env.STRIPE_SECRET_KEY || '', apply, allowLive: args.has('--live'), source });
        console.log(`Modo Stripe: ${r.modo.toUpperCase()} — ${apply ? 'ESCRITURA (--apply)' : 'DRY-RUN: nada se escribió; usa --apply para agregar.'}`);
        console.log(`Suscripciones de Cord vivas revisadas: ${r.revisadas}; ya tenían el item: ${r.yaTenian}; ${apply ? 'agregadas' : 'por agregar'}: ${r.agregadas.length}; omitidas: ${r.omitidas.length}.`);
        for (const a of r.agregadas) console.log(`${apply ? 'agregada' : 'por agregar'}: ${a}`);
        for (const o of r.omitidas) console.log(`omitida: ${o.sub}: ${o.motivo}`);
        if (r.omitidas.length) process.exitCode = 2;
    } catch (error) {
        // Los mensajes nunca incluyen la llave: solo ruta y código del error.
        console.error(error instanceof StripeScriptError ? error.message : `Fallo inesperado: ${error?.message || error}`);
        process.exitCode = 1;
    }
}
