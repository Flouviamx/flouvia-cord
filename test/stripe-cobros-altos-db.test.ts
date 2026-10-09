// Los altos A1, A2, A3 y M22 de la auditoría de oct 2026, de punta a punta: un
// evento firmado entra al webhook real de Stripe y el SQL corre en PostgreSQL
// local. Cada prueba reproduce el bug contra el código anterior.
//
//   A1: la liquidación de Stripe iba en tres transacciones y PostHog se esperaba
//       dentro del camino del dinero; una falla a la mitad dejaba la cotización
//       sin saldar para siempre.
//   A2: un pago de Stripe sobre un cobro que ya pagó Mercado Pago se ignoraba
//       en silencio.
//   A3: un pago sobre una factura anulada tronaba el webhook tres días, con una
//       alerta por intento, y el dinero no aparecía en ningún lado.
//   M22: un error permanente devolvía 500 y Stripe reintentaba tres días.
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Los secretos se leen al importar el webhook: tienen que existir antes.
vi.hoisted(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'platform-secret';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'connect-secret';
});
const m = vi.hoisted(() => ({
  db: null as any, stripe: vi.fn(), alert: vi.fn(), track: vi.fn(), dispatch: vi.fn(), partial: vi.fn(),
  invoiceEvent: vi.fn(), timeline: vi.fn(), notify: vi.fn(), pending: [] as Promise<unknown>[],
  // Corre antes de cada transacción: así se simula lo que otra entrega hizo en medio.
  antesDeTx: null as null | ((queries: Array<{ text: string }>) => Promise<void>),
}));

type Q = { text: string; values: unknown[] };
const toQuery = (s: TemplateStringsArray, values: unknown[]): Q =>
  ({ text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values });
vi.mock('../src/lib/db', () => ({
  // `sql` sirve igual para `await sql\`...\`` (corre suelto) que dentro de withOrgTx.
  sql: (s: TemplateStringsArray, ...values: unknown[]) => {
    const q = toQuery(s, values);
    const run = () => m.db.query(q.text, q.values).then((r: any) => r.rows);
    return { ...q, then: (res: any, rej: any) => run().then(res, rej), catch: (rej: any) => run().catch(rej) };
  },
  withOrgTx: async (orgId: string, ...queries: Q[]) => {
    if (m.antesDeTx) await m.antesDeTx(queries);
    return m.db.transaction(async (tx: any) => {
      await tx.query("select set_config('app.org_id', $1, true)", [orgId]);
      const out = [];
      for (const q of queries) out.push((await tx.query(q.text, q.values)).rows);
      return out;
    });
  },
  logAudit: async (orgId: string, e: { accion: string; entidad?: string; entidad_id?: string; detalle?: string }) => {
    await m.db.query('insert into audit_log(org_id,accion,entidad,entidad_id,detalle) values ($1,$2,$3,$4,$5)',
      [orgId, e.accion, e.entidad ?? null, e.entidad_id ?? null, e.detalle ?? null]);
  },
}));
vi.mock('../src/lib/after', () => ({ after: (p: Promise<unknown>) => { m.pending.push(Promise.resolve(p).catch(() => {})); } }));
vi.mock('../src/lib/billing', () => ({ stripe: m.stripe, METER_PRICES: {}, PRICE_TO_PLAN: {}, retrieveAccount: vi.fn() }));
vi.mock('../src/lib/ops-alert', () => ({ sendOpsAlert: m.alert }));
vi.mock('../src/lib/posthog-server', () => ({ trackPaymentReceived: m.track, trackServer: vi.fn(async () => true) }));
vi.mock('../src/lib/webhooks', () => ({
  dispatchQuoteEvent: m.dispatch, dispatchPaymentPartial: m.partial, dispatchInvoiceEvent: m.invoiceEvent, dispatchEvent: vi.fn(),
}));
vi.mock('../src/lib/notify', () => ({ notifyQuoteEvent: m.notify }));
vi.mock('../src/lib/fiscal/timeline', () => ({ logInvoiceEvent: m.timeline }));
vi.mock('../src/lib/kyc-evidencia', () => ({ cerrarVeredictoKyc: vi.fn() }));
vi.mock('../src/lib/queries', () => ({ invalidateMoneyCaches: vi.fn() }));
vi.mock('../src/lib/email', () => ({ sendEmail: vi.fn(), siteOrigin: () => 'https://cordhq.app' }));
vi.mock('../src/lib/invoice-payment-fees', () => ({ reconcileInvoiceCommission: vi.fn(async () => 'ok') }));
vi.mock('../src/lib/integraciones/contabilidad/pagos', () => ({ onPagoFactura: vi.fn(async () => {}) }));
vi.mock('../src/lib/integraciones/hojas/service', () => ({ onAbonoFactura: vi.fn(async () => {}) }));
vi.mock('../src/lib/log', () => ({ log: { error: (...a: any[]) => console.log('LOGERR', a[0], String(a[1]?.err?.message ?? a[1]?.err ?? '')), warn: vi.fn(), info: vi.fn() } }));

import { POST } from '../src/pages/api/stripe/webhook';

const org = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const quote = '22222222-2222-4222-8222-222222222222';
const doc = '11111111-1111-4111-8111-111111111111';
const cobroId = '33333333-3333-4333-8333-333333333332';
let db: PGlite;
const q = (text: string, values: unknown[] = []) => db.query<any>(text, values);
const cotizacion = async () => (await q('select * from cotizaciones where id=$1', [quote])).rows[0];
const cobro = async () => (await q('select * from cotizacion_cobros where id=$1', [cobroId])).rows[0];
const auditadas = async (accion: string) => (await q('select * from audit_log where accion=$1', [accion])).rows;

let eventSeq = 0;
async function deliver(type: string, object: Record<string, unknown>, eventId = `evt_${++eventSeq}`) {
  const raw = JSON.stringify({ id: eventId, type, account: 'acct_1', data: { object } });
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', 'connect-secret').update(`${ts}.${raw}`).digest('hex');
  const res = await POST({ request: new Request('https://cordhq.app/api/stripe/webhook', {
    method: 'POST', body: raw, headers: { 'stripe-signature': `t=${ts},v1=${sig}` },
  }) } as any) as Response;
  await Promise.all(m.pending.splice(0));
  return res;
}
const intent = (over: Record<string, unknown> = {}) => ({
  id: 'pi_1', status: 'succeeded', amount: 10000, amount_received: 10000, currency: 'mxn', latest_charge: 'ch_1',
  payment_method_types: ['card'], metadata: { cotizacion_id: quote, cobro_id: cobroId }, ...over,
});

beforeAll(async () => {
  db = new PGlite();
  m.db = db;
  await db.exec(`
    create table orgs (id uuid primary key, nombre text, razon_social text, rfc text, regimen_fiscal text, country_code text,
      moneda text default 'MXN', sandbox_of uuid, stripe_account_id text, is_demo boolean default false, owner_id uuid);
    create table cotizaciones (id uuid primary key, org_id uuid not null references orgs(id), total numeric not null,
      status text not null, paid_at timestamptz, payment_method text, base_currency text, es_recurrente boolean default false,
      pago_declarado_at timestamptz);
    create table cotizacion_cobros (id uuid primary key, org_id uuid not null, cotizacion_id uuid not null references cotizaciones(id),
      tipo text not null, numero_cuota int not null default 0, monto numeric not null, status text not null default 'pendiente',
      stripe_payment_intent_id text, paid_payment_intent_id text, payment_method text, metodo_pago text, paid_at timestamptz,
      mp_payment_id text, mp_preference_id text, pago_en_proceso_at timestamptz, pago_en_proceso_ref text,
      reembolsado_cents int not null default 0, reembolso_status text, refunded_at timestamptz,
      stripe_charge_id text, stripe_balance_transaction_id text, stripe_application_fee_id text, stripe_fee_cents int,
      application_fee_cents int, fee_base_cents int, fee_iva_cents int, fee_total_cents int, neto_cents int,
      created_at timestamptz default now());
    create table comisiones (id uuid primary key default gen_random_uuid(), org_id uuid not null, cobro_id uuid,
      stripe_payment_intent_id text not null, stripe_charge_id text, stripe_balance_transaction_id text, stripe_application_fee_id text,
      metodo_pago text, moneda text, monto_cents int, fee_base_cents int, fee_iva_cents int, fee_total_cents int,
      stripe_fee_cents int, neto_vendedor_cents int, status text, updated_at timestamptz, created_at timestamptz default now(),
      unique (org_id, stripe_payment_intent_id));
    create table cotizacion_pago_intentos (id uuid primary key default gen_random_uuid(), org_id uuid not null, cobro_id uuid not null,
      stripe_payment_intent_id text);
    create table documentos_fiscales (
      id uuid primary key default gen_random_uuid(), org_id uuid not null references orgs(id),
      invoice_number text, total numeric not null, subtotal numeric, tax_total numeric, currency text not null,
      amount_paid numeric default 0, amount_remaining numeric, lifecycle text, status text,
      document_type text default 'cfdi_40', credit_note_of uuid references documentos_fiscales(id),
      country_code text default 'MX', cotizacion_id uuid, cliente_id uuid, public_token text default 'tok',
      due_date date, provider text, provider_data jsonb, stripe_payment_intent_id text, mp_preference_id text,
      created_at timestamptz default now(), updated_at timestamptz default now());
    create table documento_pagos (
      id uuid primary key default gen_random_uuid(), org_id uuid not null, documento_id uuid not null,
      monto numeric not null check (monto > 0), currency text, stripe_payment_intent_id text, mp_payment_id text, metodo text, referencia text,
      cobro_id uuid, nota text, registrado_por uuid);
    create unique index pagos_pi on documento_pagos(documento_id,stripe_payment_intent_id) where stripe_payment_intent_id is not null;
    create table eventos (id uuid primary key default gen_random_uuid(), org_id uuid, cotizacion_id uuid, documento_id uuid, tipo text, detalle text);
    create table audit_log (id uuid primary key default gen_random_uuid(), org_id uuid, accion text, entidad text, entidad_id text, detalle text);
    create table cobro_reembolsos (id uuid primary key default gen_random_uuid(), org_id uuid not null, cobro_id uuid not null,
      stripe_refund_id text unique, mp_refund_id text unique, amount_cents int not null check (amount_cents > 0),
      currency text not null default 'MXN', status text not null default 'pending', reason text, failure_reason text,
      updated_at timestamptz);
    create table stripe_events (id text primary key, type text, claimed_at timestamptz, processed_at timestamptz,
      claim_token text, attempt_count int not null default 0, last_error text);
    create table platform_health (key text primary key, last_success_at timestamptz, metadata jsonb, updated_at timestamptz);
    create function cord_resolve_org_for_quote(p_quote uuid, p_account text default null) returns uuid language sql as $$
      select c.org_id from cotizaciones c join orgs o on o.id = c.org_id
       where c.id = p_quote and (p_account is null or p_account = '' or o.stripe_account_id = p_account) limit 1 $$;
    create function cord_resolve_org_for_connected_account(p_account text) returns uuid language sql as $$
      select id from orgs where stripe_account_id = p_account limit 1 $$;
  `);
  const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const start = schema.indexOf('-- Conciliación de facturas:');
  const next = schema.indexOf('\n-- BEGIN ', start);
  await db.exec(schema.slice(start, next === -1 ? undefined : next));
}, 30000);
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  vi.clearAllMocks();
  m.pending.length = 0;
  m.antesDeTx = null;
  await db.exec(`truncate stripe_events, audit_log, eventos, documento_pagos, documento_reembolsos, cobro_reembolsos,
    cotizacion_pago_intentos, comisiones, cotizacion_cobros, documentos_fiscales, cotizaciones, orgs cascade`);
  await q("insert into orgs(id, country_code, stripe_account_id) values ($1,'MX','acct_1')", [org]);
  await q("insert into cotizaciones(id,org_id,total,status,base_currency) values ($1,$2,100,'approved','MXN')", [quote, org]);
  m.track.mockResolvedValue(undefined);
  m.stripe.mockImplementation(async (path: string) => {
    if (path.startsWith('/v1/charges/')) {
      return { id: 'ch_1', amount: 10000, currency: 'mxn', payment_method_details: { type: 'card' },
        balance_transaction: { id: 'txn_1', fee: 400, net: 9600, fee_details: [] }, application_fee: null };
    }
    return {};
  });
});

describe('A1: la liquidación de Stripe es atómica y reentrante', () => {
  it('salda la cotización y escribe su historia en la misma transacción', async () => {
    await q("insert into cotizacion_cobros(id,org_id,cotizacion_id,tipo,monto,status,stripe_payment_intent_id) values ($1,$2,$3,'total',100,'pendiente','pi_1')", [cobroId, org, quote]);
    expect((await deliver('payment_intent.succeeded', intent())).status).toBe(200);
    expect(await cotizacion()).toMatchObject({ status: 'paid' });
    expect(await cobro()).toMatchObject({ status: 'pagado', paid_payment_intent_id: 'pi_1' });
    expect((await q("select detalle from eventos where cotizacion_id=$1", [quote])).rows.map((r) => r.detalle))
      .toEqual(['Pago recibido con Cord Payments; cotización saldada']);
    expect(m.dispatch).toHaveBeenCalledWith(org, quote, 'quote.paid');
  });

  it('un estado a medias (cobro pagado, cotización sin saldar) se repara en el reintento', async () => {
    // Así quedaba con el código anterior si fallaba el segundo o tercer paso.
    await q("insert into cotizacion_cobros(id,org_id,cotizacion_id,tipo,monto,status,paid_payment_intent_id,payment_method,paid_at) values ($1,$2,$3,'total',100,'pagado','pi_1','tarjeta',now())", [cobroId, org, quote]);
    expect((await deliver('payment_intent.succeeded', intent())).status).toBe(200);
    expect(await cotizacion()).toMatchObject({ status: 'paid' });
    expect(m.dispatch).toHaveBeenCalledWith(org, quote, 'quote.paid');
    expect(await auditadas('cotizacion.pago_duplicado')).toHaveLength(0);
  });

  it('PostHog caído no tumba el pago ni se come quote.paid', async () => {
    await q("insert into cotizacion_cobros(id,org_id,cotizacion_id,tipo,monto,status) values ($1,$2,$3,'total',100,'pendiente')", [cobroId, org, quote]);
    m.track.mockRejectedValue(new Error('posthog caído'));
    expect((await deliver('payment_intent.succeeded', intent())).status).toBe(200);
    expect(await cotizacion()).toMatchObject({ status: 'paid' });
    expect(m.dispatch).toHaveBeenCalledWith(org, quote, 'quote.paid');
    expect(m.notify).toHaveBeenCalledWith(org, quote, 'quote_paid');
  });

  it('un anticipo es pago parcial con el mismo payload para los dos rieles', async () => {
    await q("update cotizaciones set total=200 where id=$1", [quote]);
    await q("insert into cotizacion_cobros(id,org_id,cotizacion_id,tipo,monto,status) values ($1,$2,$3,'anticipo',100,'pendiente')", [cobroId, org, quote]);
    await deliver('payment_intent.succeeded', intent());
    expect(await cotizacion()).toMatchObject({ status: 'approved' });
    expect(m.partial).toHaveBeenCalledWith(org, quote, expect.objectContaining({ tipo: 'anticipo', monto: 100, saldo_pendiente: 100, payment_method: 'tarjeta' }));
  });
});

describe('A2: el dinero de más ya no se pierde en silencio', () => {
  it('Stripe paga un cobro que ya pagó Mercado Pago: se avisa y queda en la factura por devolver', async () => {
    await q("insert into cotizacion_cobros(id,org_id,cotizacion_id,tipo,monto,status,mp_payment_id,payment_method,paid_at) values ($1,$2,$3,'total',100,'pagado','9001','mercadopago',now())", [cobroId, org, quote]);
    await q("update cotizaciones set status='invoiced', paid_at=now() where id=$1", [quote]);
    await q(`insert into documentos_fiscales(id,org_id,cotizacion_id,total,subtotal,tax_total,currency,amount_paid,amount_remaining,lifecycle,status)
             values ($1,$2,$3,100,100,0,'MXN',0,100,'open','issued')`, [doc, org, quote]);
    await q("insert into documento_pagos(org_id,documento_id,monto,currency,mp_payment_id,cobro_id) values ($1,$2,100,'MXN','9001',$3)", [org, doc, cobroId]);
    await q("select 1"); // la factura recalcula al aplicar el siguiente pago
    expect((await deliver('payment_intent.succeeded', intent({ id: 'pi_2' }))).status).toBe(200);
    expect(await auditadas('cotizacion.pago_duplicado')).toHaveLength(1);
    expect(m.alert).toHaveBeenCalledWith('Pago duplicado en Cord Payments', expect.stringContaining('pi_2'));
    const pagos = (await q('select stripe_payment_intent_id, cobro_id from documento_pagos where stripe_payment_intent_id is not null')).rows;
    expect(pagos).toEqual([{ stripe_payment_intent_id: 'pi_2', cobro_id: null }]);
    // El cobro sigue diciendo que lo pagó Mercado Pago: el duplicado no lo pisa.
    expect(await cobro()).toMatchObject({
      status: 'pagado', paid_payment_intent_id: null, payment_method: 'mercadopago', stripe_charge_id: null,
    });
  });

  it('un segundo PaymentIntent no pisa el cargo ni el neto del que pagó el cobro (la disputa sigue ligada)', async () => {
    await q(`insert into cotizacion_cobros(id,org_id,cotizacion_id,tipo,monto,status,stripe_payment_intent_id,paid_payment_intent_id,
               payment_method,metodo_pago,stripe_charge_id,neto_cents,paid_at)
             values ($1,$2,$3,'total',100,'pagado','pi_1','pi_1','tarjeta','tarjeta','ch_1',9600,now())`, [cobroId, org, quote]);
    await q("update cotizaciones set status='paid', paid_at=now() where id=$1", [quote]);
    m.stripe.mockImplementation(async (path: string) => (path.startsWith('/v1/charges/')
      ? { id: path.slice('/v1/charges/'.length), amount: 10000, currency: 'mxn', payment_method_details: { type: 'card' },
          balance_transaction: { id: 'txn_2', fee: 500, net: 9500, fee_details: [] }, application_fee: null }
      : {}));
    expect((await deliver('payment_intent.succeeded', intent({ id: 'pi_2', latest_charge: 'ch_2' }))).status).toBe(200);
    expect(await cobro()).toMatchObject({ stripe_charge_id: 'ch_1', neto_cents: 9600, paid_payment_intent_id: 'pi_1' });
    expect(await auditadas('cotizacion.pago_duplicado')).toHaveLength(1);
    // La comisión del duplicado sí queda registrada, con su propio cargo.
    expect((await q("select stripe_charge_id from comisiones where stripe_payment_intent_id='pi_2'")).rows)
      .toEqual([{ stripe_charge_id: 'ch_2' }]);
  });

  it('legacy: la entrega gemela que pierde la carrera es repetida, no va a revisión', async () => {
    await q("update cotizaciones set status='invoiced' where id=$1", [quote]);
    // checkout.session y payment_intent del mismo pago llegan casi juntos: la
    // otra entrega salda la cotización justo antes de que esta tome el candado.
    m.antesDeTx = async (queries) => {
      if (queries[0]?.text.includes('pg_advisory_xact_lock') && queries.some((x) => x.text.includes("set status = 'paid'"))) {
        m.antesDeTx = null;
        await q("update cotizaciones set status='paid', paid_at=now() where id=$1", [quote]);
      }
    };
    const legacy = intent({ metadata: { cotizacion_id: quote } });
    expect((await deliver('payment_intent.succeeded', legacy, 'evt_gemelo')).status).toBe(200);
    const [evento] = (await q("select processed_at, last_error from stripe_events where id='evt_gemelo'")).rows;
    expect(evento.processed_at).not.toBeNull();
    expect(evento.last_error).toBeNull();
    expect(m.alert).not.toHaveBeenCalledWith('Evento de Stripe enviado a revisión', expect.anything());
  });

  it('el mismo PaymentIntent reenviado NO es duplicado', async () => {
    await q("insert into cotizacion_cobros(id,org_id,cotizacion_id,tipo,monto,status) values ($1,$2,$3,'total',100,'pendiente')", [cobroId, org, quote]);
    await deliver('payment_intent.succeeded', intent(), 'evt_a');
    await deliver('payment_intent.succeeded', intent(), 'evt_b');
    expect(await auditadas('cotizacion.pago_duplicado')).toHaveLength(0);
    expect(m.dispatch.mock.calls.filter((c) => c[2] === 'quote.paid')).toHaveLength(1);
  });

  it('un SPEI tardío sobre un cobro cancelado de una cotización ya saldada es pago de más, con aviso', async () => {
    await q("insert into cotizacion_cobros(id,org_id,cotizacion_id,tipo,monto,status) values ($1,$2,$3,'total',100,'cancelado')", [cobroId, org, quote]);
    await q("update cotizaciones set status='paid', paid_at=now(), pago_declarado_at=now() where id=$1", [quote]);
    expect((await deliver('payment_intent.succeeded', intent({ payment_method_types: ['customer_balance'] }))).status).toBe(200);
    expect(await cobro()).toMatchObject({ status: 'cancelado' });
    expect(await auditadas('cotizacion.pago_duplicado')).toHaveLength(1);
    expect(m.partial).not.toHaveBeenCalled();
    expect(m.track).not.toHaveBeenCalled();
  });
});

describe('A3 y M22: lo permanente se avisa una vez y no se reintenta días', () => {
  it('pagar una factura ANULADA: 200, queda en su historia y se avisa una sola vez', async () => {
    await q(`insert into documentos_fiscales(id,org_id,total,subtotal,tax_total,currency,amount_paid,amount_remaining,lifecycle,status)
             values ($1,$2,100,100,0,'MXN',0,100,'void','cancelled')`, [doc, org]);
    const pago = intent({ id: 'pi_void', metadata: { documento_id: doc } });
    expect((await deliver('payment_intent.succeeded', pago, 'evt_v1')).status).toBe(200);
    expect((await deliver('payment_intent.succeeded', pago, 'evt_v2')).status).toBe(200);
    expect(m.timeline.mock.calls.filter(([, d, tipo]) => d === doc && tipo === 'payment')).toHaveLength(1);
    expect(m.alert.mock.calls.filter(([t]) => t === 'Pago sin aplicar a factura')).toHaveLength(1);
  });

  it('un error permanente se da por atendido con UN aviso, y no vuelve a procesarse', async () => {
    const pago = intent({ metadata: { cotizacion_id: quote, cobro_id: 'no-es-uuid' } });
    expect((await deliver('payment_intent.succeeded', pago, 'evt_p')).status).toBe(200);
    expect((await q("select processed_at, last_error from stripe_events where id='evt_p'")).rows[0].last_error).toMatch(/^revision:/);
    expect(m.alert.mock.calls.filter(([t]) => t === 'Evento de Stripe enviado a revisión')).toHaveLength(1);
    expect((await deliver('payment_intent.succeeded', pago, 'evt_p')).status).toBe(200);
    expect(m.alert.mock.calls.filter(([t]) => t === 'Evento de Stripe enviado a revisión')).toHaveLength(1);
  });

  it('una falla temporal responde 500 y se reintenta; agotado el presupuesto, va a revisión', async () => {
    await q("insert into cotizacion_cobros(id,org_id,cotizacion_id,tipo,monto,status) values ($1,$2,$3,'total',100,'pendiente')", [cobroId, org, quote]);
    m.stripe.mockRejectedValue(new Error('stripe no responde'));
    for (let i = 0; i < 7; i++) {
      expect((await deliver('payment_intent.succeeded', intent(), 'evt_t')).status).toBe(500);
      await q("update stripe_events set claimed_at = null where id = 'evt_t'");
    }
    expect((await q("select attempt_count, processed_at from stripe_events where id='evt_t'")).rows[0]).toMatchObject({ attempt_count: 7, processed_at: null });
    expect((await deliver('payment_intent.succeeded', intent(), 'evt_t')).status).toBe(200);
    expect((await q("select processed_at from stripe_events where id='evt_t'")).rows[0].processed_at).not.toBeNull();
    expect(m.alert.mock.calls.filter(([t]) => t === 'Evento de Stripe enviado a revisión')).toHaveLength(1);
  });
});

describe('A7: el webhook completa la fila del reembolso que pidió Cord', () => {
  it('no inserta una segunda fila para el mismo reembolso', async () => {
    await q("insert into cotizacion_cobros(id,org_id,cotizacion_id,tipo,monto,status,paid_payment_intent_id) values ($1,$2,$3,'total',100,'pagado','pi_1')", [cobroId, org, quote]);
    const [{ id }] = (await q("insert into cobro_reembolsos(org_id,cobro_id,amount_cents,status) values ($1,$2,4000,'pending') returning id", [org, cobroId])).rows;
    const refund = { id: 're_1', charge: 'ch_1', payment_intent: 'pi_1', amount: 4000, currency: 'mxn', status: 'succeeded', metadata: { cord_refund_id: id } };
    m.stripe.mockImplementation(async (path: string) => (path === '/v1/refunds/re_1' ? refund : {}));
    expect((await deliver('refund.updated', refund)).status).toBe(200);
    expect((await q('select id, stripe_refund_id, status from cobro_reembolsos')).rows).toEqual([{ id, stripe_refund_id: 're_1', status: 'succeeded' }]);
    expect(await cobro()).toMatchObject({ reembolsado_cents: 4000 });
  });
});
