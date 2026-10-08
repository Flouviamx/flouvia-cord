// Cortesías de Cord Ops: días gratis y planes regalados.
//
// Un regalo NO es evidencia de pago (regla 17). Vive en `ops_plan_grants`, da
// ACCESO por un tiempo (cord_access_grant) y, solo donde tiene sentido, Stripe
// deja de cobrar:
//   - días gratis a quien paga → se mueve su próximo cobro (`trial_end`, sin
//     prorrateo). La suscripción queda en `trialing`, que NO da acceso pagado;
//     por eso la cortesía cubre ese tiempo.
//   - plan regalado a quien paga MENSUAL ese mismo plan → cupón del 100 % solo
//     sobre el producto base (los excedentes medidos se siguen cobrando),
//     repetido N meses, de un solo uso.
//   - todo lo demás (Gratis, anual, regalar un plan superior) → solo acceso,
//     sin tocar Stripe. Un cupón sobre un anual regalaría el año completo, y
//     crear una suscripción para alguien sin tarjeta termina en cobranza.
// Mientras el plan efectivo venga de una cortesía, lo incluido es tope duro y
// nada va al medidor (org-entitlements `overageAllowed`).
//
// Este archivo decide; no llama a Stripe ni a la base. La ruta ejecuta.
import { PLAN_RANK, type PlanId } from './entitlements';
import { PLANES } from './precios';

const label = (plan: PlanId) => PLANES.find((p) => p.id === plan)?.nombre ?? plan;

export type GrantPlan = Exclude<PlanId, 'free'>;
export const GRANT_PLANS: GrantPlan[] = ['starter', 'pro', 'scale', 'developer'];
export const GRANT_MAX_DAYS = 60;
export const GRANT_MAX_MONTHS = 12;
/**
 * Días de margen de la cortesía después del último periodo sin cobro: la
 * primera factura real se cobra al renovar y el webhook la sella después; sin
 * margen, ese rato el negocio caería a Gratis.
 */
export const GRANT_MARGIN_DAYS = 3;

export interface GrantRequest {
  kind: 'dias' | 'plan';
  /** Días (kind=dias) o meses (kind=plan). */
  amount: number;
  /** Plan regalado. En días gratis a quien paga, se ignora: se conserva el suyo. */
  plan: GrantPlan | null;
  reason: string;
}

/** Lo que Ops sabe de la organización y de su suscripción EN STRIPE (no de orgs). */
export interface GrantSubject {
  isSandbox: boolean;
  /** hasPaidBillingEvidence(): paga de verdad hoy. */
  paying: boolean;
  paidPlan: PlanId;
  subscription: null | {
    id: string;
    status: string;
    cycle: 'mensual' | 'anual' | null;
    periodEnd: Date | null;
    baseProduct: string | null;
    hasSchedule: boolean;
    hasDiscounts: boolean;
    cancelAtPeriodEnd: boolean;
  };
  activeGrant: boolean;
}

export type GrantPlanResult =
  | { ok: false; error: string }
  | {
      ok: true;
      mechanism: 'acceso' | 'trial' | 'cupon';
      plan: GrantPlan;
      expiresAt: Date;
      trialEnd?: Date;
      couponMonths?: number;
      /** Qué va a pasar, en una frase, para confirmar antes de ejecutar. */
      summary: string;
    };

const DAY = 86_400_000;
const fmt = (d: Date) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
export function addMonthsUtc(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}

export function parseGrantRequest(body: any): GrantRequest | { error: string } {
  const kind = body?.kind === 'dias' || body?.kind === 'plan' ? body.kind : null;
  if (!kind) return { error: 'Elige días gratis o plan regalado.' };
  const amount = Number(body?.amount);
  const max = kind === 'dias' ? GRANT_MAX_DAYS : GRANT_MAX_MONTHS;
  if (!Number.isInteger(amount) || amount < 1 || amount > max) {
    return { error: kind === 'dias' ? `Los días van de 1 a ${GRANT_MAX_DAYS}.` : `Los meses van de 1 a ${GRANT_MAX_MONTHS}.` };
  }
  const plan = GRANT_PLANS.includes(body?.plan) ? body.plan as GrantPlan : null;
  if (kind === 'plan' && !plan) return { error: 'Elige el plan que se regala.' };
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 300) return { error: 'Escribe el motivo (de 3 a 300 caracteres). Queda en la bitácora.' };
  return { kind, amount, plan, reason };
}

export function planGrant(req: GrantRequest, s: GrantSubject, now = new Date()): GrantPlanResult {
  if (s.isSandbox) return { ok: false, error: 'Una sandbox hereda el plan de su organización: la cortesía se da a la organización real.' };
  if (s.activeGrant) return { ok: false, error: 'Ya tiene una cortesía vigente. Revócala antes de dar otra.' };
  const sub = s.subscription;
  const live = sub && sub.status === 'active' && s.paying && s.paidPlan !== 'free' ? sub : null;
  if (sub && sub.status === 'trialing') return { ok: false, error: 'Su suscripción ya está en un periodo sin cobro. Espera a que termine o revócalo primero.' };

  if (req.kind === 'dias') {
    if (live) {
      if (live.hasSchedule) return { ok: false, error: 'Tiene un cambio de plan programado; mover su fecha de cobro lo rompería. Resuélvelo primero.' };
      if (live.cancelAtPeriodEnd) return { ok: false, error: 'Pidió cancelar al cierre del periodo: extenderle días cambiaría cuándo se va. Habla con él primero.' };
      if (!live.periodEnd || live.periodEnd.getTime() <= now.getTime()) return { ok: false, error: 'No se pudo leer el fin de su periodo en el procesador.' };
      const trialEnd = new Date(live.periodEnd.getTime() + req.amount * DAY);
      const plan = s.paidPlan as GrantPlan;
      return {
        ok: true, mechanism: 'trial', plan, trialEnd,
        expiresAt: new Date(trialEnd.getTime() + GRANT_MARGIN_DAYS * DAY),
        summary: `Su próximo cobro pasa del ${fmt(live.periodEnd)} al ${fmt(trialEnd)} en el procesador, sin prorrateo. Conserva ${label(plan)} sin excedentes cobrables hasta entonces.`,
      };
    }
    if (!req.plan) return { ok: false, error: 'No paga hoy: elige qué plan le das durante esos días.' };
    const expiresAt = new Date(now.getTime() + req.amount * DAY);
    return { ok: true, mechanism: 'acceso', plan: req.plan, expiresAt, summary: `Tendrá ${label(req.plan)} hasta el ${fmt(expiresAt)}, sin tocar el procesador ni pedir tarjeta. Lo incluido es su tope: no hay excedentes.` };
  }

  // Plan regalado.
  const plan = req.plan!;
  if (live) {
    const sameOrLower = PLAN_RANK[plan] <= PLAN_RANK[s.paidPlan];
    if (sameOrLower && plan !== s.paidPlan) return { ok: false, error: `Ya paga ${label(s.paidPlan)}, que incluye ${label(plan)}. Para dejar de cobrarle, regala su mismo plan.` };
    if (plan === s.paidPlan) {
      if (live.cycle !== 'mensual') return { ok: false, error: 'Paga anual: un cupón regalaría el año completo. En un anual solo se puede regalar un plan superior.' };
      if (live.hasDiscounts) return { ok: false, error: 'Su suscripción ya tiene un descuento; un cupón nuevo lo reemplazaría.' };
      if (live.hasSchedule) return { ok: false, error: 'Tiene un cambio de plan programado. Resuélvelo antes de regalar meses.' };
      if (live.cancelAtPeriodEnd) return { ok: false, error: 'Pidió cancelar al cierre del periodo; un cupón no aplicaría. Habla con él primero.' };
      if (!live.baseProduct) return { ok: false, error: 'No se pudo leer el producto de su plan en el procesador.' };
      if (!live.periodEnd || live.periodEnd.getTime() <= now.getTime()) return { ok: false, error: 'No se pudo leer el fin de su periodo en el procesador.' };
      const lastFree = addMonthsUtc(live.periodEnd, req.amount);
      return {
        ok: true, mechanism: 'cupon', plan, couponMonths: req.amount,
        expiresAt: new Date(lastFree.getTime() + GRANT_MARGIN_DAYS * DAY),
        summary: `Sus próximas ${req.amount === 1 ? 'mensualidad sale' : `${req.amount} mensualidades salen`} en $0 con un cupón del 100 % solo sobre el plan base; los excedentes se siguen cobrando. Vuelve a pagar normal desde el ${fmt(lastFree)}.`,
      };
    }
    // Regalar un plan SUPERIOR a quien paga: se le sigue cobrando el suyo.
    const expiresAt = addMonthsUtc(now, req.amount);
    return { ok: true, mechanism: 'acceso', plan, expiresAt, summary: `Tendrá ${label(plan)} hasta el ${fmt(expiresAt)} y se le sigue cobrando ${label(s.paidPlan)}. Sin excedentes cobrables mientras dure.` };
  }
  const expiresAt = addMonthsUtc(now, req.amount);
  return { ok: true, mechanism: 'acceso', plan, expiresAt, summary: `Tendrá ${label(plan)} hasta el ${fmt(expiresAt)}, sin tocar el procesador ni pedir tarjeta. Lo incluido es su tope: no hay excedentes.` };
}

export const OPS_GRANT_MECHANISM: Record<string, string> = {
  acceso: 'Solo acceso', trial: 'Cobro movido', cupon: 'Cupón del 100 %',
};
