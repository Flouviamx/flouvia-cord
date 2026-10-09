// A7 de la auditoría de oct 2026: un reembolso cuyo resultado no se supo se
// marcaba como FALLIDO. Si el proveedor sí lo había creado, el saldo quedaba
// libre y el vendedor podía devolver dos veces el mismo dinero.
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ db: null as any, stripe: vi.fn() }));
type Q = { text: string; values: unknown[] };
vi.mock('../src/lib/db', () => ({
  sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.reduce((o, p, i) => o + (i ? `$${i}` : '') + p, ''), values }),
  withOrgTx: (orgId: string, ...queries: Q[]) => m.db.transaction(async (tx: any) => {
    await tx.query("select set_config('app.org_id', $1, true)", [orgId]);
    const out = [];
    for (const q of queries) out.push((await tx.query(q.text, q.values)).rows);
    return out;
  }),
  getActiveOrgId: async () => 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  logAudit: vi.fn(),
  reqIp: () => '203.0.113.7',
}));
vi.mock('../src/lib/queries', () => ({ requirePerm: async () => null }));
vi.mock('../src/lib/step-up', () => ({ requireFreshAuth: async () => null }));
vi.mock('../src/lib/context', () => ({ currentUserId: () => null, currentLocale: () => 'es' }));
vi.mock('../src/lib/ratelimit', () => ({ strictRateLimit: async () => ({ ok: true }), strictLimitResponse: () => null }));
vi.mock('../src/lib/billing', () => ({ stripe: m.stripe }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn() } }));

import { GET, POST } from '../src/pages/api/cobros/[cobroId]/reembolso';

const org = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const quote = '22222222-2222-4222-8222-222222222222';
const cobroId = '33333333-3333-4333-8333-333333333333';
let db: PGlite;
const q = (text: string, values: unknown[] = []) => db.query<any>(text, values);
const filas = async () => (await q('select status, stripe_refund_id, failure_reason from cobro_reembolsos order by created_at')).rows;

async function autorizar() {
  const res = await GET({ params: { cobroId } } as any) as Response;
  return { status: res.status, body: await res.json() };
}
async function reembolsar(nonce: string, amountCents: number) {
  const res = await POST({ params: { cobroId }, request: new Request('https://cordhq.app/x', {
    method: 'POST', body: JSON.stringify({ nonce, amountCents, feeDisclosureAccepted: true }),
  }) } as any) as Response;
  return { status: res.status, body: await res.json() };
}
const errorStripe = (status?: number) => Object.assign(new Error('fallo'), status ? { stripeStatus: status, type: 'invalid_request_error' } : {});

beforeAll(async () => {
  db = new PGlite();
  m.db = db;
  await db.exec(`
    create table orgs (id uuid primary key, moneda text default 'MXN', stripe_account_id text);
    create table cotizaciones (id uuid primary key, org_id uuid, base_currency text);
    create table cotizacion_cobros (id uuid primary key, org_id uuid, cotizacion_id uuid, monto numeric, status text,
      payment_method text, metodo_pago text, stripe_payment_intent_id text, paid_payment_intent_id text);
    create table cobro_reembolsos (id uuid primary key default gen_random_uuid(), org_id uuid not null, cobro_id uuid not null,
      stripe_refund_id text unique, mp_refund_id text unique, amount_cents int not null, currency text default 'MXN',
      status text not null default 'pending', reason text, manual boolean not null default false, failure_reason text,
      requested_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table refund_nonces (id uuid primary key default gen_random_uuid(), org_id uuid, cobro_id uuid, nonce_hash text,
      max_amount_cents int, expires_at timestamptz, consumed_at timestamptz, created_by uuid);
    create table tareas (org_id uuid, cotizacion_id uuid, titulo text);
  `);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  vi.clearAllMocks();
  await db.exec('truncate cobro_reembolsos, refund_nonces, cotizacion_cobros, cotizaciones, orgs');
  await q("insert into orgs(id, stripe_account_id) values ($1, 'acct_1')", [org]);
  await q("insert into cotizaciones(id, org_id, base_currency) values ($1, $2, 'MXN')", [quote, org]);
  // El cobro tuvo dos intentos: el que PAGÓ (pi_pago) y uno posterior que no.
  await q(`insert into cotizacion_cobros(id, org_id, cotizacion_id, monto, status, payment_method, stripe_payment_intent_id, paid_payment_intent_id)
           values ($1, $2, $3, 100, 'pagado', 'tarjeta', 'pi_ultimo', 'pi_pago')`, [cobroId, org, quote]);
  m.stripe.mockImplementation(async (path: string) => (path === '/v1/refunds' ? { data: [] } : {}));
});

describe('un reembolso de resultado incierto retiene el saldo', () => {
  it('red caída al pedirlo: queda pendiente y NO se puede volver a reembolsar el mismo dinero', async () => {
    const a = await autorizar();
    expect(a.body.maxAmountCents).toBe(10000);
    m.stripe.mockRejectedValueOnce(errorStripe());
    const r = await reembolsar(a.body.nonce, 10000);
    expect(r).toMatchObject({ status: 202, body: { status: 'pending', uncertain: true } });
    expect((await filas())[0]).toMatchObject({ status: 'pending', stripe_refund_id: null });
    // Antes: la fila quedaba `failed` y aquí se autorizaban otros 10,000.
    expect((await autorizar()).status).toBe(409);
  });

  it('un rechazo definitivo del proveedor sí libera el saldo', async () => {
    const a = await autorizar();
    m.stripe.mockRejectedValueOnce(errorStripe(400));
    expect((await reembolsar(a.body.nonce, 10000)).status).toBe(502);
    expect((await filas())[0]).toMatchObject({ status: 'failed' });
    expect((await autorizar()).body.maxAmountCents).toBe(10000);
  });

  it('reembolsa el PaymentIntent que PAGÓ el cobro y liga la fila por metadata', async () => {
    const a = await autorizar();
    m.stripe.mockResolvedValueOnce({ id: 're_1', status: 'succeeded' });
    expect((await reembolsar(a.body.nonce, 4000)).status).toBe(202);
    const [, params] = m.stripe.mock.calls.find(([path, , method]) => path === '/v1/refunds' && method === 'POST')!;
    expect(params).toMatchObject({ payment_intent: 'pi_pago', 'metadata[cord_refund_id]': expect.any(String) });
    expect((await filas())[0]).toMatchObject({ status: 'succeeded', stripe_refund_id: 're_1' });
  });

  it('la conciliación encuentra el reembolso incierto en el proveedor por su metadata', async () => {
    const [{ id }] = (await q(`insert into cobro_reembolsos(org_id, cobro_id, amount_cents, status, created_at)
      values ($1, $2, 6000, 'pending', now() - interval '3 minutes') returning id`, [org, cobroId])).rows;
    m.stripe.mockImplementation(async (path: string, params: any) => (path === '/v1/refunds' && params?.payment_intent === 'pi_pago'
      ? { data: [{ id: 're_tarde', status: 'succeeded', metadata: { cord_refund_id: id } }] } : {}));
    const a = await autorizar();
    expect(a.body.maxAmountCents).toBe(4000);
    expect((await filas())[0]).toMatchObject({ status: 'succeeded', stripe_refund_id: 're_tarde' });
  });

  it('una petición que nunca llegó al proveedor libera el saldo pasados 15 minutos', async () => {
    await q(`insert into cobro_reembolsos(org_id, cobro_id, amount_cents, status, created_at)
      values ($1, $2, 6000, 'pending', now() - interval '20 minutes')`, [org, cobroId]);
    expect((await autorizar()).body.maxAmountCents).toBe(10000);
    expect((await filas())[0]).toMatchObject({ status: 'failed', failure_reason: 'no_llego_al_proveedor' });
  });

  it('sin respuesta del proveedor al conciliar, la fila sigue reteniendo el saldo', async () => {
    await q(`insert into cobro_reembolsos(org_id, cobro_id, amount_cents, status, created_at)
      values ($1, $2, 6000, 'pending', now() - interval '20 minutes')`, [org, cobroId]);
    m.stripe.mockRejectedValue(errorStripe());
    expect((await autorizar()).body.maxAmountCents).toBe(4000);
    expect((await filas())[0]).toMatchObject({ status: 'pending' });
  });
});
