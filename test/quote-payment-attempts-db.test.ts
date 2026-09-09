import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const m = vi.hoisted(() => ({ db: null as any }));
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: any[]) => ({ text: s.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: async (org: string, ...queries: any[]) => m.db.transaction(async (tx: any) => {
        await tx.query("select set_config('app.org_id',$1,true)", [org]);
        const rows = []; for (const q of queries) rows.push((await tx.query(q.text, q.values)).rows); return rows;
    }),
}));
import { claimQuotePaymentAttempt, publishQuotePaymentAttempt } from '../src/lib/quote-payment-attempts';
const ORG = '00000000-0000-4000-8000-000000000001', OTHER = '00000000-0000-4000-8000-000000000002';
const QUOTE = '00000000-0000-4000-8000-000000000003', COBRO = '00000000-0000-4000-8000-000000000004';
const migration = readFileSync(new URL('../db/migrations/2026-09-07-quote-payment-attempts.sql', import.meta.url), 'utf8');
const input = (extra = {}) => ({ orgId: ORG, quoteId: QUOTE, cobroId: COBRO, previousId: null, amount: 1000, quoteTotal: 1000, currency: 'MXN', request: new URLSearchParams({ amount: '100000', currency: 'mxn', 'payment_method_types[0]': 'card' }), ...extra });
const fee = { applicationFeeCents: 0, feeBaseCents: 0, feeIvaCents: 0 };
beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`create table orgs(id uuid primary key);
        create table cotizaciones(id uuid primary key,org_id uuid,status text,total numeric,base_currency text);
        create table cotizacion_cobros(id uuid primary key,org_id uuid,cotizacion_id uuid,status text,monto numeric,stripe_payment_intent_id text,
          metodo_pago text,application_fee_cents int,fee_base_cents int,fee_iva_cents int,fee_total_cents int);
        create role payment_test nologin;
        insert into orgs values ('${ORG}'),('${OTHER}');
        insert into cotizaciones values ('${QUOTE}','${ORG}','approved',1000,'MXN');
        insert into cotizacion_cobros(id,org_id,cotizacion_id,status,monto) values ('${COBRO}','${ORG}','${QUOTE}','pendiente',1000);`);
    await m.db.exec(migration);
    await m.db.exec('grant select, insert, update on cotizacion_pago_intentos to payment_test');
}, 15000);
beforeEach(async () => {
    await m.db.exec(`reset role; delete from cotizacion_pago_intentos;
        update cotizaciones set status='approved',total=1000,base_currency='MXN';
        update cotizacion_cobros set status='pendiente',monto=1000,stripe_payment_intent_id=null;`);
});
afterAll(async () => { await m.db.close(); });
it('reruns the migration and preserves a single durable reservation', async () => {
    const first = await claimQuotePaymentAttempt(input());
    await m.db.exec(migration);
    expect((await claimQuotePaymentAttempt(input())).id).toBe(first.id);
    expect((await m.db.query('select count(*)::int n from cotizacion_pago_intentos')).rows[0].n).toBe(1);
});
it('competing methods share a predecessor slot and the second cannot create a new attempt', async () => {
    await claimQuotePaymentAttempt(input());
    await expect(claimQuotePaymentAttempt(input({ request: new URLSearchParams({ amount: '100000', currency: 'mxn', 'payment_method_types[0]': 'customer_balance' }) }))).rejects.toMatchObject({ code: 'payment_changed' });
    expect((await m.db.query('select count(*)::int n from cotizacion_pago_intentos')).rows[0].n).toBe(1);
});
it('stable canonical parameter order preserves the request hash', async () => {
    const first = await claimQuotePaymentAttempt(input());
    const changedOrder = new URLSearchParams({ currency: 'mxn', 'payment_method_types[0]': 'card', amount: '100000' });
    expect((await claimQuotePaymentAttempt(input({ request: changedOrder }))).id).toBe(first.id);
});
it.each(["update cotizacion_cobros set status='pagado'", 'update cotizacion_cobros set monto=500', "update cotizaciones set base_currency='USD'", "update cotizaciones set status='rejected'", 'update cotizaciones set total=800'])('rejects a stale creation after %s', async mutation => {
    await m.db.exec(mutation);
    await expect(claimQuotePaymentAttempt(input())).rejects.toMatchObject({ code: 'payment_changed' });
    expect((await m.db.query('select count(*)::int n from cotizacion_pago_intentos')).rows[0].n).toBe(0);
});
it('does not create again after the provider idempotency retention window', async () => {
    await claimQuotePaymentAttempt(input());
    await m.db.exec("update cotizacion_pago_intentos set created_at=now()-interval '25 hours'");
    await expect(claimQuotePaymentAttempt(input())).rejects.toMatchObject({ code: 'payment_review_required' });
});
it('recovers the stored provider id even after the idempotency retention window', async () => {
    await claimQuotePaymentAttempt(input());
    await m.db.exec("update cotizacion_pago_intentos set created_at=now()-interval '25 hours',stripe_payment_intent_id='pi_known'");
    expect(await claimQuotePaymentAttempt(input())).toMatchObject({ paymentIntentId: 'pi_known' });
});
it('publishes once, and records the next generation against the canceled predecessor', async () => {
    const args = input(); const first = await claimQuotePaymentAttempt(args);
    await publishQuotePaymentAttempt(args, first.id, 'pi_first', fee, 'card');
    await publishQuotePaymentAttempt(args, first.id, 'pi_first', fee, 'card');
    const next = await claimQuotePaymentAttempt(input({ previousId: 'pi_first' }));
    expect(next.id).not.toBe(first.id);
    expect((await m.db.query('select stripe_payment_intent_id from cotizacion_cobros')).rows[0].stripe_payment_intent_id).toBe('pi_first');
});
it('keeps the provider id for recovery but never overwrites a newer cobro pointer', async () => {
    const args = input(); const first = await claimQuotePaymentAttempt(args);
    await m.db.exec("update cotizacion_cobros set stripe_payment_intent_id='pi_other'");
    await expect(publishQuotePaymentAttempt(args, first.id, 'pi_first', fee, 'card')).rejects.toMatchObject({ code: 'payment_changed' });
    expect((await m.db.query('select stripe_payment_intent_id from cotizacion_cobros')).rows[0].stripe_payment_intent_id).toBe('pi_other');
    expect((await m.db.query('select stripe_payment_intent_id from cotizacion_pago_intentos')).rows[0].stripe_payment_intent_id).toBe('pi_first');
});
it('does not overwrite a paid or canceled cobro after the external request', async () => {
    const args = input(); const first = await claimQuotePaymentAttempt(args);
    await m.db.exec("update cotizacion_cobros set status='pagado'");
    await expect(publishQuotePaymentAttempt(args, first.id, 'pi_first', fee, 'card')).rejects.toMatchObject({ code: 'payment_changed' });
    expect((await m.db.query('select stripe_payment_intent_id from cotizacion_cobros')).rows[0].stripe_payment_intent_id).toBeNull();
});
it('enforces tenant reads and the composite parent relationship in PostgreSQL', async () => {
    await claimQuotePaymentAttempt(input());
    await m.db.exec(`set role payment_test; set app.org_id='${OTHER}';`);
    expect((await m.db.query('select * from cotizacion_pago_intentos')).rows).toHaveLength(0);
    await expect(m.db.query('insert into cotizacion_pago_intentos(org_id,cobro_id,predecessor,request_hash) values ($1,$2,$3,$4)', [OTHER, COBRO, 'initial', '0'.repeat(64)])).rejects.toThrow(/foreign key/);
    await expect(m.db.query('insert into cotizacion_pago_intentos(org_id,cobro_id,predecessor,request_hash) values ($1,$2,$3,$4)', [ORG, COBRO, 'different', '0'.repeat(64)])).rejects.toThrow(/row-level security/);
});

it('runs the actual external migration runner atomically and preserves existing cobros', async () => {
    const { migrateQuotePaymentAttempts } = await import('../scripts/migrate-quote-payment-attempts.mjs');
    const query = (text: string, values: any[] = []) => ({ text, values, then: (resolve: any, reject: any) => m.db.query(text, values).then((r: any) => r.rows).then(resolve, reject) });
    const sql = Object.assign((s: TemplateStringsArray, ...values: any[]) => query(s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values), {
        query,
        transaction: async (queries: any[]) => m.db.transaction(async (tx: any) => {
            const rows = []; for (const q of queries) rows.push((await tx.query(q.text, q.values)).rows); return rows;
        }),
    });
    const before = (await m.db.query('select * from cotizacion_cobros')).rows;
    expect(await migrateQuotePaymentAttempts(sql)).toMatchObject({ applied: false, cobros: 1 });
    expect(await migrateQuotePaymentAttempts(sql, { apply: true })).toMatchObject({ applied: true, tenant_rls: true, composite_parent: true });
    expect((await m.db.query('select * from cotizacion_cobros')).rows).toEqual(before);
});
