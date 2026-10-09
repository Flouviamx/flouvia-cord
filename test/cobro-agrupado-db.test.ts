// Cobro agrupado contra Postgres real (PGlite): reparto, asiento idempotente,
// débito en proceso, reintentos del cobro automático y alta con consentimiento.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ tx: vi.fn(), stripe: vi.fn(), event: vi.fn() }));
vi.mock('../src/lib/db', () => ({
    withOrgTx: m.tx,
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values }),
}));
vi.mock('../src/lib/billing', () => ({ stripe: m.stripe }));
vi.mock('../src/lib/fiscal/timeline', () => ({ logInvoiceEvent: m.event }));
vi.mock('../src/lib/after', () => ({ after: () => {} }));
// Efectos de cada abono (complemento de pago, hoja, contabilidad): fuera de esta prueba.
vi.mock('../src/lib/fiscal/payment-complement', () => ({ emitPaymentComplement: vi.fn() }));
vi.mock('../src/lib/integraciones/hojas/service', () => ({ onAbonoFactura: vi.fn() }));
vi.mock('../src/lib/integraciones/contabilidad/pagos', () => ({ onPagoFactura: vi.fn() }));

import {
    activarAutopayDesdeIntent, asentarPagoAgrupado, crearPagoAgrupado, fallarPagoAgrupado,
    facturasDelCliente, marcarPagoEnProceso, registrarConsentimientoPendiente, saldoPorDivisa,
} from '../src/lib/cobros/agrupados';

const org = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const cli = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const otro = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333'; // USD
const X = '44444444-4444-4444-8444-444444444444'; // de otro cliente
let db: PGlite;
const q = (text: string, values: unknown[] = []) => db.query<any>(text, values);
const doc = async (id: string) => (await q('select * from documentos_fiscales where id = $1', [id])).rows[0];

beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
        create table orgs (id uuid primary key, nombre text, cobro_automatico_permitido boolean default true);
        create table clientes (id uuid primary key, org_id uuid not null references orgs(id), empresa text, email text);
        create table documentos_fiscales (
            id uuid primary key, org_id uuid not null references orgs(id), cliente_id uuid, invoice_number text, public_token text,
            total numeric not null, currency text not null, amount_paid numeric default 0, amount_remaining numeric,
            amount_credited numeric default 0, amount_refunded numeric default 0, refund_due numeric default 0,
            lifecycle text, status text, document_type text default 'invoice', credit_note_of uuid, provider_data jsonb,
            due_date date, issued_at timestamptz default now(), created_at timestamptz default now(), updated_at timestamptz default now());
        create table documento_pagos (
            id uuid primary key default gen_random_uuid(), org_id uuid not null, documento_id uuid not null,
            monto numeric, currency text, stripe_payment_intent_id text, mp_payment_id text, metodo text, referencia text,
            cobro_id uuid, nota text, registrado_por uuid, aplicado_at timestamptz not null default now());
        create unique index pagos_pi on documento_pagos(documento_id, stripe_payment_intent_id) where stripe_payment_intent_id is not null;
        create table documento_reembolsos (
            org_id uuid not null, stripe_refund_id text, stripe_payment_intent_id text, mp_refund_id text, mp_payment_id text,
            monto numeric not null, currency text not null, status text not null, provider_event_created bigint default 0,
            created_at timestamptz default now(), updated_at timestamptz default now());
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
beforeEach(async () => {
    m.stripe.mockReset(); m.event.mockReset();
    await db.exec('truncate pago_agrupado_documentos, pagos_agrupados, cobro_automatico_estado, documento_reembolso_asignaciones, documento_reembolsos, documento_pagos, documentos_fiscales, clientes, orgs cascade');
    await q("insert into orgs(id, nombre) values ($1, 'Taller')", [org]);
    await q("insert into clientes(id, org_id, empresa, email) values ($1, $2, 'Acme', 'pagos@acme.test'), ($3, $2, 'Otra', null)", [cli, org, otro]);
    const ins = (id: string, cliente: string, total: number, currency: string, numero: string) => q(`
        insert into documentos_fiscales(id, org_id, cliente_id, invoice_number, public_token, total, currency, amount_remaining, lifecycle, status, due_date)
        values ($1, $2, $3, $4, $5, $6, $7, $6, 'open', 'issued', current_date)`, [id, org, cliente, numero, `tok-${numero}`, total, currency]);
    await ins(A, cli, 100, 'MXN', 'F-1');
    await ins(B, cli, 60, 'MXN', 'F-2');
    await ins(C, cli, 40, 'USD', 'F-3');
    await ins(X, otro, 10, 'MXN', 'F-9');
});

const intentDe = (pagoId: string, monto: number, extra: Record<string, unknown> = {}) => ({
    id: 'pi_grupo', amount: monto, amount_received: monto, currency: 'mxn',
    payment_method_types: ['card'], metadata: { pago_agrupado_id: pagoId, cliente_id: cli }, ...extra,
});

describe('facturas del cliente y saldo', () => {
    it('lista solo las del cliente y separa el saldo por divisa', async () => {
        const facturas = await facturasDelCliente(org, cli);
        expect(facturas.map((f) => f.numero).sort()).toEqual(['F-1', 'F-2', 'F-3']);
        expect(saldoPorDivisa(facturas)).toEqual([
            { currency: 'MXN', saldo: 160, facturas: 2, vencido: 0 },
            { currency: 'USD', saldo: 40, facturas: 1, vencido: 0 },
        ]);
    });
});

describe('crear el cobro agrupado', () => {
    it('reparte por el saldo real de la base, no por lo que mande el navegador', async () => {
        await q('update documentos_fiscales set amount_remaining = 70 where id = $1', [A]);
        const r = await crearPagoAgrupado(org, { clienteId: cli, origen: 'portal', currency: 'MXN', documentos: [A, B] });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.pago.monto).toBe(130);
        expect(r.pago.asignaciones.sort((a, b) => a.monto - b.monto)).toEqual([{ documentoId: B, monto: 60 }, { documentoId: A, monto: 70 }]);
    });
    it('no crea nada si alguna factura es de otro cliente, de otra divisa o está en proceso', async () => {
        expect((await crearPagoAgrupado(org, { clienteId: cli, origen: 'portal', currency: 'MXN', documentos: [A, X] })).ok).toBe(false);
        expect((await crearPagoAgrupado(org, { clienteId: cli, origen: 'portal', currency: 'MXN', documentos: [A, C] })).ok).toBe(false);
        await q("update documentos_fiscales set pago_en_proceso_pi = 'pi_x' where id = $1", [B]);
        expect((await crearPagoAgrupado(org, { clienteId: cli, origen: 'portal', currency: 'MXN', documentos: [A, B] })).ok).toBe(false);
        expect((await q('select * from pagos_agrupados')).rows).toHaveLength(0);
    });
    it('dos corridas del cron no abren dos cobros automáticos vivos', async () => {
        const [uno, dos] = await Promise.all([
            crearPagoAgrupado(org, { clienteId: cli, origen: 'automatico', currency: 'MXN', documentos: [A] }),
            crearPagoAgrupado(org, { clienteId: cli, origen: 'automatico', currency: 'MXN', documentos: [B] }),
        ]);
        expect([uno.ok, dos.ok].filter(Boolean)).toHaveLength(1);
    });
});

describe('asiento del cobro', () => {
    it('aplica a cada factura su parte, una sola vez', async () => {
        const r = await crearPagoAgrupado(org, { clienteId: cli, origen: 'portal', currency: 'MXN', documentos: [A, B] });
        if (!r.ok) throw new Error(r.error);
        const intent = intentDe(r.pago.id, 16000);
        const primero = await asentarPagoAgrupado(org, intent);
        expect(primero?.saldadas.sort()).toEqual([A, B].sort());
        const segundo = await asentarPagoAgrupado(org, intent);
        expect(segundo?.saldadas).toEqual([]);
        expect((await q('select documento_id, monto from documento_pagos order by monto')).rows.map((p) => [p.documento_id, Number(p.monto)]))
            .toEqual([[B, 60], [A, 100]]);
        expect(await doc(A)).toMatchObject({ lifecycle: 'paid', amount_remaining: '0' });
        expect((await q('select estado from pagos_agrupados')).rows[0].estado).toBe('pagado');
    });
    it('rechaza un intento cuyo importe no coincide con el reparto', async () => {
        const r = await crearPagoAgrupado(org, { clienteId: cli, origen: 'portal', currency: 'MXN', documentos: [A, B] });
        if (!r.ok) throw new Error(r.error);
        await expect(asentarPagoAgrupado(org, intentDe(r.pago.id, 10000))).rejects.toThrow(/importe/);
        expect((await q('select * from documento_pagos')).rows).toHaveLength(0);
    });
});

describe('débito en proceso y reintentos', () => {
    it('un débito en proceso bloquea otro cobro y se libera si falla', async () => {
        const r = await crearPagoAgrupado(org, { clienteId: cli, origen: 'automatico', currency: 'MXN', documentos: [A, B] });
        if (!r.ok) throw new Error(r.error);
        await q("update pagos_agrupados set stripe_payment_intent_id = 'pi_grupo'");
        await marcarPagoEnProceso(org, intentDe(r.pago.id, 16000, { payment_method_types: ['sepa_debit'] }));
        expect((await doc(A)).pago_en_proceso_pi).toBe('pi_grupo');
        expect((await crearPagoAgrupado(org, { clienteId: cli, origen: 'portal', currency: 'MXN', documentos: [A] })).ok).toBe(false);

        const ahora = new Date('2026-10-08T14:00:00Z');
        const fallo = await fallarPagoAgrupado(org, r.pago.id, { codigo: 'insufficient_funds', declineCode: null, tipoMetodo: 'sepa_debit' }, ahora);
        expect(fallo?.decision).toMatchObject({ accion: 'reintentar' });
        expect((await doc(A)).pago_en_proceso_pi).toBeNull();
        const [estado] = (await q('select intentos, detenido_motivo, siguiente_at from cobro_automatico_estado')).rows;
        expect(estado).toMatchObject({ intentos: 1, detenido_motivo: null });
        // El webhook llega después del rechazo que ya vio el cron: no cuenta dos veces.
        const repetido = await fallarPagoAgrupado(org, r.pago.id, { codigo: 'insufficient_funds', declineCode: null, tipoMetodo: 'sepa_debit' }, ahora);
        expect(repetido?.decision).toBeNull();
        expect((await q('select intentos from cobro_automatico_estado')).rows[0].intentos).toBe(1);
        expect(m.event).toHaveBeenCalledTimes(2);
    });
    it('un rechazo duro apaga el cobro automático y da de baja el método', async () => {
        await q(`update clientes set autopay_activo = true, autopay_payment_method_id = 'pm_card', stripe_customer_account = 'acct_1' where id = $1`, [cli]);
        m.stripe.mockResolvedValue({});
        const r = await crearPagoAgrupado(org, { clienteId: cli, origen: 'automatico', currency: 'MXN', documentos: [A] });
        if (!r.ok) throw new Error(r.error);
        const fallo = await fallarPagoAgrupado(org, r.pago.id, { codigo: 'card_declined', declineCode: 'stolen_card', tipoMetodo: 'card' });
        expect(fallo?.decision).toMatchObject({ accion: 'detener', motivo: 'bloqueado', desactivar: true });
        const c = (await q('select autopay_activo, autopay_payment_method_id, autopay_desactivado from clientes where id = $1', [cli])).rows[0];
        expect(c).toMatchObject({ autopay_activo: false, autopay_payment_method_id: null });
        expect(c.autopay_desactivado).toMatchObject({ por: 'sistema', motivo: 'bloqueado' });
        expect(m.stripe).toHaveBeenCalledWith('/v1/payment_methods/pm_card/detach', undefined, 'POST', { stripeAccount: 'acct_1' });
        expect((await q('select detenido_motivo from cobro_automatico_estado')).rows[0].detenido_motivo).toBe('bloqueado');
    });
});

describe('alta del cobro automático', () => {
    const consentimiento = (intentId: string) => ({ version: 'v', aceptado_at: '2026-10-08T00:00:00Z', ip: '203.0.113.9', user_agent: 'x', intent_id: intentId });
    beforeEach(async () => {
        await q(`update clientes set stripe_customer_id = 'cus_1', stripe_customer_account = 'acct_1' where id = $1`, [cli]);
        m.stripe.mockImplementation(async (path: string) => path.startsWith('/v1/payment_methods/pm_')
            ? { id: 'pm_nuevo', customer: 'cus_1', type: 'card', card: { brand: 'visa', last4: '4242', exp_month: 1, exp_year: 2031 } }
            : {});
    });
    it('solo activa con el consentimiento registrado para ESE intento', async () => {
        await registrarConsentimientoPendiente(org, cli, consentimiento('seti_bueno'));
        const intent = { id: 'seti_otro', payment_method: 'pm_nuevo', metadata: { cliente_id: cli } };
        expect(await activarAutopayDesdeIntent(org, intent, 'acct_1')).toBe(false);
        expect(await activarAutopayDesdeIntent(org, { ...intent, id: 'seti_bueno' }, 'acct_1')).toBe(true);
        const c = (await q('select autopay_activo, autopay_payment_method_id, autopay_metodo, autopay_consentimiento, autopay_consentimiento_pendiente from clientes where id = $1', [cli])).rows[0];
        expect(c).toMatchObject({ autopay_activo: true, autopay_payment_method_id: 'pm_nuevo', autopay_consentimiento_pendiente: null });
        expect(c.autopay_metodo).toMatchObject({ tipo: 'card', last4: '4242' });
        expect(c.autopay_consentimiento.intent_id).toBe('seti_bueno');
        // Reintento del mismo evento: idempotente.
        expect(await activarAutopayDesdeIntent(org, { ...intent, id: 'seti_bueno' }, 'acct_1')).toBe(true);
    });
    it('no acepta un método de otro Customer', async () => {
        m.stripe.mockResolvedValue({ id: 'pm_ajeno', customer: 'cus_otro', type: 'card', card: { brand: 'visa', last4: '1111' } });
        await registrarConsentimientoPendiente(org, cli, consentimiento('seti_bueno'));
        expect(await activarAutopayDesdeIntent(org, { id: 'seti_bueno', payment_method: 'pm_ajeno', metadata: { cliente_id: cli } }, 'acct_1')).toBe(false);
        expect((await q('select autopay_activo from clientes where id = $1', [cli])).rows[0].autopay_activo).toBe(false);
    });
});
