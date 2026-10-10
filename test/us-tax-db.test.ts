// Sales tax de EE. UU. por dirección contra Postgres real (PGlite) y el
// proveedor simulado: el cálculo guardado es la única fuente de la tasa, el
// fallo cerrado dice qué falta, la venta se registra una sola vez y la
// configuración se sincroniza sin duplicar registros.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ tx: vi.fn(), sys: vi.fn(), stripe: vi.fn(), entitled: { ok: true } }));
vi.mock('../src/lib/db', () => ({
    withOrgTx: m.tx,
    withSystemTx: m.sys,
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values }),
}));
vi.mock('../src/lib/billing', () => ({ stripe: m.stripe }));
vi.mock('../src/lib/org-entitlements', () => ({ checkEntitlement: async () => m.entitled }));
vi.mock('../src/lib/ratelimit', () => ({ strictRateLimit: async () => ({ ok: true, remaining: 10, retryAfter: 0 }) }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
// La cuota mensual de ventas (src/lib/us-tax/cuota.ts) tiene su propia prueba
// contra Billing real (test/us-tax-cuota.test.ts). Aquí siempre hay cupo.
vi.mock('../src/lib/us-tax/cuota', () => ({
    assertUsTaxCuota: async () => {},
    usTaxCuota: async () => ({ incluido: 10, usado: 0, techo: 10, excedente: false, agotada: false }),
    reservarUsoTransaccion: async () => ({ ok: true, id: '00000000-0000-4000-8000-0000000000f0' }),
    confirmarUsoTransaccion: async () => {},
    liberarUsoTransaccion: async () => {},
}));

import { calculateDocumentTotals } from '../packages/elements/src/engine';
import { taxCatalogFor } from '../src/lib/impuestos-db';
import {
    claimUsTaxCalculo, prepareUsTaxForDocument, recordUsTaxTransaction, reverseUsTaxForDocument, sweepUsTaxForOrg,
} from '../src/lib/us-tax/calculo';
import { saveUsTaxConfig } from '../src/lib/us-tax/config';
import { UsTaxError } from '../src/lib/us-tax/core';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTRA = '00000000-0000-4000-8000-0000000000a2';
const CLI_LA = '00000000-0000-4000-8000-00000000c001';
const CLI_TX = '00000000-0000-4000-8000-00000000c002';
const CLI_SIN_ZIP = '00000000-0000-4000-8000-00000000c003';
const CLI_EXENTO = '00000000-0000-4000-8000-00000000c004';
const CLI_MX = '00000000-0000-4000-8000-00000000c005';
const ACCT = 'acct_negocio';

let db: PGlite;
const q = (text: string, values: unknown[] = []) => db.query<any>(text, values);

// ── Proveedor simulado ──────────────────────────────────────────────────────
// Estados donde la cuenta del negocio tiene registro EN EL PROVEEDOR (puede
// diferir de la copia de Cord: es justo lo que se prueba).
let registradosProveedor = new Set<string>(['CA']);
let remotos: { id: string; state: string; expired?: boolean }[] = [];
let n = 0;
let fallo: Error | null = null;

const conStatus = (status: number, code?: string) => Object.assign(new Error('Raw provider message: do not show'), { stripeStatus: status, code });

function jurisdicciones(state: string, amount: number, exento: boolean) {
    if (exento) return [{ amount: 0, jurisdiction: { country: 'US', display_name: 'California', level: 'state', state }, sourcing: 'destination', tax_rate_details: null, taxability_reason: 'customer_exempt', taxable_amount: 0 }];
    if (!registradosProveedor.has(state)) return [{ amount: 0, jurisdiction: { country: 'US', display_name: 'Texas', level: 'state', state }, sourcing: 'destination', tax_rate_details: null, taxability_reason: 'not_collecting', taxable_amount: 0 }];
    // Los Ángeles: el proveedor redondea POR JURISDICCIÓN.
    return [
        { pct: '6.0', name: 'California', level: 'state' },
        { pct: '0.25', name: 'LOS ANGELES', level: 'county' },
        { pct: '3.25', name: 'LOS ANGELES COUNTY DISTRICTS', level: 'district' },
    ].map((j) => ({
        amount: Math.round(amount * Number(j.pct) / 100),
        jurisdiction: { country: 'US', display_name: j.name, level: j.level, state },
        sourcing: 'destination', tax_rate_details: { display_name: 'Sales and Use Tax', percentage_decimal: j.pct, tax_type: 'sales_tax' },
        taxability_reason: 'standard_rated', taxable_amount: amount,
    }));
}

async function fakeStripe(path: string, params: Record<string, string> = {}, method = 'POST', _opts: any = {}) {
    if (fallo) throw fallo;
    if (path === '/v1/tax/calculations') {
        const state = params['customer_details[address][state]'];
        const exento = params['customer_details[taxability_override]'] === 'customer_exempt';
        const inclusive = params['line_items[0][tax_behavior]'] === 'inclusive';
        const lines = [];
        for (let i = 0; params[`line_items[${i}][amount]`]; i++) {
            const amount = Number(params[`line_items[${i}][amount]`]);
            const tb = jurisdicciones(state, inclusive ? Math.round(amount / 1.095) : amount, exento);
            lines.push({ reference: params[`line_items[${i}][reference]`], amount, amount_tax: tb.reduce((s, b) => s + b.amount, 0), tax_breakdown: tb });
        }
        const tax = lines.reduce((s, l) => s + l.amount_tax, 0);
        return {
            id: `taxcalc_${++n}`, amount_total: lines.reduce((s, l) => s + l.amount, 0) + (inclusive ? 0 : tax),
            expires_at: Math.floor(Date.now() / 1000) + 90 * 86400, line_items: { data: lines, has_more: false },
        };
    }
    if (path === '/v1/tax/transactions/create_from_calculation') return { id: `tax_${++n}` };
    if (path === '/v1/tax/transactions/create_reversal') return { id: `taxrev_${++n}` };
    if (path === '/v1/tax/settings') return { status: 'active', status_details: { active: {} } };
    if (path === '/v1/tax/registrations' && method === 'GET') {
        return { data: remotos.filter((r) => !r.expired).map((r) => ({ id: r.id, country: 'US', country_options: { us: { state: r.state, type: 'state_sales_tax' } } })) };
    }
    if (path === '/v1/tax/registrations') {
        const r = { id: `taxreg_${++n}`, state: params['country_options[us][state]'] };
        remotos.push(r);
        return { id: r.id };
    }
    const exp = /^\/v1\/tax\/registrations\/(.+)$/.exec(path);
    if (exp) { const r = remotos.find((x) => x.id === exp[1]); if (r) r.expired = true; return { id: exp[1] }; }
    throw new Error(`ruta no simulada: ${method} ${path}`);
}

const calcCalls = () => m.stripe.mock.calls.filter((c: any[]) => c[0] === '/v1/tax/calculations');
const items = (...precios: number[]) => precios.map((p) => ({ cantidad: 1, precio_unitario: p }));

beforeAll(async () => {
    db = new PGlite();
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
            line_items_snapshot jsonb, status text, lifecycle text, credit_note_of uuid);
    `);
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const inicio = schema.indexOf('-- ── Sales tax de EE. UU. calculado por la dirección del cliente');
    await db.exec(schema.slice(inicio, schema.indexOf('-- END us-tax', inicio)));
    // La reserva de cuota de cada registro (sección "Cuota del sales tax
    // automático de EE. UU." de db/schema.sql; su prueba es us-tax-cuota.test.ts).
    await db.exec('alter table us_tax_calculos add column if not exists uso_id uuid');
    const run = (scope: { org?: string }) => (...queries: Array<{ text: string; values: unknown[] }>) => db.transaction(async (tx) => {
        if (scope.org) await tx.query("select set_config('app.org_id', $1, true)", [scope.org]);
        const out = [];
        for (const query of queries) out.push((await tx.query(query.text, query.values)).rows);
        return out;
    });
    m.tx.mockImplementation((orgId: string, ...queries: any[]) => run({ org: orgId })(...queries));
    m.sys.mockImplementation((...queries: any[]) => run({})(...queries));
}, 30000);
afterAll(async () => { await db?.close(); });

beforeEach(async () => {
    m.stripe.mockReset();
    m.stripe.mockImplementation(fakeStripe);
    m.entitled = { ok: true };
    registradosProveedor = new Set(['CA']);
    remotos = [];
    fallo = null;
    await db.exec(`truncate us_tax_registros, documentos_fiscales, cotizacion_items, cotizaciones, impuestos, clientes, orgs cascade;
                   delete from us_tax_calculos;`);
    const origen = JSON.stringify({ line1: '200 N Spring St', line2: null, city: 'Los Angeles', state: 'CA', postal_code: '90012' });
    await q(`insert into orgs (id, country_code, iva_pct, stripe_account_id, us_tax_auto, us_tax_origen, us_tax_codigo, us_tax_estado)
             values ($1, 'US', 7.25, $2, true, $3::jsonb, 'txcd_20030000', '{"status":"active","faltantes":[]}'::jsonb),
                    ($4, 'US', 0, 'acct_otra', true, $3::jsonb, 'txcd_20030000', '{"status":"active","faltantes":[]}'::jsonb)`,
        [ORG, ACCT, origen, OTRA]);
    await q(`insert into us_tax_registros (org_id, estado, stripe_registration_id) values ($1, 'CA', 'taxreg_ca')`, [ORG]);
    await q(`insert into impuestos (org_id, nombre, tasa, es_default) values ($1, 'Sales tax CA 7.25%', 7.25, true)`, [ORG]);
    await q(`insert into clientes (id, org_id, empresa, country_code, direccion_line1, ciudad, region, cp_fiscal) values
             ($1, $6, 'Acme LA', 'US', '350 S Grand Ave', 'Los Angeles', 'CA', '90071'),
             ($2, $6, 'Lone Star', 'US', '100 Congress Ave', 'Austin', 'TX', '78701'),
             ($3, $6, 'Sin ZIP', 'US', null, null, 'CA', null),
             ($4, $6, 'Reventa', null, '1 Market St', 'San Francisco', 'CA', '94105'),
             ($5, $6, 'Cliente MX', 'MX', 'Reforma 1', 'CDMX', 'CDMX', '06600')`,
        [CLI_LA, CLI_TX, CLI_SIN_ZIP, CLI_EXENTO, CLI_MX, ORG]);
});

describe('el cálculo guardado es la única fuente de la tasa', () => {
    it('calcula en la cuenta del negocio y el motor reproduce su impuesto al centavo', async () => {
        const r = await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(123.45, 80) });
        expect(r?.calculoId).toBeTruthy();
        const [path, form, method, opts] = calcCalls()[0];
        expect([path, method]).toEqual(['/v1/tax/calculations', 'POST']);
        expect(opts.stripeAccount).toBe(ACCT);
        expect(opts.idempotencyKey).toMatch(/^us-tax-calc:/);
        expect(form).toMatchObject({
            currency: 'usd', 'customer_details[address][state]': 'CA', 'customer_details[address][postal_code]': '90071',
            'line_items[0][amount]': '12345', 'line_items[0][reference]': 'L0', 'line_items[0][tax_code]': 'txcd_20030000',
            'line_items[0][tax_behavior]': 'exclusive', 'expand[0]': 'line_items.data.tax_breakdown',
        });

        const cat = await taxCatalogFor(ORG, { usTaxCalculoId: r!.calculoId });
        // Lo que mande el navegador no cuenta: la tasa es la del cálculo.
        const tasas = [0, 1].map((i) => cat.resolve(0.0725, cat.defaultRate, i));
        const t = calculateDocumentTotals(items(123.45, 80).map((it, i) => ({ ...it, tax_rate: tasas[i] })), { roundLines: 2, taxRounding: 'line' });
        const [fila] = (await q('select tax_total, lineas from us_tax_calculos where id = $1', [r!.calculoId])).rows;
        expect(Math.round(t.impuestos * 100)).toBe(Number(fila.tax_total));
        expect(cat.breakdown(0)?.componentes.map((c) => c.nombre)).toEqual(['California', 'Los Angeles County', 'Los Angeles County Districts']);
    });

    it('reusa el cálculo de la vista previa si el documento no cambió, y recalcula si cambió', async () => {
        const a = await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(100) });
        const b = await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(100), calculoId: a!.calculoId });
        expect(b!.calculoId).toBe(a!.calculoId);
        expect(calcCalls()).toHaveLength(1);
        const c = await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(101), calculoId: a!.calculoId });
        expect(c!.calculoId).not.toBe(a!.calculoId);
        expect(calcCalls()).toHaveLength(2);
    });

    it('un cálculo de otra organización o vencido no prueba ninguna tasa', async () => {
        const a = await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(100) });
        await expect(taxCatalogFor(OTRA, { usTaxCalculoId: a!.calculoId })).rejects.toMatchObject({ code: 'calculo_vencido' });
        await q(`update us_tax_calculos set expires_at = now() - interval '1 minute'`);
        await expect(taxCatalogFor(ORG, { usTaxCalculoId: a!.calculoId })).rejects.toBeInstanceOf(UsTaxError);
        await expect(taxCatalogFor(ORG, { usTaxCalculoId: 'no-es-un-uuid' })).rejects.toMatchObject({ code: 'calculo_vencido' });
    });

    it('no aplica fuera de EE. UU., con la preferencia apagada o sin plan', async () => {
        expect(await prepareUsTaxForDocument(ORG, { clienteId: CLI_MX, currency: 'USD', ivaIncluido: false, items: items(100) })).toBeNull();
        m.entitled = { ok: false };
        expect(await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(100) })).toBeNull();
        m.entitled = { ok: true };
        await q('update orgs set us_tax_auto = false where id = $1', [ORG]);
        expect(await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(100) })).toBeNull();
        expect(calcCalls()).toHaveLength(0);
    });
});

describe('fallo cerrado: dice qué falta y no inventa la tasa', () => {
    it('sin ZIP del cliente no se llama al proveedor', async () => {
        await expect(prepareUsTaxForDocument(ORG, { clienteId: CLI_SIN_ZIP, currency: 'USD', ivaIncluido: false, items: items(100) }))
            .rejects.toMatchObject({ code: 'direccion_cliente', status: 422 });
        expect(calcCalls()).toHaveLength(0);
    });

    it('enviar sin cliente no se puede; un borrador sin cliente usa el catálogo', async () => {
        await expect(prepareUsTaxForDocument(ORG, { clienteId: null, currency: 'USD', ivaIncluido: false, items: items(100), requireClient: true }))
            .rejects.toMatchObject({ code: 'direccion_cliente' });
        expect(await prepareUsTaxForDocument(ORG, { clienteId: null, currency: 'USD', ivaIncluido: false, items: items(100) })).toBeNull();
    });

    it('el proveedor caído o una dirección que no ubica no dejan nada guardado ni su mensaje', async () => {
        fallo = conStatus(500);
        const caido = await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(100) }).catch((e) => e);
        expect(caido).toMatchObject({ code: 'no_disponible', status: 503 });
        expect(caido.message).not.toMatch(/provider message|stripe/i);
        fallo = conStatus(400, 'customer_tax_location_invalid');
        await expect(prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(100) }))
            .rejects.toMatchObject({ code: 'direccion_invalida' });
        expect((await q('select count(*)::int as n from us_tax_calculos')).rows[0].n).toBe(0);
    });

    it('sin cuenta de cobros o sin estados registrados, lo dice', async () => {
        await q('update orgs set stripe_account_id = null where id = $1', [ORG]);
        await expect(prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(100) }))
            .rejects.toMatchObject({ code: 'cuenta_cobros' });
        await q('update orgs set stripe_account_id = $2 where id = $1', [ORG, ACCT]);
        await q('update us_tax_registros set baja_at = now() where org_id = $1', [ORG]);
        await expect(prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(100) }))
            .rejects.toMatchObject({ code: 'sin_registros' });
    });

    it('un estado sin registro lleva 0 % con su motivo; uno registrado sin registro en la cuenta es un error', async () => {
        const tx = await prepareUsTaxForDocument(ORG, { clienteId: CLI_TX, currency: 'USD', ivaIncluido: false, items: items(100) });
        const cat = await taxCatalogFor(ORG, { usTaxCalculoId: tx!.calculoId });
        expect(cat.resolve(0.0725, cat.defaultRate, 0)).toBe(0);
        expect(cat.breakdown(0)).toMatchObject({ motivo: 'sin_registro', estado: 'TX', estadoNombre: 'Texas' });

        await q(`insert into us_tax_registros (org_id, estado, stripe_registration_id) values ($1, 'TX', 'taxreg_tx')`, [ORG]);
        await expect(prepareUsTaxForDocument(ORG, { clienteId: CLI_TX, currency: 'USD', ivaIncluido: false, items: items(200) }))
            .rejects.toMatchObject({ code: 'registro_desincronizado' });
    });

    it('un cliente exento necesita su certificado; con él, la exención viaja al cálculo', async () => {
        await q('update clientes set tax_exempt = true where id = $1', [CLI_EXENTO]);
        await expect(prepareUsTaxForDocument(ORG, { clienteId: CLI_EXENTO, currency: 'USD', ivaIncluido: false, items: items(100) }))
            .rejects.toMatchObject({ code: 'certificado' });
        await q(`update clientes set tax_exempt_cert = '{"numero":"SR FHA 12-345678","estado":"CA","vence":null}'::jsonb where id = $1`, [CLI_EXENTO]);
        const r = await prepareUsTaxForDocument(ORG, { clienteId: CLI_EXENTO, currency: 'USD', ivaIncluido: false, items: items(100) });
        expect(calcCalls().at(-1)![1]['customer_details[taxability_override]']).toBe('customer_exempt');
        const cat = await taxCatalogFor(ORG, { usTaxCalculoId: r!.calculoId });
        expect(cat.breakdown(0)).toMatchObject({ motivo: 'exento', certificado: 'SR FHA 12-345678' });
        await q(`update clientes set tax_exempt_cert = '{"numero":"X","vence":"2020-01-01"}'::jsonb where id = $1`, [CLI_EXENTO]);
        await expect(prepareUsTaxForDocument(ORG, { clienteId: CLI_EXENTO, currency: 'USD', ivaIncluido: false, items: items(300) }))
            .rejects.toMatchObject({ code: 'certificado' });
    });
});

describe('la venta se registra una vez, con lo que de verdad se cobró', () => {
    async function factura(id: string, calculoId: string, lineas: { subtotal: number; taxAmount: number }[], cotizacionId: string | null = null) {
        await q(`insert into documentos_fiscales (id, org_id, cotizacion_id, currency, line_items_snapshot, status, lifecycle, us_tax_calculo_id)
                 values ($1, $2, $3, 'USD', $4::jsonb, 'issued', 'open', $5)`, [id, ORG, cotizacionId, JSON.stringify(lineas), calculoId]);
    }
    const D1 = '00000000-0000-4000-8000-00000000d001';
    const D2 = '00000000-0000-4000-8000-00000000d002';

    it('registra la transacción con referencia única e idempotencia, y no repite', async () => {
        const r = await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(100) });
        await claimUsTaxCalculo(ORG, r!.calculoId, `documento:${D1}`);
        await factura(D1, r!.calculoId, [{ subtotal: 100, taxAmount: 9.5 }]);
        expect(await recordUsTaxTransaction(ORG, { documentoId: D1 })).toBe('registrada');
        const tx = m.stripe.mock.calls.find((c: any[]) => c[0] === '/v1/tax/transactions/create_from_calculation')!;
        expect(tx[1]).toMatchObject({ reference: `cord:${r!.calculoId}` });
        expect(tx[3]).toMatchObject({ stripeAccount: ACCT, idempotencyKey: `us-tax-tx:cord:${r!.calculoId}` });
        expect(await recordUsTaxTransaction(ORG, { documentoId: D1 })).toBe('ya_registrada');
        expect(m.stripe.mock.calls.filter((c: any[]) => c[0] === '/v1/tax/transactions/create_from_calculation')).toHaveLength(1);
    });

    it('si el documento ya no coincide con su cálculo, recalcula y registra solo si el impuesto cuadra', async () => {
        const r = await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(100, 50) });
        await claimUsTaxCalculo(ORG, r!.calculoId, `documento:${D1}`);
        // Aprobación parcial: solo la primera línea llegó a la factura.
        await factura(D1, r!.calculoId, [{ subtotal: 100, taxAmount: 9.5 }]);
        expect(await recordUsTaxTransaction(ORG, { documentoId: D1 })).toBe('registrada');
        const [doc] = (await q('select us_tax_calculo_id from documentos_fiscales where id = $1', [D1])).rows;
        expect(doc.us_tax_calculo_id).not.toBe(r!.calculoId);

        // Un impuesto cobrado que no cuadra con el recalculado no se reporta.
        await factura(D2, r!.calculoId, [{ subtotal: 100, taxAmount: 9.49 }, { subtotal: 50, taxAmount: 4.75 }]);
        await q('update us_tax_calculos set venta = $2 where id = $1', [r!.calculoId, `documento:${D2}`]);
        await q(`update us_tax_calculos set expires_at = now() - interval '1 day' where id = $1`, [r!.calculoId]);
        expect(await recordUsTaxTransaction(ORG, { documentoId: D2 })).toBe('no_concilia');
    });

    it('dos documentos iguales del mismo día son dos ventas: el segundo no hereda la transacción del primero', async () => {
        const r = await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(100) });
        await claimUsTaxCalculo(ORG, r!.calculoId, `documento:${D1}`);
        await factura(D1, r!.calculoId, [{ subtotal: 100, taxAmount: 9.5 }]);
        await factura(D2, r!.calculoId, [{ subtotal: 100, taxAmount: 9.5 }]);
        expect(await recordUsTaxTransaction(ORG, { documentoId: D1 })).toBe('registrada');
        expect(await recordUsTaxTransaction(ORG, { documentoId: D2 })).toBe('registrada');
        const refs = (await q('select transaccion_ref, venta from us_tax_calculos where transaccion_id is not null order by created_at')).rows;
        expect(refs.map((x: any) => x.venta)).toEqual([`documento:${D1}`, `documento:${D2}`]);
    });

    it('el barrido registra la cotización cobrada; anular la factura revierte su venta', async () => {
        const Q = '00000000-0000-4000-8000-00000000e001';
        const r = await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(100) });
        const tasa = (await taxCatalogFor(ORG, { usTaxCalculoId: r!.calculoId })).resolve(null, 0, 0);
        await q(`insert into cotizaciones (id, org_id, status, paid_at, base_currency, us_tax_calculo_id) values ($1, $2, 'paid', now(), 'USD', $3)`, [Q, ORG, r!.calculoId]);
        await q(`insert into cotizacion_items (cotizacion_id, cantidad, precio_unitario, tax_rate, orden) values ($1, 1, 100, $2, 0)`, [Q, tasa]);
        await claimUsTaxCalculo(ORG, r!.calculoId, `cotizacion:${Q}`);
        expect(await sweepUsTaxForOrg(ORG)).toMatchObject({ registradas: 1 });
        expect(await sweepUsTaxForOrg(ORG)).toMatchObject({ pendientes: 0 });

        // La factura de esa cotización es la misma venta: no se registra dos veces,
        // y como la cotización está cobrada, anularla no revierte la venta.
        await factura(D1, r!.calculoId, [{ subtotal: 100, taxAmount: 9.5 }], Q);
        expect(await recordUsTaxTransaction(ORG, { documentoId: D1 })).toBe('ya_registrada');
        await q(`update documentos_fiscales set lifecycle = 'void' where id = $1`, [D1]);
        expect(await reverseUsTaxForDocument(ORG, D1)).toBe('no_aplica');

        // Una factura suelta anulada sí revierte, una vez.
        const s = await prepareUsTaxForDocument(ORG, { clienteId: CLI_LA, currency: 'USD', ivaIncluido: false, items: items(70) });
        await claimUsTaxCalculo(ORG, s!.calculoId, `documento:${D2}`);
        // 70 × 9.5 % = 6.65, pero el proveedor redondea por jurisdicción: 4.20 + 0.18 + 2.28.
        await factura(D2, s!.calculoId, [{ subtotal: 70, taxAmount: 6.66 }]);
        expect(await recordUsTaxTransaction(ORG, { documentoId: D2 })).toBe('registrada');
        await q(`update documentos_fiscales set lifecycle = 'void' where id = $1`, [D2]);
        expect(await reverseUsTaxForDocument(ORG, D2)).toBe('revertida');
        expect(await reverseUsTaxForDocument(ORG, D2)).toBe('no_aplica');
        const rev = m.stripe.mock.calls.filter((c: any[]) => c[0] === '/v1/tax/transactions/create_reversal');
        expect(rev).toHaveLength(1);
        expect(rev[0][1]).toMatchObject({ mode: 'full', reference: `cord:${s!.calculoId}:anulada` });
    });
});

describe('configuración: Ajustes › Impuestos', () => {
    const origen = { line1: '200 N Spring St', city: 'Los Angeles', state: 'CA', postal_code: '90012' };

    it('adopta el registro que ya existe en la cuenta, crea el que falta y vence el que se quita', async () => {
        await db.exec(`delete from us_tax_registros`);
        remotos = [{ id: 'taxreg_existente', state: 'CA' }];
        const r = await saveUsTaxConfig(ORG, { auto: true, origen, taxCode: 'txcd_99999999', estados: ['CA', 'NY'] });
        expect(r).toMatchObject({ ok: true, auto: true });
        const regs = (await q(`select estado, stripe_registration_id, id from us_tax_registros where baja_at is null order by estado`)).rows;
        expect(regs[0]).toMatchObject({ estado: 'CA', stripe_registration_id: 'taxreg_existente' });
        const alta = m.stripe.mock.calls.find((c: any[]) => c[0] === '/v1/tax/registrations' && c[2] === 'POST')!;
        expect(alta[1]).toMatchObject({ country: 'US', 'country_options[us][state]': 'NY', 'country_options[us][type]': 'state_sales_tax' });
        expect(alta[3]).toMatchObject({ stripeAccount: ACCT, idempotencyKey: `us-tax-reg:${regs[1].id}` });
        const settings = m.stripe.mock.calls.find((c: any[]) => c[0] === '/v1/tax/settings')!;
        expect(settings[1]).toMatchObject({ 'head_office[address][state]': 'CA', 'defaults[tax_code]': 'txcd_99999999' });

        await saveUsTaxConfig(ORG, { auto: true, origen, taxCode: 'txcd_99999999', estados: ['CA'] });
        expect(remotos.find((x) => x.state === 'NY')?.expired).toBe(true);
        expect(remotos.find((x) => x.state === 'CA')?.expired).toBeFalsy();
    });

    it('no enciende la preferencia a medias: sin domicilio completo o sin estados, dice qué falta', async () => {
        const sinCalle = await saveUsTaxConfig(ORG, { auto: true, origen: { ...origen, line1: '' }, taxCode: null, estados: ['CA'] });
        expect(sinCalle).toMatchObject({ ok: false, code: 'us_tax_origen_incompleto', campo: 'line1' });
        const sinEstados = await saveUsTaxConfig(ORG, { auto: true, origen, taxCode: null, estados: [] });
        expect(sinEstados).toMatchObject({ ok: false, code: 'us_tax_sin_registros' });
        expect((await q('select us_tax_auto from orgs where id = $1', [ORG])).rows[0].us_tax_auto).toBe(false);
        expect(await saveUsTaxConfig(ORG, { auto: true, origen, taxCode: 'txcd_00000000', estados: ['CA'] })).toMatchObject({ ok: false, code: 'invalid_tax_code' });
        m.entitled = { ok: false };
        expect(await saveUsTaxConfig(ORG, { auto: true, origen, taxCode: null, estados: ['CA'] })).toMatchObject({ ok: false, status: 402 });
    });
});
