import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ tx: vi.fn(), plan: 'free', flush: vi.fn() }));
vi.mock('../src/lib/db', () => ({ withOrgTx: m.tx, withSystemTx: vi.fn(),
  sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.reduce((out, p, i) => out + (i ? `$${i}` : '') + p, ''), values }) }));
vi.mock('../src/lib/org-entitlements', () => ({ getEffectivePlan: async () => m.plan,
  getEntitlementContext: async (id: string) => ({ effectivePlan: m.plan, billingOrgId: id, isSandbox: false, stripeCustomerId: 'cus_test' }) }));
vi.mock('../src/lib/billing', async (original) => ({ ...await original<any>(), flushUsageReservation: m.flush }));
import { INCLUDED, reserveUsage, cancelUsage } from '../src/lib/billing';
import { meterInvoiceEmission } from '../src/lib/fiscal/issuance-usage';
import { selectDocumentType, isFiscalDocument, documentPrefix } from '../src/lib/fiscal/document-kind';
import { FiscalFactory } from '../src/lib/fiscal/FiscalFactory';
import { SUPPORTED_COUNTRIES } from '../src/lib/countries';
const org = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
let db: PGlite;
const q = (text: string, values: unknown[] = []) => db.query<any>(text, values);
const usage = async () => Number((await q('select cfdi from uso_periodo where org_id=$1', [org])).rows[0]?.cfdi || 0);
async function draft() {
  return (await q("insert into documentos_fiscales(org_id,status,lifecycle,provider_data) values($1,'pending','draft','{}') returning id", [org])).rows[0].id as string;
}
async function issue(id: string, data = {}) {
  await q("update documentos_fiscales set status='issued',lifecycle='open',provider_data=provider_data || $2::jsonb where id=$1", [id, JSON.stringify(data)]);
  return { emitted: true, documentId: id, status: 'issued' as const, billable: false };
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table documentos_fiscales(id uuid primary key default gen_random_uuid(),org_id uuid,status text,lifecycle text,provider_data jsonb,updated_at timestamptz);
    create table uso_periodo(org_id uuid,periodo text,cfdi int default 0,ia int default 0,api int default 0,usuarios int default 0,envios int default 0,updated_at timestamptz,primary key(org_id,periodo));
    create table usage_reservations(id uuid primary key,org_id uuid,billing_org_id uuid,dimension text,value int,meter_value int,periodo text,status text,meter_status text,stripe_customer_id text,committed_at timestamptz,canceled_at timestamptz,updated_at timestamptz);
  `);
  m.tx.mockImplementation((_org: string, ...queries: Array<{ text: string; values: unknown[] }>) => db.transaction(async tx => {
    const results = [];
    for (const query of queries) results.push((await tx.query(query.text, query.values)).rows);
    return results;
  }));
}, 15000);
beforeEach(async () => { m.plan = 'free'; m.flush.mockReset(); await db.exec('truncate documentos_fiscales,uso_periodo,usage_reservations'); });
afterAll(async () => { await db.close(); });

describe('documentos comerciales y fiscales', () => {
  it.each(SUPPORTED_COUNTRIES)('Free en %s nunca selecciona un proveedor fiscal', (country) => {
    const type = selectDocumentType(country, 'free', undefined, true);
    expect(isFiscalDocument(type, country)).toBe(false);
    expect(FiscalFactory.getProvider(country, type).constructor.name).toBe('CommercialInvoiceProvider');
    expect(() => selectDocumentType(country, 'free', 'fiscal', true)).toThrow(/Starter/);
  });
  it('Starter mexicano permite CFDI y proforma explícita', () => {
    expect(selectDocumentType('MX', 'starter', undefined)).toBe('cfdi_40');
    expect(selectDocumentType('MX', 'starter', 'commercial')).toBe('proforma');
  });
  it('España requiere habilitación; no llama factura fiscal al fallback', () => {
    expect(selectDocumentType('ES', 'starter', undefined, false)).toBe('proforma');
    expect(() => selectDocumentType('ES', 'starter', 'fiscal', false)).toThrow(/habilitada/);
    expect(selectDocumentType('ES', 'starter', 'fiscal', true)).toBe('verifactu_invoice');
  });
  it('no promete emisión fiscal en un mercado sin integración', () => {
    expect(() => selectDocumentType('US', 'pro', 'fiscal')).toThrow(/habilitada/);
    expect(() => selectDocumentType('MX', 'starter', 'otro')).toThrow(/inválido/);
  });
  it('separa folios de proforma, crédito comercial y CFDI', () => {
    expect(new Set(['proforma', 'commercial_credit_note', 'cfdi_40', 'cfdi_egreso'].map(t => documentPrefix(t, 'F'))).size).toBe(4);
  });
});

describe('cuota real con SQL', () => {
  it('conserva exactamente las cantidades autorizadas, incluido Pro mayor que Scale', () => {
    expect(['free','starter','pro','scale','developer'].map(p => INCLUDED[p as keyof typeof INCLUDED].cfdi)).toEqual([5,20,500,100,1000]);
  });
  it('de seis emisiones simultáneas Free confirma cinco; la sexta no llama al emisor', async () => {
    const ids = await Promise.all(Array.from({ length: 6 }, draft));
    const emitter = vi.fn(issue);
    const results = await Promise.all(ids.map(id => meterInvoiceEmission(org, id, () => emitter(id))));
    expect(results.filter(r => r.emitted)).toHaveLength(5);
    expect(results.find(r => !r.emitted)?.httpStatus).toBe(429);
    expect(emitter).toHaveBeenCalledTimes(5); expect(await usage()).toBe(5);
  });
  it('dos clics sobre el mismo borrador emiten y consumen una sola vez', async () => {
    const id = await draft(); const emitter = vi.fn(() => issue(id));
    await Promise.all([meterInvoiceEmission(org, id, emitter), meterInvoiceEmission(org, id, emitter)]);
    expect(emitter).toHaveBeenCalledTimes(1); expect(await usage()).toBe(1);
  });
  it('un reintento de un documento emitido funciona aun con cuota agotada', async () => {
    const id = await draft(); await issue(id);
    await reserveUsage(org, 'timbrado', 5);
    const read = vi.fn(async () => ({ emitted: true, status: 'issued' as const, reused: true }));
    expect((await meterInvoiceEmission(org, id, read)).reused).toBe(true);
    expect(await usage()).toBe(5);
  });
  it('un fallo confirmado devuelve la cuota y permite corregir el borrador', async () => {
    const id = await draft();
    await meterInvoiceEmission(org, id, async () => ({ emitted: false, status: 'error' as const }));
    expect(await usage()).toBe(0);
    expect((await meterInvoiceEmission(org, id, () => issue(id))).emitted).toBe(true);
    expect(await usage()).toBe(1);
  });
  it('un resultado incierto conserva reserva y bloquea otro intento', async () => {
    const id = await draft();
    await meterInvoiceEmission(org, id, async () => {
      await q("update documentos_fiscales set provider_data=provider_data || '{\"delivery_uncertain\":true}'::jsonb where id=$1", [id]);
      return { emitted: false, status: 'error' as const };
    });
    const emitter = vi.fn(() => issue(id));
    expect((await meterInvoiceEmission(org, id, emitter)).emitted).toBe(false);
    expect(emitter).not.toHaveBeenCalled(); expect(await usage()).toBe(1); expect(m.flush).not.toHaveBeenCalled();
  });
  it('una interrupción conserva la reserva para revisión', async () => {
    const id = await draft();
    await expect(meterInvoiceEmission(org, id, async () => { throw new Error('interrupción'); })).rejects.toThrow();
    expect(await usage()).toBe(1);
    expect((await meterInvoiceEmission(org, id, () => issue(id))).emitted).toBe(false);
  });
  it.each([{ simulado: true }, { livemode: false }])('un documento de prueba no consume cuota: %j', async data => {
    const id = await draft(); await meterInvoiceEmission(org, id, () => issue(id, data));
    expect(await usage()).toBe(0); expect(m.flush).not.toHaveBeenCalled();
  });
  it('el identificador de otra organización no emite ni consume', async () => {
    const id = await draft(); const emitter = vi.fn(() => issue(id));
    expect((await meterInvoiceEmission(other, id, emitter)).emitted).toBe(false);
    expect(emitter).not.toHaveBeenCalled(); expect(await usage()).toBe(0);
  });
  it('el excedente de Starter permanece retenido hasta confirmar la emisión', async () => {
    m.plan = 'starter'; await reserveUsage(org, 'timbrado', 20);
    const id = await draft();
    await meterInvoiceEmission(org, id, async () => {
      const row = (await q("select meter_status,meter_value from usage_reservations where meter_value>0")).rows[0];
      expect(row).toMatchObject({ meter_status: 'skipped', meter_value: 1 });
      return issue(id);
    });
    expect((await q('select meter_status from usage_reservations where meter_value>0')).rows[0].meter_status).toBe('pending');
    expect(await usage()).toBe(21);
  });
  it('un intento pendiente que luego falla no provoca un excedente falso', async () => {
    m.plan = 'starter'; await reserveUsage(org, 'timbrado', 19);
    const pending = await reserveUsage(org, 'timbrado', 1, { deferMeter: true });
    const id = await draft(); await meterInvoiceEmission(org, id, () => issue(id));
    expect(await cancelUsage(org, pending.id!)).toBe(true);
    expect(await usage()).toBe(20);
    expect((await q("select count(*)::int as n from usage_reservations where status='committed' and meter_value>0")).rows[0].n).toBe(0);
  });
});
