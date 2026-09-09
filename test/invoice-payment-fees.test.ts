import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const m = vi.hoisted(() => ({ db: null as any, stripe: vi.fn() }));
vi.mock('../src/lib/billing', () => ({ stripe: m.stripe }));
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: any[]) => ({ text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: async (org: string, ...queries: any[]) => m.db.transaction(async (tx: any) => {
        await tx.exec('set local role invoice_fee_test');
        await tx.query("select set_config('app.org_id',$1,true)", [org]);
        const rows = []; for (const q of queries) rows.push((await tx.query(q.text, q.values)).rows); return rows;
    }),
}));
import { invoiceCommissionValues, reconcileInvoiceCommission, setInvoiceFeeMetadata } from '../src/lib/invoice-payment-fees';
const ORG = '00000000-0000-4000-8000-000000000001', OTHER = '00000000-0000-4000-8000-000000000002';
const DOC = '00000000-0000-4000-8000-000000000003';
const intent = (extra = {}) => ({ id: 'pi_invoice', currency: 'mxn', latest_charge: 'ch_invoice', application_fee_amount: 464,
    metadata: { cord_fee_version: '1', cord_fee_base_cents: '400', cord_fee_tax_cents: '64', cord_fee_total_cents: '464' }, ...extra });
const charge = (extra = {}) => ({ id: 'ch_invoice', payment_intent: 'pi_invoice', status: 'succeeded', captured: true,
    amount: 100000, currency: 'mxn', created: 1788220800, application_fee_amount: 464,
    application_fee: { id: 'fee_invoice', amount: 464, currency: 'mxn' }, payment_method_details: { type: 'card' },
    balance_transaction: { id: 'txn_invoice', currency: 'mxn', amount: 100000, fee: 4988, net: 95012 }, ...extra });
beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`create table orgs(id uuid primary key); create table cotizacion_cobros(id uuid primary key);
        create table documentos_fiscales(id uuid primary key, org_id uuid);
        create table documento_pagos(id uuid default gen_random_uuid(), org_id uuid, documento_id uuid, stripe_payment_intent_id text, currency text);
        create role invoice_fee_test nologin;
        insert into orgs values ('${ORG}'),('${OTHER}');
        insert into documentos_fiscales values ('${DOC}','${ORG}');
        insert into documento_pagos(org_id,documento_id,stripe_payment_intent_id,currency) values ('${ORG}','${DOC}','pi_invoice','MXN');`);
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const start = schema.indexOf('create table if not exists comisiones (');
    await m.db.exec(schema.slice(start, schema.indexOf('-- % de anticipo', start)));
    await m.db.exec('grant select on documentos_fiscales, documento_pagos to invoice_fee_test; grant select,insert,update on comisiones to invoice_fee_test;');
}, 15000);
afterAll(async () => { await m.db.close(); });
beforeEach(async () => { m.stripe.mockReset(); m.stripe.mockResolvedValue(charge()); await m.db.exec('delete from comisiones'); });

describe('invoice fee evidence', () => {
    it('stores the exact fee split without changing the requested fee', () => {
        const form = new URLSearchParams({ application_fee_amount: '464' });
        setInvoiceFeeMetadata(form, { feeBaseCents: 400, feeIvaCents: 64, applicationFeeCents: 464 });
        expect(form.get('metadata[cord_fee_tax_cents]')).toBe('64');
        expect(form.get('application_fee_amount')).toBe('464');
    });
    it('uses actual processor cost and net, preserving the original fee split', () => {
        expect(invoiceCommissionValues(intent(), charge())).toMatchObject({ base: 400, tax: 64, total: 464, processor: 4524, net: 95012, status: 'settled' });
    });
    it.each([{}, { cord_fee_version: '1', cord_fee_base_cents: '464', cord_fee_tax_cents: '64', cord_fee_total_cents: '464' }])('quarantines missing or inconsistent historical fee evidence: %j', metadata => {
        expect(invoiceCommissionValues(intent({ metadata }), charge())).toMatchObject({ total: 464, base: 0, tax: 0, status: 'needs_review' });
    });
    it('accepts a verified zero fee without inventing a tax split', () => {
        expect(invoiceCommissionValues(intent({ metadata: {}, application_fee_amount: 0 }), charge({ application_fee_amount: 0, application_fee: null }))).toMatchObject({ total: 0, base: 0, tax: 0, status: 'settled' });
    });
    it('does not invent a collected fee from the intent when the charge has none', () => {
        expect(invoiceCommissionValues(intent(), charge({ application_fee_amount: null, application_fee: null }))).toMatchObject({ total: 0, base: 0, tax: 0 });
    });
    it('does not estimate the net before a balance transaction exists', () => {
        expect(invoiceCommissionValues(intent(), charge({ balance_transaction: null }))).toMatchObject({ status: 'pending', processor: null, net: null });
    });
    it('rejects a charge amount different from the confirmed payment', () => {
        expect(() => invoiceCommissionValues(intent({ amount_received: 50000 }), charge())).toThrow();
    });
    it('never mixes settlement currency with the invoice currency', () => {
        expect(invoiceCommissionValues(intent(), charge({ balance_transaction: { id: 'txn_fx', currency: 'usd', amount: 5000, fee: 250, net: 4750 } }))).toMatchObject({ status: 'needs_review', processor: null, net: null });
    });
    it.each([{ captured: false }, { payment_intent: 'pi_other' }, { amount: -1 }, { currency: 'eur' }, { amount_captured: 50000 }])('rejects an unrelated or unconfirmed charge: %j', extra => {
        expect(() => invoiceCommissionValues(intent(), charge(extra))).toThrow();
    });
});

describe('invoice commissions in PostgreSQL', () => {
    it('records a direct invoice without a quote cobro and deduplicates retries', async () => {
        await reconcileInvoiceCommission(ORG, DOC, intent(), 'acct_invoice');
        await reconcileInvoiceCommission(ORG, DOC, intent(), 'acct_invoice');
        const rows = (await m.db.query('select * from comisiones')).rows;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ cobro_id: null, fee_base_cents: 400, fee_iva_cents: 64, fee_total_cents: 464, stripe_fee_cents: 4524, neto_vendedor_cents: 95012 });
        expect(m.stripe).toHaveBeenCalledWith('/v1/charges/ch_invoice', expect.anything(), 'GET', { stripeAccount: 'acct_invoice' });
    });
    it('keeps a refunded commission refunded after a payment replay', async () => {
        await reconcileInvoiceCommission(ORG, DOC, intent(), 'acct_invoice');
        await m.db.exec("update comisiones set status='fee_refunded',refunded_cents=100");
        await reconcileInvoiceCommission(ORG, DOC, intent(), 'acct_invoice');
        expect((await m.db.query('select status,refunded_cents from comisiones')).rows[0]).toEqual({ status: 'fee_refunded', refunded_cents: 100 });
    });
    it('blocks an organization or document mismatch before accessing the provider', async () => {
        await expect(reconcileInvoiceCommission(OTHER, DOC, intent(), 'acct_other')).rejects.toThrow();
        expect(m.stripe).not.toHaveBeenCalled();
        expect((await m.db.query('select * from comisiones')).rows).toHaveLength(0);
    });
    it('does not overwrite a different ledger entry for the same payment', async () => {
        await reconcileInvoiceCommission(ORG, DOC, intent(), 'acct_invoice');
        await m.db.exec("update comisiones set monto_cents=90000");
        await expect(reconcileInvoiceCommission(ORG, DOC, intent(), 'acct_invoice')).rejects.toThrow(/no coincide/);
        expect((await m.db.query('select monto_cents from comisiones')).rows[0].monto_cents).toBe(90000);
    });
    it('excludes unknown tax splits from monthly invoiceable commissions', async () => {
        await reconcileInvoiceCommission(ORG, DOC, intent({ metadata: {} }), 'acct_invoice');
        expect((await m.db.query("select * from comisiones where status in ('settled','pending') and moneda='MXN'")).rows).toHaveLength(0);
        expect((await m.db.query('select status,fee_total_cents from comisiones')).rows[0]).toEqual({ status: 'needs_review', fee_total_cents: 464 });
    });
    it('reconciles a pending balance on retry and retains the charge date', async () => {
        m.stripe.mockResolvedValueOnce(charge({ balance_transaction: null }));
        await reconcileInvoiceCommission(ORG, DOC, intent(), 'acct_invoice');
        await reconcileInvoiceCommission(ORG, DOC, intent(), 'acct_invoice');
        const row = (await m.db.query('select status,created_at from comisiones')).rows[0];
        expect(row.status).toBe('settled'); expect(new Date(row.created_at).getTime()).toBe(1788220800000);
    });
});
