import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  FEATURE_MIN_PLAN,
  RESOURCE_LIMITS,
  hasPaidBillingEvidence,
  normalizePlan,
  planIncludes,
} from '../src/lib/entitlements.ts';

const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), 'utf8');
let assertions = 0;
const check = (condition, message) => { assertions++; assert.ok(condition, message); };

// Matriz ago 2026 (delimitación de planes): `collections`/`cashflow_90` bajan a
// Pro (van con cfo_dashboard, que ya vivía ahí) y `international_invoicing` baja
// a Starter para quedar en el mismo peldaño que `cfdi` — mismo carril de
// facturación electrónica, distinto solo por país. Ver entitlements.ts y
// docs/negocio-billing.md.
const expectedFeatures = {
  cfdi: 'starter', remove_branding: 'starter', custom_email: 'starter', advanced_forecast: 'starter',
  international_invoicing: 'starter',
  team: 'pro', roles: 'pro', multi_org: 'pro', live_presence: 'pro', quote_attention: 'pro',
  cfo_dashboard: 'pro',
  audit_log: 'pro', webhook_replay: 'pro', collections: 'pro', cashflow_90: 'pro',
  approvals: 'scale', collections_ai: 'scale', late_interest: 'scale',
  smtp: 'scale', sso: 'scale', agent_governance: 'scale',
};
check(JSON.stringify(FEATURE_MIN_PLAN) === JSON.stringify(expectedFeatures), 'La matriz de features cambió sin actualizar la prueba contractual.');
check(normalizePlan('business') === 'pro' && normalizePlan('negocio') === 'pro', 'Los aliases históricos deben normalizarse.');
check(normalizePlan('admin') === 'free' && normalizePlan('') === 'free', 'Un plan desconocido debe caer a Gratis.');
check(!planIncludes('free', 'cfdi') && planIncludes('starter', 'cfdi'), 'CFDI debe iniciar en Starter.');
check(!planIncludes('free', 'international_invoicing') && planIncludes('starter', 'international_invoicing'), 'Facturación internacional debe iniciar en Starter, en paridad con CFDI.');
check(!planIncludes('starter', 'collections') && planIncludes('pro', 'collections'), 'Cobranza debe iniciar en Pro.');
check(!planIncludes('pro', 'collections_ai') && planIncludes('scale', 'collections_ai'), 'Cobranza autónoma con IA debe iniciar en Scale.');
check(!planIncludes('pro', 'approvals') && planIncludes('scale', 'approvals'), 'Aprobaciones deben iniciar en Scale.');
check(!planIncludes('starter', 'quote_attention') && planIncludes('pro', 'quote_attention'), 'La atención del cliente debe iniciar en Pro, en paridad con la presencia en vivo.');
// El link público del cliente NUNCA se gatea por plan: lo que se cobra es el
// panel del vendedor. Si el gate se colara al carril público, una org en Gratis
// dejaría de poder cobrar por su propio link.
check(!read('src/pages/api/q/[token].ts').includes('requireEntitlement'), 'El carril público /api/q/[token] no debe gatearse por plan.');
check(!read('src/pages/api/q/[token]/stream.ts').includes('requireEntitlement'), 'El stream del link público no debe gatearse por plan.');
check(read('src/pages/api/cotizaciones/[id]/atencion.ts').includes("requireEntitlement(orgId, 'quote_attention')"), 'El panel de atención debe autorizarse en el endpoint, no solo ocultando la UI.');
check(RESOURCE_LIMITS.free.active_quotes === 5 && RESOURCE_LIMITS.starter.active_quotes === 50, 'Límites de cotizaciones incorrectos.');
check(RESOURCE_LIMITS.free.products === 50 && RESOURCE_LIMITS.starter.products === 500, 'Límites de productos incorrectos.');
check(RESOURCE_LIMITS.free.clients === 50 && RESOURCE_LIMITS.starter.clients === 500, 'Límites de clientes incorrectos.');
check(RESOURCE_LIMITS.free.seats === 1 && RESOURCE_LIMITS.starter.seats === 1, 'Free y Starter deben tener un asiento duro.');
check(RESOURCE_LIMITS.pro.seats === null && RESOURCE_LIMITS.scale.seats === null, 'Pro y Scale deben permitir asientos con overage.');

const now = new Date('2026-08-13T12:00:00.000Z');
const valid = {
  plan: 'pro', subscriptionStatus: 'active',
  currentPeriodEnd: '2026-09-01T00:00:00.000Z', billingPaidThrough: '2026-09-01T00:00:00.000Z',
  billingPaidPlan: 'pro',
  stripeSubscriptionId: 'sub_valid', stripeCustomerId: 'cus_valid',
};
check(hasPaidBillingEvidence(valid, now), 'La evidencia pagada válida debe conceder acceso.');
for (const status of ['trialing', 'past_due', 'unpaid', 'paused', 'incomplete', 'incomplete_expired', 'canceled']) {
  check(!hasPaidBillingEvidence({ ...valid, subscriptionStatus: status }, now), `${status} no debe conceder acceso.`);
}
check(!hasPaidBillingEvidence({ ...valid, plan: 'free' }, now), 'Gratis nunca es evidencia pagada.');
check(!hasPaidBillingEvidence({ ...valid, currentPeriodEnd: '2026-08-12T00:00:00.000Z' }, now), 'Un periodo vencido no debe conceder acceso.');
check(!hasPaidBillingEvidence({ ...valid, billingPaidThrough: '2026-08-31T23:59:59.000Z' }, now), 'El pago debe cubrir todo el periodo.');
check(!hasPaidBillingEvidence({ ...valid, stripeSubscriptionId: null }, now), 'Sin subscription id no hay acceso.');
check(!hasPaidBillingEvidence({ ...valid, stripeCustomerId: null }, now), 'Sin customer id no hay acceso.');
check(!hasPaidBillingEvidence({ ...valid, billingPaidPlan: 'starter' }, now), 'Un pago Starter no puede autorizar Pro.');
check(hasPaidBillingEvidence({ ...valid, plan: 'starter', billingPaidPlan: 'pro' }, now), 'Un pago superior sí puede cubrir un downgrade.');

const billing = read('src/lib/billing.ts');
const webhook = read('src/pages/api/stripe/webhook.ts');
const subscribe = read('src/pages/api/billing/subscribe.ts');
const schema = read('db/schema.sql');
const queries = read('src/lib/queries.ts');
const email = read('src/lib/email.ts');
const saml = read('src/lib/saml.ts');
const ssoDiscover = read('src/pages/api/auth/sso/discover.ts');
const quoteApi = read('src/pages/api/cotizaciones/[id].ts');
const apiKeyAuth = read('src/lib/apikey.ts');
const apiKeys = read('src/pages/api/keys.ts');
const outgoingWebhooks = read('src/lib/webhooks.ts');
const webhooksApi = read('src/pages/api/webhooks.ts');
const vercel = read('vercel.json');

check(billing.includes('envios: 5') && /starter:\s*\{[^}]*envios:\s*null/.test(billing), 'El tope de envíos/mes debe ser exclusivo de Gratis (5), sin número en el resto de los planes.');
check(billing.includes("if (dim === 'envios') return false;"), 'Envíos nunca debe tener excedente facturable — es tope duro puro, sin meter.');
check(billing.includes("'payload[value]': String(row.meter_value)"), 'Stripe debe recibir solo meter_value.');
check(!billing.includes("'payload[value]': String(row.value)"), 'Nunca se debe cobrar el consumo total incluido.');
check(billing.includes('pg_advisory_xact_lock') && billing.includes('usage_reservations'), 'La cuota debe reservarse con lock y outbox.');
check(billing.includes('allowsOverage(plan, dim)'), 'El overage debe decidirse por plan y dimensión.');
check(subscribe.includes('Idempotency-Key') || subscribe.includes('idempotencyKey'), 'Checkout debe usar idempotencia Stripe.');
check(subscribe.includes('billing_checkout_attempts'), 'Checkout debe tener exclusión durable por organización.');
check(subscribe.includes("existingStatus === 'incomplete' && !sameSelection"), 'Un intento incompleto de OTRO plan debe poder abandonarse: el lock no puede dejar la cuenta sin contratar nada hasta expirar.');
check(subscribe.includes('if (cancelFirst)') && subscribe.includes("'DELETE', { version: STRIPE_VERSION }"), 'Abandonar un intento debe cancelar primero en Stripe, para no dejar una suscripción viva sin registro local.');
check(/active[\s\S]{0,400}past_due/.test(subscribe) && subscribe.includes('Ya hay un pago de suscripción en proceso'), 'Un intento con dinero de por medio (active/past_due) debe seguir bloqueando el alta de otra suscripción.');
check(subscribe.includes('/v1/subscriptions/${billing.stripe_subscription_id}'), 'Una suscripción local existente debe verificarse contra Stripe.');
check(subscribe.includes('pending_if_incomplete') && subscribe.includes('schedulePlanChange'), 'Upgrades y downgrades deben tener flujos de cambio pagado/programado.');
check(subscribe.includes("cycle === 'anual'") && subscribe.includes('checkout_mixed_interval_unsupported'), 'Checkout alojado no debe intentar intervalos mixtos no soportados.');
check(webhook.includes("const grantsPlan = status === 'active'"), 'Solo active puede proyectar un plan pagado.');
check(webhook.includes('hasRequiredMeterItems'), 'Un plan no debe activarse sin todos sus precios medidos.');
check(!webhook.includes('metaPlan'), 'Metadata no debe sustituir al Price real para decidir el plan.');
check(webhook.includes('billing_paid_through') && webhook.includes('amountPaid <= 0'), 'El webhook debe exigir factura cobrada y periodo cubierto.');
check(webhook.includes('basePlanItem') && webhook.includes('!baseLines.length && amountPaid <= 0'), 'Las facturas auxiliares no deben invalidar el precio base anual.');
check(read('src/lib/billing-reconcile.ts').includes('paidBaseInvoice'), 'El reconciliador debe localizar la factura pagada del precio base.');
check(schema.includes('create unique index if not exists uq_billing_checkout_open_org'), 'Falta la exclusión concurrente de checkout.');
check(schema.includes('create trigger trg_limit_productos') && schema.includes('create trigger trg_limit_clientes') && schema.includes('create trigger trg_limit_cotizaciones'), 'Faltan límites concurrentes en PostgreSQL.');
check(schema.includes('alter table usage_reservations force row level security'), 'El outbox debe tener FORCE RLS.');
check(schema.includes("dimension in ('api','usuario','ia','timbrado','envios')"), 'El CHECK de usage_reservations debe aceptar la dimensión envios.');
check(queries.includes('canRemoveBranding') && queries.includes('portalPowered: canRemoveBranding'), 'El link público debe restituir la marca tras downgrade.');
check(queries.includes('can_manage_billing') && read('src/pages/app/ajustes/plan.astro').includes('BILL.canManage'), 'Un impago debe revocar funciones sin ocultar la recuperación del Portal.');
check(email.includes('canCustomizeEmail') && email.includes('canRemoveBranding'), 'El correo debe aplicar entitlements efectivos.');
check(saml.includes("cord_effective_plan(c.org_id) in ('scale', 'developer')"), 'Las URLs SAML públicas deben dejar de operar tras downgrade.');
check(ssoDiscover.includes('cord_effective_plan(o.id)'), 'SSO discovery debe usar el plan efectivo.');
check(quoteApi.includes("isMexico ? 'cfdi' : 'international_invoicing'"), 'La emisión debe rutear por país a su propio feature — CFDI en México, factura comercial en el resto — sin consumir la cuota de la otra.');
check(apiKeyAuth.includes('active_rank') && apiKeyAuth.includes('subscription_key_limit'), 'Las API keys excedentes deben apagarse tras downgrade.');
check(apiKeys.includes("pg_advisory_xact_lock(hashtextextended(${'api_keys:' + orgId}"), 'La creación concurrente de API keys debe serializarse.');
check(outgoingWebhooks.includes('position <= allowance'), 'Los webhooks excedentes deben apagarse tras downgrade.');
check(webhooksApi.includes("pg_advisory_xact_lock(hashtextextended(${'webhooks:' + orgId}"), 'La creación concurrente de webhooks debe serializarse.');
check(vercel.includes('/api/cron/billing-reconcile'), 'Falta programar la reconciliación de Billing.');

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (['.ts', '.tsx', '.astro', '.js', '.mjs'].includes(extname(entry.name))) out.push(path);
  }
  return out;
}
const legacyUsageCallers = sourceFiles(join(root, 'src'))
  .filter((path) => !path.endsWith('/lib/billing.ts'))
  .filter((path) => /\breportUsage\s*\(/.test(readFileSync(path, 'utf8')));
check(legacyUsageCallers.length === 0, `Hay consumidores que aún miden después de ejecutar: ${legacyUsageCallers.join(', ')}`);

console.log(`Billing security check: ${assertions} verificaciones aprobadas.`);
