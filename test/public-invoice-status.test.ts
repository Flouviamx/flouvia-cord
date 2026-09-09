import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publicInvoiceContact, publicInvoiceGuidance, publicPaymentIntent } from '../src/lib/fiscal/public-invoice-state';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), tx: vi.fn(), limit: vi.fn() }));
vi.mock('../src/lib/db', () => ({ resolvePublicInvoice: mocks.resolve, withOrgTx: mocks.tx,
    sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({ text: parts.join('?'), values }),
}));
vi.mock('../src/lib/ratelimit', () => ({ rateLimit: mocks.limit, tooMany: vi.fn() }));
vi.mock('../src/lib/public-viewer', () => ({ resolveViewer: vi.fn() }));
vi.mock('../src/lib/fiscal/timeline', () => ({ logInvoiceEvent: vi.fn() }));
const invoice = { estado: 'open', esNotaCredito: false, porDevolver: 0, saldo: 500, acreditado: 0, puedePagar: true, regresoDePago: false };
const row = { lifecycle: 'open', currency: 'MXN', amount_paid: '500', amount_remaining: '500', amount_credited: '0', amount_refunded: '0', refund_due: '0', payment_recorded: false };
async function get(query = '') {
    const { GET } = await import('../src/pages/api/i/[token]');
    return GET({ params: { token: 'public-token' }, request: new Request(`https://cordhq.app/api/i/public-token${query}`) } as any);
}
beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({ id: 'invoice-a', orgId: 'org-a' });
    mocks.tx.mockResolvedValue([[row]]);
    mocks.limit.mockResolvedValue({ ok: true });
});

describe('public invoice guidance', () => {
    it('does not claim payment based on the return URL', () => {
        expect(publicInvoiceGuidance({ ...invoice, regresoDePago: true }, 'es')).toContain('verificando');
        expect(publicInvoiceGuidance({ ...invoice, regresoDePago: true }, 'en')).toContain('checking');
    });
    it('explains that a credit note is not a request for money', () => {
        expect(publicInvoiceGuidance({ ...invoice, esNotaCredito: true }, 'es')).toContain('No es una solicitud');
    });
    it('prioritizes cancellation over payment and credit note actions', () => {
        expect(publicInvoiceGuidance({ ...invoice, estado: 'void', esNotaCredito: true, regresoDePago: true }, 'es')).toContain('cancelado');
    });
    it('does not promise an automatic refund', () => {
        expect(publicInvoiceGuidance({ ...invoice, estado: 'paid', saldo: 0, porDevolver: 100 }, 'es')).toContain('coordinarlo');
    });
    it('explains settlement by credit without calling it a payment', () => {
        expect(publicInvoiceGuidance({ ...invoice, estado: 'paid', saldo: 0, acreditado: 500 }, 'es')).toContain('No tienes saldo pendiente');
    });
    it('offers contact for uncollectible and offline invoices', () => {
        expect(publicInvoiceGuidance({ ...invoice, estado: 'uncollectible' }, 'es')).toContain('revisar');
        expect(publicInvoiceGuidance({ ...invoice, puedePagar: false }, 'en')).toContain('arrange payment');
    });
    it('builds company contact links with an encoded invoice reference', () => {
        const result = publicInvoiceContact('finance@example.com', '+52 (55) 1234-5678', 'A&2', 'es');
        expect(result).toEqual({ mailto: 'mailto:finance%40example.com?subject=Factura%20A%262', tel: 'tel:+525512345678' });
    });
    it.each(['a@example.com?bcc=private@example.com', 'a@example.com\r\nBcc:b@example.com', 'a%0Abcc@example.com', 'a@example.com,b@example.com'])(
        'rejects injected email destination %s', email => expect(publicInvoiceContact(email, 'javascript:alert(1)', '', 'en')).toEqual({ mailto: null, tel: null }),
    );
    it('rejects malformed or secret-bearing payment identifiers', () => {
        expect(publicPaymentIntent('pi_123')).toBe('pi_123');
        expect(publicPaymentIntent('pi_123_secret_abcd')).toBeNull();
        expect(publicPaymentIntent('pi_123&org=other')).toBeNull();
    });
});

describe('public balance refresh', () => {
    it('the actual PostgreSQL query excludes payments from another tenant or invoice and revoked tokens', async () => {
        const { PGlite } = await import('@electric-sql/pglite');
        const db = new PGlite();
        try {
            await get('?payment_intent=pi_partial');
            const query = mocks.tx.mock.calls[0][1];
            let n = 0;
            const statement = query.text.replace(/\?/g, () => `$${++n}`);
            await db.exec(`
                create table documentos_fiscales(id text,org_id text,public_token text,lifecycle text,currency text,
                    amount_paid numeric,amount_remaining numeric,amount_credited numeric,amount_refunded numeric,refund_due numeric);
                create table documento_pagos(org_id text,documento_id text,stripe_payment_intent_id text);
                insert into documentos_fiscales values('invoice-a','org-a','public-token','open','MXN',500,500,0,0,0);
                insert into documento_pagos values('org-b','invoice-a','pi_partial'),('org-a','invoice-b','pi_partial');
            `);
            expect((await db.query<any>(statement, query.values)).rows[0].payment_recorded).toBe(false);
            await db.exec("insert into documento_pagos values('org-a','invoice-a','pi_partial')");
            expect((await db.query<any>(statement, query.values)).rows[0].payment_recorded).toBe(true);
            await db.exec("update documentos_fiscales set public_token='revoked'");
            expect((await db.query(statement, query.values)).rows).toHaveLength(0);
            await db.exec("update documentos_fiscales set public_token='public-token', lifecycle='draft'");
            expect((await db.query(statement, query.values)).rows).toHaveLength(0);
        } finally { await db.close(); }
    }, 15000);
    it('returns only public balances with private no-store headers', async () => {
        mocks.tx.mockResolvedValue([[{ ...row, provider_data: { secret: 'not-public' }, recipient_snapshot: { email: 'private@example.com' } }]]);
        const result = await get('?pagado=1');
        expect(await result.json()).toEqual({ estado: 'open', currency: 'MXN', pagado: 500, saldo: 500, acreditado: 0, reembolsado: 0, porDevolver: 0, paymentRecorded: false });
        expect(result.headers.get('cache-control')).toBe('private, no-store');
        expect(result.headers.get('referrer-policy')).toBe('no-referrer');
        expect(result.headers.get('x-robots-tag')).toContain('noindex');
    });
    it('confirms a partial payment only when the same document ledger contains it', async () => {
        mocks.tx.mockResolvedValue([[{ ...row, payment_recorded: true }]]);
        expect(await (await get('?payment_intent=pi_partial')).json()).toMatchObject({ saldo: 500, paymentRecorded: true });
        const [org, query] = mocks.tx.mock.calls[0];
        expect(org).toBe('org-a');
        expect(query.values).toEqual(['pi_partial', 'invoice-a', 'org-a', 'public-token']);
        expect(query.text).toContain('p.org_id = d.org_id and p.documento_id = d.id');
        expect(query.text).toContain("d.lifecycle in ('open', 'paid', 'void', 'uncollectible')");
    });
    it('does not query a secret as a payment identifier', async () => {
        await get('?payment_intent=pi_a_secret_b');
        expect(mocks.tx.mock.calls[0][1].values[0]).toBeNull();
    });
    it('does not open a tenant transaction for an unknown token', async () => {
        mocks.resolve.mockResolvedValue(null);
        expect((await get()).status).toBe(404);
        expect(mocks.tx).not.toHaveBeenCalled();
    });
    it('does not expose an unpublished or revoked document', async () => {
        mocks.tx.mockResolvedValue([[]]);
        expect((await get()).status).toBe(404);
    });
    it('limits polling before resolving the document', async () => {
        mocks.limit.mockResolvedValue({ ok: false, retryAfter: 5 });
        const response = await get();
        expect(response.status).toBe(429);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(mocks.resolve).not.toHaveBeenCalled();
    });
});
