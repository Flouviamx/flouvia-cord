// Reglas 17 y 18: un plan guardado no es evidencia de pago, y un límite es
// hard limit, soft limit o feature gate — nunca los tres a la vez.
//
// `hasPaidBillingEvidence` se documenta a sí misma como "primitiva pura que
// permite probar el fail-closed sin BD ni Stripe". Esto es esa prueba.

import { describe, it, expect } from 'vitest';
import {
    API_KEY_LIMITS,
    FEATURE_LABEL,
    FEATURE_MIN_PLAN,
    PLAN_IDS,
    PLAN_RANK,
    RESOURCE_LIMITS,
    WEBHOOK_LIMITS,
    apiKeyLimit,
    hasPaidBillingEvidence,
    minimumPlan,
    normalizePlan,
    planIncludes,
    resourceLimit,
    webhookLimit,
    type FeatureKey,
    type PlanId,
} from '../src/lib/entitlements';

const FEATURES = Object.keys(FEATURE_MIN_PLAN) as FeatureKey[];

describe('normalizePlan', () => {
    it('traduce los alias históricos al nivel comercial equivalente', () => {
        expect(normalizePlan('business')).toBe('pro');
        expect(normalizePlan('negocio')).toBe('pro');
    });

    it('cae a Gratis ante cualquier valor desconocido', () => {
        for (const v of [null, undefined, '', 'enterprise', 'PRO_MAX', 42, {}]) {
            expect(normalizePlan(v)).toBe('free');
        }
    });

    it('es insensible a mayúsculas', () => {
        expect(normalizePlan('SCALE')).toBe('scale');
    });
});

describe('matriz de capacidades', () => {
    it('ninguna capacidad de pago se habilita en Gratis', () => {
        for (const f of FEATURES) {
            expect(planIncludes('free', f)).toBe(false);
        }
    });

    it('developer (el rango más alto) incluye todo', () => {
        for (const f of FEATURES) {
            expect(planIncludes('developer', f)).toBe(true);
        }
    });

    it('la inclusión es monótona: si un plan la tiene, todos los superiores también', () => {
        const ordenados = [...PLAN_IDS].sort((a, b) => PLAN_RANK[a] - PLAN_RANK[b]);
        for (const f of FEATURES) {
            let vistoHabilitado = false;
            for (const plan of ordenados) {
                const incluye = planIncludes(plan, f);
                if (incluye) vistoHabilitado = true;
                // Una vez habilitada, no puede volver a apagarse más arriba.
                else expect(vistoHabilitado, `${f} se apaga en ${plan}`).toBe(false);
            }
        }
    });

    it('cada capacidad declara su plan mínimo y una etiqueta para el usuario', () => {
        for (const f of FEATURES) {
            expect(PLAN_IDS).toContain(minimumPlan(f));
            expect(FEATURE_LABEL[f], `${f} sin etiqueta`).toBeTruthy();
        }
    });

    it('planIncludes coincide exactamente con el plan mínimo declarado', () => {
        for (const f of FEATURES) {
            const min = FEATURE_MIN_PLAN[f];
            expect(planIncludes(min, f)).toBe(true);
            const anterior = PLAN_IDS.find((p) => PLAN_RANK[p] === PLAN_RANK[min] - 1);
            if (anterior) expect(planIncludes(anterior, f)).toBe(false);
        }
    });
});

describe('límites de recursos (hard limits)', () => {
    it('todos los planes declaran los cuatro recursos', () => {
        for (const plan of PLAN_IDS) {
            for (const r of ['active_quotes', 'products', 'clients', 'seats'] as const) {
                const v = resourceLimit(plan, r);
                expect(v === null || (Number.isInteger(v) && v > 0), `${plan}.${r} = ${v}`).toBe(true);
            }
        }
    });

    it('Gratis es el plan más restringido', () => {
        expect(RESOURCE_LIMITS.free.active_quotes).toBe(5);
        expect(RESOURCE_LIMITS.free.seats).toBe(1);
    });

    it('el límite nunca baja al subir de plan', () => {
        const ordenados = [...PLAN_IDS].sort((a, b) => PLAN_RANK[a] - PLAN_RANK[b]);
        for (const r of ['active_quotes', 'products', 'clients', 'seats'] as const) {
            let previo: number | null = 0;
            for (const plan of ordenados) {
                const actual = resourceLimit(plan, r);
                if (previo === null) {
                    expect(actual, `${plan}.${r} retrocede desde ilimitado`).toBeNull();
                } else if (actual !== null) {
                    expect(actual, `${plan}.${r} baja`).toBeGreaterThanOrEqual(previo);
                }
                previo = actual;
            }
        }
    });
});

describe('límites de API keys y webhooks', () => {
    it('ningún plan es ilimitado — siempre hay un tope numérico', () => {
        for (const plan of PLAN_IDS) {
            expect(Number.isInteger(apiKeyLimit(plan))).toBe(true);
            expect(apiKeyLimit(plan)).toBeGreaterThan(0);
            expect(Number.isInteger(webhookLimit(plan))).toBe(true);
            expect(webhookLimit(plan)).toBeGreaterThan(0);
        }
    });

    it('un plan desconocido recibe el tope de Gratis, no el más alto', () => {
        expect(apiKeyLimit('inventado')).toBe(API_KEY_LIMITS.free);
        expect(webhookLimit('inventado')).toBe(WEBHOOK_LIMITS.free);
    });

    it('los alias históricos conservan su tope', () => {
        expect(apiKeyLimit('business')).toBe(apiKeyLimit('pro'));
        expect(webhookLimit('negocio')).toBe(webhookLimit('pro'));
    });
});

describe('hasPaidBillingEvidence (fail-closed)', () => {
    const AHORA = new Date('2026-08-17T00:00:00Z');
    const VIGENTE = new Date('2026-09-17T00:00:00Z');

    // Se tipa contra la firma real: los parches prueban a propósito valores
    // null/string que la función acepta, y `Partial<typeof valido>` los negaría.
    type Evidencia = Parameters<typeof hasPaidBillingEvidence>[0];

    const valido: Evidencia = {
        plan: 'pro',
        subscriptionStatus: 'active',
        currentPeriodEnd: VIGENTE,
        billingPaidThrough: VIGENTE,
        billingPaidPlan: 'pro',
        stripeSubscriptionId: 'sub_123',
        stripeCustomerId: 'cus_123',
    };

    it('acepta una suscripción completa y vigente', () => {
        expect(hasPaidBillingEvidence(valido, AHORA)).toBe(true);
    });

    // Cada campo, por separado, debe poder tumbar la autorización.
    const rupturas: [string, Partial<Evidencia>][] = [
        ['plan Gratis', { plan: 'free' }],
        ['suscripción no activa', { subscriptionStatus: 'past_due' }],
        ['suscripción cancelada', { subscriptionStatus: 'canceled' }],
        ['sin id de suscripción', { stripeSubscriptionId: '' }],
        ['sin id de customer', { stripeCustomerId: '' }],
        ['id de suscripción no string', { stripeSubscriptionId: null }],
        ['periodo vencido', { currentPeriodEnd: new Date('2026-08-01T00:00:00Z') }],
        ['sin periodo', { currentPeriodEnd: null }],
        ['factura no cubre el periodo', { billingPaidThrough: new Date('2026-09-01T00:00:00Z') }],
        ['sin factura pagada', { billingPaidThrough: null }],
        ['plan pagado inferior al guardado', { billingPaidPlan: 'starter' }],
        ['fecha corrupta', { currentPeriodEnd: 'no-es-fecha' }],
    ];

    for (const [nombre, parche] of rupturas) {
        it(`niega el acceso: ${nombre}`, () => {
            expect(hasPaidBillingEvidence({ ...valido, ...parche }, AHORA)).toBe(false);
        });
    }

    it('niega ante un objeto completamente vacío', () => {
        expect(hasPaidBillingEvidence({
            plan: null, subscriptionStatus: null, currentPeriodEnd: null,
            billingPaidThrough: null, billingPaidPlan: null,
            stripeSubscriptionId: null, stripeCustomerId: null,
        }, AHORA)).toBe(false);
    });

    it('acepta un plan pagado SUPERIOR al guardado', () => {
        expect(hasPaidBillingEvidence({ ...valido, billingPaidPlan: 'scale' }, AHORA)).toBe(true);
    });

    it('acepta fechas en formato string además de Date', () => {
        expect(hasPaidBillingEvidence({
            ...valido,
            currentPeriodEnd: VIGENTE.toISOString(),
            billingPaidThrough: VIGENTE.toISOString(),
        }, AHORA)).toBe(true);
    });
});
