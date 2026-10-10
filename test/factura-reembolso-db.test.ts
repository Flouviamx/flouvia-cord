// Reembolso del pago de una factura desde Cord (src/lib/cobros/reembolsos.ts),
// contra Postgres real (PGlite) y un proveedor simulado: total y parcial, ACH
// solo completo, el tope del reparto de un cobro agrupado, idempotencia ante
// reintentos, el webhook que llega después (o antes) sin contar dos veces,
// Mercado Pago y las transiciones de estado de la factura.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { splitStatements } from '../scripts/migrate-facturacion.mjs';

const m = vi.hoisted(() => ({ tx: vi.fn(), stripe: vi.fn(), event: vi.fn(), mpRefund: vi.fn(), mpPayment: vi.fn() }));
vi.mock('../src/lib/db', () => ({
    withOrgTx: m.tx,
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values }),
}));
vi.mock('../src/lib/billing', () => ({ stripe: m.stripe }));
vi.mock('../src/lib/fiscal/timeline', () => ({ logInvoiceEvent: m.event }));
vi.mock('../src/lib/after', () => ({ after: () => {} }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../src/lib/mercadopago', () => ({ createMpRefund: m.mpRefund, fetchMpPayment: m.mpPayment }));
vi.mock('../src/lib/fiscal/payment-complement', () => ({ emitPaymentComplement: vi.fn() }));
vi.mock('../src/lib/integraciones/hojas/service', () => ({ onAbonoFactura: vi.fn() }));
vi.mock('../src/lib/integraciones/contabilidad/pagos', () => ({ onPagoFactura: vi.fn() }));

import { ejecutarReembolso, evaluarReembolso, prepararReembolso, validarMonto } from '../src/lib/cobros/reembolsos';
import { recordInvoiceRefund } from '../src/lib/fiscal/reconciliation';
import { applyPayment } from '../src/lib/fiscal/payments';

const org = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const user = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let db: PGlite;
const q = (text: string, values: unknown[] = []) => db.query<any>(text, values);
const doc = async (id: string) => (await q('select * from documentos_fiscales where id = $1', [id])).rows[0];
const pagoDe = async (id: string) => String((await q('select id from documento_pagos where documento_id = $1 order by aplicado_at limit 1', [id])).rows[0].id);

// ── Proveedor simulado (Stripe en la cuenta conectada) ──────────────────────
interface Intento { amount: number; currency: string; status: string; type: string; created: number }
const proveedor = {
    intentos: new Map<string, Intento>(),
    reembolsos: [] as Array<{ id: string; payment_intent: string; amount: number; status: string; metadata: Record<string, string> }>,
    porLlave: new Map<string, any>(),
    estadoNuevo: 'succeeded',
    fallo: null as null | Error,
    /** Simula el webhook que llega ANTES de que la ruta reciba su respuesta. */
    webhookAntes: false,
};
const ahora = () => Math.floor(Date.now() / 1000);
async function stripeSimulado(path: string, params: Record<string, string> | undefined, method: string, opts: any) {
    if (method === 'GET' && path.startsWith('/v1/payment_intents/')) {
        const pi = decodeURIComponent(path.split('/').pop()!);
        const i = proveedor.intentos.get(pi);
        if (!i) throw Object.assign(new Error('No such payment_intent'), { stripeStatus: 404 });
        return { id: pi, status: i.status, amount_received: i.amount, currency: i.currency.toLowerCase(), created: i.created,
            payment_method_types: [i.type], latest_charge: { payment_method_details: { type: i.type } } };
    }
    if (method === 'GET' && path === '/v1/refunds') {
        return { data: proveedor.reembolsos.filter((r) => r.payment_intent === params!.payment_intent), has_more: false };
    }
    if (method === 'POST' && path === '/v1/refunds') {
        if (proveedor.fallo) { const e = proveedor.fallo; proveedor.fallo = null; throw e; }
        const previo = proveedor.porLlave.get(opts.idempotencyKey);
        if (previo) return previo;
        const metadata: Record<string, string> = {};
        for (const [k, v] of Object.entries(params!)) { const mm = k.match(/^metadata\[(.+)\]$/); if (mm) metadata[mm[1]] = v; }
        const r = { id: `re_${proveedor.reembolsos.length + 1}`, payment_intent: params!.payment_intent, amount: Number(params!.amount), status: proveedor.estadoNuevo, metadata };
        proveedor.reembolsos.push(r);
        proveedor.porLlave.set(opts.idempotencyKey, r);
        if (proveedor.webhookAntes) {
            await recordInvoiceRefund(org, { id: r.id, paymentIntentId: r.payment_intent, amount: r.amount / 100, currency: 'MXN',
                status: r.status, eventCreated: 7, solicitudId: metadata.cord_reembolso });
        }
        return r;
    }
    throw new Error(`llamada no simulada: ${method} ${path}`);
}

beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
        create table users (id uuid primary key);
        create table clientes (id uuid primary key, org_id uuid);
        create table orgs (id uuid primary key, nombre text, stripe_account_id text, sandbox_of uuid);
        create table documentos_fiscales (
            id uuid primary key, org_id uuid not null references orgs(id), cliente_id uuid, invoice_number text,
            total numeric not null, currency text not null, amount_paid numeric default 0, amount_remaining numeric,
            lifecycle text, status text, document_type text default 'invoice', credit_note_of uuid, provider_data jsonb,
            country_code text default 'MX', informacion_global jsonb, sustituida_por uuid, sustituye_a uuid,
            pago_en_proceso_pi text, due_date date, issued_at timestamptz default now(), created_at timestamptz default now(),
            updated_at timestamptz default now());
        create table cotizacion_cobros (id uuid primary key default gen_random_uuid(), org_id uuid, cotizacion_id uuid,
            stripe_payment_intent_id text, mp_payment_id text, monto numeric, status text);
        create table documento_pagos (
            id uuid primary key default gen_random_uuid(), org_id uuid not null, documento_id uuid not null,
            monto numeric, currency text, stripe_payment_intent_id text, mp_payment_id text, metodo text, referencia text,
            cobro_id uuid, nota text, registrado_por uuid, aplicado_at timestamptz not null default now(),
            created_at timestamptz not null default now());
        create unique index pagos_pi on documento_pagos(documento_id, stripe_payment_intent_id) where stripe_payment_intent_id is not null;
        create unique index pagos_mp on documento_pagos(documento_id, mp_payment_id) where mp_payment_id is not null;
    `);
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const start = schema.indexOf('-- Conciliación de facturas:');
    await db.exec(schema.slice(start, schema.indexOf('\n-- BEGIN ', start)));
    const portal = schema.slice(schema.indexOf('-- PORTAL DEL CLIENTE, COBRO AGRUPADO'));
    for (const s of splitStatements(portal.slice(0, portal.indexOf('-- END cobros-portal')))
        .filter((x: string) => /\b(documento_reembolso_asignaciones|pagos_agrupados|pago_agrupado_documentos)\b/.test(x) && !/grant /.test(x))) {
        await db.exec(s);
    }
    const propio = schema.slice(schema.indexOf('-- BEGIN reembolsos-facturas'), schema.indexOf('-- END reembolsos-facturas'));
    await db.exec(propio);
    m.tx.mockImplementation((orgId: string, ...queries: Array<{ text: string; values: unknown[] }>) => db.transaction(async (tx) => {
        await tx.query("select set_config('app.org_id', $1, true)", [orgId]);
        const out = [];
        for (const query of queries) out.push((await tx.query(query.text, query.values)).rows);
        return out;
    }));
}, 30000);
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
    m.stripe.mockReset(); m.event.mockReset(); m.mpRefund.mockReset(); m.mpPayment.mockReset();
    m.stripe.mockImplementation(stripeSimulado);
    proveedor.intentos.clear(); proveedor.reembolsos.length = 0; proveedor.porLlave.clear();
    proveedor.estadoNuevo = 'succeeded'; proveedor.fallo = null; proveedor.webhookAntes = false;
    await db.exec(`truncate documento_reembolso_solicitudes, documento_reembolso_asignaciones, documento_reembolsos,
        pago_agrupado_documentos, pagos_agrupados, documento_pagos, cotizacion_cobros, documentos_fiscales, clientes, orgs, users cascade`);
    await q('insert into users(id) values ($1)', [user]);
    await q("insert into orgs(id, nombre, stripe_account_id) values ($1, 'Taller', 'acct_negocio')", [org]);
    for (const [id, total, numero] of [[A, 100, 'F-1'], [B, 60, 'F-2']] as const) {
        await q(`insert into documentos_fiscales(id, org_id, invoice_number, total, currency, amount_remaining, lifecycle, status, document_type)
                 values ($1, $2, $3, $4, 'MXN', $4, 'open', 'issued', 'cfdi_40')`, [id, org, numero, total]);
    }
});

/** Un pago de una sola factura desde su link (/i), ya confirmado. */
async function pagarConTarjeta(id: string, monto: number, pi = 'pi_a', type = 'card', diasAtras = 1) {
    proveedor.intentos.set(pi, { amount: Math.round(monto * 100), currency: 'MXN', status: 'succeeded', type, created: ahora() - diasAtras * 86400 });
    const r = await applyPayment(org, id, { monto, currency: 'MXN', metodo: 'stripe', stripePaymentIntentId: pi, referencia: pi });
    expect(r.ok).toBe(true);
}

/** Un cargo del portal que pagó A primero y B después. */
async function pagarAgrupado(type = 'card') {
    proveedor.intentos.set('pi_g', { amount: 16000, currency: 'MXN', status: 'succeeded', type, created: ahora() - 86400 });
    await q("insert into pagos_agrupados(org_id, origen, currency, monto, stripe_payment_intent_id, estado, metodo) values ($1, 'portal', 'MXN', 160, 'pi_g', 'pagado', $2)", [org, type]);
    await applyPayment(org, A, { monto: 100, currency: 'MXN', metodo: 'stripe', stripePaymentIntentId: 'pi_g' });
    await applyPayment(org, B, { monto: 60, currency: 'MXN', metodo: 'stripe', stripePaymentIntentId: 'pi_g' });
    await q("update documento_pagos set aplicado_at = case when documento_id = $1 then now() - interval '1 minute' else now() end where stripe_payment_intent_id = 'pi_g'", [A]);
}

const reembolsar = async (id: string, pagoId: string, monto: number, alcance: 'factura' | 'cobro' = 'factura') => {
    const op = await prepararReembolso(org, id, pagoId, user);
    if (!op?.nonce) throw new Error(`sin autorización: ${op?.bloqueo}`);
    return ejecutarReembolso(org, id, { nonce: op.nonce, alcance, montoMinimo: Math.round(monto * 100), motivo: null, userId: user });
};
const llamadasPost = () => m.stripe.mock.calls.filter((c) => c[2] === 'POST');

describe('reglas puras', () => {
    const base = { tipo: 'card', confirmado: true, edadDias: 1, cobrado: 100, devueltoProveedor: 0, registrado: 0, capacidadFactura: 100, capacidadCobro: 100, facturas: 1, decimales: 2 };
    it('tarjeta: total o parcial hasta lo que queda', () => {
        const ev = evaluarReembolso({ ...base, devueltoProveedor: 30, registrado: 30, capacidadFactura: 70, capacidadCobro: 70 });
        expect(ev).toMatchObject({ bloqueo: null, parcial: true, maxFactura: 70, maxCobro: 0 });
        expect(validarMonto(ev, 'factura', 20, 2)).toBeNull();
        expect(validarMonto(ev, 'factura', 70.01, 2)).toBe('monto');
        expect(validarMonto(ev, 'cobro', 70, 2)).toBe('alcance');
    });
    it('ACH: solo completo, y de un cobro agrupado solo el cobro entero', () => {
        expect(evaluarReembolso({ ...base, tipo: 'us_bank_account' })).toMatchObject({ parcial: false, maxFactura: 100, maxCobro: 0 });
        const grupo = evaluarReembolso({ ...base, tipo: 'us_bank_account', cobrado: 160, capacidadFactura: 100, capacidadCobro: 160, facturas: 2 });
        expect(grupo).toMatchObject({ bloqueo: null, maxFactura: 0, maxCobro: 160 });
        expect(validarMonto(grupo, 'factura', 100, 2)).toBe('alcance');
        expect(validarMonto(grupo, 'cobro', 160, 2)).toBeNull();
        // Ya se devolvió algo: un ACH no admite un segundo reembolso.
        expect(evaluarReembolso({ ...base, tipo: 'us_bank_account', devueltoProveedor: 100, registrado: 100, capacidadFactura: 0, capacidadCobro: 0 }).bloqueo).toBe('reembolsado');
    });
    it('los límites del proveedor se dicen antes de enviar', () => {
        expect(evaluarReembolso({ ...base, tipo: 'sepa_debit', edadDias: 181 }).bloqueo).toBe('plazo');
        expect(evaluarReembolso({ ...base, tipo: 'sepa_debit', edadDias: 180 }).bloqueo).toBeNull();
        expect(evaluarReembolso({ ...base, confirmado: false }).bloqueo).toBe('no_confirmado');
        expect(evaluarReembolso({ ...base, tipo: 'customer_balance' }).bloqueo).toBe('transferencia');
        expect(evaluarReembolso({ ...base, tipo: 'klarna' }).bloqueo).toBe('metodo');
        // El proveedor devolvió algo que Cord aún no registra: se espera al aviso.
        expect(evaluarReembolso({ ...base, devueltoProveedor: 40, registrado: 0 }).bloqueo).toBe('pendiente_registro');
    });
    it('divisas sin decimales: el tope se redondea a la unidad', () => {
        expect(evaluarReembolso({ ...base, decimales: 0, cobrado: 1000, capacidadFactura: 999.6, capacidadCobro: 1000 }).maxFactura).toBe(1000);
    });
});

describe('reembolso de un pago con tarjeta', () => {
    it('total: la factura pagada vuelve a abrirse con todo su saldo', async () => {
        await pagarConTarjeta(A, 100);
        expect((await doc(A)).lifecycle).toBe('paid');
        const r = await reembolsar(A, await pagoDe(A), 100);
        expect(r).toMatchObject({ ok: true, estado: 'succeeded', monto: 100, currency: 'MXN', alcance: 'factura', cfdi: true });
        expect(await doc(A)).toMatchObject({ lifecycle: 'open', amount_paid: '100', amount_refunded: '100', amount_remaining: '100' });
        const [, params, , opts] = llamadasPost()[0];
        expect(params).toMatchObject({ payment_intent: 'pi_a', amount: '10000', refund_application_fee: 'false', 'metadata[documento_id]': A });
        expect(opts).toMatchObject({ stripeAccount: 'acct_negocio' });
        expect(opts.idempotencyKey).toBe(`cord-reembolso-factura-${params['metadata[cord_reembolso]']}`);
        expect(m.event).toHaveBeenCalledWith(org, A, 'refund', 'Reembolso de 100.00 MXN');
        expect((await q('select estado, stripe_refund_id from documento_reembolso_solicitudes where estado <> $1', ['autorizada'])).rows)
            .toEqual([{ estado: 'registrada', stripe_refund_id: 're_1' }]);
    });
    it('parcial: reabre solo lo devuelto y el siguiente diálogo ofrece lo que queda', async () => {
        await pagarConTarjeta(A, 100);
        const pago = await pagoDe(A);
        expect((await reembolsar(A, pago, 40)).ok).toBe(true);
        expect(await doc(A)).toMatchObject({ lifecycle: 'open', amount_refunded: '40', amount_remaining: '40' });
        expect(await prepararReembolso(org, A, pago, user)).toMatchObject({ bloqueo: null, parcial: true, maxFactura: 60 });
        expect(await reembolsar(A, pago, 60.01)).toEqual({ ok: false, error: 'monto' });
        expect((await reembolsar(A, pago, 60)).ok).toBe(true);
        expect(await prepararReembolso(org, A, pago, user)).toMatchObject({ bloqueo: 'reembolsado' });
    });
    it('una factura con saldo pendiente (pago parcial) sube su saldo sin cambiar de estado', async () => {
        await pagarConTarjeta(A, 30);
        expect((await doc(A)).lifecycle).toBe('open');
        await reembolsar(A, await pagoDe(A), 30);
        expect(await doc(A)).toMatchObject({ lifecycle: 'open', amount_remaining: '100' });
    });
    it('un pago tardío sobre una factura anulada deja de estar "por devolver" al reembolsarlo', async () => {
        await q("update documentos_fiscales set lifecycle = 'void', status = 'cancelled' where id = $1", [A]);
        await pagarConTarjeta(A, 100);
        expect((await doc(A)).refund_due).toBe('100');
        expect((await reembolsar(A, await pagoDe(A), 100)).ok).toBe(true);
        expect(await doc(A)).toMatchObject({ lifecycle: 'void', refund_due: '0' });
    });
    it('un reembolso con tarjeta en proceso se anota como solicitado y no reabre el saldo todavía', async () => {
        await pagarConTarjeta(A, 100);
        proveedor.estadoNuevo = 'pending';
        expect(await reembolsar(A, await pagoDe(A), 100)).toMatchObject({ ok: true, estado: 'pending' });
        expect(await doc(A)).toMatchObject({ lifecycle: 'paid', amount_refunded: '0' });
        expect(m.event).toHaveBeenCalledWith(org, A, 'refund', 'Reembolso de 100.00 MXN solicitado');
        // Confirmado después por el webhook: la transición se cuenta una vez.
        await recordInvoiceRefund(org, { id: 're_1', paymentIntentId: 'pi_a', amount: 100, currency: 'MXN', status: 'succeeded', eventCreated: 9 });
        await recordInvoiceRefund(org, { id: 're_1', paymentIntentId: 'pi_a', amount: 100, currency: 'MXN', status: 'succeeded', eventCreated: 10 });
        expect(await doc(A)).toMatchObject({ lifecycle: 'open', amount_refunded: '100' });
        expect(m.event.mock.calls.filter((c) => c[3] === 'Reembolso de 100.00 MXN')).toHaveLength(1);
    });
});

describe('límites del proveedor antes de enviar', () => {
    it('ACH: un monto parcial se rechaza en Cord, sin llamar al proveedor', async () => {
        await pagarConTarjeta(A, 100, 'pi_ach', 'us_bank_account');
        const pago = await pagoDe(A);
        expect(await prepararReembolso(org, A, pago, user)).toMatchObject({ metodo: 'us_bank_account', parcial: false, maxFactura: 100 });
        expect(await reembolsar(A, pago, 40)).toEqual({ ok: false, error: 'completo' });
        expect(llamadasPost()).toHaveLength(0);
        expect((await reembolsar(A, pago, 100)).ok).toBe(true);
        expect(await prepararReembolso(org, A, pago, user)).toMatchObject({ bloqueo: 'reembolsado' });
    });
    it('SEPA de más de 180 días: no se ofrece', async () => {
        await pagarConTarjeta(A, 100, 'pi_sepa', 'sepa_debit', 200);
        const op = await prepararReembolso(org, A, await pagoDe(A), user);
        expect(op).toMatchObject({ bloqueo: 'plazo', maxFactura: 0 });
        expect(op?.nonce).toBeUndefined();
    });
    it('un pago registrado a mano o que entró por la cotización no se reembolsa desde aquí', async () => {
        await applyPayment(org, A, { monto: 50, currency: 'MXN', metodo: 'transferencia' });
        expect(await prepararReembolso(org, A, await pagoDe(A), user)).toMatchObject({ bloqueo: 'manual' });
        await pagarConTarjeta(B, 60, 'pi_cot');
        await q("insert into cotizacion_cobros(org_id, stripe_payment_intent_id, monto, status) values ($1, 'pi_cot', 60, 'pagado')", [org]);
        expect(await prepararReembolso(org, B, await pagoDe(B), user)).toMatchObject({ bloqueo: 'cotizacion' });
        expect(m.stripe).not.toHaveBeenCalled();
    });
    it('un reembolso hecho fuera de Cord y todavía sin registrar bloquea hasta que llegue su aviso', async () => {
        await pagarConTarjeta(A, 100);
        proveedor.reembolsos.push({ id: 're_fuera', payment_intent: 'pi_a', amount: 2000, status: 'succeeded', metadata: {} });
        const pago = await pagoDe(A);
        expect(await prepararReembolso(org, A, pago, user)).toMatchObject({ bloqueo: 'pendiente_registro' });
        await recordInvoiceRefund(org, { id: 're_fuera', paymentIntentId: 'pi_a', amount: 20, currency: 'MXN', status: 'succeeded', eventCreated: 3 });
        expect(await prepararReembolso(org, A, pago, user)).toMatchObject({ bloqueo: null, maxFactura: 80 });
    });
});

describe('cobro que pagó varias facturas', () => {
    it('desde la PRIMERA factura, lo devuelto va a ella y no a la última', async () => {
        await pagarAgrupado();
        const op = await prepararReembolso(org, A, await pagoDe(A), user);
        expect(op).toMatchObject({ facturas: 2, maxFactura: 100, maxCobro: 160 });
        expect((await reembolsar(A, await pagoDe(A), 50)).ok).toBe(true);
        expect(await doc(A)).toMatchObject({ amount_refunded: '50', amount_remaining: '50', lifecycle: 'open' });
        expect(await doc(B)).toMatchObject({ amount_refunded: '0', lifecycle: 'paid' });
    });
    it('el monto se acota a lo que ese cobro le aplicó a la factura', async () => {
        await pagarAgrupado();
        expect(await reembolsar(B, await pagoDe(B), 61)).toEqual({ ok: false, error: 'monto' });
        expect((await reembolsar(B, await pagoDe(B), 60)).ok).toBe(true);
        expect(await prepararReembolso(org, B, await pagoDe(B), user)).toMatchObject({ maxFactura: 0, maxCobro: 100 });
        expect(llamadasPost()).toHaveLength(1);
    });
    it('el cobro completo reabre cada factura por lo que pagó, y solo admite el total que queda', async () => {
        await pagarAgrupado();
        await reembolsar(A, await pagoDe(A), 30);
        expect(await reembolsar(B, await pagoDe(B), 100, 'cobro')).toEqual({ ok: false, error: 'completo' });
        expect((await reembolsar(B, await pagoDe(B), 130, 'cobro')).ok).toBe(true);
        expect(await doc(A)).toMatchObject({ amount_refunded: '100', amount_remaining: '100' });
        expect(await doc(B)).toMatchObject({ amount_refunded: '60', amount_remaining: '60' });
    });
    it('ACH agrupado: solo el cobro entero', async () => {
        await pagarAgrupado('us_bank_account');
        expect(await prepararReembolso(org, A, await pagoDe(A), user)).toMatchObject({ parcial: false, maxFactura: 0, maxCobro: 160 });
        expect(await reembolsar(A, await pagoDe(A), 100)).toEqual({ ok: false, error: 'alcance' });
    });
    it('si el webhook llega antes que la respuesta, el reparto respeta igual la factura elegida', async () => {
        await pagarAgrupado();
        proveedor.webhookAntes = true;
        expect((await reembolsar(A, await pagoDe(A), 50)).ok).toBe(true);
        expect((await q('select documento_id, monto from documento_reembolso_asignaciones')).rows).toEqual([{ documento_id: A, monto: '50' }]);
        expect((await doc(A)).amount_refunded).toBe('50');
        expect((await doc(B)).amount_refunded).toBe('0');
        expect((await q('select * from documento_reembolsos')).rows).toHaveLength(1);
    });
});

describe('idempotencia', () => {
    it('la misma autorización no se usa dos veces, ni con dos envíos a la vez', async () => {
        await pagarConTarjeta(A, 100);
        const op = await prepararReembolso(org, A, await pagoDe(A), user);
        const enviar = () => ejecutarReembolso(org, A, { nonce: op!.nonce!, alcance: 'factura', montoMinimo: 4000, motivo: null, userId: user });
        const resultados = await Promise.all([enviar(), enviar()]);
        expect(resultados.filter((r) => r.ok)).toHaveLength(1);
        expect(resultados.find((r) => !r.ok)).toMatchObject({ ok: false });
        expect(await enviar()).toEqual({ ok: false, error: 'autorizacion' });
        expect(llamadasPost()).toHaveLength(1);
        expect((await doc(A)).amount_refunded).toBe('40');
    });
    it('el webhook que llega después de un reembolso hecho en Cord no lo cuenta dos veces', async () => {
        await pagarConTarjeta(A, 100);
        await reembolsar(A, await pagoDe(A), 40);
        await recordInvoiceRefund(org, { id: 're_1', paymentIntentId: 'pi_a', amount: 40, currency: 'MXN', status: 'succeeded', eventCreated: 50 });
        expect((await q('select * from documento_reembolsos')).rows).toHaveLength(1);
        expect(await doc(A)).toMatchObject({ amount_refunded: '40', amount_remaining: '40' });
        expect(m.event.mock.calls.filter((c) => c[2] === 'refund')).toHaveLength(1);
    });
    it('sin respuesta del proveedor la reserva se queda: no se puede volver a reembolsar ese monto hasta saber', async () => {
        await pagarConTarjeta(A, 100);
        const pago = await pagoDe(A);
        proveedor.fallo = new Error('fetch failed');
        const r = await reembolsar(A, pago, 70);
        expect(r).toMatchObject({ ok: false, error: 'incierto' });
        // La solicitud sigue "enviada": reserva sus 70 aunque nada se haya registrado.
        expect(await prepararReembolso(org, A, pago, user)).toMatchObject({ maxFactura: 30 });
        // El aviso del proveedor la liga por su metadata y deja de estar en vuelo.
        const [sol] = (await q("select id from documento_reembolso_solicitudes where estado = 'enviada'")).rows;
        await recordInvoiceRefund(org, { id: 're_tarde', paymentIntentId: 'pi_a', amount: 70, currency: 'MXN', status: 'succeeded', eventCreated: 5, solicitudId: sol.id });
        proveedor.reembolsos.push({ id: 're_tarde', payment_intent: 'pi_a', amount: 7000, status: 'succeeded', metadata: { cord_reembolso: sol.id } });
        expect((await q('select estado from documento_reembolso_solicitudes where id = $1', [sol.id])).rows[0].estado).toBe('registrada');
        expect(await prepararReembolso(org, A, pago, user)).toMatchObject({ maxFactura: 30 });
        expect((await doc(A)).amount_refunded).toBe('70');
    });
    it('un rechazo del proveedor libera la reserva y no expone su mensaje', async () => {
        await pagarConTarjeta(A, 100);
        const pago = await pagoDe(A);
        proveedor.fallo = Object.assign(new Error('Charge ch_123 has been charged back.'), { stripeStatus: 400, code: 'charge_disputed' });
        const r = await reembolsar(A, pago, 100);
        expect(r).toMatchObject({ ok: false, error: 'rechazo' });
        expect(JSON.stringify(r)).not.toContain('ch_123');
        expect((await q("select estado from documento_reembolso_solicitudes where estado <> 'autorizada'")).rows).toEqual([{ estado: 'fallida' }]);
        expect(await prepararReembolso(org, A, pago, user)).toMatchObject({ maxFactura: 100 });
    });
});

describe('Mercado Pago', () => {
    const pagoMp = (reembolsos: Array<{ id: string; monto: number; status: string }> = []) =>
        ({ id: 'mp_1', status: 'approved', monto: 100, moneda: 'MXN', referencia: `fac:${A}`, metodo: 'credit_card', reembolsos });
    it('reembolsa con las credenciales del negocio, en unidades mayores y con llave de idempotencia', async () => {
        await applyPayment(org, A, { monto: 100, currency: 'MXN', metodo: 'mercadopago', mpPaymentId: 'mp_1', referencia: 'mp_1' });
        m.mpPayment.mockResolvedValue(pagoMp());
        m.mpRefund.mockResolvedValue({ ok: true, refund: { id: '777', monto: 25.5, status: 'succeeded' } });
        const pago = await pagoDe(A);
        expect(await prepararReembolso(org, A, pago, user)).toMatchObject({ proveedor: 'mercadopago', metodo: 'mercadopago', parcial: true, maxFactura: 100 });
        const r = await reembolsar(A, pago, 25.5);
        expect(r).toMatchObject({ ok: true, estado: 'succeeded', monto: 25.5 });
        const [, entrada] = m.mpRefund.mock.calls[0];
        expect(entrada).toMatchObject({ paymentId: 'mp_1', monto: 25.5 });
        expect(entrada.idempotencyKey).toMatch(/^cord-reembolso-factura-[0-9a-f-]{36}$/);
        expect(await doc(A)).toMatchObject({ amount_refunded: '25.5', amount_remaining: '25.5', lifecycle: 'open' });
        expect((await q('select mp_refund_id, estado from documento_reembolso_solicitudes where estado <> $1', ['autorizada'])).rows)
            .toEqual([{ mp_refund_id: '777', estado: 'registrada' }]);
    });
    it('un rechazo libera la reserva', async () => {
        await applyPayment(org, A, { monto: 100, currency: 'MXN', metodo: 'mercadopago', mpPaymentId: 'mp_1', referencia: 'mp_1' });
        m.mpPayment.mockResolvedValue(pagoMp());
        m.mpRefund.mockResolvedValue({ ok: false, reason: 'rechazo', status: 400 });
        expect(await reembolsar(A, await pagoDe(A), 100)).toMatchObject({ ok: false, error: 'rechazo' });
        expect(await prepararReembolso(org, A, await pagoDe(A), user)).toMatchObject({ maxFactura: 100 });
    });
});
