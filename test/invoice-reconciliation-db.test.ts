import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ tx: vi.fn(), event: vi.fn(), issue: vi.fn(), cancel: vi.fn() }));
vi.mock('../src/lib/db', () => ({ withOrgTx: m.tx, sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values }) }));
vi.mock('../src/lib/fiscal/FiscalFactory', () => ({ FiscalFactory: { getProvider: () => ({ issueDocument: m.issue, cancelDocument: m.cancel }) } }));
vi.mock('../src/lib/fiscal/timeline', () => ({ logInvoiceEvent: m.event }));
vi.mock('../src/lib/crypto-secret', () => ({ decryptSecret: () => undefined }));
vi.mock('../src/lib/fiscal/emit', () => ({ metadata: (v: unknown) => v || {}, cleanPrefix: () => 'F', documentTypeFor: () => 'cfdi_40', isBillableCfdi: () => false, money: (n: number) => Math.round(n * 100) / 100, newInvoiceToken: () => crypto.randomUUID() }));
vi.mock('../src/lib/impuestos-db', () => ({ taxCatalogFor: vi.fn(), TaxCatalogUnavailableError: class extends Error {} }));
import { reconcileInvoice, recordInvoiceRefund } from '../src/lib/fiscal/reconciliation';
import { applyPayment } from '../src/lib/fiscal/payments';
import { createCreditNote, finalizeInvoice, voidInvoice } from '../src/lib/fiscal/invoices';
const org = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const id = '11111111-1111-4111-8111-111111111111';
let db: PGlite;
const q = (text: string, values: unknown[] = []) => db.query<any>(text, values);
const read = async () => (await q('select * from documentos_fiscales where id=$1', [id])).rows[0];
const refund = (status = 'succeeded', extra = {}) => recordInvoiceRefund(org, { id: 're_a', paymentIntentId: 'pi_a', amount: 40, currency: 'MXN', status, eventCreated: 1, ...extra });
const pay = (monto = 100, pi = 'pi_a') => applyPayment(org, id, { monto, currency: 'MXN', stripePaymentIntentId: pi });
const issueCredit = async (monto: number) => {
  const draft = await createCreditNote(org, id, { monto }); expect(draft.ok).toBe(true);
  await q("update documentos_fiscales set status='issued', lifecycle='open' where id=$1", [draft.documentId]);
  await reconcileInvoice(org, id); return draft.documentId;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table orgs (id uuid primary key, nombre text, razon_social text, rfc text, regimen_fiscal text, country_code text,
      iva_pct numeric, cp_fiscal text, uso_cfdi text, email_contacto text, direccion text, moneda text, fiscal_metadata jsonb,
      serie_folio text, facturapi_live_key text, facturapi_live_key_enc text, sandbox_of uuid);
    create table clientes (id uuid primary key, org_id uuid, uso_cfdi text);
    create table invoice_sequences(org_id uuid, country_code text, document_type text, serie text, ejercicio int, prefix text,
      next_value int, updated_at timestamptz, primary key(org_id,country_code,document_type,serie,ejercicio));
    create table documentos_fiscales (
      id uuid primary key default gen_random_uuid(), org_id uuid not null references orgs(id),
      invoice_number text, fiscal_id text, provider_document_id text, pdf_url text, xml_url text, issued_at timestamptz,
      idempotency_key text, voided_at timestamptz, void_reason text,
      total numeric not null, subtotal numeric, tax_total numeric, currency text not null,
      amount_paid numeric default 0, amount_remaining numeric, lifecycle text, status text,
      document_type text default 'cfdi_40', credit_note_of uuid references documentos_fiscales(id),
      country_code text default 'MX', cotizacion_id uuid, cliente_id uuid,
      ledger_currency text default 'MXN', fx_rate numeric default 1, ledger_total numeric,
      retencion_total numeric default 0, retenciones_snapshot jsonb default '[]',
      issuer_snapshot jsonb default '{}', recipient_snapshot jsonb default '{}', line_items_snapshot jsonb,
      due_date date, public_token text, provider text, notes text, created_by uuid,
      schema_version text, provider_data jsonb, updated_at timestamptz default now()
    );
    create table documento_pagos (
      id uuid primary key default gen_random_uuid(), org_id uuid not null, documento_id uuid not null,
      monto numeric, currency text, stripe_payment_intent_id text, metodo text, referencia text,
      cobro_id uuid, nota text, registrado_por uuid
    );
    create unique index pagos_pi on documento_pagos(documento_id,stripe_payment_intent_id) where stripe_payment_intent_id is not null;
  `);
  const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await db.exec(schema.slice(schema.indexOf('-- Conciliación de facturas:')));
  m.tx.mockImplementation((orgId: string, ...queries: Array<{ text: string; values: unknown[] }>) => db.transaction(async (tx) => {
    await tx.query("select set_config('app.org_id', $1, true)", [orgId]);
    const results = [];
    for (const query of queries) results.push((await tx.query(query.text, query.values)).rows);
    return results;
  }));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('reset role; truncate invoice_sequences, documento_pagos, documento_reembolsos, documentos_fiscales, orgs cascade');
  await q('insert into orgs(id) values ($1),($2)', [org, other]);
  m.issue.mockResolvedValue({ success: true, provider: 'facturapi', documentId: 'note-provider', fiscalId: 'uuid-note' });
  m.cancel.mockResolvedValue({ success: true, status: 'accepted' });
  const lines = JSON.stringify([{ description: 'Servicio', quantity: 1, unitPrice: 100, taxRate: 0, subtotal: 100, taxAmount: 0, total: 100 }]);
  await q("insert into documentos_fiscales(id,org_id,total,subtotal,tax_total,currency,amount_remaining,lifecycle,status,line_items_snapshot) values ($1,$2,100,100,0,'MXN',100,'open','issued',$3)", [id, org, lines]);
});

describe('conciliación ejecutada en PostgreSQL local', () => {
  it('aplica crédito sin inventar un pago y no vuelve a descontarlo al recalcular', async () => {
    await issueCredit(40); await reconcileInvoice(org, id);
    expect(await read()).toMatchObject({ amount_paid: '0', amount_credited: '40', amount_remaining: '60', refund_due: '0' });
  });
  it('registra pago después de crédito y liquida solo el saldo restante', async () => {
    await issueCredit(40); expect((await pay(60)).justPaid).toBe(true);
    expect(await read()).toMatchObject({ amount_paid: '60', amount_remaining: '0', lifecycle: 'paid' });
  });
  it('rechaza el pago manual que excede el saldo, incluso tras cambiarlo otra acción', async () => {
    await issueCredit(40);
    expect((await applyPayment(org, id, { monto: 80, currency: 'MXN' })).ok).toBe(false);
    expect((await q('select * from documento_pagos')).rows).toHaveLength(0);
  });
  it('crédito posterior al cobro crea un importe por devolver', async () => {
    await pay(); await issueCredit(40);
    expect(await read()).toMatchObject({ amount_paid: '100', amount_credited: '40', amount_remaining: '0', refund_due: '40' });
    expect((await q('select * from documento_reembolsos')).rows).toHaveLength(0);
  });
  it('solo un reembolso efectivo reduce lo pendiente por devolver', async () => {
    await pay(); await issueCredit(40); await refund('pending');
    expect((await read()).refund_due).toBe('40');
    await refund('succeeded', { eventCreated: 2 }); await refund('succeeded', { eventCreated: 2 });
    expect(await read()).toMatchObject({ amount_refunded: '40', refund_due: '0', amount_remaining: '0' });
  });
  it('un reembolso sin crédito reabre la deuda de la factura', async () => {
    await pay(); await refund();
    expect(await read()).toMatchObject({ amount_remaining: '40', lifecycle: 'open', amount_paid: '100' });
  });
  it('recupera un reembolso que llegó antes que el pago', async () => {
    await refund(); await pay();
    expect(await read()).toMatchObject({ amount_refunded: '40', amount_remaining: '40' });
  });
  it('un evento viejo no revierte el reembolso y un fallo posterior sí se refleja', async () => {
    await pay(); await issueCredit(40); await refund('succeeded', { eventCreated: 3 });
    await refund('pending', { eventCreated: 2 }); expect((await read()).refund_due).toBe('0');
    await refund('failed', { eventCreated: 4 }); expect((await read()).refund_due).toBe('40');
  });
  it('pago duplicado y reembolso parcial no se suman dos veces', async () => {
    await pay(); expect((await pay()).duplicate).toBe(true); await refund(); await pay();
    expect(await read()).toMatchObject({ amount_paid: '100', amount_refunded: '40', amount_remaining: '40' });
  });
  it('los borradores reservan crédito y evitan acreditar de más', async () => {
    const results = await Promise.all([createCreditNote(org, id, { monto: 70 }), createCreditNote(org, id, { monto: 70 })]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect((await read()).amount_remaining).toBe('100');
  });
  it('anular una nota libera crédito y recalcula el saldo original', async () => {
    const note = await issueCredit(40);
    await q("update documentos_fiscales set lifecycle='void',status='cancelled' where id=$1", [note]);
    await reconcileInvoice(org, id);
    expect(await read()).toMatchObject({ amount_credited: '0', amount_remaining: '100' });
    expect((await createCreditNote(org, id)).ok).toBe(true);
  });
  it('no mezcla reembolsos de otra empresa ni de otra divisa', async () => {
    await pay(); await recordInvoiceRefund(other, { id: 're_a', paymentIntentId: 'pi_a', amount: 40, currency: 'MXN', status: 'succeeded', eventCreated: 1 });
    await refund('succeeded', { id: 're_usd', currency: 'USD' }); await reconcileInvoice(org, id);
    expect(await read()).toMatchObject({ amount_refunded: '0', amount_remaining: '0' });
  });
  it('una organización ajena no puede reservar crédito sobre la factura', async () => {
    expect((await createCreditNote(other, id, { monto: 40 })).ok).toBe(false);
  });
  it('emitir y cancelar la nota recalcula el saldo dentro de la misma transacción', async () => {
    const note = await createCreditNote(org, id, { monto: 40 });
    expect((await finalizeInvoice(org, note.documentId!)).emitted).toBe(true);
    expect((await read()).amount_credited).toBe('40');
    expect((await voidInvoice(org, note.documentId!)).ok).toBe(true);
    expect(await read()).toMatchObject({ amount_credited: '0', amount_remaining: '100' });
  });
  it('un fallo del recálculo revierte la escritura local de la emisión y permite reintentar', async () => {
    const note = await createCreditNote(org, id, { monto: 40 });
    await db.exec('alter table documentos_fiscales add constraint simulated_balance_failure check(amount_credited = 0)');
    try {
      await expect(finalizeInvoice(org, note.documentId!)).rejects.toThrow(/simulated_balance_failure/);
      expect((await q('select status from documentos_fiscales where id=$1', [note.documentId])).rows[0].status).toBe('pending');
    } finally { await db.exec('alter table documentos_fiscales drop constraint simulated_balance_failure'); }
    expect((await finalizeInvoice(org, note.documentId!)).emitted).toBe(true);
    expect((await read()).amount_credited).toBe('40');
    const attempts = m.issue.mock.calls.filter(([request]) => request.documentId === note.documentId);
    expect(attempts).toHaveLength(2);
    expect(attempts[0][0].idempotencyKey).toBe(attempts[1][0].idempotencyKey);
  });
  it('RLS impide leer e insertar reembolsos de otra organización con rol de aplicación', async () => {
    await refund();
    await db.exec('create role reconciliation_fixture; grant usage on schema public to reconciliation_fixture; grant select, insert on documento_reembolsos to reconciliation_fixture; set role reconciliation_fixture');
    await q("select set_config('app.org_id',$1,false)", [other]);
    expect((await q('select * from documento_reembolsos')).rows).toHaveLength(0);
    await expect(q("insert into documento_reembolsos(org_id,stripe_refund_id,stripe_payment_intent_id,monto,currency,status) values ($1,'re_wrong','pi_a',10,'MXN','pending')", [org])).rejects.toThrow(/row-level security/);
  });
});
