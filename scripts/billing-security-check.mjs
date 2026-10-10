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

// Contrato aprobado: documentos comerciales Free, emisión fiscal Starter.
const expectedFeatures = {
  cfdi: 'starter', recurring_invoices: 'pro',
  remove_branding: 'starter', custom_email: 'starter', custom_domain: 'pro', advanced_forecast: 'starter',
  international_invoicing: 'free',
  // multi_org salió de la matriz (sep 2026): crear espacios de trabajo es libre
  // y cada uno trae su propio plan.
  team: 'pro', roles: 'pro', live_presence: 'pro', quote_attention: 'pro',
  cfo_dashboard: 'pro',
  audit_log: 'pro', webhook_replay: 'pro', collections: 'pro', cashflow_90: 'pro',
  approvals: 'scale', collections_ai: 'pro', late_interest: 'scale',
  smtp: 'scale', sso: 'scale', agent_governance: 'scale',
  // Sales tax de EE. UU. por dirección: Cord paga el proveedor; la venta
  // registrada además consume su propia cuota (INCLUDED.us_tax).
  us_sales_tax: 'starter',
};
check(JSON.stringify(FEATURE_MIN_PLAN) === JSON.stringify(expectedFeatures), 'La matriz de features cambió sin actualizar la prueba contractual.');
check(!planIncludes('starter', 'custom_domain') && planIncludes('pro', 'custom_domain'), 'Dominio propio debe iniciar en Pro.');
check(normalizePlan('business') === 'pro' && normalizePlan('negocio') === 'pro', 'Los aliases históricos deben normalizarse.');
check(normalizePlan('admin') === 'free' && normalizePlan('') === 'free', 'Un plan desconocido debe caer a Gratis.');
check(!planIncludes('free', 'cfdi') && planIncludes('starter', 'cfdi'), 'La emisión fiscal integrada requiere Starter.');
check(planIncludes('free', 'international_invoicing'), 'Los documentos comerciales deben estar disponibles en Gratis.');
check(!planIncludes('free', 'us_sales_tax') && planIncludes('starter', 'us_sales_tax'), 'El sales tax automático por dirección requiere Starter (cada cálculo le cuesta a Cord).');
check(!planIncludes('starter', 'collections') && planIncludes('pro', 'collections'), 'Cobranza debe iniciar en Pro.');
check(!planIncludes('starter', 'collections_ai') && planIncludes('pro', 'collections_ai'), 'Cobranza con IA debe iniciar en Profesional.');
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
const quoteApi = read('src/lib/actions/quotes.ts');
check(read('src/pages/api/cotizaciones/[id].ts').includes('runQuoteAction('), 'La ruta de cotización debe delegar en la capa de acciones.');
const apiKeyAuth = read('src/lib/apikey.ts');
const apiKeys = read('src/pages/api/keys.ts');
const outgoingWebhooks = read('src/lib/webhooks.ts');
const webhooksApi = read('src/lib/actions/webhooks.ts');
const vercel = read('vercel.json');

check(billing.includes('envios: 5') && /starter:\s*\{[^}]*envios:\s*null/.test(billing), 'El tope de envíos/mes debe ser exclusivo de Gratis (5), sin número en el resto de los planes.');
check(/free:\s*\{[^}]*cfdi:\s*0[^}]*docs:\s*10/.test(billing), 'Gratis incluye 10 documentos comerciales al mes y ninguna factura fiscal.');
check(read('src/lib/fiscal/issuance-usage.ts').includes("reserveUsage(orgId, 'documento', 1)"), 'Los documentos comerciales deben consumir su propia cuota, no la fiscal.');
check(read('src/lib/billing-reconcile.ts').includes('syncSeatUsageAll()'), 'Los asientos extra deben reportarse cada periodo, no solo al unirse un miembro.');
check(billing.includes("if (dim === 'envios' || dim === 'documento') return false;"), 'Envíos y documentos comerciales nunca tienen excedente facturable — son tope duro puro, sin meter.');
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
check(schema.includes("dimension in ('api','usuario','ia','timbrado','envios','documento','us_tax')"), 'El CHECK de usage_reservations debe aceptar las siete dimensiones que reserva el código (envios, documento y us_tax incluidas).');
check(!schema.includes("dimension in ('api','usuario','ia','timbrado','envios'))"), 'Ninguna declaración del CHECK de usage_reservations puede quedarse con la lista vieja: db:migrate fallaría al re-declararla sobre filas nuevas.');

// Sales tax automático de EE. UU. (oct 2026): su propia cuota y su propio
// excedente, nunca los del timbre (decisión de André: el timbre cobra USD 0.15
// y la venta registrada le cuesta USD 0.50 a Cord).
check(/free:\s*\{[^}]*us_tax:\s*0\s*\}/.test(billing) && /starter:\s*\{[^}]*us_tax:\s*10\s*\}/.test(billing)
      && /pro:\s*\{[^}]*us_tax:\s*25\s*\}/.test(billing) && /scale:\s*\{[^}]*us_tax:\s*60\s*\}/.test(billing)
      && /developer:\s*\{[^}]*us_tax:\s*150\s*\}/.test(billing), 'INCLUDED.us_tax debe ser 0/10/25/60/150 (Gratis/Starter/Profesional/Scale/Developer).');
check(billing.includes("timbrado: 'cfdi'") && billing.includes("us_tax: 'us_tax'"), 'us_tax cuenta en su propia columna de uso_periodo, no en cfdi.');
check(/export function overageBillable[\s\S]{0,200}allowsOverage\(plan, dim\) && meterConfigured\(plan, dim\)/.test(billing), 'Sin meter y Price configurados no hay excedente: lo incluido es tope duro (fallo cerrado).');
check(/function usageHardCap[\s\S]{0,200}overageBillable\(plan, dim\)/.test(billing) && /meterEligible[\s\S]{0,160}overageBillable\(plan, dim\)/.test(billing),
      'El techo y la elegibilidad del meter deben depender de que el meter exista, no solo del contrato.');
check(/export const OPTIONAL_METER_DIMS[^\n]*\['us_tax'\]/.test(billing), 'El medidor us_tax es opcional para conceder el plan (se agregó con suscripciones vivas).');
check(webhook.includes('requiredMeterPrices(') && !/Object\.values\(METER_PRICES\[plan[^\n]*\n\s*\.filter\(Boolean\)\s*\n\s*\.every/.test(webhook),
      'El webhook concede el plan con los medidores REQUERIDOS: llenar el id de us_tax no puede bajar a Gratis a quien ya paga.');
check(read('src/lib/billing-reconcile.ts').includes('requiredMeterPrices(plan)') && read('src/lib/billing-reconcile.ts').includes('Suscripción sin un medidor opcional'),
      'El reconciliador concede con los medidores requeridos y avisa a Ops del opcional que falte.');
check(/export function meterPricesFor[\s\S]{0,300}filter\(\(id\): id is string => Boolean\(id\)\)/.test(billing), 'El checkout nunca manda un Price vacío (us_tax sin configurar).');
check(/if \(column === 'us_tax'\)[\s\S]{0,1600}options\.deferMeter \? 'reserved' : 'committed'/.test(billing), 'La venta con sales tax se reserva diferida: el excedente se calcula al confirmar el registro.');
check(/us_tax = greatest\(0, u\.us_tax - /.test(billing), 'cancelUsage debe devolver la unidad de us_tax.');
check(/export async function commitUsTaxUsage[\s\S]{0,600}overageBillable\(plan, 'us_tax'\)/.test(billing), 'La confirmación de us_tax solo manda excedente con meter configurado.');
const usTaxCalc = read('src/lib/us-tax/calculo.ts');
const iReserva = usTaxCalc.indexOf('reservarUsoTransaccion(orgId, objetivo.id)');
const iRegistro = usTaxCalc.indexOf('createUsTaxTransaction(String(calc.stripe_account_id)');
check(iReserva > 0 && iRegistro > iReserva, 'La unidad de us_tax se reserva ANTES de registrar la venta con el proveedor (regla 17).');
check(/catch \(error\) \{[\s\S]{0,300}liberarUsoTransaccion\(/.test(usTaxCalc.slice(iRegistro)), 'Un registro fallido libera su unidad de us_tax.');
check(/assertUsTaxCuota\(orgId, locale\)/.test(usTaxCalc), 'El documento con sales tax automático verifica la cuota antes de guardarse.');
check(queries.includes('canRemoveBranding') && queries.includes('portalPowered: canRemoveBranding'), 'El link público debe restituir la marca tras downgrade.');
check(queries.includes('can_manage_billing') && read('src/pages/app/ajustes/plan.astro').includes('BILL.canManage'), 'Un impago debe revocar funciones sin ocultar la recuperación del Portal.');
check(email.includes('canCustomizeEmail') && email.includes('canRemoveBranding'), 'El correo debe aplicar entitlements efectivos.');
// El gate por plan se movió de saml.ts a la función SQL cord_resolve_sso_connection
// (auditoría de tenancy, ago 2026): el id de conexión llega SIN sesión, así que
// se resuelve con una función estrecha. La garantía es la misma y se sigue
// verificando en los dos extremos — que el filtro exista en la función, y que
// saml.ts no tenga otra puerta que se la salte.
check(schema.includes("cord_effective_plan(c.org_id) in ('scale', 'developer')")
      && saml.includes('cord_resolve_sso_connection'),
      'Las URLs SAML públicas deben dejar de operar tras downgrade.');
// Mismo movimiento que arriba: el descubrimiento por dominio de correo también
// llega sin sesión y se resuelve con cord_resolve_sso_domain, que conserva el
// filtro por plan efectivo dentro de la función.
check(schema.includes("cord_effective_plan(o.id) in ('scale', 'developer')")
      && ssoDiscover.includes('cord_resolve_sso_domain'),
      'SSO discovery debe usar el plan efectivo.');
check(quoteApi.includes("'international_invoicing'") && read('src/lib/fiscal/invoices.ts').includes("planIncludes(await getEffectivePlan(orgId), 'cfdi')"), 'El acceso comercial es Free; la emisión fiscal valida el plan efectivo en el dominio.');
check(apiKeyAuth.includes('active_rank') && apiKeyAuth.includes('subscription_key_limit'), 'Las API keys excedentes deben apagarse tras downgrade.');
check(apiKeys.includes("pg_advisory_xact_lock(hashtextextended(${'api_keys:' + orgId}"), 'La creación concurrente de API keys debe serializarse.');
check(outgoingWebhooks.includes('position <= ${allowance}') && outgoingWebhooks.includes('webhookLimit(String(planRow'), 'Los webhooks excedentes deben apagarse tras downgrade.');
check(webhooksApi.includes("pg_advisory_xact_lock(hashtextextended(${'webhooks:' + ctx.orgId}"), 'La creación concurrente de webhooks debe serializarse.');
check(read('src/pages/api/webhooks.ts').includes('createWebhookEndpoint(') && read('src/pages/api/v1/webhooks.ts').includes('createWebhookEndpoint('), 'App y API deben crear webhooks con la misma acción.');
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
