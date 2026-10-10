// SPEI en facturas contra Postgres real (PGlite): una CLABE por factura (el
// índice lo impone), el pago completo entra al ledger UNA vez con método spei y
// dispara el complemento de pago, y lo que no es pago (fondeo parcial, saldo
// sobrante) solo deja constancia en la factura de ESA CLABE.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ tx: vi.fn(), event: vi.fn(), alert: vi.fn(), complement: vi.fn(), org: { id: '' as string | null } }));
vi.mock('../src/lib/db', () => ({
    withOrgTx: m.tx,
    sql: (s: TemplateStringsArray, ...values: unknown[]) => {
        const q = { text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values };
        // El resolutor de la cuenta conectada se usa como `await sql\`…\``.
        return Object.assign(q, {
            then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
                Promise.resolve(q.text.includes('cord_resolve_org_for_connected_account') ? [{ id: m.org.id }] : []).then(ok, ko),
        });
    },
}));
vi.mock('../src/lib/fiscal/timeline', () => ({ logInvoiceEvent: m.event }));
vi.mock('../src/lib/ops-alert', () => ({ sendOpsAlert: m.alert }));
vi.mock('../src/lib/after', () => ({ after: (p: unknown) => p }));
vi.mock('../src/lib/fiscal/payment-complement', () => ({ emitPaymentComplement: m.complement }));
vi.mock('../src/lib/integraciones/hojas/service', () => ({ onAbonoFactura: vi.fn() }));
vi.mock('../src/lib/integraciones/contabilidad/pagos', () => ({ onPagoFactura: vi.fn() }));

import { applyPayment, carryQuotePayments } from '../src/lib/fiscal/payments';
import { saldoSinAplicar, transferenciaParcial } from '../src/lib/cobros/spei';
import { invoiceEventDetail } from '../src/lib/fiscal/timeline-detail';

const org = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const cli = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const Q = '99999999-9999-4999-8999-999999999999';
const COBRO = '88888888-8888-4888-8888-888888888888';
let db: PGlite;
const q = (text: string, values: unknown[] = []) => db.query<any>(text, values);
const doc = async (id: string) => (await q('select * from documentos_fiscales where id = $1', [id])).rows[0];

beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
        create table orgs (id uuid primary key, nombre text);
        create table clientes (id uuid primary key, org_id uuid not null references orgs(id), empresa text, email text);
        create table cotizaciones (id uuid primary key, org_id uuid not null, folio text, base_currency text);
        create table cotizacion_cobros (
            id uuid primary key, org_id uuid not null, cotizacion_id uuid not null, monto numeric not null, status text,
            stripe_payment_intent_id text, mp_payment_id text, payment_method text);
        create table documentos_fiscales (
            id uuid primary key, org_id uuid not null references orgs(id), cliente_id uuid, cotizacion_id uuid, invoice_number text,
            total numeric not null, currency text not null, amount_paid numeric default 0, amount_remaining numeric,
            amount_credited numeric default 0, amount_refunded numeric default 0, refund_due numeric default 0,
            lifecycle text, status text, document_type text default 'invoice', credit_note_of uuid, provider_data jsonb,
            updated_at timestamptz default now(), sustituida_por uuid, informacion_global jsonb);
        create table documento_pagos (
            id uuid primary key default gen_random_uuid(), org_id uuid not null, documento_id uuid not null,
            monto numeric, currency text, stripe_payment_intent_id text, mp_payment_id text, metodo text, referencia text,
            cobro_id uuid, nota text, registrado_por uuid, aplicado_at timestamptz not null default now());
        create unique index pagos_pi on documento_pagos(documento_id, stripe_payment_intent_id) where stripe_payment_intent_id is not null;
        create table documento_reembolsos (
            org_id uuid not null, stripe_refund_id text, stripe_payment_intent_id text, mp_refund_id text, mp_payment_id text,
            monto numeric not null, currency text not null, status text not null);
        create table documento_reembolso_asignaciones (
            org_id uuid not null, stripe_refund_id text, documento_id uuid, monto numeric, currency text);
    `);
    // La sección del esquema tal cual: columna e índice único de la CLABE por factura.
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const inicio = schema.indexOf('-- ── SPEI con CLABE en facturas');
    expect(inicio).toBeGreaterThan(0);
    await db.exec(schema.slice(inicio, schema.indexOf('-- END spei-facturas', inicio)));
    m.tx.mockImplementation((orgId: string, ...queries: Array<{ text: string; values: unknown[] }>) => db.transaction(async (tx) => {
        await tx.query("select set_config('app.org_id', $1, true)", [orgId]);
        const out = [];
        for (const query of queries) out.push((await tx.query(query.text, query.values)).rows);
        return out;
    }));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
    m.event.mockReset(); m.alert.mockReset(); m.complement.mockReset(); m.alert.mockResolvedValue(true);
    m.org.id = org;
    await db.exec('truncate documento_pagos, documento_reembolsos, documento_reembolso_asignaciones, documentos_fiscales, cotizacion_cobros, cotizaciones, clientes, orgs cascade');
    await q("insert into orgs(id, nombre) values ($1, 'Taller Norte')", [org]);
    await q("insert into clientes(id, org_id, empresa, email) values ($1, $2, 'Acme', 'pagos@acme.mx')", [cli, org]);
    const ins = (id: string, total: number, numero: string, customer: string) => q(`
        insert into documentos_fiscales(id, org_id, cliente_id, invoice_number, total, currency, amount_remaining, lifecycle, status, stripe_spei_customer_id)
        values ($1, $2, $3, $4, $5, 'MXN', $5, 'open', 'issued', $6)`, [id, org, cli, numero, total, customer]);
    await ins(A, 100, 'F-1', 'cus_A');
    await ins(B, 60, 'F-2', 'cus_B');
});

const intentParcial = (documentoId: string, customer: string) => ({
    id: 'pi_a', status: 'requires_action', amount: 10000, currency: 'mxn', customer,
    payment_method_types: ['customer_balance'], metadata: { documento_id: documentoId },
    next_action: { display_bank_transfer_instructions: { amount_remaining: 3000 } },
});

describe('una CLABE por factura', () => {
    it('el índice impide que dos facturas compartan el mismo Customer', async () => {
        await expect(q("update documentos_fiscales set stripe_spei_customer_id = 'cus_A' where id = $1", [B])).rejects.toThrow(/unique/i);
    });
});

describe('el pago completo', () => {
    it('entra UNA vez a su factura, con método spei, y dispara el complemento de pago', async () => {
        const pago = { monto: 100, currency: 'MXN', metodo: 'spei', stripePaymentIntentId: 'pi_a', referencia: 'pi_a' };
        const primero = await applyPayment(org, A, pago);
        const segundo = await applyPayment(org, A, pago);
        expect(primero).toMatchObject({ ok: true, justPaid: true, amountRemaining: 0 });
        expect(segundo).toMatchObject({ ok: true, duplicate: true, justPaid: false });
        const pagos = (await q('select documento_id, metodo, monto from documento_pagos')).rows;
        expect(pagos).toEqual([{ documento_id: A, metodo: 'spei', monto: '100' }]);
        expect(await doc(B)).toMatchObject({ lifecycle: 'open', amount_remaining: '60' });
        await vi.waitFor(() => expect(m.complement).toHaveBeenCalledTimes(1));
        const [{ id: pagoId }] = (await q('select id from documento_pagos')).rows;
        expect(m.complement).toHaveBeenCalledWith(org, A, pagoId);
    });

    it('un SPEI cobrado en la cotización llega a su factura como spei, no como tarjeta', async () => {
        await q("insert into cotizaciones(id, org_id, folio, base_currency) values ($1, $2, 'COT-7', 'MXN')", [Q, org]);
        await q("update documentos_fiscales set cotizacion_id = $1 where id = $2", [Q, A]);
        await q(`insert into cotizacion_cobros(id, org_id, cotizacion_id, monto, status, stripe_payment_intent_id, payment_method)
                 values ($1, $2, $3, 100, 'pagado', 'pi_cot', 'spei')`, [COBRO, org, Q]);
        expect(await carryQuotePayments(org, Q)).toEqual([A]);
        expect((await q('select metodo, cobro_id from documento_pagos')).rows).toEqual([{ metodo: 'spei', cobro_id: COBRO }]);
        await vi.waitFor(() => expect(m.complement).toHaveBeenCalledTimes(1));
    });
});

describe('lo que llega y todavía no es un pago', () => {
    it('una transferencia incompleta deja constancia en SU factura y no toca el ledger', async () => {
        await transferenciaParcial(intentParcial(A, 'cus_A'), 'acct_seller');
        expect(m.event).toHaveBeenCalledTimes(1);
        const [o, d, tipo, detalle] = m.event.mock.calls[0];
        expect([o, d, tipo]).toEqual([org, A, 'transferencia']);
        expect(detalle).toBe('Transferencia SPEI incompleta: llegaron 70.00 MXN de 100.00 MXN; faltan 30.00 MXN a la misma CLABE. El pago se registra al completarse');
        expect(detalle.length).toBeLessThanOrEqual(300);
        expect(invoiceEventDetail('transferencia', detalle, 'en')).toMatch(/^Incomplete SPEI transfer: 70\.00 MXN of 100\.00 MXN arrived/);
        expect((await q('select * from documento_pagos')).rows).toEqual([]);
        expect(await doc(A)).toMatchObject({ amount_remaining: '100', lifecycle: 'open' });
    });

    it('un intento que dice ser de una factura pero trae la CLABE de otra se ignora', async () => {
        await transferenciaParcial(intentParcial(A, 'cus_B'), 'acct_seller');
        await transferenciaParcial({ ...intentParcial(A, 'cus_A'), payment_method_types: ['card'] }, 'acct_seller');
        m.org.id = null;
        await transferenciaParcial(intentParcial(A, 'cus_A'), 'acct_ajena');
        expect(m.event).not.toHaveBeenCalled();
    });

    it('el saldo sobrante se cuenta en la factura de ESA CLABE; con la factura pagada, también a Operaciones', async () => {
        const saldo = { object: 'cash_balance', customer: 'cus_B', available: { mxn: 2500 } };
        await saldoSinAplicar(saldo, 'acct_seller');
        expect(m.event).toHaveBeenCalledWith(org, B, 'transferencia',
            'Transferencia SPEI sin pago abierto: 25.00 MXN a favor del cliente. Se aplica cuando vuelva a elegir SPEI en la factura');
        expect(m.alert).not.toHaveBeenCalled();

        await q("update documentos_fiscales set lifecycle = 'paid', amount_remaining = 0 where id = $1", [B]);
        await saldoSinAplicar(saldo, 'acct_seller');
        const detalle = m.event.mock.calls[1][3];
        expect(detalle).toBe('Transferencia SPEI de más: 25.00 MXN a favor del cliente, sin aplicar a la factura. Hay que devolvérselo');
        expect(invoiceEventDetail('transferencia', detalle, 'en')).toMatch(/^SPEI overpayment: 25\.00 MXN/);
        expect(m.alert).toHaveBeenCalledWith('Saldo SPEI a favor del cliente', expect.stringContaining(B));
        expect((await q('select * from documento_pagos')).rows).toEqual([]);
    });

    it('un Customer que no es CLABE de factura (cotización, portal) o sin saldo no se reporta', async () => {
        await saldoSinAplicar({ customer: 'cus_cotizacion', available: { mxn: 2500 } }, 'acct_seller');
        await saldoSinAplicar({ customer: 'cus_A', available: { mxn: 0 } }, 'acct_seller');
        expect(m.event).not.toHaveBeenCalled();
    });
});
