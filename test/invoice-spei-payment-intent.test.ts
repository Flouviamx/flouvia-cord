// SPEI con la CLABE de la factura (/api/i/[token]/payment-intent, metodo 'spei').
// Proveedor simulado: lo que importa es qué se le pide, con qué clave de
// idempotencia y en qué orden — una CLABE por factura, el intento ligado antes
// de confirmarse, la comisión de SPEI y un fondeo parcial que nunca se cancela.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeFee, FEE_TERMS_VERSION } from '../src/lib/fees';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), tx: vi.fn(), limit: vi.fn() }));
vi.mock('../src/lib/db', () => ({
    resolvePublicInvoice: mocks.resolve, withOrgTx: mocks.tx,
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join('?'), values }),
}));
vi.mock('../src/lib/connect-security', () => ({ limitPublicPayment: mocks.limit }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn() } }));
vi.mock('../src/lib/posthog-server', () => ({ trackServer: vi.fn(async () => {}) }));

const DOC = '11111111-1111-4111-8111-111111111111';
const doc = (extra = {}) => ({
    id: DOC, org_id: 'org-a', invoice_number: 'F-10', lifecycle: 'open', currency: 'MXN', total: 1000,
    amount_remaining: 1000, stripe_payment_intent_id: null, previous_payment_applied: false,
    stripe_account_id: 'acct_a', stripe_charges_enabled: true, acepta_tarjeta: true,
    org_nombre: 'Taller Norte', provider_data: {}, fee_enabled: false,
    cobro_spei_auto: true, org_country: 'MX', stripe_capacidades: { card_payments: 'active', mx_bank_transfer_payments: 'active' },
    stripe_spei_customer_id: null, cliente_email: 'pagos@acme.mx', ...extra,
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const instrucciones = (remaining: number) => ({
    type: 'display_bank_transfer_instructions',
    display_bank_transfer_instructions: {
        amount_remaining: remaining, currency: 'mxn', reference: 'REF4821',
        financial_addresses: [{ type: 'spei', supported_networks: ['spei'], spei: { bank_code: '002', bank_name: 'BANAMEX', clabe: '002180650612345670' } }],
    },
});
const spei = (extra = {}) => ({
    id: 'pi_spei', status: 'requires_action', amount: 100000, currency: 'mxn', customer: 'cus_factura',
    payment_method_types: ['customer_balance'], application_fee_amount: null, client_secret: 'pi_spei_secret',
    next_action: instrucciones(100000), ...extra,
});
let fetchMock: ReturnType<typeof vi.fn>;
const calls = () => fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url), method: init?.method ?? 'GET', key: init?.headers?.['Idempotency-Key'],
    form: new URLSearchParams(String(init?.body ?? '')),
}));

async function pay(body: Record<string, unknown> = { metodo: 'spei' }) {
    const { POST } = await import('../src/pages/api/i/[token]/payment-intent');
    return POST({ params: { token: 'invoice-token' }, request: new Request('https://cordhq.app/api/i/invoice-token/payment-intent', {
        method: 'POST', body: JSON.stringify(body),
    }) } as any);
}

beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks();
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
    vi.stubEnv('PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_fixture');
    mocks.resolve.mockResolvedValue({ id: DOC, orgId: 'org-a' });
    mocks.limit.mockResolvedValue(null);
    fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('cuándo se ofrece SPEI', () => {
    it.each([
        ['sin el interruptor del negocio', { cobro_spei_auto: false }],
        ['fuera de México', { org_country: 'ES' }],
        ['en otra divisa', { currency: 'USD' }],
        ['con la capacidad pendiente', { stripe_capacidades: { card_payments: 'active', mx_bank_transfer_payments: 'pending' } }],
    ])('no %s', async (_caso, extra) => {
        mocks.tx.mockResolvedValue([[doc(extra)]]);
        const res = await pay();
        expect(res.status).toBe(409);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('una cuenta sin capacidades registradas sigue la decisión del negocio, como la cotización', async () => {
        mocks.tx.mockResolvedValueOnce([[doc({ stripe_capacidades: {}, stripe_spei_customer_id: 'cus_factura' })]])
            .mockResolvedValueOnce([[{ id: DOC }]]);
        fetchMock.mockResolvedValueOnce(response(spei({ status: 'requires_payment_method', next_action: null })))
            .mockResolvedValueOnce(response(spei()));
        expect((await pay()).status).toBe(200);
    });
});

describe('primer pago por SPEI', () => {
    it('crea la CLABE de la factura, liga el intento y SOLO después lo confirma', async () => {
        mocks.tx.mockResolvedValueOnce([[doc()]])
            .mockResolvedValueOnce([[{ stripe_spei_customer_id: 'cus_factura' }]])
            .mockResolvedValueOnce([[{ id: DOC }]]);
        fetchMock.mockResolvedValueOnce(response({ id: 'cus_factura' }))
            .mockResolvedValueOnce(response(spei({ status: 'requires_payment_method', next_action: null })))
            .mockResolvedValueOnce(response(spei()));
        const res = await pay();
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
            metodo: 'spei', amount: 100000, currency: 'MXN',
            instructions: { clabe: '002180650612345670', bankName: 'BANAMEX', reference: 'REF4821', beneficiary: 'Taller Norte', amountRemaining: 100000, received: 0 },
        });
        const [cus, crea, confirma] = calls();
        expect(cus).toMatchObject({ url: 'https://api.stripe.com/v1/customers', key: `cord-inv-spei-cus-${DOC}` });
        expect(cus.form.get('email')).toBe('pagos@acme.mx');
        expect(cus.form.get('metadata[documento_id]')).toBe(DOC);
        expect(crea).toMatchObject({ url: 'https://api.stripe.com/v1/payment_intents', key: `cord-inv-v2-${DOC}-first` });
        expect(crea.form.get('customer')).toBe('cus_factura');
        expect(crea.form.get('payment_method_types[0]')).toBe('customer_balance');
        expect(crea.form.get('payment_method_types[1]')).toBeNull();
        expect(crea.form.get('payment_method_options[customer_balance][funding_type]')).toBe('bank_transfer');
        expect(crea.form.get('payment_method_options[customer_balance][bank_transfer][type]')).toBe('mx_bank_transfer');
        expect(crea.form.get('metadata[documento_id]')).toBe(DOC);
        expect(confirma).toMatchObject({ url: 'https://api.stripe.com/v1/payment_intents/pi_spei/confirm', key: 'cord-inv-spei-confirm-pi_spei' });
        expect(confirma.form.get('payment_method_data[type]')).toBe('customer_balance');
        // La CLABE se guarda antes del pago, y el intento se liga antes de confirmarse.
        const textos = mocks.tx.mock.calls.map(([, q]) => q.text);
        expect(textos[1]).toContain('stripe_spei_customer_id = coalesce(stripe_spei_customer_id');
        expect(textos[2]).toContain('set stripe_payment_intent_id');
        expect(mocks.tx.mock.invocationCallOrder[2]).toBeLessThan(fetchMock.mock.invocationCallOrder[2]);
        expect(mocks.tx.mock.calls.every(([org]) => org === 'org-a')).toBe(true);
    });

    it('cobra la comisión de SPEI de la tabla, no la de tarjeta', async () => {
        mocks.tx.mockResolvedValueOnce([[doc({ fee_enabled: true, fee_terms_version: FEE_TERMS_VERSION, stripe_spei_customer_id: 'cus_factura' })]])
            .mockResolvedValueOnce([[{ id: DOC }]]);
        fetchMock.mockResolvedValueOnce(response(spei({ status: 'requires_payment_method', next_action: null })))
            .mockResolvedValueOnce(response(spei()));
        expect((await pay()).status).toBe(200);
        const esperado = computeFee({ amountCents: 100000, metodo: 'spei', moneda: 'MXN', enabled: true });
        const tarjeta = computeFee({ amountCents: 100000, metodo: 'card', moneda: 'MXN', enabled: true });
        expect(esperado.applicationFeeCents).not.toBe(tarjeta.applicationFeeCents);
        const crea = calls()[0];
        expect(crea.form.get('application_fee_amount')).toBe(String(esperado.applicationFeeCents));
        expect(crea.form.get('metadata[cord_fee_total_cents]')).toBe(String(esperado.applicationFeeCents));
        // Con la tarifa activa en MXN el Payment Element solo ofrece tarjeta,
        // pero SPEI sí se ofrece: tiene su propia tarifa aprobada.
        expect(crea.form.get('payment_method_types[0]')).toBe('customer_balance');
    });

    it('si el saldo del cliente ya cubre el pago, no muestra una CLABE: espera el registro', async () => {
        mocks.tx.mockResolvedValueOnce([[doc({ stripe_spei_customer_id: 'cus_factura' })]]).mockResolvedValueOnce([[{ id: DOC }]]);
        fetchMock.mockResolvedValueOnce(response(spei({ status: 'requires_payment_method', next_action: null })))
            .mockResolvedValueOnce(response(spei({ status: 'succeeded', next_action: null, amount_received: 100000 })));
        const res = await pay();
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ code: 'payment_pending' });
    });

    it('no presenta instrucciones si el saldo cambió antes de ligar el intento', async () => {
        mocks.tx.mockResolvedValueOnce([[doc({ stripe_spei_customer_id: 'cus_factura' })]]).mockResolvedValueOnce([[]]);
        fetchMock.mockResolvedValueOnce(response(spei({ status: 'requires_payment_method', next_action: null })));
        const res = await pay();
        expect(res.status).toBe(409);
        expect(calls().some((c) => c.url.endsWith('/confirm'))).toBe(false);
    });
});

describe('visitas siguientes: la misma CLABE', () => {
    it('reutiliza el intento abierto sin crear Customer ni intento nuevos', async () => {
        mocks.tx.mockResolvedValue([[doc({ stripe_payment_intent_id: 'pi_spei', stripe_spei_customer_id: 'cus_factura' })]]);
        fetchMock.mockResolvedValueOnce(response(spei()));
        const res = await pay();
        expect(await res.json()).toMatchObject({ metodo: 'spei', instructions: { clabe: '002180650612345670' } });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('otro importe cancela el intento sin fondos y abre otro con el MISMO Customer', async () => {
        mocks.tx.mockResolvedValueOnce([[doc({ stripe_payment_intent_id: 'pi_spei', stripe_spei_customer_id: 'cus_factura' })]])
            .mockResolvedValueOnce([[{ id: DOC }]]);
        fetchMock.mockResolvedValueOnce(response(spei()))
            .mockResolvedValueOnce(response(spei({ status: 'canceled' })))
            .mockResolvedValueOnce(response(spei({ id: 'pi_dos', amount: 40000, status: 'requires_payment_method', next_action: null })))
            .mockResolvedValueOnce(response(spei({ id: 'pi_dos', amount: 40000, next_action: instrucciones(40000) })));
        const res = await pay({ metodo: 'spei', monto: 400 });
        expect(await res.json()).toMatchObject({ amount: 40000, instructions: { amountRemaining: 40000 } });
        const c = calls();
        expect(c[1]).toMatchObject({ url: 'https://api.stripe.com/v1/payment_intents/pi_spei/cancel', key: 'cord-inv-cancel-pi_spei' });
        expect(c[2]).toMatchObject({ key: `cord-inv-v2-${DOC}-pi_spei` });
        expect(c[2].form.get('customer')).toBe('cus_factura');
        expect(c.some((x) => x.url.endsWith('/v1/customers'))).toBe(false);
    });

    it('cambiar a tarjeta cancela el SPEI sin fondos y crea el intento de tarjeta', async () => {
        mocks.tx.mockResolvedValueOnce([[doc({ stripe_payment_intent_id: 'pi_spei', stripe_spei_customer_id: 'cus_factura' })]])
            .mockResolvedValueOnce([[{ id: DOC }]]);
        fetchMock.mockResolvedValueOnce(response(spei()))
            .mockResolvedValueOnce(response(spei({ status: 'canceled' })))
            .mockResolvedValueOnce(response({ id: 'pi_card', client_secret: 'card_secret', amount: 100000 }));
        const res = await pay({});
        expect(await res.json()).toMatchObject({ clientSecret: 'card_secret' });
        const crea = calls()[2];
        expect(crea.form.get('payment_method_types[0]')).toBe('card');
        expect(crea.form.get('customer')).toBeNull();
    });

    it('si no puede demostrar la cancelación, no abre otro pago', async () => {
        mocks.tx.mockResolvedValue([[doc({ stripe_payment_intent_id: 'pi_spei', stripe_spei_customer_id: 'cus_factura' })]]);
        fetchMock.mockResolvedValueOnce(response(spei()))
            .mockRejectedValueOnce(new Error('respuesta perdida'))
            .mockResolvedValueOnce(response(spei()));
        const res = await pay({});
        expect(res.status).toBe(409);
        expect(calls().filter((c) => c.url === 'https://api.stripe.com/v1/payment_intents')).toHaveLength(0);
    });

    it('un intento de tarjeta pendiente se reemplaza por SPEI; uno en proceso no', async () => {
        mocks.tx.mockResolvedValueOnce([[doc({ stripe_payment_intent_id: 'pi_card', stripe_spei_customer_id: 'cus_factura' })]])
            .mockResolvedValueOnce([[{ id: DOC }]]);
        fetchMock.mockResolvedValueOnce(response({ id: 'pi_card', status: 'requires_payment_method', amount: 100000, payment_method_types: ['card'] }))
            .mockResolvedValueOnce(response({ id: 'pi_card', status: 'canceled' }))
            .mockResolvedValueOnce(response(spei({ status: 'requires_payment_method', next_action: null })))
            .mockResolvedValueOnce(response(spei()));
        expect((await pay()).status).toBe(200);

        vi.resetModules(); fetchMock.mockReset(); mocks.tx.mockReset();
        mocks.tx.mockResolvedValue([[doc({ stripe_payment_intent_id: 'pi_card', stripe_spei_customer_id: 'cus_factura' })]]);
        fetchMock.mockResolvedValueOnce(response({ id: 'pi_card', status: 'processing', amount: 100000, payment_method_types: ['card'] }));
        expect((await pay()).status).toBe(409);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('transferencia incompleta', () => {
    const parcial = () => spei({ next_action: instrucciones(30000) });

    it('muestra lo que falta a la misma CLABE, sin cancelar ni cambiar el importe', async () => {
        mocks.tx.mockResolvedValue([[doc({ stripe_payment_intent_id: 'pi_spei', stripe_spei_customer_id: 'cus_factura' })]]);
        fetchMock.mockResolvedValueOnce(response(parcial()));
        // Aunque pida otro importe: el dinero recibido está retenido en ESTE intento.
        const res = await pay({ metodo: 'spei', monto: 200 });
        expect(await res.json()).toMatchObject({ instructions: { amount: 100000, amountRemaining: 30000, received: 70000 } });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('no deja pagar con tarjeta encima de un SPEI con fondos', async () => {
        mocks.tx.mockResolvedValue([[doc({ stripe_payment_intent_id: 'pi_spei', stripe_spei_customer_id: 'cus_factura' })]]);
        fetchMock.mockResolvedValueOnce(response(parcial()));
        const res = await pay({});
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ code: 'spei_parcial' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('errores del proveedor', () => {
    it('no devuelve el mensaje crudo del proveedor al crear la CLABE', async () => {
        mocks.tx.mockResolvedValue([[doc()]]);
        fetchMock.mockResolvedValueOnce(response({ error: { message: 'No such capability: mx_bank_transfer_payments' } }, 400));
        const res = await pay();
        expect(res.status).toBe(502);
        expect(await res.text()).not.toContain('mx_bank_transfer_payments');
    });
});
