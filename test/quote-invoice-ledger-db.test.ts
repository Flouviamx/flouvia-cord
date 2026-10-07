// Los dos ledgers de una venta (cotización y factura) ejecutados en PostgreSQL
// local. Reproducen el crítico C1 de la auditoría de oct 2026: una factura
// emitida desde una cotización ya cobrada nacía con el saldo completo, y una
// factura pagada no saldaba su cotización.
vi.mock('../src/lib/fiscal/issuance-usage', () => ({ meterInvoiceEmission: (_org: string, _id: string, emit: () => unknown) => emit() }));
vi.mock('../src/lib/org-entitlements', () => ({ getEffectivePlan: async () => 'starter' }));
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ tx: vi.fn(), event: vi.fn(), issue: vi.fn(), after: vi.fn(), audit: vi.fn(), alert: vi.fn() }));
vi.mock('../src/lib/db', () => ({
  withOrgTx: m.tx,
  logAudit: m.audit,
  sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values }),
}));
vi.mock('../src/lib/after', () => ({ after: m.after }));
vi.mock('../src/lib/ops-alert', () => ({ sendOpsAlert: m.alert }));
vi.mock('../src/lib/fiscal/FiscalFactory', () => ({ FiscalFactory: { getProvider: () => ({ issueDocument: m.issue, cancelDocument: vi.fn() }) } }));
vi.mock('../src/lib/fiscal/timeline', () => ({ logInvoiceEvent: m.event }));
vi.mock('../src/lib/crypto-secret', () => ({ decryptSecret: () => undefined }));
vi.mock('../src/lib/fiscal/emit', () => ({ metadata: (v: unknown) => v || {}, cleanPrefix: () => 'F', documentTypeFor: () => 'cfdi_40', isBillableCfdi: () => false, money: (n: number) => Math.round(n * 100) / 100, newInvoiceToken: () => crypto.randomUUID() }));
vi.mock('../src/lib/impuestos-db', () => ({ taxCatalogFor: vi.fn(), TaxCatalogUnavailableError: class extends Error {} }));
vi.mock('../src/lib/webhooks', () => ({ dispatchQuoteEvent: vi.fn(async () => {}), dispatchInvoiceEvent: vi.fn(async () => {}) }));
vi.mock('../src/lib/notify', () => ({ notifyQuoteEvent: vi.fn(async () => {}) }));
vi.mock('../src/lib/integraciones/contabilidad/pagos', () => ({ onPagoFactura: vi.fn(async () => {}) }));
vi.mock('../src/lib/integraciones/hojas/service', () => ({ onAbonoFactura: vi.fn(async () => {}) }));
vi.mock('../src/lib/posthog-server', () => ({ trackPaymentReceived: vi.fn(async () => {}) }));
import { applyPayment } from '../src/lib/fiscal/payments';
import { finalizeInvoice } from '../src/lib/fiscal/invoices';
import { liveInvoiceForQuote, quoteChargeBlockedByInvoice, reconcileInvoiceWithQuote } from '../src/lib/fiscal/quote-ledger';
import { settleQuoteCobro } from '../src/lib/cobros-settle';
import { processMpPayment } from '../src/lib/mercadopago-cobro';
import type { MpPayment } from '../src/lib/mercadopago';

const org = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const quote = '22222222-2222-4222-8222-222222222222';
const doc = '11111111-1111-4111-8111-111111111111';
const anticipo = '33333333-3333-4333-8333-333333333331';
const saldo = '33333333-3333-4333-8333-333333333332';
let db: PGlite;
const q = (text: string, values: unknown[] = []) => db.query<any>(text, values);
const factura = async () => (await q('select * from documentos_fiscales where id=$1', [doc])).rows[0];
const cotizacion = async () => (await q('select * from cotizaciones where id=$1', [quote])).rows[0];
const cobros = async () => (await q('select id, status from cotizacion_cobros order by tipo')).rows;
const pagos = async () => (await q('select * from documento_pagos order by monto')).rows;

/** Una factura de la cotización, todavía en borrador, lista para emitirse. */
async function borrador(total = 100, currency = 'MXN') {
  const lines = JSON.stringify([{ description: 'Servicio', quantity: 1, unitPrice: total, taxRate: 0, subtotal: total, taxAmount: 0, total }]);
  await q(`insert into documentos_fiscales(id,org_id,cotizacion_id,total,subtotal,tax_total,currency,amount_remaining,lifecycle,status,line_items_snapshot,idempotency_key)
           values ($1,$2,$3,$4,$4,0,$5,$4,'draft','pending',$6,'quote:x:invoice:v1')`, [doc, org, quote, total, currency, lines]);
}
/** La misma factura ya emitida (para pagos posteriores a la emisión). */
async function emitida(total = 100) {
  await borrador(total);
  await q("update documentos_fiscales set status='issued', lifecycle='open' where id=$1", [doc]);
}
async function cobro(id: string, tipo: string, monto: number, status: string, extra: Record<string, unknown> = {}) {
  await q(`insert into cotizacion_cobros(id,org_id,cotizacion_id,tipo,monto,status,stripe_payment_intent_id,paid_payment_intent_id,mp_payment_id,mp_preference_id,payment_method)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, org, quote, tipo, monto, status, extra.pi ?? null, extra.paidPi ?? null, extra.mp ?? null, extra.pref ?? null, extra.metodo ?? null]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table orgs (id uuid primary key, nombre text, razon_social text, rfc text, regimen_fiscal text, country_code text,
      iva_pct numeric, cp_fiscal text, uso_cfdi text, email_contacto text, direccion text, moneda text default 'MXN', fiscal_metadata jsonb,
      serie_folio text, facturapi_live_key text, facturapi_live_key_enc text, sandbox_of uuid, stripe_account_id text, is_demo boolean default false);
    create table clientes (id uuid primary key, org_id uuid, uso_cfdi text);
    create table cotizaciones (id uuid primary key, org_id uuid not null references orgs(id), total numeric not null,
      status text not null, paid_at timestamptz, payment_method text, base_currency text, es_recurrente boolean default false,
      pago_declarado_at timestamptz);
    create table cotizacion_cobros (id uuid primary key, org_id uuid not null, cotizacion_id uuid not null references cotizaciones(id),
      tipo text not null, numero_cuota int not null default 0, monto numeric not null, status text not null default 'pendiente',
      stripe_payment_intent_id text, paid_payment_intent_id text, payment_method text, metodo_pago text, paid_at timestamptz,
      mp_payment_id text, mp_preference_id text, created_at timestamptz default now());
    create table comisiones (id uuid primary key default gen_random_uuid(), org_id uuid not null, cobro_id uuid,
      stripe_payment_intent_id text not null, created_at timestamptz default now());
    create table cotizacion_pago_intentos (id uuid primary key default gen_random_uuid(), org_id uuid not null, cobro_id uuid not null,
      stripe_payment_intent_id text);
    create table invoice_sequences(org_id uuid, country_code text, document_type text, serie text, ejercicio int, prefix text,
      next_value int, updated_at timestamptz, primary key(org_id,country_code,document_type,serie,ejercicio));
    create table documentos_fiscales (
      id uuid primary key default gen_random_uuid(), org_id uuid not null references orgs(id),
      invoice_number text, fiscal_id text, provider_document_id text, pdf_url text, xml_url text, issued_at timestamptz,
      idempotency_key text, total numeric not null, subtotal numeric, tax_total numeric, currency text not null,
      amount_paid numeric default 0, amount_remaining numeric, lifecycle text, status text,
      document_type text default 'cfdi_40', credit_note_of uuid references documentos_fiscales(id),
      country_code text default 'MX', cotizacion_id uuid, cliente_id uuid,
      ledger_currency text default 'MXN', fx_rate numeric default 1, ledger_total numeric,
      retencion_total numeric default 0, retenciones_snapshot jsonb default '[]',
      issuer_snapshot jsonb default '{}', recipient_snapshot jsonb default '{}', line_items_snapshot jsonb,
      due_date date, public_token text default 'tok-factura', provider text, provider_data jsonb,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table documento_pagos (
      id uuid primary key default gen_random_uuid(), org_id uuid not null, documento_id uuid not null,
      monto numeric not null check (monto > 0), currency text, stripe_payment_intent_id text, mp_payment_id text, metodo text, referencia text,
      cobro_id uuid, nota text, registrado_por uuid
    );
    create unique index pagos_pi on documento_pagos(documento_id,stripe_payment_intent_id) where stripe_payment_intent_id is not null;
    create unique index pagos_mp on documento_pagos(documento_id,mp_payment_id) where mp_payment_id is not null;
    create table eventos (id uuid primary key default gen_random_uuid(), org_id uuid, cotizacion_id uuid, documento_id uuid, tipo text, detalle text);
    create table audit_log (id uuid primary key default gen_random_uuid(), org_id uuid, accion text, entidad text, entidad_id text, detalle text);
    create table cobro_reembolsos (id uuid primary key default gen_random_uuid(), org_id uuid not null, cobro_id uuid not null,
      stripe_refund_id text unique, mp_refund_id text unique, amount_cents int not null check (amount_cents > 0),
      currency text not null default 'MXN', status text not null default 'pending', updated_at timestamptz);
    alter table cotizacion_cobros add column reembolsado_cents int not null default 0, add column reembolso_status text, add column refunded_at timestamptz;
  `);
  const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const start = schema.indexOf('-- Conciliación de facturas:');
  const next = schema.indexOf('\n-- BEGIN ', start);
  await db.exec(schema.slice(start, next === -1 ? undefined : next));
  m.tx.mockImplementation((orgId: string, ...queries: Array<{ text: string; values: unknown[] }>) => db.transaction(async (tx) => {
    await tx.query("select set_config('app.org_id', $1, true)", [orgId]);
    const results = [];
    for (const query of queries) results.push((await tx.query(query.text, query.values)).rows);
    return results;
  }));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  vi.clearAllMocks();
  m.audit.mockImplementation(async (orgId: string, e: { accion: string; entidad?: string; entidad_id?: string; detalle?: string }) => {
    await q('insert into audit_log(org_id,accion,entidad,entidad_id,detalle) values ($1,$2,$3,$4,$5)', [orgId, e.accion, e.entidad ?? null, e.entidad_id ?? null, e.detalle ?? null]);
  });
  await db.exec(`truncate audit_log, cobro_reembolsos, eventos, documento_pagos, documento_reembolsos, cotizacion_pago_intentos, comisiones,
    cotizacion_cobros, documentos_fiscales, invoice_sequences, cotizaciones, orgs cascade`);
  await q("insert into orgs(id, country_code) values ($1,'MX'),($2,'MX')", [org, other]);
  await q("insert into cotizaciones(id,org_id,total,status,base_currency) values ($1,$2,100,'approved','MXN')", [quote, org]);
  m.issue.mockResolvedValue({ success: true, provider: 'facturapi', documentId: 'prov-1', fiscalId: 'uuid-1' });
});

describe('la factura nace sabiendo lo que la cotización ya cobró', () => {
  it('cotización pagada en línea: la factura nace PAGADA, sin saldo que perseguir', async () => {
    await cobro(anticipo, 'anticipo', 30, 'pagado', { pi: 'pi_ant', paidPi: 'pi_ant', metodo: 'tarjeta' });
    await cobro(saldo, 'saldo', 70, 'pagado', { pi: 'pi_sal', paidPi: 'pi_sal', metodo: 'spei' });
    await q("update cotizaciones set status='paid', paid_at=now() where id=$1", [quote]);
    await borrador();
    expect((await finalizeInvoice(org, doc)).emitted).toBe(true);
    expect(await factura()).toMatchObject({ lifecycle: 'paid', amount_paid: '100', amount_remaining: '0', refund_due: '0' });
    const rows = await pagos();
    expect(rows.map((p) => [p.stripe_payment_intent_id, p.cobro_id, p.metodo])).toEqual([
      ['pi_ant', anticipo, 'stripe'], ['pi_sal', saldo, 'spei'],
    ]);
  });

  it('solo el anticipo cobrado: la factura nace con el saldo REAL', async () => {
    await cobro(anticipo, 'anticipo', 30, 'pagado', { pi: 'pi_ant', paidPi: 'pi_ant' });
    await cobro(saldo, 'saldo', 70, 'pendiente');
    await borrador();
    await finalizeInvoice(org, doc);
    expect(await factura()).toMatchObject({ lifecycle: 'open', amount_paid: '30', amount_remaining: '70' });
    expect((await cotizacion()).status).toBe('approved');
  });

  it('pagada a mano en la cotización (transferencia): la factura nace pagada por lo declarado', async () => {
    await cobro(saldo, 'total', 100, 'cancelado');
    await q("update cotizaciones set status='paid', paid_at=now(), pago_declarado_at=now(), payment_method='transferencia' where id=$1", [quote]);
    await borrador();
    await finalizeInvoice(org, doc);
    expect(await factura()).toMatchObject({ lifecycle: 'paid', amount_paid: '100', amount_remaining: '0' });
    expect(await pagos()).toMatchObject([{ referencia: `cotizacion:${quote}`, metodo: 'transferencia', monto: '100' }]);
  });

  it('cobro en línea + resto declarado: se heredan los dos sin pasarse del total', async () => {
    await cobro(anticipo, 'anticipo', 30, 'pagado', { mp: 'mp_9', metodo: 'mercadopago' });
    await cobro(saldo, 'saldo', 70, 'cancelado');
    await q("update cotizaciones set status='paid', paid_at=now(), pago_declarado_at=now() where id=$1", [quote]);
    await borrador();
    await finalizeInvoice(org, doc);
    expect(await factura()).toMatchObject({ lifecycle: 'paid', amount_paid: '100', refund_due: '0' });
    expect((await pagos()).map((p) => [p.monto, p.mp_payment_id, p.referencia])).toEqual([
      ['30', 'mp_9', 'mp_9'], ['70', null, `cotizacion:${quote}`],
    ]);
  });

  it('una divisa distinta NO se hereda: no se inventa un tipo de cambio', async () => {
    await cobro(anticipo, 'total', 100, 'pagado', { pi: 'pi_x', paidPi: 'pi_x' });
    await q("update cotizaciones set base_currency='USD' where id=$1", [quote]);
    await borrador(100, 'MXN');
    await finalizeInvoice(org, doc);
    expect(await factura()).toMatchObject({ lifecycle: 'open', amount_paid: '0' });
    expect(await pagos()).toHaveLength(0);
    expect(m.alert).toHaveBeenCalledWith('Factura con divisa distinta a su cotización', expect.any(String));
  });

  it('una iguala recurrente no hereda sus cuotas mensuales a una factura', async () => {
    await q("update cotizaciones set es_recurrente=true where id=$1", [quote]);
    await cobro(anticipo, 'cuota', 100, 'pagado', { pi: 'pi_mes' });
    await borrador();
    await finalizeInvoice(org, doc);
    expect(await pagos()).toHaveLength(0);
  });
});

describe('idempotencia: el mismo dinero nunca se cuenta dos veces', () => {
  it('el webhook ya aplicó el pago con un PaymentIntent ANTERIOR del cobro: no se duplica', async () => {
    // El cobro presentó pi_viejo, luego se sustituyó por pi_nuevo; el cliente
    // pagó el viejo y el webhook lo aplicó a la factura sin cobro_id.
    await emitida();
    await cobro(saldo, 'total', 100, 'pagado', { pi: 'pi_nuevo' });
    await q("insert into cotizacion_pago_intentos(org_id,cobro_id,stripe_payment_intent_id) values ($1,$2,'pi_viejo'),($1,$2,'pi_nuevo')", [org, saldo]);
    await q("insert into documento_pagos(org_id,documento_id,monto,currency,stripe_payment_intent_id) values ($1,$2,100,'MXN','pi_viejo')", [org, doc]);
    const r = await reconcileInvoiceWithQuote(org, doc);
    expect(r.heredados).toBe(0);
    expect(await pagos()).toHaveLength(1);
  });

  it('reconciliar dos veces no aplica nada la segunda', async () => {
    await emitida();
    await cobro(anticipo, 'anticipo', 30, 'pagado', { paidPi: 'pi_a' });
    expect((await reconcileInvoiceWithQuote(org, doc)).heredados).toBe(1);
    expect((await reconcileInvoiceWithQuote(org, doc)).heredados).toBe(0);
    expect(await factura()).toMatchObject({ amount_paid: '30', amount_remaining: '70' });
  });

  it('la herencia y el webhook del mismo PaymentIntent se deduplican por el índice', async () => {
    await emitida();
    await cobro(anticipo, 'anticipo', 30, 'pagado', { paidPi: 'pi_a' });
    await reconcileInvoiceWithQuote(org, doc);
    const webhook = await applyPayment(org, doc, { monto: 30, currency: 'MXN', stripePaymentIntentId: 'pi_a', cobroId: anticipo });
    expect(webhook.duplicate).toBe(true);
    expect(await factura()).toMatchObject({ amount_paid: '30', amount_remaining: '70' });
  });

  it('la vista previa no escribe nada', async () => {
    await emitida();
    await cobro(anticipo, 'anticipo', 30, 'pagado', { paidPi: 'pi_a' });
    const r = await reconcileInvoiceWithQuote(org, doc, { dryRun: true });
    expect(r.pendiente).toEqual({ cobros: 1, monto: 30, cotizacionPorSaldar: false });
    expect(await pagos()).toHaveLength(0);
  });

  it('no hereda cobros de otra organización', async () => {
    await emitida();
    await q(`insert into cotizacion_cobros(id,org_id,cotizacion_id,tipo,monto,status,paid_payment_intent_id)
             values ($1,$2,$3,'total',100,'pagado','pi_ajeno')`, [anticipo, other, quote]);
    expect((await reconcileInvoiceWithQuote(org, doc)).heredados).toBe(0);
  });
});

describe('una factura saldada con dinero salda su cotización', () => {
  it('pagar la factura en /i salda la cotización y cancela los cobros que aún se podían pagar', async () => {
    await emitida();
    await q("update cotizaciones set status='invoiced' where id=$1", [quote]);
    await cobro(anticipo, 'anticipo', 30, 'pendiente', { pi: 'pi_a', pref: 'pref_a' });
    await cobro(saldo, 'saldo', 70, 'pendiente');
    const r = await applyPayment(org, doc, { monto: 100, currency: 'MXN', stripePaymentIntentId: 'pi_factura' });
    expect(r).toMatchObject({ ok: true, justPaid: true, lifecycle: 'paid' });
    expect(await cotizacion()).toMatchObject({ status: 'paid' });
    expect((await cotizacion()).paid_at).not.toBeNull();
    expect((await cobros()).map((c) => c.status)).toEqual(['cancelado', 'cancelado']);
    // Lo que todavía podía cobrar se invalida fuera de la transacción.
    expect(m.after).toHaveBeenCalled();
  });

  it('un abono parcial en la factura NO salda la cotización', async () => {
    await emitida();
    await q("update cotizaciones set status='invoiced' where id=$1", [quote]);
    await cobro(saldo, 'total', 100, 'pendiente');
    await applyPayment(org, doc, { monto: 40, currency: 'MXN', stripePaymentIntentId: 'pi_parcial' });
    expect((await cotizacion()).status).toBe('invoiced');
    expect((await cobros())[0].status).toBe('pendiente');
  });

  it('pagar de más una factura ya saldada deja importe por devolver y avisa', async () => {
    await emitida();
    await applyPayment(org, doc, { monto: 100, currency: 'MXN', stripePaymentIntentId: 'pi_1' });
    const segundo = await applyPayment(org, doc, { monto: 100, currency: 'MXN', stripePaymentIntentId: 'pi_2' });
    expect(segundo.ok).toBe(true);
    expect(await factura()).toMatchObject({ amount_paid: '200', refund_due: '100' });
    expect(m.event).toHaveBeenCalledWith(org, doc, 'payment', expect.stringContaining('por devolver'));
  });
});

describe('/q no cobra lo que la factura ya no debe', () => {
  it('sin factura, /q cobra normal', async () => {
    expect(quoteChargeBlockedByInvoice(await liveInvoiceForQuote(org, quote), 100, 'MXN', null)).toBeNull();
  });
  it('factura pagada: /q responde "ya pagada"', async () => {
    await emitida();
    await applyPayment(org, doc, { monto: 100, currency: 'MXN', stripePaymentIntentId: 'pi_1' });
    expect(quoteChargeBlockedByInvoice(await liveInvoiceForQuote(org, quote), 70, 'MXN', null))
      .toEqual({ status: 200, body: { alreadyPaid: true } });
  });
  it('un cobro que no cabe en el saldo de la factura se manda a la factura', async () => {
    await emitida();
    await applyPayment(org, doc, { monto: 50, currency: 'MXN', stripePaymentIntentId: 'pi_1' });
    const gate = await liveInvoiceForQuote(org, quote);
    expect(quoteChargeBlockedByInvoice(gate, 30, 'MXN', null)).toBeNull();
    expect(quoteChargeBlockedByInvoice(gate, 70, 'MXN', 'https://cordhq.app/i/tok'))
      .toMatchObject({ status: 409, body: { code: 'invoice_balance', invoiceUrl: 'https://cordhq.app/i/tok' } });
    expect(quoteChargeBlockedByInvoice(gate, 30, 'USD', null)).toMatchObject({ status: 409 });
  });
});

describe('la liquidación de un cobro es atómica y reentrante', () => {
  const settle = (cobroId: string) => settleQuoteCobro(org, {
    cotizacionId: quote, cobroId, monto: 100, moneda: 'MXN', metodo: 'mercadopago', pagoId: 'mp_1', proveedor: 'Mercado Pago',
  });
  it('salda la cotización cuando el último cobro se paga', async () => {
    await cobro(saldo, 'total', 100, 'pendiente');
    expect(await settle(saldo)).toBe('saldada');
    expect((await cotizacion()).status).toBe('paid');
  });
  it('un reintento sobre un estado a medias (cobro pagado, cotización sin saldar) lo repara', async () => {
    await cobro(saldo, 'total', 100, 'pagado');
    expect(await settle(saldo)).toBe('saldada');
    expect((await cotizacion()).status).toBe('paid');
    expect(await settle(saldo)).toBe('repetida');
  });
  it('un cobro inexistente no mueve la cotización', async () => {
    expect(await settle(saldo)).toBe('sin_cobro');
    expect((await cotizacion()).status).toBe('approved');
  });
});

describe('Mercado Pago: lo que Cord hace con un pago leído del proveedor', () => {
  const pagoMp = (over: Partial<MpPayment> = {}): MpPayment => ({
    id: '9001', status: 'approved', monto: 100, moneda: 'MXN', referencia: saldo, metodo: 'credit_card',
    collectorId: '777', liveMode: true, reembolsos: [], ...over,
  });

  it('un pago cobrado por OTRA cuenta de Mercado Pago no es de esta organización', async () => {
    await cobro(saldo, 'total', 100, 'pendiente');
    expect(await processMpPayment(org, '777', pagoMp({ collectorId: '888' }))).toEqual({ propio: false, estado: 'otra_cuenta' });
    expect((await cobros())[0].status).toBe('pendiente');
  });

  it('una referencia que no es cobro de esta organización tampoco', async () => {
    expect((await processMpPayment(org, '777', pagoMp())).propio).toBe(false);
  });

  it('liquida el cobro y salda la cotización; el reenvío no paga dos veces', async () => {
    await cobro(saldo, 'total', 100, 'pendiente');
    expect(await processMpPayment(org, '777', pagoMp())).toEqual({ propio: true, estado: 'saldada' });
    expect((await cotizacion()).status).toBe('paid');
    expect(await processMpPayment(org, '777', pagoMp())).toEqual({ propio: true, estado: 'repetida' });
  });

  it('reclamado pero sin liquidar (el intento anterior se cortó): el reintento lo liquida', async () => {
    await cobro(saldo, 'total', 100, 'pendiente', { mp: '9001' });
    expect(await processMpPayment(org, '777', pagoMp())).toEqual({ propio: true, estado: 'saldada' });
    expect((await cobros())[0].status).toBe('pagado');
  });

  it('un importe que no cuadra con el cobro NO lo salda: queda a la vista y avisa una vez', async () => {
    await cobro(saldo, 'total', 100, 'pendiente');
    expect((await processMpPayment(org, '777', pagoMp({ monto: 90 }))).estado).toBe('no_coincide');
    expect((await cobros())[0].status).toBe('pendiente');
    expect(m.after).toHaveBeenCalledTimes(1);
    await processMpPayment(org, '777', pagoMp({ monto: 90 }));
    expect(m.after).toHaveBeenCalledTimes(1);
    expect((await q("select detalle from eventos where cotizacion_id=$1", [quote])).rows).toHaveLength(1);
  });

  it('una divisa distinta tampoco salda', async () => {
    await cobro(saldo, 'total', 100, 'pendiente');
    expect((await processMpPayment(org, '777', pagoMp({ moneda: 'USD' }))).estado).toBe('no_coincide');
  });

  it('un pago de PRUEBA no salda nada en producción', async () => {
    await cobro(saldo, 'total', 100, 'pendiente');
    process.env.VERCEL_ENV = 'production';
    try {
      expect((await processMpPayment(org, '777', pagoMp({ liveMode: false }))).estado).toBe('prueba');
    } finally { delete process.env.VERCEL_ENV; }
    expect((await cobros())[0].status).toBe('pendiente');
    expect((await cotizacion()).status).toBe('approved');
  });

  it('el pago de una cotización ya facturada baja el saldo de su factura', async () => {
    await emitida();
    await cobro(saldo, 'total', 100, 'pendiente');
    await processMpPayment(org, '777', pagoMp());
    expect(await factura()).toMatchObject({ lifecycle: 'paid', amount_paid: '100', amount_remaining: '0' });
    expect((await pagos())[0]).toMatchObject({ mp_payment_id: '9001', cobro_id: saldo });
  });

  it('segundo pago sobre un cobro que ya pagó Cord Payments: queda en la factura como por devolver y se avisa', async () => {
    await emitida();
    await cobro(saldo, 'total', 100, 'pagado', { paidPi: 'pi_1' });
    await reconcileInvoiceWithQuote(org, doc);
    expect(await processMpPayment(org, '777', pagoMp())).toEqual({ propio: true, estado: 'duplicado' });
    expect(await factura()).toMatchObject({ amount_paid: '200', refund_due: '100' });
    expect((await q("select 1 from audit_log where accion='cotizacion.pago_duplicado'")).rows).toHaveLength(1);
  });

  it('un pago a una factura ANULADA no truena ni se reintenta: queda en su historia y avisa una vez', async () => {
    await emitida();
    await q("update documentos_fiscales set lifecycle='void' where id=$1", [doc]);
    const p = pagoMp({ referencia: `fac:${doc}` });
    expect(await processMpPayment(org, '777', p)).toEqual({ propio: true, estado: 'no_aplicado' });
    expect(await processMpPayment(org, '777', p)).toEqual({ propio: true, estado: 'no_aplicado' });
    expect(m.event.mock.calls.filter(([, , , d]) => String(d).includes('no se pudo aplicar'))).toHaveLength(1);
  });

  it('un reembolso de Mercado Pago sobre una cotización facturada reabre la factura por lo devuelto', async () => {
    await emitida();
    await cobro(saldo, 'total', 100, 'pendiente');
    await processMpPayment(org, '777', pagoMp());
    await processMpPayment(org, '777', pagoMp({ status: 'refunded', reembolsos: [{ id: 'r1', monto: 40, status: 'succeeded' }] }));
    expect(await factura()).toMatchObject({ amount_refunded: '40', amount_remaining: '40', lifecycle: 'open' });
    expect((await q('select amount_cents, status from cobro_reembolsos')).rows).toEqual([{ amount_cents: 4000, status: 'succeeded' }]);
  });
});

describe('revisión adversarial: el dinero que ya se registró a mano no se vuelve a contar', () => {
  it('A: factura ya cerrada con un pago A MANO: la reparación NO hereda el cobro y pide revisar', async () => {
    await emitida();
    await cobro(saldo, 'total', 100, 'pagado', { paidPi: 'pi_q' });
    await q("insert into documento_pagos(org_id,documento_id,monto,currency,metodo) values ($1,$2,100,'MXN','transferencia')", [org, doc]);
    const vista = await reconcileInvoiceWithQuote(org, doc, { dryRun: true });
    expect(vista).toMatchObject({ revisar: 'pagos_manuales', pendiente: { cobros: 0 } });
    const r = await reconcileInvoiceWithQuote(org, doc);
    expect(r).toMatchObject({ heredados: 0, revisar: 'pagos_manuales' });
    expect(await pagos()).toHaveLength(1);
  });

  it('B: una factura pagada en /i y luego reembolsada NO genera un "pago declarado" fantasma', async () => {
    await emitida();
    await q("update cotizaciones set status='invoiced' where id=$1", [quote]);
    await applyPayment(org, doc, { monto: 100, currency: 'MXN', stripePaymentIntentId: 'pi_i' });
    expect((await cotizacion()).paid_at).not.toBeNull();
    await q(`insert into documento_reembolsos(org_id,stripe_refund_id,stripe_payment_intent_id,monto,currency,status)
             values ($1,'re_1','pi_i',60,'MXN','succeeded')`, [org]);
    const r = await reconcileInvoiceWithQuote(org, doc);
    expect(r.heredados).toBe(0);
    expect(await factura()).toMatchObject({ amount_paid: '100', refund_due: '0' });
  });

  it('C/D: una cotización ya saldada que se facturó no se re-salda ni re-dispara quote.paid en reentregas', async () => {
    await cobro(saldo, 'total', 100, 'pagado', { paidPi: 'pi_q' });
    await q("update cotizaciones set status='invoiced', paid_at=now() where id=$1", [quote]);
    await borrador();
    await finalizeInvoice(org, doc);
    expect(await factura()).toMatchObject({ lifecycle: 'paid' });
    const repetido = await applyPayment(org, doc, { monto: 100, currency: 'MXN', stripePaymentIntentId: 'pi_q' });
    expect(repetido.duplicate).toBe(true);
    expect((await cotizacion()).status).toBe('invoiced');
  });

  it('E: no se salda una cotización si lo pagado no cubre el total, aunque no queden pendientes', async () => {
    await cobro(anticipo, 'anticipo', 30, 'pendiente');
    await cobro(saldo, 'saldo', 70, 'cancelado');
    const r = await settleQuoteCobro(org, {
      cotizacionId: quote, cobroId: anticipo, monto: 30, moneda: 'MXN', metodo: 'mercadopago', pagoId: 'mp_x', proveedor: 'Mercado Pago',
    });
    expect(r).toBe('parcial');
    expect((await cotizacion()).status).toBe('approved');
  });

  it('marcar pagada con factura ya emitida: lo declarado se aplica TOPADO al saldo que la factura aún debe', async () => {
    await emitida();
    await applyPayment(org, doc, { monto: 50, currency: 'MXN', stripePaymentIntentId: 'pi_parcial' });
    await q("update cotizaciones set status='paid', paid_at=now(), pago_declarado_at=now() where id=$1", [quote]);
    const r = await reconcileInvoiceWithQuote(org, doc);
    expect(r.monto).toBe(50);
    expect(await factura()).toMatchObject({ lifecycle: 'paid', amount_paid: '100', refund_due: '0' });
  });

  it('un pago de Mercado Pago sobre un cobro cancelado de una cotización ya saldada es un DUPLICADO, no un anticipo', async () => {
    await emitida();
    await cobro(saldo, 'saldo', 100, 'cancelado');
    await q("update cotizaciones set status='paid', paid_at=now() where id=$1", [quote]);
    await applyPayment(org, doc, { monto: 100, currency: 'MXN', stripePaymentIntentId: 'pi_factura' });
    const r = await processMpPayment(org, '777', {
      id: '9100', status: 'approved', monto: 100, moneda: 'MXN', referencia: saldo, metodo: null,
      collectorId: '777', liveMode: true, reembolsos: [],
    });
    expect(r).toEqual({ propio: true, estado: 'duplicado' });
    expect((await cobros())[0].status).toBe('cancelado');
    expect(await factura()).toMatchObject({ amount_paid: '200', refund_due: '100' });
  });
});
