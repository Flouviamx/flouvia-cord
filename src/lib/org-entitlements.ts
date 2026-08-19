// Resolución AUTORITATIVA de acceso por organización.
//
// `orgs.plan` es una proyección comercial útil para UI, pero nunca una prueba de
// pago. Toda autorización de capacidades pagadas pasa por este módulo, que exige
// una suscripción activa y un periodo vigente. Las sandboxes heredan el estado
// efectivo de su organización padre en cada consulta para no conservar un plan
// pagado después de una cancelación.

import { sql, withOrgTx } from './db';
import { log } from './log';
import {
    FEATURE_LABEL,
    PLAN_RANK,
    hasPaidBillingEvidence,
    minimumPlan,
    normalizePlan,
    planIncludes,
    resourceLimit,
    type FeatureKey,
    type LimitedResource,
    type PlanId,
} from './entitlements';

const PLAN_LABEL: Record<PlanId, string> = {
    free: 'Gratis', starter: 'Starter', pro: 'Profesional', scale: 'Scale', developer: 'Developer',
};

export interface EntitlementContext {
    requestedOrgId: string;
    billingOrgId: string;
    isSandbox: boolean;
    storedPlan: PlanId;
    effectivePlan: PlanId;
    subscriptionStatus: string | null;
    currentPeriodEnd: Date | null;
    billingPaidThrough: Date | null;
    billingPaidPlan: PlanId;
    stripeSubscriptionId: string | null;
    stripeCustomerId: string | null;
    paidAccess: boolean;
    accessReason: 'free' | 'active' | 'missing_subscription' | 'inactive_status' | 'expired_period' | 'unpaid_period' | 'insufficient_paid_plan';
}

function asDate(value: unknown): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isFinite(date.getTime()) ? date : null;
}

async function readBillingRow(orgId: string): Promise<any | null> {
    const [[row]] = await withOrgTx(orgId, sql`
        select id, sandbox_of, coalesce(plan, 'free') as plan,
               subscription_status, current_period_end, billing_paid_through,
               billing_paid_plan,
               stripe_subscription_id, stripe_customer_id
          from orgs
         where id = ${orgId}
         limit 1`);
    return row ?? null;
}

export async function getEntitlementContext(orgId: string, now = new Date()): Promise<EntitlementContext> {
    const requested = await readBillingRow(orgId);
    if (!requested) throw new Error(`Organización ${orgId} no encontrada`);

    const billingOrgId = requested.sandbox_of ? String(requested.sandbox_of) : orgId;
    const row = billingOrgId === orgId ? requested : await readBillingRow(billingOrgId);
    if (!row) throw new Error(`Organización de facturación ${billingOrgId} no encontrada`);

    const storedPlan = normalizePlan(row.plan);
    const status = row.subscription_status ? String(row.subscription_status) : null;
    const currentPeriodEnd = asDate(row.current_period_end);
    const billingPaidThrough = asDate(row.billing_paid_through);
    const billingPaidPlan = normalizePlan(row.billing_paid_plan);
    const stripeSubscriptionId = row.stripe_subscription_id ? String(row.stripe_subscription_id) : null;
    const stripeCustomerId = row.stripe_customer_id ? String(row.stripe_customer_id) : null;

    const paidAccess = hasPaidBillingEvidence({
        plan: storedPlan,
        subscriptionStatus: status,
        currentPeriodEnd,
        billingPaidThrough,
        billingPaidPlan,
        stripeSubscriptionId,
        stripeCustomerId,
    }, now);
    let accessReason: EntitlementContext['accessReason'] = 'free';
    if (storedPlan !== 'free') {
        if (!stripeSubscriptionId || !stripeCustomerId) {
            accessReason = 'missing_subscription';
        } else if (status !== 'active') {
            accessReason = 'inactive_status';
        } else if (!currentPeriodEnd || currentPeriodEnd.getTime() <= now.getTime()) {
            accessReason = 'expired_period';
        } else if (!billingPaidThrough || billingPaidThrough.getTime() < currentPeriodEnd.getTime()) {
            accessReason = 'unpaid_period';
        } else if (PLAN_RANK[billingPaidPlan] < PLAN_RANK[storedPlan]) {
            accessReason = 'insufficient_paid_plan';
        } else {
            accessReason = 'active';
        }
    }

    return {
        requestedOrgId: orgId,
        billingOrgId,
        isSandbox: billingOrgId !== orgId,
        storedPlan,
        effectivePlan: paidAccess ? storedPlan : 'free',
        subscriptionStatus: status,
        currentPeriodEnd,
        billingPaidThrough,
        billingPaidPlan,
        stripeSubscriptionId,
        stripeCustomerId,
        paidAccess,
        accessReason,
    };
}

export async function getEffectivePlan(orgId: string): Promise<PlanId> {
    return (await getEntitlementContext(orgId)).effectivePlan;
}

export interface EntitlementDecision {
    ok: boolean;
    feature: FeatureKey;
    plan: PlanId;
    requiredPlan: PlanId;
    context: EntitlementContext;
}

export async function checkEntitlement(orgId: string, feature: FeatureKey): Promise<EntitlementDecision> {
    // Deliberadamente fail-closed: si la BD no puede demostrar el derecho, la
    // operación premium no puede continuar.
    const context = await getEntitlementContext(orgId);
    const requiredPlan = minimumPlan(feature);
    return {
        ok: planIncludes(context.effectivePlan, feature),
        feature,
        plan: context.effectivePlan,
        requiredPlan,
        context,
    };
}

export async function requireEntitlement(orgId: string, feature: FeatureKey): Promise<Response | null> {
    try {
        const result = await checkEntitlement(orgId, feature);
        if (result.ok) return null;
        return json({
            error: `${FEATURE_LABEL[feature]} requiere el plan ${PLAN_LABEL[result.requiredPlan]} o superior.`,
            code: 'subscription_required',
            feature,
            plan: result.plan,
            plan_required: result.requiredPlan,
            subscription_status: result.context.subscriptionStatus,
        }, 402);
    } catch (error) {
        log.error('no se pudo verificar el entitlement', { route: 'entitlements', feature, orgId, err: error });
        return json({
            error: 'No pudimos verificar tu suscripción. Intenta de nuevo.',
            code: 'subscription_verification_unavailable',
        }, 503);
    }
}

export async function getResourceAllowance(orgId: string, resource: LimitedResource) {
    const context = await getEntitlementContext(orgId);
    return { context, limit: resourceLimit(context.effectivePlan, resource) };
}

export class ResourceLimitReachedError extends Error {
    constructor(public resource: LimitedResource, public limit: number, public plan: PlanId) {
        super(`Tu plan permite ${limit} ${RESOURCE_LABEL[resource]}. Libera espacio o sube de plan para continuar.`);
        this.name = 'ResourceLimitReachedError';
    }
}

const RESOURCE_LABEL: Record<LimitedResource, string> = {
    active_quotes: 'cotizaciones activas',
    products: 'productos',
    clients: 'clientes',
    seats: 'usuarios',
};

export async function requireResourceCapacity(orgId: string, resource: LimitedResource): Promise<Response | null> {
    try {
        await assertResourceCapacity(orgId, resource);
        return null;
    } catch (error) {
        if (error instanceof ResourceLimitReachedError) {
            return resourceLimitJson(error.resource, error.limit, error.plan);
        }
        log.error('no se pudo verificar el límite de recurso', { route: 'entitlements', resource, orgId, err: error });
        return json({
            error: 'No pudimos verificar los límites de tu plan. Intenta de nuevo.',
            code: 'subscription_verification_unavailable',
        }, 503);
    }
}

export async function assertResourceCapacity(orgId: string, resource: LimitedResource): Promise<void> {
    const { context, limit } = await getResourceAllowance(orgId, resource);
    if (limit === null) return;
    let query: any;
    if (resource === 'active_quotes') {
        query = sql`select count(*)::int as n from cotizaciones
                     where org_id = ${orgId} and status in ('draft','sent','viewed','approved')`;
    } else if (resource === 'products') {
        query = sql`select count(*)::int as n from productos where org_id = ${orgId}`;
    } else if (resource === 'clients') {
        query = sql`select count(*)::int as n from clientes where org_id = ${orgId}`;
    } else {
        query = sql`select count(*)::int as n from org_members
                     where org_id = ${orgId} and estado in ('activo','invitado')`;
    }
    const [[row]] = await withOrgTx(orgId, query);
    if (Number(row?.n ?? 0) >= limit) throw new ResourceLimitReachedError(resource, limit, context.effectivePlan);
}

export function parsedResourceLimit(error: unknown): { resource: LimitedResource; limit: number } | null {
    if (error instanceof ResourceLimitReachedError) return { resource: error.resource, limit: error.limit };
    const message = error instanceof Error ? error.message : String(error || '');
    const match = /cord_limit:(active_quotes|products|clients|seats):(\d+)/.exec(message);
    return match ? { resource: match[1] as LimitedResource, limit: Number(match[2]) } : null;
}

/** Traduce la excepción del trigger DB que cierra carreras concurrentes. */
export function resourceLimitError(error: unknown): Response | null {
    const parsed = parsedResourceLimit(error);
    if (!parsed) return null;
    return resourceLimitJson(parsed.resource, parsed.limit, 'free');
}

function resourceLimitJson(resource: LimitedResource, limit: number, plan: PlanId): Response {
    return json({
        error: `Tu plan permite ${limit} ${RESOURCE_LABEL[resource]}. Libera espacio o sube de plan para continuar.`,
        code: 'plan_limit_reached',
        resource,
        limit,
        plan,
    }, 402);
}

/**
 * Mantiene los datos de miembros excedentes tras un downgrade, pero solo deja
 * operar al owner y a los primeros asientos cubiertos por el plan efectivo.
 * Nunca borra membresías ni depende de la UI.
 */
export async function checkMemberSeatAccess(orgId: string, userId: string): Promise<{ ok: boolean; context: EntitlementContext }> {
    const context = await getEntitlementContext(orgId);
    const limit = resourceLimit(context.effectivePlan, 'seats');
    if (limit === null) return { ok: true, context };

    // La sandbox no tiene una membresía duplicada: su acceso pertenece a la
    // organización padre. Validar contra la sandbox bloquearía incluso al owner.
    const membershipOrgId = context.billingOrgId;
    const [[org], members] = await withOrgTx(membershipOrgId,
        sql`select owner_id from orgs where id = ${membershipOrgId} limit 1`,
        sql`select user_id, rol
              from org_members
             where org_id = ${membershipOrgId} and estado = 'activo' and user_id is not null
             order by (rol = 'owner') desc, joined_at asc nulls first, created_at asc, id asc`,
    );
    if (String(org?.owner_id || '') === userId) return { ok: true, context };
    const covered = members.slice(0, limit).some((member: any) => String(member.user_id) === userId);
    return { ok: covered, context };
}

function json(data: unknown, status: number) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
}
