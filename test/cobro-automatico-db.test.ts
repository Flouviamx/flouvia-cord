// Cobro automático contra Postgres real (PGlite): qué facturas se cargan, a
// qué método, qué pasa con un rechazo y con una respuesta incierta.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ tx: vi.fn(), stripe: vi.fn(), aviso: vi.fn() }));
vi.mock('../src/lib/db', () => ({
    withOrgTx: m.tx,
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values }),
}));
vi.mock('../src/lib/billing', () => ({ stripe: m.stripe }));
vi.mock('../src/lib/fiscal/timeline', () => ({ logInvoiceEvent: vi.fn() }));
vi.mock('../src/lib/after', () => ({ after: () => {} }));
vi.mock('../src/lib/cobros/avisos', () => ({ avisarFalloCobro: m.aviso }));
vi.mock('../src/lib/cobros/webhook', () => ({
    cobroConfirmado: vi.fn(), cobroEnProceso: vi.fn(), cobroCancelado: vi.fn(), cobroFallido: vi.fn(),
}));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), info: vi.fn() } }));

import { cobrarCliente, conciliarPendiente, metodoCubre } from '../src/lib/cobros/automatico';

const org = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const cli = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ahora = new Date('2026-10-08T14:15:00Z');
let db: PGlite;
const q = (text: string, values: unknown[] = []) => db.query<any>(text, values);

beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
        create table orgs (
            id uuid primary key, nombre text, stripe_account_id text, stripe_charges_enabled boolean, acepta_tarjeta boolean default true,
            fee_enabled boolean default false, fee_terms_version text, sandbox_of uuid, is_demo boolean default false);
        create table clientes (id uuid primary key, org_id uuid not null references orgs(id), empresa text, email text);
        create table documentos_fiscales (
            id uuid primary key, org_id uuid not null references orgs(id), cliente_id uuid, invoice_number text,
            total numeric not null, currency text not null, amount_remaining numeric, lifecycle text, status text,
            document_type text default 'invoice', credit_note_of uuid, provider_data jsonb, stripe_payment_intent_id text,
            due_date date, issued_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(),
            sustituye_a uuid, sustituida_por uuid, informacion_global jsonb);
        create table documento_pagos (
            id uuid primary key default gen_random_uuid(), org_id uuid not null, documento_id uuid not null,
            monto numeric, currency text, stripe_payment_intent_id text, aplicado_at timestamptz default now());
        create table documento_reembolsos (org_id uuid, stripe_refund_id text, stripe_payment_intent_id text, monto numeric, currency text, status text);
    `);
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const inicio = schema.indexOf('-- PORTAL DEL CLIENTE, COBRO AGRUPADO');
    await db.exec(schema.slice(inicio, schema.indexOf('-- END cobros-portal', inicio)));
    m.tx.mockImplementation((orgId: string, ...queries: Array<{ text: string; values: unknown[] }>) => db.transaction(async (tx) => {
        await tx.query("select set_config('app.org_id', $1, true)", [orgId]);
        const out = [];
        for (const query of queries) out.push((await tx.query(query.text, query.values)).rows);
        return out;
    }));
}, 30000);
afterAll(async () => { await db?.close(); });

const consentimiento = (fecha = '2026-10-01') => JSON.stringify({ version: 'v', aceptado_at: `${fecha}T10:00:00Z`, ip: '203.0.113.9', user_agent: 'x' });
beforeEach(async () => {
    m.stripe.mockReset(); m.aviso.mockReset();
    await db.exec('truncate pago_agrupado_documentos, pagos_agrupados, cobro_automatico_estado, documento_pagos, documentos_fiscales, clientes, orgs cascade');
    await q("insert into orgs(id, nombre, stripe_account_id, stripe_charges_enabled) values ($1, 'Taller', 'acct_1', true)", [org]);
    await q(`insert into clientes(id, org_id, empresa, email, autopay_activo, autopay_payment_method_id, autopay_metodo,
                autopay_consentimiento, stripe_customer_id, stripe_customer_account)
             values ($1, $2, 'Acme', 'pagos@acme.test', true, 'pm_card', '{"tipo":"card","marca":"visa","last4":"4242"}', $3, 'cus_1', 'acct_1')`,
        [cli, org, consentimiento()]);
    const ins = (id: string, total: number, due: string, issued: string, currency = 'MXN') => q(`
        insert into documentos_fiscales(id, org_id, cliente_id, invoice_number, total, currency, amount_remaining, lifecycle, status, due_date, issued_at)
        values ($1, $2, $3, $8, $4, $5, $4, 'open', 'issued', $6, $7)`, [id, org, cli, total, currency, due, issued, `F-${id.slice(0, 4)}`]);
    await ins(A, 100, '2026-10-08', '2026-10-01T09:00:00Z');
    await ins(B, 60, '2026-10-05', '2026-10-02T09:00:00Z');
});

describe('qué cubre cada método', () => {
    it('la tarjeta cubre cualquier divisa; la domiciliación solo la suya', () => {
        expect(metodoCubre('card', 'JPY')).toBe(true);
        expect(metodoCubre('sepa_debit', 'EUR')).toBe(true);
        expect(metodoCubre('sepa_debit', 'USD')).toBe(false);
        expect(metodoCubre('us_bank_account', 'usd')).toBe(true);
    });
});

describe('cobro automático', () => {
    it('carga las facturas vencidas en UN cargo sin el cliente presente', async () => {
        m.stripe.mockResolvedValueOnce({ id: 'pi_auto', status: 'succeeded', amount: 16000 });
        expect(await cobrarCliente(org, cli, 'MXN', ahora)).toBe('cobrado');
        const [path, form, method, opts] = m.stripe.mock.calls[0];
        expect([path, method]).toEqual(['/v1/payment_intents', 'POST']);
        expect(form).toMatchObject({
            amount: '16000', currency: 'mxn', customer: 'cus_1', payment_method: 'pm_card',
            confirm: 'true', off_session: 'true', 'payment_method_types[0]': 'card', 'metadata[cord_autopay]': '1',
        });
        const [pago] = (await q('select id, estado, stripe_payment_intent_id, monto from pagos_agrupados')).rows;
        expect(opts).toEqual({ stripeAccount: 'acct_1', idempotencyKey: `cord-grupo-${pago.id}` });
        expect(pago).toMatchObject({ estado: 'creado', stripe_payment_intent_id: 'pi_auto', monto: '160' });
    });

    it('no carga lo que vencía antes de la autorización ni lo emitido hoy', async () => {
        await q('update clientes set autopay_consentimiento = $1 where id = $2', [consentimiento('2026-10-06'), cli]);
        await q("update documentos_fiscales set issued_at = '2026-10-08T08:00:00Z' where id = $1", [A]);
        expect(await cobrarCliente(org, cli, 'MXN', ahora)).toBe('sin_facturas');
        expect(m.stripe).not.toHaveBeenCalled();
    });

    it('un método que no cubre la divisa no se usa', async () => {
        await q(`update clientes set autopay_metodo = '{"tipo":"sepa_debit","last4":"3000"}' where id = $1`, [cli]);
        expect(await cobrarCliente(org, cli, 'MXN', ahora)).toBe('no_cubre');
    });

    it('un rechazo programa el reintento y avisa; el mismo día espera', async () => {
        const rechazo = Object.assign(new Error('Your card has insufficient funds.'), {
            code: 'card_declined', declineCode: 'insufficient_funds', paymentIntent: { id: 'pi_auto', status: 'requires_payment_method' },
        });
        m.stripe.mockRejectedValueOnce(rechazo);
        expect(await cobrarCliente(org, cli, 'MXN', ahora)).toBe('rechazado');
        const [estado] = (await q('select intentos, siguiente_at, detenido_motivo from cobro_automatico_estado')).rows;
        expect(estado.intentos).toBe(1);
        expect(estado.detenido_motivo).toBeNull();
        expect(new Date(estado.siguiente_at).getTime()).toBeGreaterThan(ahora.getTime());
        expect(m.aviso).toHaveBeenCalledTimes(1);
        expect((await q('select estado from pagos_agrupados')).rows[0].estado).toBe('fallido');
        expect(await cobrarCliente(org, cli, 'MXN', ahora)).toBe('esperando');
        expect(m.stripe).toHaveBeenCalledTimes(1);
    });

    it('sin respuesta del proveedor no abre otro cargo: reintenta con la misma clave', async () => {
        m.stripe.mockRejectedValueOnce(new Error('fetch failed'));
        expect(await cobrarCliente(org, cli, 'MXN', ahora)).toBe('error');
        const [pago] = (await q('select id, estado, stripe_payment_intent_id from pagos_agrupados')).rows;
        expect(pago).toMatchObject({ estado: 'creado', stripe_payment_intent_id: null });
        // Otra corrida no crea un segundo cobro vivo.
        expect(await cobrarCliente(org, cli, 'MXN', ahora)).toBe('en_vuelo');
        // La conciliación reintenta con la MISMA clave de idempotencia.
        m.stripe.mockResolvedValueOnce({ id: 'pi_auto', status: 'succeeded' });
        await conciliarPendiente(org, String(pago.id), new Date(ahora.getTime() + 2 * 3_600_000));
        const llaves = m.stripe.mock.calls.filter(([p]) => p === '/v1/payment_intents').map(([, , , o]) => o.idempotencyKey);
        expect(llaves).toEqual([`cord-grupo-${pago.id}`, `cord-grupo-${pago.id}`]);
    });

    it('México: un CFDI sustituido o con su sustituto en curso no se carga', async () => {
        const S = '33333333-3333-4333-8333-333333333333';
        await q(`insert into documentos_fiscales(id, org_id, cliente_id, total, currency, amount_remaining, lifecycle, status, sustituye_a)
                 values ($1, $2, $3, 100, 'MXN', 100, 'draft', 'pending', $4)`, [S, org, cli, A]);
        await q('update documentos_fiscales set sustituida_por = $1 where id = $2', [S, B]);
        expect(await cobrarCliente(org, cli, 'MXN', ahora)).toBe('sin_facturas');
        expect(m.stripe).not.toHaveBeenCalled();
    });

    it('un cliente detenido no se carga', async () => {
        await q("insert into cobro_automatico_estado(org_id, cliente_id, currency, intentos, detenido_motivo) values ($1, $2, 'MXN', 1, 'requiere_autenticacion')", [org, cli]);
        expect(await cobrarCliente(org, cli, 'MXN', ahora)).toBe('detenido');
    });
});
