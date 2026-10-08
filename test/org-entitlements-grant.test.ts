import { describe, expect, it, vi } from 'vitest';

// Acceso efectivo = el mayor entre lo PAGADO y la cortesía vigente; el
// excedente solo se cobra cuando el plan efectivo lo respalda un pago.
const m = vi.hoisted(() => ({ org: {} as Record<string, unknown>, grant: null as null | Record<string, unknown> }));
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray) => ({ text: s.join('?') }),
    withOrgTx: async (_org: string, q: { text: string }) => [q.text.includes('cord_access_grant') ? (m.grant ? [m.grant] : []) : [m.org]],
}));
vi.mock('../src/lib/permissions', () => ({ planLabel: (p: string) => p }));
const { getEntitlementContext } = await import('../src/lib/org-entitlements');

const NOW = new Date('2026-10-08T12:00:00Z');
const ORG = '00000000-0000-4000-8000-000000000001';
const paid = {
    id: ORG, sandbox_of: null, plan: 'starter', subscription_status: 'active',
    current_period_end: '2026-11-01T00:00:00Z', billing_paid_through: '2026-11-01T00:00:00Z',
    billing_paid_plan: 'starter', stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1',
};

describe('acceso efectivo con cortesías', () => {
    it('sin cortesía, el pago decide y el excedente se cobra', async () => {
        m.org = paid; m.grant = null;
        const c = await getEntitlementContext(ORG, NOW);
        expect(c).toMatchObject({ effectivePlan: 'starter', accessSource: 'paid', overageAllowed: true, grant: null });
    });

    it('una cortesía superior sube el plan, pero el excedente no se cobra', async () => {
        m.org = paid; m.grant = { plan: 'pro', expires_at: '2026-12-01T00:00:00Z', source: 'ops' };
        const c = await getEntitlementContext(ORG, NOW);
        expect(c).toMatchObject({ effectivePlan: 'pro', accessSource: 'grant', overageAllowed: false, paidAccess: true });
    });

    it('una cortesía inferior al pago no cambia nada', async () => {
        m.org = { ...paid, plan: 'scale', billing_paid_plan: 'scale' };
        m.grant = { plan: 'pro', expires_at: '2026-12-01T00:00:00Z', source: 'ops' };
        const c = await getEntitlementContext(ORG, NOW);
        expect(c).toMatchObject({ effectivePlan: 'scale', accessSource: 'paid', overageAllowed: true });
    });

    it('en prueba extendida (trialing) el pago no cuenta y la cortesía mantiene el acceso', async () => {
        m.org = { ...paid, subscription_status: 'trialing' };
        m.grant = { plan: 'starter', expires_at: '2026-11-20T00:00:00Z', source: 'ops' };
        const c = await getEntitlementContext(ORG, NOW);
        expect(c).toMatchObject({ effectivePlan: 'starter', paidAccess: false, accessSource: 'grant', overageAllowed: false });
    });

    it('la promoción de The Cord Build ya no diverge del SQL: da Scale', async () => {
        m.org = { ...paid, plan: 'free', subscription_status: null, stripe_subscription_id: null };
        m.grant = { plan: 'scale', expires_at: '2027-01-01T00:00:00Z', source: 'build' };
        const c = await getEntitlementContext(ORG, NOW);
        expect(c).toMatchObject({ effectivePlan: 'scale', accessSource: 'grant', grant: { source: 'build' } });
    });

    it('una cortesía vencida no da nada', async () => {
        m.org = { ...paid, plan: 'free' };
        m.grant = { plan: 'pro', expires_at: '2026-10-01T00:00:00Z', source: 'ops' };
        const c = await getEntitlementContext(ORG, NOW);
        expect(c).toMatchObject({ effectivePlan: 'free', accessSource: 'free', overageAllowed: false });
    });
});
