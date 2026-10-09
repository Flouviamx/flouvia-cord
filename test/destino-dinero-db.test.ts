// A dónde llega el dinero y CUÁNDO sale (decisiones de oct 2026, regla 38), con
// el SQL real de db/schema.sql corriendo en PostgreSQL local:
//   - un cambio de destino espera 72 horas (7 días si la seguridad cambió hace
//     poco), salvo el primer destino de una cuenta que todavía no cobra;
//   - la cuenta bancaria nueva no es la predeterminada hasta entrar en vigor;
//   - "No fui yo" revierte, congela y cierra sesiones, UNA vez;
//   - Cord toma los depósitos en el periodo de prueba, el congelamiento y la
//     espera de una primera cuenta, y los suelta cuando ya nada los retiene.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  db: null as any, stripe: vi.fn(), notify: vi.fn(), payout: vi.fn(), alert: vi.fn(), revoke: vi.fn(), disconnect: vi.fn(),
}));
// Como el driver de Neon (1.1, "HTTP template queries are now fully composable"):
// un fragmento `sql` dentro de otro se inserta con sus propios parámetros.
type Frag = { strings: readonly string[]; vals: unknown[] };
const esFrag = (v: any): v is Frag => !!v && typeof v === 'object' && Array.isArray(v.vals) && Array.isArray(v.strings);
function compilar(f: Frag, out = { text: '', values: [] as unknown[] }) {
  f.strings.forEach((part, i) => {
    out.text += part;
    if (i < f.vals.length) {
      const v = f.vals[i];
      if (esFrag(v)) compilar(v, out);
      else { out.values.push(v); out.text += `$${out.values.length}`; }
    }
  });
  return out;
}
vi.mock('../src/lib/db', () => ({
  sql: (s: TemplateStringsArray, ...vals: unknown[]) => {
    const f: Frag = { strings: [...s], vals };
    const run = () => { const c = compilar(f); return m.db.query(c.text, c.values).then((r: any) => r.rows); };
    return { ...f, then: (res: any, rej: any) => run().then(res, rej), catch: (rej: any) => run().catch(rej) };
  },
  withOrgTx: (orgId: string, ...queries: Frag[]) => m.db.transaction(async (tx: any) => {
    await tx.query("select set_config('app.org_id', $1, true)", [orgId]);
    const out = [];
    for (const q of queries) { const c = compilar(q); out.push((await tx.query(c.text, c.values)).rows); }
    return out;
  }),
}));
vi.mock('../src/lib/billing', () => ({ stripe: m.stripe }));
vi.mock('../src/lib/email', () => ({ siteOrigin: () => 'https://cordhq.app' }));
vi.mock('../src/lib/auth-email', () => ({ notifyMoneyDestinationChange: m.notify, notifyPayoutControl: m.payout }));
vi.mock('../src/lib/ops-alert', () => ({ sendOpsAlert: m.alert }));
vi.mock('../src/lib/auth', () => ({ revokeAllSessions: m.revoke }));
vi.mock('../src/lib/mercadopago', () => ({ disconnectMp: m.disconnect }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import {
  ESPERA_HORAS, ESPERA_REFORZADA_HORAS, cambioPorToken, cambiosVencidos, cancelarCambio, cancelarEspera, completarCambio,
  horasDeEspera, ponerEnVigor, programarCambio,
} from '../src/lib/money-hold';
import { entrarEnVigor, revertirCambio, descongelarDepositos } from '../src/lib/destino-dinero';
import { procesarCuenta, sincronizarControl } from '../src/lib/deposit-control';

const org = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const owner = '99999999-9999-4999-8999-999999999991';
const actor = '99999999-9999-4999-8999-999999999992';
let db: PGlite;
const q = (text: string, values: unknown[] = []) => db.query<any>(text, values);
const orgRow = async () => (await q('select * from orgs where id=$1', [org])).rows[0];
const cambios = async () => (await q('select * from destino_dinero_cambios order by creado_at')).rows;
const stripeCalls = (metodo?: string) => m.stripe.mock.calls.filter((c) => !metodo || c[2] === metodo).map((c) => [c[0], c[1]]);

beforeAll(async () => {
  db = new PGlite();
  m.db = db;
  await db.exec(`
    create table users (id uuid primary key, email text, suspended_at timestamptz);
    create table orgs (id uuid primary key, nombre text, owner_id uuid, country_code text default 'MX', sandbox_of uuid,
      stripe_account_id text, stripe_charges_enabled boolean default false, stripe_requirements jsonb,
      banco_clabe text, banco_clabe_enc text, banco_clabe_last4 text, banco_beneficiario text,
      mp_user_id text, mp_charges_enabled boolean default false);
    create table org_members (org_id uuid, user_id uuid, rol text, estado text);
    create table cotizacion_cobros (id uuid primary key default gen_random_uuid(), org_id uuid, status text);
    create table documento_pagos (id uuid primary key default gen_random_uuid(), org_id uuid);
    create table cobro_disputas (id uuid primary key default gen_random_uuid(), org_id uuid, status text, created_at timestamptz default now());
    create table payouts (id uuid primary key default gen_random_uuid(), org_id uuid, status text,
      created_at timestamptz default now(), updated_at timestamptz default now());
  `);
  const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await db.exec(schema.slice(schema.indexOf('-- BEGIN destino-dinero'), schema.indexOf('-- END destino-dinero')));
}, 30000);
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  vi.clearAllMocks();
  await db.exec('truncate destino_dinero_cambios, cotizacion_cobros, documento_pagos, cobro_disputas, payouts, org_members, orgs, users');
  await q("insert into users(id,email) values ($1,'duena@negocio.mx'),($2,'vendedor@negocio.mx')", [owner, actor]);
  await q(`insert into orgs(id,nombre,owner_id,stripe_account_id,stripe_charges_enabled,banco_clabe_enc,banco_clabe_last4,banco_beneficiario)
           values ($1,'Negocio',$2,'acct_1',true,'enc:vieja','1111','Negocio SA')`, [org, owner]);
  await q("insert into org_members(org_id,user_id,rol,estado) values ($1,$2,'owner','activo'),($1,$3,'miembro','activo')", [org, owner, actor]);
  m.stripe.mockResolvedValue({});
});

const conDinero = () => q("insert into cotizacion_cobros(org_id,status) values ($1,'pagado')", [org]);

describe('cuánto espera un cambio', () => {
  it('el primer destino de una cuenta que todavía no cobra no espera (el alta)', async () => {
    expect(await horasDeEspera(org, { tipo: 'banco', primerDestino: true, actorUserId: actor })).toBe(0);
  });
  it('un cambio, o un primer destino de una cuenta que YA cobró, espera 72 horas', async () => {
    expect(await horasDeEspera(org, { tipo: 'clabe', primerDestino: false, actorUserId: actor })).toBe(ESPERA_HORAS);
    await conDinero();
    expect(await horasDeEspera(org, { tipo: 'banco', primerDestino: true, actorUserId: actor })).toBe(ESPERA_HORAS);
  });
  it('si la seguridad de un dueño o de quien lo hace cambió en 3 días, espera 7', async () => {
    await q('update users set seguridad_cambiada_at = now() - interval \'2 days\' where id=$1', [actor]);
    expect(await horasDeEspera(org, { tipo: 'clabe', primerDestino: false, actorUserId: actor })).toBe(ESPERA_REFORZADA_HORAS);
    await q('update users set seguridad_cambiada_at = null where id=$1', [actor]);
    await q('update users set seguridad_cambiada_at = now() where id=$1', [owner]);
    expect(await horasDeEspera(org, { tipo: 'clabe', primerDestino: false, actorUserId: null })).toBe(ESPERA_REFORZADA_HORAS);
  });
});

describe('la espera y su proyección', () => {
  it('la proyección sale de los cambios en espera; reemplazar y cancelar la recalculan', async () => {
    const a = await programarCambio(org, { tipo: 'clabe', horas: 72, antes: {}, despues: { clabe_enc: 'enc:a', clabe_last4: '2222' }, actorUserId: actor });
    expect((await orgRow()).clabe_espera_hasta).not.toBeNull();
    const b = await programarCambio(org, { tipo: 'clabe', horas: 168, antes: {}, despues: { clabe_enc: 'enc:b', clabe_last4: '3333' }, actorUserId: actor });
    expect(b.reemplazados).toEqual([{ clabe_enc: 'enc:a', clabe_last4: '2222' }]);
    expect((await cambios()).map((c) => [c.id, c.estado])).toEqual([[a.id, 'reemplazado'], [b.id, 'en_espera']]);
    await cancelarEspera(org, 'clabe');
    expect((await orgRow()).clabe_espera_hasta).toBeNull();
  });

  it('el link público sigue mostrando la CLABE anterior hasta que la nueva entra en vigor, y se promueve UNA vez', async () => {
    const c = await programarCambio(org, { tipo: 'clabe', horas: 72, antes: { clabe_last4: '1111' }, despues: { clabe_enc: 'enc:nueva', clabe_last4: '2222', beneficiario: 'Otro SA' }, actorUserId: actor });
    expect(await cambiosVencidos()).toEqual([]);
    await q("update destino_dinero_cambios set efectivo_desde = now() - interval '1 minute' where id=$1", [c.id]);
    expect((await cambiosVencidos()).map((v) => v.id)).toEqual([c.id]);
    expect(await ponerEnVigor(org, c.id)).toBe(true);
    expect(await ponerEnVigor(org, c.id)).toBe(false);
    expect(await orgRow()).toMatchObject({ banco_clabe_enc: 'enc:nueva', banco_clabe_last4: '2222', banco_beneficiario: 'Otro SA', clabe_espera_hasta: null });
    expect((await orgRow()).banco_clabe_actualizada_at).not.toBeNull();
    expect((await cambios())[0]).toMatchObject({ estado: 'vigente' });
  });

  it('un cambio de cuenta de depósito NO pisa la CLABE si alguien la cambió por la otra vía mientras esperaba', async () => {
    const c = await programarCambio(org, { tipo: 'banco', horas: 72, antes: { clabe_last4: '1111' }, despues: { clabe_enc: 'enc:dep', clabe_last4: '4444' }, actorUserId: actor });
    await q("update orgs set banco_clabe_last4 = '5555', banco_clabe_enc = 'enc:otra' where id=$1", [org]);
    await ponerEnVigor(org, c.id);
    expect(await orgRow()).toMatchObject({ banco_clabe_last4: '5555', banco_clabe_enc: 'enc:otra' });
  });
});

describe('la cuenta bancaria entra en vigor en Stripe', () => {
  const programarBanco = async () => {
    const c = await programarCambio(org, {
      tipo: 'banco', horas: 72, reemplazar: false, actorUserId: actor,
      antes: { external_account_id: 'ba_vieja', last4: '1111', clabe_enc: 'enc:vieja', clabe_last4: '1111' },
      despues: { last4: '2222', clabe_enc: 'enc:nueva', clabe_last4: '2222' },
    });
    await completarCambio(org, c.id, { external_account_id: 'ba_nueva' });
    await q("update destino_dinero_cambios set efectivo_desde = now() - interval '1 minute' where id=$1", [c.id]);
    return c;
  };

  it('al vencer la espera, la nueva pasa a predeterminada y se avisa a los dueños', async () => {
    const c = await programarBanco();
    expect(await entrarEnVigor(org, c.id)).toBe('vigente');
    expect(stripeCalls('POST')).toEqual([['/v1/accounts/acct_1/external_accounts/ba_nueva', { default_for_currency: 'true' }]]);
    expect((await cambios())[0].aplicado_at).not.toBeNull();
    expect(m.notify).toHaveBeenCalledWith(org, 'banco_vigente', expect.anything());
  });

  it('si Stripe falla, el registro queda vigente sin aplicar y la siguiente corrida lo reintenta sin volver a avisar', async () => {
    const c = await programarBanco();
    m.stripe.mockRejectedValueOnce(Object.assign(new Error('caído'), { stripeStatus: 503 }));
    await expect(entrarEnVigor(org, c.id)).rejects.toThrow('caído');
    expect((await cambios())[0]).toMatchObject({ estado: 'vigente', aplicado_at: null });
    expect((await cambiosVencidos()).map((v) => v.id)).toEqual([c.id]);
    expect(await entrarEnVigor(org, c.id)).toBe('reintento_aplicado');
    expect((await cambios())[0].aplicado_at).not.toBeNull();
    expect(m.notify).not.toHaveBeenCalled();
  });

  it('un cambio que el proveedor ya no tiene se da por aplicado y se avisa a Ops', async () => {
    const c = await programarBanco();
    m.stripe.mockRejectedValueOnce(Object.assign(new Error('no existe'), { stripeStatus: 404 }));
    expect(await entrarEnVigor(org, c.id)).toBe('cuenta_borrada');
    expect(m.alert).toHaveBeenCalled();
    expect(await cambiosVencidos()).toEqual([]);
  });

  it('cancelar un cambio que el proveedor rechazó deja todo como estaba', async () => {
    const c = await programarCambio(org, { tipo: 'banco', horas: 72, reemplazar: false, antes: {}, despues: {}, actorUserId: actor });
    await cancelarCambio(org, c.id);
    expect((await cambios())[0].estado).toBe('cancelado');
    expect((await orgRow()).deposito_espera_hasta).toBeNull();
  });
});

describe('"No fui yo"', () => {
  it('revierte una cuenta en espera: borra la nueva, congela, cierra sesiones, y el enlace sirve UNA vez', async () => {
    const c = await programarCambio(org, {
      tipo: 'banco', horas: 72, reemplazar: false, actorUserId: actor,
      antes: { external_account_id: 'ba_vieja' }, despues: { clabe_last4: '2222' },
    });
    await completarCambio(org, c.id, { external_account_id: 'ba_nueva' });
    const cambio = await cambioPorToken(c.revertirToken);
    expect(cambio).toMatchObject({ tipo: 'banco', estado: 'en_espera', creadoPor: actor });
    const r = await revertirCambio(cambio!, { ip: '203.0.113.9' });
    expect(r).toEqual({ revertido: true, pendientes: [] });
    // En espera la nueva nunca fue la predeterminada: no hay nada que restaurar, solo borrarla.
    expect(stripeCalls('DELETE')).toEqual([['/v1/accounts/acct_1/external_accounts/ba_nueva', undefined]]);
    expect(stripeCalls('POST')).toEqual([['/v1/accounts/acct_1', { 'settings[payouts][schedule][interval]': 'manual' }]]);
    expect(await orgRow()).toMatchObject({ depositos_controlados: true, deposito_espera_hasta: null });
    expect((await orgRow()).depositos_congelados_at).not.toBeNull();
    expect(m.revoke.mock.calls.map((c) => c[0]).sort()).toEqual([owner, actor].sort());
    expect(m.notify).toHaveBeenCalledWith(org, 'revertido', expect.anything());
    expect(m.payout).toHaveBeenCalledWith(org, 'congelado');
    expect(await cambioPorToken(c.revertirToken)).toBeNull();
    expect(await revertirCambio(cambio!, { ip: null })).toEqual({ revertido: false, pendientes: [] });
  });

  it('una cuenta ya vigente: la anterior vuelve a ser predeterminada ANTES de borrar la nueva, y la CLABE se restaura', async () => {
    const c = await programarCambio(org, {
      tipo: 'banco', horas: 0, actorUserId: actor,
      antes: { external_account_id: 'ba_vieja', clabe_enc: 'enc:vieja', clabe_last4: '1111', beneficiario: 'Negocio SA' },
      despues: { external_account_id: 'ba_nueva', clabe_enc: 'enc:nueva', clabe_last4: '2222' },
    });
    await q("update orgs set banco_clabe_enc='enc:nueva', banco_clabe_last4='2222' where id=$1", [org]);
    await revertirCambio((await cambioPorToken(c.revertirToken))!, { ip: null });
    const llamadas = stripeCalls().map((x) => x[0]);
    expect(llamadas.indexOf('/v1/accounts/acct_1/external_accounts/ba_vieja')).toBeLessThan(llamadas.indexOf('/v1/accounts/acct_1/external_accounts/ba_nueva'));
    expect(await orgRow()).toMatchObject({ banco_clabe_enc: 'enc:vieja', banco_clabe_last4: '1111' });
  });

  it('Mercado Pago se desconecta solo si sigue conectada la cuenta que se desconoce', async () => {
    const c = await programarCambio(org, { tipo: 'mercadopago', horas: 72, antes: {}, despues: { mp_user_id: '999' }, actorUserId: actor });
    await q("update orgs set mp_user_id='111' where id=$1", [org]);
    await revertirCambio((await cambioPorToken(c.revertirToken))!, { ip: null });
    expect(m.disconnect).not.toHaveBeenCalled();
    const d = await programarCambio(org, { tipo: 'mercadopago', horas: 72, antes: {}, despues: { mp_user_id: '111' }, actorUserId: actor });
    await revertirCambio((await cambioPorToken(d.revertirToken))!, { ip: null });
    expect(m.disconnect).toHaveBeenCalledWith(org);
  });

  it('un enlace mal formado o de otro cambio no resuelve nada', async () => {
    expect(await cambioPorToken('corto')).toBeNull();
    expect(await cambioPorToken('x'.repeat(43))).toBeNull();
  });

  it('descongelar es de Ops y devuelve los depósitos a la frecuencia del negocio', async () => {
    await q(`update orgs set depositos_congelados_at = now(), depositos_controlados = true,
             deposito_preferido = '{"interval":"weekly","weekly_anchor":"monday"}' where id=$1`, [org]);
    expect(await descongelarDepositos(org)).toBe(true);
    expect(stripeCalls('POST')).toEqual([['/v1/accounts/acct_1', {
      'settings[payouts][schedule][interval]': 'weekly',
      'settings[payouts][schedule][delay_days]': 'minimum',
      'settings[payouts][schedule][weekly_anchor]': 'monday',
    }]]);
    expect(await orgRow()).toMatchObject({ depositos_controlados: false, depositos_congelados_at: null });
    expect(await descongelarDepositos(org)).toBe(false);
  });
});

describe('control de depósitos', () => {
  it('la primera cuenta en espera de una cuenta que ya cobró deja los depósitos en manual', async () => {
    await programarCambio(org, { tipo: 'banco', horas: 72, reemplazar: false, antes: { external_account_id: null }, despues: {}, actorUserId: actor });
    expect(await sincronizarControl(org, 'acct_1', 'MX')).toBe('controlada');
    // Reafirma el control en cada corrida: Ajustes pudo haberlo pisado.
    expect(await sincronizarControl(org, 'acct_1', 'MX')).toBe('sin_cambio');
    expect(stripeCalls('POST')).toHaveLength(2);
  });

  it('un cambio sobre una cuenta anterior NO congela: los depósitos siguen llegando a la anterior', async () => {
    await programarCambio(org, { tipo: 'banco', horas: 72, reemplazar: false, antes: { external_account_id: 'ba_vieja' }, despues: {}, actorUserId: actor });
    expect(await sincronizarControl(org, 'acct_1', 'MX')).toBe('sin_cambio');
    expect(m.stripe).not.toHaveBeenCalled();
  });

  it('Brasil queda fuera: Stripe no permite depósitos manuales ahí', async () => {
    await q("update orgs set pagos_control = 'prueba' where id=$1", [org]);
    expect(await sincronizarControl(org, 'acct_1', 'BR')).toBe('no_aplica');
  });

  it('en periodo de prueba deposita lo disponible menos la reserva del 10% de tarjeta y lo de los últimos 7 días', async () => {
    await q("update orgs set pagos_control = 'prueba', pagos_prueba_desde = now() - interval '5 days', debito_negativo_configurado = true where id=$1", [org]);
    const ahora = Math.floor(Date.now() / 1000);
    m.stripe.mockImplementation(async (path: string) => {
      if (path === '/v1/balance') return { available: [{ currency: 'mxn', amount: 100_000 }], pending: [] };
      if (path === '/v1/charges') return { has_more: false, data: [
        { id: 'ch_t', status: 'succeeded', paid: true, amount: 200_000, amount_refunded: 0, currency: 'mxn', created: ahora - 20 * 86400, payment_method_details: { type: 'card' }, customer: 'cus_1' },
        { id: 'ch_s', status: 'succeeded', paid: true, amount: 500_000, amount_refunded: 0, currency: 'mxn', created: ahora - 20 * 86400, payment_method_details: { type: 'customer_balance' }, customer: 'cus_2' },
      ] };
      if (path === '/v1/balance_transactions') return { has_more: false, data: [
        { type: 'charge', currency: 'mxn', net: 30_000, available_on: ahora - 3600 },
      ] };
      if (path === '/v1/payouts') return { id: 'po_1' };
      return {};
    });
    const r = await procesarCuenta(org, 'acct_1', 'MX', '2026-10-09');
    // 100 000 disponibles − 20 000 de reserva (10% de la tarjeta; SPEI no) − 30 000 recientes.
    expect(r.depositos).toEqual([{ moneda: 'MXN', monto: 50_000, payoutId: 'po_1' }]);
    const payout = m.stripe.mock.calls.find((c) => c[0] === '/v1/payouts');
    expect(payout?.[3]).toMatchObject({ stripeAccount: 'acct_1', idempotencyKey: 'cord-deposito-acct_1-MXN-2026-10-09' });
    expect(r.faltan).toEqual(expect.arrayContaining(['dias', 'cobros', 'pagadores', 'depositos']));
  });

  it('congelada no deposita aunque esté en prueba', async () => {
    await q("update orgs set pagos_control = 'prueba', pagos_prueba_desde = now(), depositos_congelados_at = now(), debito_negativo_configurado = true where id=$1", [org]);
    m.stripe.mockImplementation(async (path: string) => (path === '/v1/balance' ? { available: [{ currency: 'mxn', amount: 100_000 }] } : { data: [], has_more: false }));
    const r = await procesarCuenta(org, 'acct_1', 'MX', '2026-10-09');
    expect(r.depositos).toBeUndefined();
    expect(m.stripe.mock.calls.some((c) => c[0] === '/v1/payouts')).toBe(false);
  });

  it('fuera de México y Brasil, Stripe le cobra al banco un saldo negativo (se activa una vez)', async () => {
    await q("update orgs set country_code = 'US' where id=$1", [org]);
    m.stripe.mockImplementation(async (path: string) => (path === '/v1/balance' ? { available: [] } : { data: [], has_more: false }));
    await procesarCuenta(org, 'acct_1', 'US', '2026-10-09');
    await procesarCuenta(org, 'acct_1', 'US', '2026-10-09');
    const debito = m.stripe.mock.calls.filter((c) => c[1]?.['settings[payouts][debit_negative_balances]'] === 'true');
    expect(debito).toHaveLength(1);
    await procesarCuenta(org, 'acct_1', 'MX', '2026-10-09');
    expect(m.stripe.mock.calls.filter((c) => c[1]?.['settings[payouts][debit_negative_balances]'])).toHaveLength(1);
  });
});
