import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ sql: () => ({}) }));

const { opsConnectRequirements, opsIsPaying, opsMinor, opsRevenueAtRisk, opsRevenueCanceling, stripeDashboardUrl, summarizeRevenue } = await import('../src/lib/ops-billing');
const { mergeOpsLog, normalizeOpsTag } = await import('../src/lib/ops-notes');
const { PLANES, precioAnualMensualizado } = await import('../src/lib/precios');

const price = (plan: string, cur: 'MXN' | 'USD' | 'EUR') => PLANES.find((p) => p.id === plan)!.precio[cur] as number;
const org = (over: Record<string, unknown>) => ({
    id: crypto.randomUUID(), nombre: 'Org', country_code: 'MX', plan: 'pro', effective_plan: 'pro',
    billing_cycle: 'mensual', billing_currency: null, subscription_status: 'active',
    cancel_at_period_end: false, current_period_end: '2026-11-01T00:00:00Z', ...over,
}) as any;

describe('MRR de Ops', () => {
    it('cuenta solo el plan pagado verificado, por divisa y sin mezclarlas', () => {
        const rows = [
            org({ country_code: 'MX' }),
            org({ country_code: 'MX', billing_cycle: 'anual', plan: 'starter', effective_plan: 'starter' }),
            org({ country_code: 'US' }),
            // Plan guardado sin cobro que lo respalde: la app lo trata como Gratis.
            org({ country_code: 'MX', effective_plan: 'free', subscription_status: 'past_due' }),
            // Promoción sin suscripción: tiene acceso, no es ingreso.
            org({ country_code: 'MX', plan: 'free', effective_plan: 'scale', subscription_status: null }),
        ];
        const [mxn, usd] = summarizeRevenue(rows);
        expect(mxn.currency).toBe('MXN');
        expect(mxn.paying).toBe(2);
        expect(mxn.mrr).toBe(price('pro', 'MXN') + precioAnualMensualizado(price('starter', 'MXN')));
        expect(mxn.arr).toBe(mxn.mrr * 12);
        expect(mxn.annual).toBe(1);
        expect(usd).toMatchObject({ currency: 'USD', paying: 1, mrr: price('pro', 'USD') });
    });

    it('la divisa de una factura real gana sobre el país (regla 21)', () => {
        const [only] = summarizeRevenue([org({ country_code: 'ES', billing_currency: 'usd' })]);
        expect(only.currency).toBe('USD');
    });

    it('un plan sin precio de lista en esa divisa no inventa MRR', () => {
        const [eur] = summarizeRevenue([org({ country_code: 'ES', plan: 'developer', effective_plan: 'developer' })]);
        expect(eur).toMatchObject({ currency: 'EUR', paying: 1, unpriced: 1, mrr: 0 });
    });

    it('los nombres heredados del plan se leen como Pro', () => {
        expect(opsIsPaying(org({ plan: 'business', effective_plan: 'pro' }))).toBe(true);
        const [mxn] = summarizeRevenue([org({ plan: 'negocio', effective_plan: 'pro' })]);
        expect(mxn.mrr).toBe(price('pro', 'MXN'));
    });

    it('separa a quien cancela al cierre de quien está en riesgo', () => {
        const rows = [
            org({ nombre: 'Tarde', cancel_at_period_end: true, current_period_end: '2026-12-01' }),
            org({ nombre: 'Pronto', cancel_at_period_end: true, current_period_end: '2026-10-20' }),
            org({ nombre: 'Atrasada', effective_plan: 'free', subscription_status: 'past_due' }),
            org({ nombre: 'Cancelada', effective_plan: 'free', subscription_status: 'canceled' }),
        ];
        expect(opsRevenueCanceling(rows).map((r: any) => r.nombre)).toEqual(['Pronto', 'Tarde']);
        expect(opsRevenueAtRisk(rows).map((r: any) => r.nombre)).toEqual(['Atrasada']);
    });
});

describe('cuenta de cobros en Ops', () => {
    it('lee los requisitos sin exponer el id de la persona', () => {
        const r = opsConnectRequirements({
            currently_due: ['external_account', 'person_1AbcXyz.id_number', 'person_1AbcXyz.id_number'],
            past_due: ['business_profile.url'],
            pending_verification: [3, 'person_9Q.verification.document'],
            current_deadline: 1_790_000_000,
        });
        expect(r.currentlyDue).toEqual(['external_account', 'persona.id_number']);
        expect(r.pastDue).toEqual(['business_profile.url']);
        expect(r.pendingVerification).toEqual(['persona.verification.document']);
        expect(r.deadline?.toISOString()).toBe(new Date(1_790_000_000 * 1000).toISOString());
        expect(opsConnectRequirements(null)).toEqual({ currentlyDue: [], pastDue: [], pendingVerification: [], deadline: null });
    });

    it('arma enlaces al panel solo con ids del prefijo correcto', () => {
        expect(stripeDashboardUrl('customer', 'cus_ABC123')).toBe('https://dashboard.stripe.com/customers/cus_ABC123');
        expect(stripeDashboardUrl('account', 'acct_1x')).toBe('https://dashboard.stripe.com/connect/accounts/acct_1x');
        expect(stripeDashboardUrl('customer', 'sub_ABC')).toBeNull();
        expect(stripeDashboardUrl('subscription', 'sub_1/../../settings')).toBeNull();
        expect(stripeDashboardUrl('invoice', null)).toBeNull();
    });

    it('convierte unidades mínimas con los decimales de cada divisa', () => {
        expect(opsMinor(123456, 'MXN')).toBe(1234.56);
        expect(opsMinor(5000, 'JPY')).toBe(5000);
        expect(opsMinor(null, 'USD')).toBe(0);
    });
});

describe('notas y etiquetas internas', () => {
    it('normaliza la etiqueta igual que el CHECK de la base', () => {
        expect(normalizeOpsTag('  Cliente VIP ')).toBe('cliente-vip');
        expect(normalizeOpsTag('riesgo-fraude')).toBe('riesgo-fraude');
        expect(normalizeOpsTag('-empieza-con-guion')).toBeNull();
        expect(normalizeOpsTag('a'.repeat(25))).toBeNull();
        expect(normalizeOpsTag('<script>')).toBeNull();
        expect(normalizeOpsTag(42)).toBeNull();
    });

    it('une notas y auditoría en una sola bitácora, la más reciente primero', () => {
        const log = mergeOpsLog(
            [{ id: 'n1', author_email: 'ops@cord', author_operator_id: 'u1', body: 'Llamar el lunes', created_at: '2026-10-02T10:00:00Z' }],
            [
                { action: 'ops.organization_api_keys_revoked', result: 'success', actor_email: 'ops@cord', ip: '1.1.1.1', created_at: '2026-10-03T10:00:00Z' },
                { action: 'ops.resend_invoice', result: 'failure', actor_email: null, ip: null, created_at: '2026-10-01T10:00:00Z' },
            ],
        );
        expect(log.map((e) => e.kind)).toEqual(['audit', 'note', 'audit']);
        expect(log[2]).toMatchObject({ author: 'Sistema', result: 'failure' });
        expect(mergeOpsLog([], [], 5)).toEqual([]);
    });
});

describe('fechas sin hora', async () => {
    const { opsDay } = await import('../src/lib/ops-format');
    it('un día civil no se corre por la zona horaria', () => {
        expect(opsDay('2026-10-09')).toMatch(/^9 oct/);
        expect(opsDay(new Date(Date.UTC(2026, 9, 9)))).toMatch(/^9 oct/);
        expect(opsDay(null)).toBe('—');
    });
});
