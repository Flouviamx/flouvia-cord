import { beforeEach, describe, expect, it, vi } from 'vitest';

// La sonda "confirmación de pagos" de la página de estado. Antes marcaba falla
// con solo tener cobros pendientes y 26 h sin webhook, que con poco tráfico es
// el estado normal (clientes que abrieron el pago y no pagaron). Ahora solo es
// falla si Stripe cobró algo que Cord no registró, o si no se puede verificar.

const m = vi.hoisted(() => ({
    health: [] as any[],
    intents: null as any[] | null,        // null = la función aún no existe
    stripe: vi.fn(),
}));

vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray) => s.join('?'),
    withSystemTx: async (q: string) => {
        if (q.includes('cord_pending_payment_intents')) {
            if (m.intents === null) throw new Error('function cord_pending_payment_intents(integer) does not exist');
            return [m.intents];
        }
        return [m.health];
    },
}));
vi.mock('../src/lib/billing', () => ({ stripe: m.stripe }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { paymentsConfirmation } = await import('../src/lib/platform-health');

const HACE_3_DIAS = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString();
const HACE_1_HORA = new Date(Date.now() - 3_600_000).toISOString();

beforeEach(() => {
    m.stripe.mockReset();
    m.intents = [{ payment_intent: 'pi_1', stripe_account: 'acct_1' }, { payment_intent: 'pi_2', stripe_account: null }];
});

describe('paymentsConfirmation', () => {
    it('sin cobros pendientes no hay nada que confirmar', async () => {
        m.health = [{ last_success_at: HACE_3_DIAS, pending_count: 0 }];
        expect((await paymentsConfirmation()).broken).toBe(false);
        expect(m.stripe).not.toHaveBeenCalled();
    });

    it('con un webhook reciente no consulta a Stripe', async () => {
        m.health = [{ last_success_at: HACE_1_HORA, pending_count: 4 }];
        expect((await paymentsConfirmation()).broken).toBe(false);
        expect(m.stripe).not.toHaveBeenCalled();
    });

    it('pendientes sin pagar y sin webhooks NO es una caída', async () => {
        m.health = [{ last_success_at: HACE_3_DIAS, pending_count: 2 }];
        m.stripe.mockResolvedValue({ status: 'requires_payment_method' });
        const r = await paymentsConfirmation();
        expect(r.broken).toBe(false);
        // Consulta cada intento en su cuenta conectada.
        expect(m.stripe).toHaveBeenCalledWith('/v1/payment_intents/pi_1', undefined, 'GET', { stripeAccount: 'acct_1' });
        expect(m.stripe).toHaveBeenCalledWith('/v1/payment_intents/pi_2', undefined, 'GET', undefined);
    });

    it('un pago cobrado en Stripe que Cord no registró SÍ es falla', async () => {
        m.health = [{ last_success_at: HACE_3_DIAS, pending_count: 2 }];
        m.stripe.mockImplementation(async (path: string) => ({ status: path.endsWith('pi_2') ? 'succeeded' : 'requires_payment_method' }));
        expect(await paymentsConfirmation()).toMatchObject({ broken: true, reason: 'missed' });
    });

    it('si la función aún no está migrada, falla cerrada como antes', async () => {
        m.health = [{ last_success_at: null, pending_count: 1 }];
        m.intents = null;
        expect(await paymentsConfirmation()).toMatchObject({ broken: true, reason: 'unverified' });
    });

    it('si Stripe no responde para ninguno, no se afirma que todo está bien', async () => {
        m.health = [{ last_success_at: HACE_3_DIAS, pending_count: 2 }];
        m.stripe.mockRejectedValue(new Error('timeout'));
        expect(await paymentsConfirmation()).toMatchObject({ broken: true, reason: 'unverified' });
    });
});
