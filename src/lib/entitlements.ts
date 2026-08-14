// Contrato comercial EJECUTABLE de Cord.
//
// Esta es la fuente de verdad para decidir qué plan habilita una capacidad y
// cuántos recursos puede crear una organización. La tabla pública de precios
// describe el contrato; este módulo lo hace exigible en servidor.
//
// Regla de seguridad: un nombre de plan guardado en `orgs.plan` NO concede por
// sí solo acceso pagado. `src/lib/org-entitlements.ts` combina este contrato con
// el estado real de la suscripción antes de autorizar una operación.

export const PLAN_IDS = ['free', 'starter', 'pro', 'scale', 'developer'] as const;
export type PlanId = typeof PLAN_IDS[number];
export type PaidPlan = Exclude<PlanId, 'free'>;

export const PLAN_RANK: Record<PlanId, number> = {
    free: 0,
    starter: 1,
    pro: 2,
    scale: 3,
    developer: 4,
};

// Alias históricos. Nunca evitan la verificación del pago: únicamente traducen
// el nombre viejo al nivel comercial equivalente cuando la suscripción sí está
// vigente.
export function normalizePlan(value: unknown): PlanId {
    const plan = String(value || '').toLowerCase();
    if (plan === 'business' || plan === 'negocio') return 'pro';
    return (PLAN_IDS as readonly string[]).includes(plan) ? plan as PlanId : 'free';
}

export type FeatureKey =
    | 'cfdi'
    | 'remove_branding'
    | 'custom_email'
    | 'advanced_forecast'
    | 'team'
    | 'roles'
    | 'multi_org'
    | 'live_presence'
    | 'cfo_dashboard'
    | 'audit_log'
    | 'webhook_replay'
    | 'approvals'
    | 'collections'
    | 'collections_ai'
    | 'late_interest'
    | 'cashflow_90'
    | 'international_invoicing'
    | 'smtp'
    | 'sso'
    | 'agent_governance';

/** Plan mínimo de cada capacidad que NO está incluida en Gratis. */
export const FEATURE_MIN_PLAN: Record<FeatureKey, PaidPlan> = {
    cfdi: 'starter',
    remove_branding: 'starter',
    custom_email: 'starter',
    advanced_forecast: 'starter',
    team: 'pro',
    roles: 'pro',
    multi_org: 'pro',
    live_presence: 'pro',
    cfo_dashboard: 'pro',
    audit_log: 'pro',
    webhook_replay: 'pro',
    approvals: 'scale',
    collections: 'scale',
    collections_ai: 'scale',
    late_interest: 'scale',
    cashflow_90: 'scale',
    international_invoicing: 'scale',
    smtp: 'scale',
    sso: 'scale',
    agent_governance: 'scale',
};

export const FEATURE_LABEL: Record<FeatureKey, string> = {
    cfdi: 'Timbrado CFDI 4.0',
    remove_branding: 'Quitar la marca de Cord',
    custom_email: 'Personalización de correos',
    advanced_forecast: 'Pronóstico y margen cedido',
    team: 'Invitar a tu equipo',
    roles: 'Roles y permisos personalizados',
    multi_org: 'Espacios de trabajo adicionales',
    live_presence: 'Presencia en vivo',
    cfo_dashboard: 'CFO Dashboard',
    audit_log: 'Auditoría inmutable',
    webhook_replay: 'Reintento de webhooks',
    approvals: 'Flujos de aprobación',
    collections: 'Módulo de cobranza',
    collections_ai: 'Cobranza autónoma con IA',
    late_interest: 'Interés moratorio automático',
    cashflow_90: 'Pronóstico de flujo a 90 días',
    international_invoicing: 'Facturación internacional',
    smtp: 'Correo desde tu dominio',
    sso: 'SSO empresarial',
    agent_governance: 'Gobernanza de agentes de IA',
};

export type LimitedResource = 'active_quotes' | 'products' | 'clients' | 'seats';

// null = ilimitado. Estos números reflejan la matriz de /precios.
export const RESOURCE_LIMITS: Record<PlanId, Record<LimitedResource, number | null>> = {
    free:      { active_quotes: 5,  products: 50,  clients: 50,  seats: 1 },
    starter:   { active_quotes: 50, products: 500, clients: 500, seats: 1 },
    // Pro+ admite asientos adicionales facturados; 5/15 son incluidos, no un
    // hard cap. La cuota incluida vive en billing.INCLUDED.
    pro:       { active_quotes: null, products: null, clients: null, seats: null },
    scale:     { active_quotes: null, products: null, clients: null, seats: null },
    developer: { active_quotes: null, products: null, clients: null, seats: null },
};

export function planIncludes(plan: PlanId, feature: FeatureKey): boolean {
    return PLAN_RANK[plan] >= PLAN_RANK[FEATURE_MIN_PLAN[feature]];
}

export function resourceLimit(plan: PlanId, resource: LimitedResource): number | null {
    return RESOURCE_LIMITS[plan][resource];
}

export function minimumPlan(feature: FeatureKey): PaidPlan {
    return FEATURE_MIN_PLAN[feature];
}

/** Primitiva pura que permite probar el fail-closed sin BD ni Stripe. */
export function hasPaidBillingEvidence(input: {
    plan: unknown;
    subscriptionStatus: unknown;
    currentPeriodEnd: Date | string | null | undefined;
    billingPaidThrough: Date | string | null | undefined;
    billingPaidPlan: unknown;
    stripeSubscriptionId: unknown;
    stripeCustomerId: unknown;
}, now = new Date()): boolean {
    const asTime = (value: Date | string | null | undefined) => {
        if (!value) return Number.NaN;
        return value instanceof Date ? value.getTime() : new Date(value).getTime();
    };
    const periodEnd = asTime(input.currentPeriodEnd);
    const paidThrough = asTime(input.billingPaidThrough);
    const storedPlan = normalizePlan(input.plan);
    const paidPlan = normalizePlan(input.billingPaidPlan);
    return storedPlan !== 'free'
        && input.subscriptionStatus === 'active'
        && typeof input.stripeSubscriptionId === 'string' && input.stripeSubscriptionId.length > 0
        && typeof input.stripeCustomerId === 'string' && input.stripeCustomerId.length > 0
        && Number.isFinite(periodEnd) && periodEnd > now.getTime()
        && Number.isFinite(paidThrough) && paidThrough >= periodEnd
        && PLAN_RANK[paidPlan] >= PLAN_RANK[storedPlan];
}
