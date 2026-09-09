import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), tx: vi.fn(), limit: vi.fn() }));
vi.mock('../src/lib/db', () => ({
    resolvePublicInvoice: mocks.resolve, withOrgTx: mocks.tx,
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }),
}));
vi.mock('../src/lib/connect-security', () => ({ limitPublicPayment: mocks.limit }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn() } }));

const doc = (extra = {}) => ({
    id: 'invoice-a', org_id: 'org-a', lifecycle: 'open', currency: 'MXN', total: 1000,
    amount_remaining: 1000, stripe_payment_intent_id: null, previous_payment_applied: false,
    stripe_account_id: 'acct_a', stripe_charges_enabled: true, acepta_tarjeta: true,
    provider_data: {}, fee_enabled: false, ...extra,
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn>;

async function pay(monto = 500) {
    const { POST } = await import('../src/pages/api/i/[token]/payment-intent');
    return POST({ params: { token: 'invoice-token' }, request: new Request('https://cordhq.app/api/i/invoice-token/payment-intent', {
        method: 'POST', body: JSON.stringify({ monto }),
    }) } as any);
}

beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
    vi.stubEnv('PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_fixture');
    mocks.resolve.mockResolvedValue({ id: 'invoice-a', orgId: 'org-a' });
    mocks.limit.mockResolvedValue(null);
    fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('abonos de una factura hospedada', () => {
    it('permite un segundo abono del mismo importe con una operación distinta', async () => {
        mocks.tx.mockResolvedValueOnce([[doc()]])
            .mockResolvedValueOnce([[{ id: 'invoice-a' }]])
            .mockResolvedValueOnce([[doc({ amount_remaining: 500, stripe_payment_intent_id: 'pi_first', previous_payment_applied: true })]])
            .mockResolvedValueOnce([[{ id: 'invoice-a' }]]);
        fetchMock.mockResolvedValueOnce(response({ id: 'pi_first', client_secret: 'first_secret' }))
            .mockResolvedValueOnce(response({ id: 'pi_first', status: 'succeeded', amount: 50000 }))
            .mockResolvedValueOnce(response({ id: 'pi_second', client_secret: 'second_secret' }));
        expect((await pay()).status).toBe(200);
        expect(await (await pay()).json()).toMatchObject({ clientSecret: 'second_secret', amount: 50000 });
        const creates = fetchMock.mock.calls.filter(([url]) => url === 'https://api.stripe.com/v1/payment_intents');
        expect(creates).toHaveLength(2);
        expect(creates[0][1].headers['Idempotency-Key']).not.toEqual(creates[1][1].headers['Idempotency-Key']);
        expect(mocks.tx.mock.calls.every(([org]) => org === 'org-a')).toBe(true);
    });

    it('espera al ledger cuando el abono ya llegó a Stripe pero no a Cord', async () => {
        mocks.tx.mockResolvedValue([[doc({ stripe_payment_intent_id: 'pi_previous' })]]);
        fetchMock.mockResolvedValue(response({ id: 'pi_previous', status: 'succeeded' }));
        const result = await pay();
        expect(result.status).toBe(409);
        expect(await result.json()).toMatchObject({ code: 'payment_pending' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('no abre otro intento si falla la consulta del anterior', async () => {
        mocks.tx.mockResolvedValue([[doc({ stripe_payment_intent_id: 'pi_previous' })]]);
        fetchMock.mockResolvedValue(response({ error: { message: 'private provider failure' } }, 500));
        const result = await pay();
        expect(result.status).toBe(502);
        expect(await result.text()).not.toContain('private provider failure');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('no reemplaza un abono en proceso con otro importe', async () => {
        mocks.tx.mockResolvedValue([[doc({ stripe_payment_intent_id: 'pi_previous' })]]);
        fetchMock.mockResolvedValue(response({ id: 'pi_previous', status: 'processing', amount: 20000 }));
        expect((await pay()).status).toBe(409);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('reutiliza un intento pendiente sin crear otro', async () => {
        mocks.tx.mockResolvedValue([[doc({ stripe_payment_intent_id: 'pi_previous' })]]);
        fetchMock.mockResolvedValue(response({ id: 'pi_previous', status: 'requires_action', amount: 50000, client_secret: 'existing' }));
        expect(await (await pay()).json()).toMatchObject({ clientSecret: 'existing' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('no entrega un secreto si el saldo cambia antes de guardar el intento', async () => {
        mocks.tx.mockResolvedValueOnce([[doc()]]).mockResolvedValueOnce([[]]);
        fetchMock.mockResolvedValue(response({ id: 'pi_new', client_secret: 'not-delivered' }));
        const result = await pay();
        expect(result.status).toBe(409);
        expect(await result.json()).toMatchObject({ code: 'payment_changed' });
    });

    it('dos montos concurrentes compiten por una sola operación del proveedor', async () => {
        // Simula el contrato de idempotencia del proveedor, no una respuesta fija:
        // misma clave y payload diferente debe rechazar la segunda creación.
        const operations = new Map<string, string>();
        mocks.tx.mockImplementation(async (_org, query) => query.text.includes('returning id')
            ? [[{ id: 'invoice-a' }]] : [[doc()]]);
        fetchMock.mockImplementation(async (_url, init) => {
            const key = init.headers['Idempotency-Key'];
            if (operations.has(key) && operations.get(key) !== init.body) {
                return response({ error: { type: 'idempotency_error' } }, 400);
            }
            operations.set(key, init.body);
            return response({ id: 'pi_only', client_secret: 'only_secret' });
        });
        const results = await Promise.all([pay(300), pay(500)]);
        expect(results.map(r => r.status).sort()).toEqual([200, 409]);
        expect(operations.size).toBe(1);
    });

    it('una factura liquidada no contacta al proveedor', async () => {
        mocks.tx.mockResolvedValue([[doc({ lifecycle: 'paid', amount_remaining: 0 })]]);
        expect(await (await pay()).json()).toEqual({ alreadyPaid: true });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

it('no crea un cobro para una nota de crédito incluso con saldo heredado', async () => {
    mocks.tx.mockResolvedValue([[doc({ document_type: 'cfdi_egreso', credit_note_of: 'original' })]]);
    expect((await pay()).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
});


describe('desglose de comisión aceptado en la factura', () => {
    it('guarda base, impuesto y total junto con un nuevo cobro', async () => {
        mocks.tx.mockResolvedValueOnce([[doc({ fee_enabled: true, fee_terms_version: 'cord-pagos-2026-08-11' })]])
            .mockResolvedValueOnce([[{ id: 'invoice-a' }]]);
        fetchMock.mockResolvedValue(response({ id: 'pi_new', client_secret: 'secret' }));
        expect((await pay()).status).toBe(200);
        const form = new URLSearchParams(fetchMock.mock.calls[0][1].body);
        expect(form.get('metadata[cord_fee_version]')).toBe('1');
        expect(form.get('metadata[cord_fee_base_cents]')).toBe('200');
        expect(form.get('metadata[cord_fee_tax_cents]')).toBe('32');
        expect(form.get('metadata[cord_fee_total_cents]')).toBe('232');
        expect(form.get('application_fee_amount')).toBe('232');
    });
    it('actualiza el desglose junto con el importe de un intento modificable', async () => {
        mocks.tx.mockResolvedValue([[doc({ fee_enabled: true, fee_terms_version: 'cord-pagos-2026-08-11', stripe_payment_intent_id: 'pi_previous' })]]);
        fetchMock.mockResolvedValueOnce(response({ id: 'pi_previous', status: 'requires_payment_method', amount: 20000 }))
            .mockResolvedValueOnce(response({ id: 'pi_previous', client_secret: 'secret' }));
        expect((await pay()).status).toBe(200);
        const form = new URLSearchParams(fetchMock.mock.calls[1][1].body);
        expect(form.get('amount')).toBe('50000');
        expect(form.get('metadata[cord_fee_base_cents]')).toBe('200');
        expect(form.get('metadata[cord_fee_tax_cents]')).toBe('32');
        expect(form.get('application_fee_amount')).toBe('232');
    });
});
