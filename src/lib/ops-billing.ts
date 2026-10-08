// Suscripción de Cord, cuenta de cobros y dinero de una organización, vistos
// desde Ops. Las funciones que devuelven `sql` son constructores: el llamador
// las ejecuta en withOpsTx. Las demás son puras y se prueban sin base.
import { sql } from './db';
import { fromMinorUnits } from './currency';
import { platformCurrencyFor, type PlatformCurrency } from './plan-currency';
import { hasPaidBillingEvidence, normalizePlan } from './entitlements';
import { MESES_POR_ANIO, PLANES } from './precios';

/**
 * Suscripción y cuenta de cobros. `effective_plan` es el ACCESO efectivo:
 * plan pagado o cortesía, lo que sea mayor. Lo pagado se decide aparte con
 * hasPaidBillingEvidence (regla 17).
 */
export function opsOrgBilling(orgId: string) {
  return sql`select o.id, coalesce(o.plan, 'free') plan, cord_effective_plan(o.id) effective_plan,
      o.subscription_status, o.billing_cycle, o.current_period_end, o.cancel_at_period_end,
      o.billing_currency, o.billing_paid_plan, o.billing_paid_through, o.billing_last_paid_at,
      o.billing_last_amount_paid, o.billing_last_invoice_id, o.stripe_customer_id, o.stripe_subscription_id,
      o.stripe_account_id, o.stripe_charges_enabled, o.stripe_payouts_enabled, o.stripe_details_submitted,
      o.stripe_disabled_reason, o.stripe_requirements, o.country_code
    from orgs o where o.id = ${orgId} limit 1`;
}

export const opsOrgPayouts = (orgId: string, limit = 6) => sql`
  select id, amount_cents, currency, status, arrival_date, metodo, destino_last4, failure_message, created_at
  from payouts where org_id = ${orgId} order by created_at desc limit ${limit}`;

export const opsOrgRefunds = (orgId: string, limit = 6) => sql`
  select id, amount_cents, currency, status, reason, manual, failure_reason, created_at
  from cobro_reembolsos where org_id = ${orgId} order by created_at desc limit ${limit}`;

// Primero las disputas que siguen abiertas: tienen fecha límite de evidencia.
export const opsOrgDisputes = (orgId: string, limit = 6) => sql`
  select id, amount_cents, currency, reason, status, evidence_due_at, evidence_submitted_at, created_at
  from cobro_disputas where org_id = ${orgId}
  order by (status in ('won', 'lost', 'charge_refunded', 'warning_closed')) asc, created_at desc
  limit ${limit}`;

/** Facturas de la suscripción de Cord a esta organización. */
export const opsOrgSubscriptionInvoices = (orgId: string, limit = 6) => sql`
  select stripe_invoice_id, status, invoice_number, currency, total_cents, invoice_error, issued_at, created_at
  from suscripcion_facturas where org_id = ${orgId} order by created_at desc limit ${limit}`;

/** Importe en unidades mínimas → importe con su divisa (regla 21: nunca ×100 a mano). */
export function opsMinor(amount: unknown, currency: unknown): number {
  const code = typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : 'USD';
  return fromMinorUnits(Number(amount || 0), code);
}

// ── Enlaces al panel del proveedor ──────────────────────────────────────────
// Se valida el prefijo del id: un valor raro en la base nunca arma un enlace a
// otra ruta del panel. Solo para Ops (regla 14: la app no nombra al proveedor).
const STRIPE_PATHS = {
  customer: [/^cus_[A-Za-z0-9]+$/, 'customers'],
  subscription: [/^sub_[A-Za-z0-9]+$/, 'subscriptions'],
  account: [/^acct_[A-Za-z0-9]+$/, 'connect/accounts'],
  invoice: [/^in_[A-Za-z0-9]+$/, 'invoices'],
  event: [/^evt_[A-Za-z0-9]+$/, 'events'],
} as const;

export function stripeDashboardUrl(kind: keyof typeof STRIPE_PATHS, id: unknown): string | null {
  const [pattern, path] = STRIPE_PATHS[kind];
  return typeof id === 'string' && pattern.test(id) ? `https://dashboard.stripe.com/${path}/${id}` : null;
}

// ── Requisitos de la cuenta de cobros ───────────────────────────────────────
export interface OpsConnectRequirements {
  currentlyDue: string[];
  pastDue: string[];
  pendingVerification: string[];
  deadline: Date | null;
}

// Los nombres de campo traen el id de la persona en el proveedor
// (`person_1Abc.id_number`); Ops no lo necesita para saber qué falta.
const fieldName = (value: unknown) => String(value).replace(/\bperson_[A-Za-z0-9]+/g, 'persona').slice(0, 120);
const fieldList = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.filter((v) => typeof v === 'string').map(fieldName))]
  : [];

export function opsConnectRequirements(raw: unknown): OpsConnectRequirements {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const deadline = Number(r.current_deadline);
  return {
    currentlyDue: fieldList(r.currently_due),
    pastDue: fieldList(r.past_due),
    pendingVerification: fieldList(r.pending_verification),
    deadline: Number.isFinite(deadline) && deadline > 0 ? new Date(deadline * 1000) : null,
  };
}

// ── Ingresos recurrentes ────────────────────────────────────────────────────
/** Organizaciones con suscripción o rastro de una, con su plan pagado real. */
export const opsRevenueOrgs = () => sql`
  select o.id, o.nombre, o.country_code, coalesce(o.plan, 'free') plan, cord_effective_plan(o.id) effective_plan,
         o.billing_cycle, o.billing_currency, o.subscription_status, o.cancel_at_period_end,
         o.current_period_end, o.billing_paid_through, o.billing_paid_plan, o.billing_last_paid_at,
         o.stripe_subscription_id, o.stripe_customer_id, o.created_at,
         (select g.plan from ops_plan_grants g
           where g.org_id = o.id and g.status = 'active' and g.expires_at > now() limit 1) grant_plan
  from orgs o
  where o.sandbox_of is null and not coalesce(o.is_demo, false)
    and (o.stripe_subscription_id is not null or o.subscription_status is not null or coalesce(o.plan, 'free') <> 'free'
      or exists (select 1 from ops_plan_grants g where g.org_id = o.id and g.status = 'active' and g.expires_at > now()))
  order by o.created_at desc
  limit 5000`;

export interface OpsRevenueOrg {
  id: string; nombre: string; country_code: string | null; plan: string; effective_plan: string;
  billing_cycle: string | null; billing_currency: string | null; subscription_status: string | null;
  cancel_at_period_end: boolean | null; current_period_end: string | Date | null;
  billing_paid_through?: string | Date | null; billing_paid_plan?: string | null;
  stripe_subscription_id?: string | null; stripe_customer_id?: string | null;
  /** Plan de una cortesía de Ops vigente, si la hay. */
  grant_plan?: string | null;
}

export interface OpsCurrencyRevenue {
  currency: PlatformCurrency;
  mrr: number;
  arr: number;
  paying: number;
  annual: number;
  /** Pagan, pero su plan no tiene precio de lista en esta divisa (Developer en EUR). */
  unpriced: number;
  byPlan: { plan: string; paying: number; mrr: number }[];
}

/** Nombre del plan guardado, con los nombres heredados ya mapeados (business → pro). */
export const opsStoredPlan = (plan: unknown) => normalizePlan(plan);

/**
 * ¿Paga de verdad? La MISMA evidencia que autoriza las capacidades pagadas
 * (`hasPaidBillingEvidence`, regla 17): suscripción activa, periodo vigente y
 * pagado, ids reales y plan pagado al menos igual al guardado. No usa
 * `cord_effective_plan`, que también concede acceso por promoción: una
 * promoción da acceso, pero no es ingreso.
 */
export const opsIsPaying = (row: OpsRevenueOrg, now = new Date()) => hasPaidBillingEvidence({
  plan: row.plan,
  subscriptionStatus: row.subscription_status,
  currentPeriodEnd: row.current_period_end,
  billingPaidThrough: row.billing_paid_through,
  billingPaidPlan: row.billing_paid_plan,
  stripeSubscriptionId: row.stripe_subscription_id,
  stripeCustomerId: row.stripe_customer_id,
}, now);

/**
 * MRR a precio de LISTA, por divisa de la plataforma. No resta descuentos ni
 * suma excedentes medidos: es la base recurrente contratada. Las divisas nunca
 * se suman entre sí (regla 21).
 */
export function summarizeRevenue(rows: OpsRevenueOrg[], now = new Date()): OpsCurrencyRevenue[] {
  const out = new Map<PlatformCurrency, OpsCurrencyRevenue & { plans: Map<string, { paying: number; mrr: number }> }>();
  for (const row of rows) {
    if (!opsIsPaying(row, now)) continue;
    const plan = opsStoredPlan(row.plan);
    const currency = platformCurrencyFor(row.country_code, row.billing_currency);
    const bucket = out.get(currency) ?? { currency, mrr: 0, arr: 0, paying: 0, annual: 0, unpriced: 0, byPlan: [], plans: new Map() };
    out.set(currency, bucket);
    bucket.paying++;
    const annual = row.billing_cycle === 'anual';
    if (annual) bucket.annual++;
    const monthly = PLANES.find((p) => p.id === plan)?.precio[currency];
    const planBucket = bucket.plans.get(plan) ?? { paying: 0, mrr: 0 };
    bucket.plans.set(plan, planBucket);
    planBucket.paying++;
    if (typeof monthly !== 'number') { bucket.unpriced++; continue; }
    // Sin redondear por organización: el anual se factura `monthly × 10` y su
    // MRR es ese total / 12. Redondear aquí y luego multiplicar por 12 hacía
    // que el ARR no cuadrara con lo que de verdad se cobra.
    const yearly = annual ? monthly * MESES_POR_ANIO : monthly * 12;
    bucket.mrr += yearly / 12;
    bucket.arr += yearly;
    planBucket.mrr += yearly / 12;
  }
  return [...out.values()]
    .map(({ plans, ...bucket }) => ({
      ...bucket,
      byPlan: [...plans.entries()].map(([plan, v]) => ({ plan, ...v })).sort((a, b) => b.mrr - a.mrr),
    }))
    .sort((a, b) => b.paying - a.paying);
}

/** Pagan hoy pero ya pidieron cancelar al final del periodo. */
export const opsRevenueCanceling = (rows: OpsRevenueOrg[]) => rows
  .filter((r) => opsIsPaying(r) && r.cancel_at_period_end)
  .sort((a, b) => new Date(a.current_period_end || 0).getTime() - new Date(b.current_period_end || 0).getTime());

/**
 * Tienen un plan de pago guardado, pero el cobro no lo respalda (vencido,
 * impago, inconsistente). Una cortesía vigente no es riesgo: se decidió.
 */
export const opsRevenueAtRisk = (rows: OpsRevenueOrg[]) => rows
  .filter((r) => opsStoredPlan(r.plan) !== 'free' && !opsIsPaying(r) && r.subscription_status !== 'canceled' && !r.grant_plan);

/** Con acceso por cortesía de Ops: no pagan (o pagan menos) a propósito. */
export const opsRevenueCourtesy = (rows: OpsRevenueOrg[]) => rows.filter((r) => !!r.grant_plan);
