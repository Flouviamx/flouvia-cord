// Cuota mensual del sales tax automático de EE. UU. contra Postgres real
// (PGlite), con la reserva de consumo de Billing REAL (src/lib/billing.ts) y el
// proveedor simulado. Lo que se cuida:
//   - la cuota incluida por plan es la del contrato y la tabla pública la dice;
//   - la unidad se reserva ANTES de registrar la venta y se libera si falla;
//   - sin meter configurado, pasado lo incluido se rechaza (fallo cerrado) y
//     lo dice sin nombrar al proveedor; con meter, el excedente va al meter;
//   - una venta a un estado sin registro no consume cuota;
//   - el reverso no devuelve la unidad;
//   - la vista previa no puede pedir cálculos sin fin (tope por documento y día).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
    // Billing exige una llave para entregar meter events; nunca sale a la red
    // (fetch está simulado abajo).
    process.env.STRIPE_SECRET_KEY = 'sk_test_fixture';
    return {
        tx: vi.fn(), sys: vi.fn(), stripe: vi.fn(),
        plan: 'starter' as string,
        counts: new Map<string, number>(),
    };
});
vi.mock('../src/lib/db', () => ({
    withOrgTx: m.tx,
    withSystemTx: m.sys,
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values }),
}));
// Billing real; solo su cliente REST va al proveedor simulado (lo usa us-tax/stripe.ts).
vi.mock('../src/lib/billing', async (original) => ({ ...await original<any>(), stripe: m.stripe }));
vi.mock('../src/lib/org-entitlements', () => ({
    checkEntitlement: async () => ({ ok: true }),
    getEntitlementContext: async (orgId: string) => ({ effectivePlan: m.plan, billingOrgId: orgId, isSandbox: false, stripeCustomerId: 'cus_negocio' }),
}));
vi.mock('../src/lib/ratelimit', () => ({
    strictRateLimit: async (key: string, limit: number) => {
        const n = (m.counts.get(key) ?? 0) + 1;
        m.counts.set(key, n);
        return { ok: n <= limit, remaining: Math.max(0, limit - n), retryAfter: 1 };
    },
}));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import * as billing from '../src/lib/billing';
import { INCLUDED, flushPendingUsage, meterPricesFor, overageBillable, requiredMeterPrices, usageLimitFor } from '../src/lib/billing';
import {
    claimUsTaxCalculo, prepareUsTaxForDocument, recordUsTaxTransaction, reverseUsTaxForDocument, sweepUsTaxForOrg,
} from '../src/lib/us-tax/calculo';
import { usTaxCuota, usTaxVentasSinCuota } from '../src/lib/us-tax/cuota';
import { US_TAX_CALCULOS_DOCUMENTO_DIA, US_TAX_CALCULOS_ORG_DIA, usTaxMessage, usTaxVentaCobrable } from '../src/lib/us-tax/core';
import { COMPARATIVA } from '../src/lib/precios';
import { COMPARATIVA_EN } from '../src/lib/precios.en';
import { overagePriceLabel } from '../src/lib/plan-overage-pricing';

const ORG = '00000000-0000-4000-8000-0000000000b1';
const CLI_LA = '00000000-0000-4000-8000-00000000c101';
const CLI_TX = '00000000-0000-4000-8000-00000000c102';
const D1 = '00000000-0000-4000-8000-00000000d101';
const D2 = '00000000-0000-4000-8000-00000000d102';
const ACCT = 'acct_negocio';
const periodo = () => new Date().toISOString().slice(0, 7);

let db: PGlite;
const q = (text: string, values: unknown[] = []) => db.query<any>(text, values);

// ── Proveedor simulado (solo lo que toca el registro de la venta) ───────────
let n = 0;
let falloTransaccion: Error | null = null;
let alRegistrar: (() => Promise<void>) | null = null;
async function fakeStripe(path: string, params: Record<string, string> = {}) {
    if (path === '/v1/tax/calculations') {
        const state = params['customer_details[address][state]'];
        const lines = [];
        for (let i = 0; params[`line_items[${i}][amount]`]; i++) {
            const amount = Number(params[`line_items[${i}][amount]`]);
            const cobra = state === 'CA';
            const tax = cobra ? Math.round(amount * 0.095) : 0;
            lines.push({
                reference: params[`line_items[${i}][reference]`], amount, amount_tax: tax,
                tax_breakdown: cobra
                    ? [{ amount: tax, jurisdiction: { display_name: 'California', level: 'state', state }, tax_rate_details: { percentage_decimal: '9.5' }, taxability_reason: 'standard_rated' }]
                    : [{ amount: 0, jurisdiction: { display_name: 'Texas', level: 'state', state }, tax_rate_details: null, taxability_reason: 'not_collecting' }],
            });
        }
        return { id: `taxcalc_${++n}`, amount_total: 0, expires_at: Math.floor(Date.now() / 1000) + 90 * 86400, line_items: { data: lines, has_more: false } };
    }
    if (path === '/v1/tax/transactions/create_from_calculation') {
        if (alRegistrar) await alRegistrar();
        if (falloTransaccion) throw falloTransaccion;
        return { id: `tax_${++n}` };
    }
    if (path === '/v1/tax/transactions/create_reversal') return { id: `taxrev_${++n}` };
    throw new Error(`ruta no simulada: ${path}`);
}
const llamadas = (path: string) => m.stripe.mock.calls.filter((c: any[]) => c[0] === path);

// Meter events de Billing (fetch directo de billing.ts, no el cliente de arriba).
const meterEvents: Record<string, string>[] = [];
const fetchFalso = vi.fn(async (input: any, init: any = {}) => {
    const url = new URL(String(input));
    if (url.pathname.startsWith('/v1/billing/meters/')) return Response.json({ id: url.pathname.split('/').pop(), event_name: 'cord_us_tax_transaction' });
    if (url.pathname === '/v1/billing/meter_events') {
        meterEvents.push(Object.fromEntries(new URLSearchParams(init.body)));
        return Response.json({ object: 'billing.meter_event' });
    }
    return Response.json({ error: { message: 'no simulado' } }, { status: 404 });
});

const items = (...precios: number[]) => precios.map((p) => ({ cantidad: 1, precio_unitario: p }));
const usado = async () => Number((await q('select us_tax from uso_periodo where org_id = $1 and periodo = $2', [ORG, periodo()])).rows[0]?.us_tax ?? 0);
const fijarUsado = (v: number) => q(`insert into uso_periodo (org_id, periodo, us_tax) values ($1, $2, $3)
    on conflict (org_id, periodo) do update set us_tax = excluded.us_tax`, [ORG, periodo(), v]);

async function factura(id: string, clienteId = CLI_LA, monto = 100) {
    const r = await prepareUsTaxForDocument(ORG, { clienteId, currency: 'USD', ivaIncluido: false, items: items(monto) });
    await claimUsTaxCalculo(ORG, r!.calculoId, `documento:${id}`);
    const [fila] = (await q('select lineas from us_tax_calculos where id = $1', [r!.calculoId])).rows;
    const impuesto = Number(fila.lineas[0].impuesto) / 100;
    await q(`insert into documentos_fiscales (id, org_id, currency, line_items_snapshot, status, lifecycle, us_tax_calculo_id)
             values ($1, $2, 'USD', $3::jsonb, 'issued', 'open', $4)`, [id, ORG, JSON.stringify([{ subtotal: monto, taxAmount: impuesto }]), r!.calculoId]);
    return r!.calculoId;
}

// El meter y los Price de us_tax se "configuran" en la prueba como lo haría
// llenar sus ids en billing.ts; se restauran al terminar cada prueba.
const METERS = billing.METERS as Record<string, string>;
const PRICES = billing.METER_PRICES as Record<string, Record<string, string>>;
function configurarMeter() {
    METERS.us_tax = 'mtr_test_us_tax';
    for (const plan of ['starter', 'pro', 'scale', 'developer']) PRICES[plan].us_tax = `price_us_tax_${plan}`;
}

beforeAll(async () => {
    vi.stubGlobal('fetch', fetchFalso);
    db = new PGlite();
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const reservas = schema.slice(schema.indexOf('create table if not exists usage_reservations ('));
    await db.exec(`
        create table orgs (id uuid primary key, country_code text, iva_pct numeric, stripe_account_id text, sandbox_of uuid);
        create table clientes (id uuid primary key, org_id uuid not null references orgs(id), empresa text, country_code text,
            direccion_line1 text, direccion_line2 text, ciudad text, region text, cp_fiscal text);
        create table impuestos (id uuid primary key default gen_random_uuid(), org_id uuid, nombre text, tipo text default 'iva',
            kind text default 'consumo', tasa numeric, es_default boolean default false, activo boolean default true,
            retencion_base text default 'subtotal', exemption_reason text);
        create table cotizaciones (id uuid primary key, org_id uuid not null, status text, paid_at timestamptz, base_currency text,
            iva_incluido boolean default false, descuento_def jsonb, tax_rounding text);
        create table cotizacion_items (id serial primary key, cotizacion_id uuid, cantidad numeric, precio_unitario numeric,
            precio_negociado numeric, tax_rate numeric, aprobado boolean, orden int);
        create table documentos_fiscales (id uuid primary key, org_id uuid not null, cotizacion_id uuid, currency text,
            line_items_snapshot jsonb, status text, lifecycle text, credit_note_of uuid, provider_data jsonb);
        create table org_members (org_id uuid, estado text);
        create table uso_periodo (org_id uuid not null, periodo text not null, ia int not null default 0, cfdi int not null default 0,
            api int not null default 0, usuarios int not null default 0, envios int not null default 0, docs int not null default 0,
            updated_at timestamptz not null default now(), primary key (org_id, periodo));
        ${reservas.slice(0, reservas.indexOf(');') + 2)}
    `);
    // Las secciones reales del schema: sales tax por dirección y su cuota.
    const usTax = schema.indexOf('-- ── Sales tax de EE. UU. calculado por la dirección del cliente');
    await db.exec(schema.slice(usTax, schema.indexOf('-- END us-tax', usTax)));
    const cuota = schema.indexOf('-- ── Cuota del sales tax automático de EE. UU.');
    await db.exec(schema.slice(cuota, schema.indexOf('-- END sales-tax-cuota', cuota)));
    const run = (scope: { org?: string }) => (...queries: Array<{ text: string; values: unknown[] }>) => db.transaction(async (tx) => {
        if (scope.org) await tx.query("select set_config('app.org_id', $1, true)", [scope.org]);
        const out = [];
        for (const query of queries) out.push((await tx.query(query.text, query.values)).rows);
        return out;
    });
    m.tx.mockImplementation((orgId: string, ...queries: any[]) => run({ org: orgId })(...queries));
    m.sys.mockImplementation((...queries: any[]) => run({})(...queries));
}, 30000);
afterAll(async () => { vi.unstubAllGlobals(); await db?.close(); });

beforeEach(async () => {
    m.stripe.mockReset();
    m.stripe.mockImplementation(fakeStripe);
    m.plan = 'starter';
    m.counts.clear();
    falloTransaccion = null;
    alRegistrar = null;
    meterEvents.length = 0;
    await db.exec(`truncate us_tax_registros, documentos_fiscales, cotizacion_items, cotizaciones, impuestos, clientes, orgs, uso_periodo, usage_reservations cascade;
                   delete from us_tax_calculos;`);
    const origen = JSON.stringify({ line1: '200 N Spring St', line2: null, city: 'Los Angeles', state: 'CA', postal_code: '90012' });
    await q(`insert into orgs (id, country_code, iva_pct, stripe_account_id, us_tax_auto, us_tax_origen, us_tax_codigo, us_tax_estado)
             values ($1, 'US', 0, $2, true, $3::jsonb, 'txcd_20030000', '{"status":"active","faltantes":[]}'::jsonb)`, [ORG, ACCT, origen]);
    await q(`insert into us_tax_registros (org_id, estado, stripe_registration_id) values ($1, 'CA', 'taxreg_ca')`, [ORG]);
    await q(`insert into clientes (id, org_id, empresa, country_code, direccion_line1, ciudad, region, cp_fiscal) values
             ($1, $3, 'Acme LA', 'US', '350 S Grand Ave', 'Los Angeles', 'CA', '90071'),
             ($2, $3, 'Lone Star', 'US', '100 Congress Ave', 'Austin', 'TX', '78701')`, [CLI_LA, CLI_TX, ORG]);
});
afterEach(() => {
    METERS.us_tax = '';
    for (const plan of ['starter', 'pro', 'scale', 'developer']) PRICES[plan].us_tax = '';
});

describe('el contrato: cuota propia y precio propio', () => {
    it('incluye 10/25/60/150 ventas al mes desde Starter, y la tabla pública dice lo mismo en es y en', () => {
        const planes = ['free', 'starter', 'pro', 'scale', 'developer'] as const;
        expect(planes.map((p) => INCLUDED[p].us_tax)).toEqual([0, 10, 25, 60, 150]);
        // No comparte la cuota de los timbres: 30 en Starter a USD 0.15 perdería dinero.
        expect(INCLUDED.starter.us_tax).not.toBe(INCLUDED.starter.cfdi);
        for (const [tabla, mes] of [[COMPARATIVA, 'mes'], [COMPARATIVA_EN, 'mo']] as const) {
            const fila = tabla.flatMap((g) => g.rows).find((r) => !r.overageDim && /sales tax/i.test(r.label))!;
            expect(fila.free).toBe(false);
            expect([fila.starter, fila.pro, fila.scale, fila.developer]).toEqual(planes.slice(1).map((p) => `${INCLUDED[p].us_tax} / ${mes}`));
            expect(fila.hint).toMatch(/EE\. UU\.|US only/);
            expect(tabla.flatMap((g) => g.rows).some((r) => r.overageDim === 'us_tax' && r.hint)).toBe(true);
        }
    });

    it('excedente USD 0.75, MXN 15.00, EUR 0.70; Developer en EUR a medida y Gratis sin la capacidad', () => {
        for (const plan of ['starter', 'pro', 'scale', 'developer']) {
            expect(overagePriceLabel(plan, 'us_tax', 'USD', 'en')).toContain('0.75');
            expect(overagePriceLabel(plan, 'us_tax', 'MXN', 'es')).toContain('15.00');
        }
        for (const plan of ['starter', 'pro', 'scale']) expect(overagePriceLabel(plan, 'us_tax', 'EUR', 'en')).toContain('0.70');
        expect(overagePriceLabel('developer', 'us_tax', 'EUR', 'es')).toBe('A medida');
        expect(overagePriceLabel('free', 'us_tax', 'USD', 'es')).toBe('Desde Starter');
    });

    it('sin meter configurado lo incluido es tope duro y el checkout no manda un Price vacío', () => {
        expect(overageBillable('starter', 'us_tax')).toBe(false);
        expect(usageLimitFor('starter', 'us_tax')).toEqual({ included: 10, ceiling: 10, overage: false });
        expect(meterPricesFor('pro', 'USD').every(Boolean)).toBe(true);
        expect(meterPricesFor('pro', 'USD')).not.toContain('');
        configurarMeter();
        expect(overageBillable('starter', 'us_tax')).toBe(true);
        expect(usageLimitFor('starter', 'us_tax')).toEqual({ included: 10, ceiling: 100, overage: true });
        expect(meterPricesFor('pro', 'USD')).toContain('price_us_tax_pro');
        // Que una suscripción vieja no tenga el item NUNCA baja el plan.
        expect(requiredMeterPrices('pro')).not.toContain('price_us_tax_pro');
        expect(overageBillable('free', 'us_tax')).toBe(false);
    });

    it('una venta solo cuesta (y cuenta) si alguna línea cae en un estado donde el negocio recauda', () => {
        const desglose = (motivo: string | null) => ({ desglose: { v: 1 as const, estado: 'CA', estadoNombre: 'California', motivo: motivo as any, componentes: [] } });
        expect(usTaxVentaCobrable([desglose(null)])).toBe(true);
        expect(usTaxVentaCobrable([desglose('exento')])).toBe(true);
        expect(usTaxVentaCobrable([desglose('sin_registro'), desglose('sin_registro')])).toBe(false);
        expect(usTaxVentaCobrable([{ desglose: null }])).toBe(false);
    });
});

describe('la unidad se reserva antes del proveedor', () => {
    it('reserva, registra y confirma una sola unidad, sin excedente dentro de lo incluido', async () => {
        await factura(D1);
        alRegistrar = async () => {
            // En el momento en que el proveedor cobra, la unidad ya está contada.
            expect(await usado()).toBe(1);
            const [r] = (await q(`select status from usage_reservations where dimension = 'us_tax'`)).rows;
            expect(r.status).toBe('reserved');
        };
        expect(await recordUsTaxTransaction(ORG, { documentoId: D1 })).toBe('registrada');
        expect(await usado()).toBe(1);
        const [r] = (await q(`select id, status, meter_value, meter_status from usage_reservations where dimension = 'us_tax'`)).rows;
        expect(r).toMatchObject({ status: 'committed', meter_value: 0, meter_status: 'skipped' });
        const [c] = (await q('select uso_id from us_tax_calculos where transaccion_id is not null')).rows;
        expect(c.uso_id).toBe(r.id);
        // Repetir no cuenta otra vez.
        expect(await recordUsTaxTransaction(ORG, { documentoId: D1 })).toBe('ya_registrada');
        expect(await usado()).toBe(1);
    });

    it('si el registro falla, la unidad vuelve; el reintento cuenta una sola vez', async () => {
        await factura(D1);
        falloTransaccion = Object.assign(new Error('Raw provider message'), { stripeStatus: 500 });
        expect(await recordUsTaxTransaction(ORG, { documentoId: D1 })).toBe('error');
        expect(await usado()).toBe(0);
        expect((await q(`select status from usage_reservations where dimension = 'us_tax'`)).rows.map((r: any) => r.status)).toEqual(['canceled']);
        falloTransaccion = null;
        expect(await recordUsTaxTransaction(ORG, { documentoId: D1 })).toBe('registrada');
        expect(await usado()).toBe(1);
    });

    it('dos procesos sobre la misma venta reservan una sola unidad', async () => {
        await factura(D1);
        const r = await Promise.all([recordUsTaxTransaction(ORG, { documentoId: D1 }), recordUsTaxTransaction(ORG, { documentoId: D1 })]);
        expect(r).toContain('registrada');
        expect(await usado()).toBe(1);
        expect((await q(`select count(*)::int as n from usage_reservations where dimension = 'us_tax' and status <> 'canceled'`)).rows[0].n).toBe(1);
    });

    it('una venta a un estado sin registro se registra sin consumir cuota, aun con la cuota agotada', async () => {
        await fijarUsado(10);
        await factura(D1, CLI_TX);
        expect(await recordUsTaxTransaction(ORG, { documentoId: D1 })).toBe('registrada');
        expect(await usado()).toBe(10);
        expect((await q(`select count(*)::int as n from usage_reservations`)).rows[0].n).toBe(0);
    });

    it('anular la factura revierte la venta pero no devuelve la unidad', async () => {
        await factura(D1);
        expect(await recordUsTaxTransaction(ORG, { documentoId: D1 })).toBe('registrada');
        await q(`update documentos_fiscales set lifecycle = 'void' where id = $1`, [D1]);
        expect(await reverseUsTaxForDocument(ORG, D1)).toBe('revertida');
        expect(await usado()).toBe(1);
    });
});

describe('fallo cerrado mientras no exista el medidor', () => {
    it('pasado lo incluido, el documento no se prepara y dice qué hacer, sin nombrar al proveedor', async () => {
        await fijarUsado(10);
        const error = await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(100) }).catch((e) => e);
        expect(error).toMatchObject({ code: 'cuota', status: 402 });
        expect(error.message).toContain('10 facturas con sales tax automático');
        expect(error.message).toMatch(/mejora tu plan o captura la tasa a mano/i);
        expect(error.message).not.toMatch(/stripe/i);
        expect(usTaxMessage('cuota', 'en', { n: 10 })).toContain('10 invoices with automatic sales tax');
        expect(llamadas('/v1/tax/calculations')).toHaveLength(0);
        // Un cliente en un estado donde el negocio no recauda no le cuesta a Cord: pasa.
        expect(await prepareUsTaxForDocument(ORG, { clienteId: CLI_TX, currency: 'USD', ivaIncluido: false, items: items(100) })).not.toBeNull();
    });

    it('una venta que llega sin cupo no se registra ni se cobra: espera, se dice, y se registra al haber cupo', async () => {
        await factura(D1);
        await fijarUsado(10);
        expect(await recordUsTaxTransaction(ORG, { documentoId: D1 })).toBe('sin_cuota');
        expect(llamadas('/v1/tax/transactions/create_from_calculation')).toHaveLength(0);
        expect(await usTaxVentasSinCuota(ORG)).toBe(1);
        expect(await sweepUsTaxForOrg(ORG)).toMatchObject({ sinCuota: 1, registradas: 0 });
        // Mejora a Profesional (25 incluidas): el barrido la registra sola.
        m.plan = 'pro';
        expect(await sweepUsTaxForOrg(ORG)).toMatchObject({ registradas: 1 });
        expect(await usado()).toBe(11);
        expect(await usTaxVentasSinCuota(ORG)).toBe(0);
    });

    it('la reserva misma falla cerrado: aunque la pre-verificación no la viera, no pasa de lo incluido', async () => {
        await factura(D1);
        await factura(D2, CLI_LA, 101);
        await fijarUsado(9);
        const r = await Promise.all([recordUsTaxTransaction(ORG, { documentoId: D1 }), recordUsTaxTransaction(ORG, { documentoId: D2 })]);
        expect(r.filter((x) => x === 'registrada')).toHaveLength(1);
        expect(await usado()).toBe(10);
        expect(llamadas('/v1/tax/transactions/create_from_calculation')).toHaveLength(1);
    });
});

describe('con meter configurado: excedente al meter, con techo de seguridad', () => {
    it('pasado lo incluido registra, confirma el excedente y lo manda al meter', async () => {
        configurarMeter();
        await fijarUsado(10);
        await factura(D1);
        expect(await recordUsTaxTransaction(ORG, { documentoId: D1 })).toBe('registrada');
        expect(await usado()).toBe(11);
        const [r] = (await q(`select id, status, meter_value, meter_status from usage_reservations where dimension = 'us_tax'`)).rows;
        expect(r).toMatchObject({ status: 'committed', meter_value: 1, meter_status: 'sent' });
        // Solo el excedente, con la identidad de la reserva (idempotente).
        expect(meterEvents).toEqual([expect.objectContaining({
            event_name: 'cord_us_tax_transaction', identifier: r.id, 'payload[value]': '1', 'payload[stripe_customer_id]': 'cus_negocio',
        })]);
        expect((await usTaxCuota(ORG))).toMatchObject({ incluido: 10, usado: 11, techo: 100, excedente: true, agotada: false });
    });

    it('al techo (10x lo incluido) se rechaza con su propio mensaje', async () => {
        configurarMeter();
        await fijarUsado(100);
        await expect(prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(100) }))
            .rejects.toMatchObject({ code: 'cuota_techo', status: 429 });
    });

    it('la reconciliación confirma una reserva cuyo registro sí ocurrió', async () => {
        configurarMeter();
        await fijarUsado(10);
        const calc = await factura(D1);
        // El proceso murió entre registrar la venta y confirmar su reserva.
        const { reservarUsoTransaccion } = await import('../src/lib/us-tax/cuota');
        const uso = await reservarUsoTransaccion(ORG, calc);
        expect(uso.ok).toBe(true);
        await q(`update us_tax_calculos set transaccion_id = 'tax_x', transaccion_ref = $2 where id = $1`, [calc, `cord:${calc}`]);
        await q(`update usage_reservations set created_at = now() - interval '1 hour'`);
        await flushPendingUsage();
        const [r] = (await q(`select status, meter_value, meter_status from usage_reservations where dimension = 'us_tax'`)).rows;
        expect(r).toMatchObject({ status: 'committed', meter_value: 1, meter_status: 'sent' });
    });
});

describe('tope de cálculos en la vista previa', () => {
    const vista = (monto: number, documentoClave: string) => prepareUsTaxForDocument(ORG, {
        clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(monto), documentoClave,
    });
    const DOC = 'cotizacion:00000000-0000-4000-8000-00000000e101';
    const OTRO = 'borrador:00000000-0000-4000-8000-00000000e102';

    it(`un documento no pide más de ${US_TAX_CALCULOS_DOCUMENTO_DIA} cálculos al día; otro documento y el guardado siguen`, async () => {
        for (let i = 0; i < US_TAX_CALCULOS_DOCUMENTO_DIA; i++) await vista(100 + i, DOC);
        expect(llamadas('/v1/tax/calculations')).toHaveLength(US_TAX_CALCULOS_DOCUMENTO_DIA);
        const error = await vista(999, DOC).catch((e) => e);
        expect(error).toMatchObject({ code: 'limite_documento', status: 429 });
        expect(error.message).toContain(String(US_TAX_CALCULOS_DOCUMENTO_DIA));
        expect(error.message).not.toMatch(/stripe/i);
        expect(llamadas('/v1/tax/calculations')).toHaveLength(US_TAX_CALCULOS_DOCUMENTO_DIA);
        // Lo ya calculado se reusa sin gastar.
        expect(await vista(100, DOC)).not.toBeNull();
        await vista(999, OTRO);
        await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(998) });
        expect(llamadas('/v1/tax/calculations')).toHaveLength(US_TAX_CALCULOS_DOCUMENTO_DIA + 2);
    });

    it(`la organización no pide más de ${US_TAX_CALCULOS_ORG_DIA} al día por ningún camino`, async () => {
        m.counts.set(`us-tax-calc:d:${ORG}`, US_TAX_CALCULOS_ORG_DIA);
        const error = await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(5) }).catch((e) => e);
        expect(error).toMatchObject({ code: 'limite_dia', status: 429 });
        expect(llamadas('/v1/tax/calculations')).toHaveLength(0);
    });

    it('una clave de documento que no tiene la forma esperada no abre un contador nuevo', async () => {
        await vista(100, 'cualquier cosa');
        expect([...m.counts.keys()].some((k) => k.startsWith('us-tax-calc:doc:'))).toBe(false);
    });
});
