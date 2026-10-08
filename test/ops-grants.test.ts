import { describe, expect, it } from 'vitest';
import { addMonthsUtc, GRANT_MARGIN_DAYS, parseGrantRequest, planGrant, type GrantSubject } from '../src/lib/ops-grants';

const NOW = new Date('2026-10-08T12:00:00Z');
const PERIOD_END = new Date('2026-10-26T00:00:00Z');
const DAY = 86_400_000;
const sub = (over: Partial<NonNullable<GrantSubject['subscription']>> = {}) => ({
    id: 'sub_1', status: 'active', cycle: 'mensual' as const, periodEnd: PERIOD_END, baseProduct: 'prod_pro',
    hasSchedule: false, hasDiscounts: false, cancelAtPeriodEnd: false, ...over,
});
const paying = (over: Partial<GrantSubject> = {}): GrantSubject => ({ isSandbox: false, paying: true, paidPlan: 'pro', subscription: sub(), activeGrant: false, ...over });
const free = (over: Partial<GrantSubject> = {}): GrantSubject => ({ isSandbox: false, paying: false, paidPlan: 'free', subscription: null, activeGrant: false, ...over });
const req = (kind: 'dias' | 'plan', amount: number, plan: any = null) => ({ kind, amount, plan, reason: 'Cliente estratégico' });

describe('cortesías de Ops', () => {
    it('días gratis a quien paga: mueve su cobro y conserva SU plan', () => {
        const r = planGrant(req('dias', 14, 'scale'), paying(), NOW);
        expect(r).toMatchObject({ ok: true, mechanism: 'trial', plan: 'pro' });
        if (!r.ok) return;
        expect(r.trialEnd).toEqual(new Date(PERIOD_END.getTime() + 14 * DAY));
        // La cortesía cubre el periodo sin cobro más el margen para la primera factura real.
        expect(r.expiresAt).toEqual(new Date(r.trialEnd!.getTime() + GRANT_MARGIN_DAYS * DAY));
    });

    it('días gratis a quien no paga: solo acceso, sin tocar el procesador', () => {
        const r = planGrant(req('dias', 30, 'scale'), free(), NOW);
        expect(r).toMatchObject({ ok: true, mechanism: 'acceso', plan: 'scale' });
        if (r.ok) expect(r.expiresAt).toEqual(new Date(NOW.getTime() + 30 * DAY));
        expect(planGrant(req('dias', 30), free(), NOW)).toMatchObject({ ok: false });
    });

    it('regalar su mismo plan mensual: cupón sobre el base, N meses desde su próximo cobro', () => {
        const r = planGrant(req('plan', 3, 'pro'), paying(), NOW);
        expect(r).toMatchObject({ ok: true, mechanism: 'cupon', plan: 'pro', couponMonths: 3 });
        if (r.ok) expect(r.expiresAt).toEqual(new Date(addMonthsUtc(PERIOD_END, 3).getTime() + GRANT_MARGIN_DAYS * DAY));
    });

    it('nunca un cupón sobre un anual: regalaría el año completo', () => {
        const r = planGrant(req('plan', 3, 'pro'), paying({ subscription: sub({ cycle: 'anual' }) }), NOW);
        expect(r).toMatchObject({ ok: false });
        if (!r.ok) expect(r.error).toMatch(/anual/);
    });

    it('regalar un plan superior a quien paga: solo acceso, se le sigue cobrando el suyo', () => {
        const r = planGrant(req('plan', 2, 'scale'), paying({ subscription: sub({ cycle: 'anual' }) }), NOW);
        expect(r).toMatchObject({ ok: true, mechanism: 'acceso', plan: 'scale' });
        expect(planGrant(req('plan', 2, 'starter'), paying(), NOW)).toMatchObject({ ok: false });
    });

    it('no pisa un descuento, un cambio programado ni una cancelación pendiente', () => {
        expect(planGrant(req('plan', 1, 'pro'), paying({ subscription: sub({ hasDiscounts: true }) }), NOW)).toMatchObject({ ok: false });
        expect(planGrant(req('dias', 7), paying({ subscription: sub({ hasSchedule: true }) }), NOW)).toMatchObject({ ok: false });
        expect(planGrant(req('dias', 7), paying({ subscription: sub({ cancelAtPeriodEnd: true }) }), NOW)).toMatchObject({ ok: false });
        expect(planGrant(req('dias', 7), paying({ subscription: sub({ status: 'trialing' }) }), NOW)).toMatchObject({ ok: false });
    });

    it('una cortesía a la vez, y nunca a una sandbox', () => {
        expect(planGrant(req('dias', 7, 'pro'), free({ activeGrant: true }), NOW)).toMatchObject({ ok: false });
        expect(planGrant(req('dias', 7, 'pro'), free({ isSandbox: true }), NOW)).toMatchObject({ ok: false });
    });

    it('quien tiene suscripción pero no paga (atrasado) recibe acceso, no un cambio en el procesador', () => {
        const r = planGrant(req('dias', 10, 'pro'), { ...paying(), paying: false, paidPlan: 'free', subscription: sub({ status: 'past_due' }) }, NOW);
        expect(r).toMatchObject({ ok: true, mechanism: 'acceso' });
    });

    it('valida la petición', () => {
        expect(parseGrantRequest({ kind: 'dias', amount: 61, reason: 'ok ok' })).toHaveProperty('error');
        expect(parseGrantRequest({ kind: 'plan', amount: 3, reason: 'ok ok' })).toHaveProperty('error');
        expect(parseGrantRequest({ kind: 'plan', amount: 3, plan: 'free', reason: 'ok ok' })).toHaveProperty('error');
        expect(parseGrantRequest({ kind: 'dias', amount: 7, reason: '' })).toHaveProperty('error');
        expect(parseGrantRequest({ kind: 'dias', amount: 7, plan: 'pro', reason: 'Migración' })).toEqual({ kind: 'dias', amount: 7, plan: 'pro', reason: 'Migración' });
    });

    it('sumar meses respeta el fin de mes', () => {
        expect(addMonthsUtc(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
        expect(addMonthsUtc(new Date('2026-10-26T00:00:00Z'), 3).toISOString()).toBe('2027-01-26T00:00:00.000Z');
    });
});
