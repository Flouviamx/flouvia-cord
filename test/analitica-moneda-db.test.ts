// Analítica en la divisa y la zona horaria del negocio (reglas 21, 22, 24 y 25).
// Corre las consultas REALES de queries.ts contra PGlite con un esquema mínimo y
// la vista `cuentas_por_cobrar` copiada tal cual de db/schema.sql.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ db: null as any, org: '', rates: {} as Record<string, number> }));

type Frag = { strings: readonly string[]; values: unknown[] } | { raw: string };
function render(frag: Frag, values: unknown[]): string {
    if ('raw' in frag) return frag.raw;
    return frag.strings.reduce((text, part, i) => {
        if (i === 0) return part;
        const v = frag.values[i - 1];
        if (v && typeof v === 'object' && ('strings' in (v as any) || 'raw' in (v as any))) return text + render(v as Frag, values) + part;
        values.push(Array.isArray(v) ? v : v);
        return text + `$${values.length}` + part;
    }, '');
}
function compile(frag: Frag) { const values: unknown[] = []; return { text: render(frag, values), values }; }

vi.mock('../src/lib/db', () => {
    const sql: any = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
    sql.unsafe = (raw: string) => ({ raw });
    return {
        sql,
        getActiveOrgId: async () => m.org,
        withOrgTx: async (org: string, ...queries: Frag[]) => m.db.transaction(async (tx: any) => {
            await tx.query("select set_config('app.org_id', $1, true)", [org]);
            const out = [];
            for (const q of queries) { const { text, values } = compile(q); out.push((await tx.query(text, values)).rows); }
            return out;
        }),
        withUserTx: vi.fn(), resolvePublicQuote: vi.fn(), resolvePublicInvoice: vi.fn(),
    };
});
vi.mock('../src/lib/cache', () => ({ cached: (_k: string, _t: number, fn: () => unknown) => fn(), invalidate: vi.fn() }));
vi.mock('../src/lib/org-entitlements', () => ({
    checkEntitlement: async () => ({ ok: true }), getEntitlementContext: vi.fn(), requireEntitlement: async () => null,
}));
vi.mock('../src/lib/fx/FXService', () => ({
    FXService: {
        getExchangeRate: async ({ baseCurrency }: { baseCurrency: string }) => {
            const rate = m.rates[baseCurrency];
            if (!rate) throw new Error('sin tasa');
            return { spotRate: rate };
        },
    },
}));
vi.mock('../src/lib/public-links', () => ({ publicDocumentUrl: async (_o: string, kind: string, token: string) => `https://cord.test/${kind}/${token}` }));
vi.mock('../src/lib/after', () => ({ after: (p: unknown) => p }));
vi.mock('../src/lib/posthog-server', () => ({ trackServer: vi.fn() }));

const Q = await import('../src/lib/queries');

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CL1 = 'c1000000-0000-4000-8000-000000000001';
const CL2 = 'c2000000-0000-4000-8000-000000000002';

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table orgs(id uuid primary key, moneda text, zona_horaria text, country_code text, interes_moratorio_pct numeric);
        create table clientes(id uuid primary key, org_id uuid not null, empresa text, nivel text, descuento_pct numeric,
            terminos_default text, limite_credito numeric, telefono text);
        create table productos(id uuid primary key default gen_random_uuid(), org_id uuid, nombre text);
        create table cotizaciones(id uuid primary key default gen_random_uuid(), org_id uuid not null, cliente_id uuid,
            folio text, status text, total numeric, base_currency text not null default 'MXN', fiscal_currency text not null default 'MXN',
            fx_rate numeric not null default 1, created_at timestamptz default now(), sent_at timestamptz, approved_at timestamptz,
            paid_at timestamptz, viewer_last_seen timestamptz, vigencia date, terminos text, es_recurrente boolean,
            public_token text default gen_random_uuid()::text, creado_por uuid);
        create table org_members(org_id uuid, user_id uuid, nombre text, email text, rol text, estado text);
        create table cotizacion_items(id uuid primary key default gen_random_uuid(), cotizacion_id uuid, producto_id uuid,
            descripcion text, cantidad numeric, precio_unitario numeric, precio_negociado numeric);
        create table eventos(id uuid primary key default gen_random_uuid(), org_id uuid, cotizacion_id uuid, tipo text,
            detalle text, created_at timestamptz default now());
        create table cotizacion_cobros(id uuid primary key default gen_random_uuid(), org_id uuid, cotizacion_id uuid,
            monto numeric, status text, paid_at timestamptz, created_at timestamptz default now(), reembolsado_cents bigint);
        create table cotizacion_suscripciones(id uuid primary key default gen_random_uuid(), org_id uuid, cliente_id uuid,
            monto numeric, moneda text, estado text, current_period_end timestamptz, cancel_at_period_end boolean default false);
        create table promesas_pago(id uuid primary key default gen_random_uuid(), org_id uuid, cotizacion_id uuid,
            fecha_promesa date, monto numeric, nota text, estado text default 'pendiente', created_at timestamptz default now());
        create table documentos_fiscales(id uuid primary key default gen_random_uuid(), org_id uuid, cliente_id uuid,
            invoice_number text, currency text, total numeric, amount_paid numeric, amount_remaining numeric, due_date date,
            public_token text, cotizacion_id uuid, lifecycle text, ledger_currency text, fx_rate numeric, updated_at timestamptz default now());
    `);
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const start = schema.indexOf('create or replace view cuentas_por_cobrar as');
    const end = schema.indexOf(';', schema.indexOf('where d2.cotizacion_id = c.id', start)) + 1;
    expect(start).toBeGreaterThan(0);
    await m.db.exec(schema.slice(start, end));
}, 30000);

afterAll(async () => { await m.db?.close(); });

beforeEach(async () => {
    m.org = ORG;
    m.rates = { USD: 20 };
    await m.db.exec(`delete from orgs; delete from clientes; delete from cotizaciones; delete from cotizacion_items; delete from eventos;
        delete from cotizacion_cobros; delete from cotizacion_suscripciones; delete from org_members; delete from promesas_pago; delete from documentos_fiscales;`);
    await m.db.query(`insert into orgs values ($1, 'MXN', 'America/Mexico_City', 'MX', 0)`, [ORG]);
    await m.db.query(`insert into clientes(id, org_id, empresa, nivel, descuento_pct) values ($1, $3, 'Acme', 'A', 10), ($2, $3, 'Acme', 'A', 30)`, [CL1, CL2, ORG]);
});

async function quote(fields: Record<string, unknown>) {
    const cols = Object.keys(fields);
    const { rows } = await m.db.query(
        `insert into cotizaciones(org_id, ${cols.join(',')}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(',')}) returning id`,
        [ORG, ...Object.values(fields)],
    );
    return rows[0].id as string;
}

describe('importes en la divisa del negocio', () => {
    it('no suma USD como si fueran MXN: tasa congelada primero, la de hoy después', async () => {
        await quote({ cliente_id: CL1, status: 'approved', total: 1000, base_currency: 'MXN', fiscal_currency: 'MXN' });
        // Contable en MXN con tasa congelada 18: cuenta 18,000.
        await quote({ cliente_id: CL1, status: 'approved', total: 1000, base_currency: 'USD', fiscal_currency: 'MXN', fx_rate: 18 });
        // Contable en USD: no hay tasa congelada a MXN, se usa la de hoy (20).
        await quote({ cliente_id: CL2, status: 'approved', total: 1000, base_currency: 'USD', fiscal_currency: 'USD', fx_rate: 1 });
        const a = await Q.getAnalytics();
        expect(a.kpis.cerradoTotal).toBe(1000 + 18000 + 20000);
        expect(a.moneda).toEqual({ moneda: 'MXN', convertidas: ['USD'], sinTasa: [] });
    });

    it('una divisa sin tasa queda fuera de la suma y se reporta', async () => {
        m.rates = {};
        await quote({ status: 'approved', total: 1000, base_currency: 'MXN' });
        await quote({ status: 'approved', total: 5000, base_currency: 'EUR', fiscal_currency: 'EUR' });
        const d = await Q.getDashboard();
        expect(d.cerradoMes).toBe(1000);
        expect(d.moneda.sinTasa).toEqual(['EUR']);
        const a = await Q.getAnalytics();
        // El ticket divide solo entre las ganadas que entraron a la suma.
        expect(a.kpis.ticketPromedio).toBe(1000);
    });

    it('agrupa clientes por id, no por nombre', async () => {
        await quote({ cliente_id: CL1, status: 'approved', total: 100 });
        await quote({ cliente_id: CL2, status: 'approved', total: 300 });
        const r = await Q.getAnalyticsRango('2000-01-01', '2100-01-01');
        expect(r.clientes.map((c) => c.cerrado).sort()).toEqual([100, 300]);
    });
});

describe('días en la zona horaria del negocio', () => {
    it('una venta de las 8 pm en Ciudad de México cae en su día local, no en el de UTC', async () => {
        // 2026-03-10 20:00 en CDMX = 2026-03-11 02:00 UTC.
        await quote({ status: 'approved', total: 700, created_at: '2026-03-11T02:00:00Z' });
        const dia10 = await Q.getAnalyticsDiagnosis('2026-03-10', '2026-03-10');
        const dia11 = await Q.getAnalyticsDiagnosis('2026-03-11', '2026-03-11');
        expect(dia10.summary.cerrado).toBe(700);
        expect(dia11.summary.cerrado).toBe(0);
        expect(dia10.series).toEqual([{ fecha: '2026-03-10', cotizado: 700, cerrado: 700, cobrado: 0 }]);
    });

    it('la serie diaria termina en el hoy del negocio y tiene 365 puntos', async () => {
        const { dias } = await Q.getSerieDiaria();
        expect(dias).toHaveLength(365);
        const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
        expect(dias[dias.length - 1].fecha).toBe(hoy);
    });

    it('la serie diaria cuenta la cohorte del día y las ventas por día de cierre', async () => {
        const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
        await quote({ status: 'approved', total: 100, approved_at: new Date().toISOString() });
        await quote({ status: 'sent', total: 50 });
        await quote({ status: 'approved', total: 10, base_currency: 'EUR', fiscal_currency: 'EUR', approved_at: new Date().toISOString() });
        const { dias } = await Q.getSerieDiaria();
        const d = dias.find((x) => x.fecha === hoy)!;
        expect(d).toMatchObject({ enviadas: 3, ganadasCreadas: 2, cerrado: 100 });
        // La venta en EUR (sin tasa en esta prueba) no entra al ticket: 100 / 1.
        expect(d.ganadas).toBe(1);
    });

    it('el embudo cuenta como vista una cotización abierta que después se rechazó', async () => {
        const id = await quote({ status: 'rejected', total: 10 });
        await m.db.query(`insert into eventos(org_id, cotizacion_id, tipo) values ($1, $2, 'viewed')`, [ORG, id]);
        await quote({ status: 'sent', total: 10 });
        const r = await Q.getAnalyticsRango('2000-01-01', '2100-01-01');
        expect(r.funnel).toMatchObject({ enviadas: 2, vistas: 1 });
    });
});

describe('cobranza de los dos rieles', () => {
    it('suma saldos de cotizaciones y facturas, descuenta abonos y convierte', async () => {
        const cot = await quote({ cliente_id: CL1, status: 'approved', total: 1000, terminos: 'contado', approved_at: '2026-01-01T12:00:00Z' });
        await m.db.query(`insert into cotizacion_cobros(org_id, cotizacion_id, monto, status) values ($1, $2, 400, 'pagado')`, [ORG, cot]);
        await m.db.query(`insert into documentos_fiscales(org_id, cliente_id, invoice_number, currency, total, amount_paid, amount_remaining,
            due_date, public_token, lifecycle, ledger_currency, fx_rate) values ($1, $2, 'F-1', 'USD', 100, 0, 100, '2099-01-01', 'tok', 'open', 'USD', 1)`, [ORG, CL2]);
        const c = await Q.getCobranza();
        expect(c.resumen.totalPorCobrar).toBe(600 + 100 * 20);
        const factura = c.items.find((i) => i.origen === 'factura')!;
        expect(factura).toMatchObject({ folio: 'F-1', overdue: false, publicUrl: 'https://cord.test/i/tok' });
        expect(factura.href).toMatch(/^\/app\/facturas\//);
        const cotizacion = c.items.find((i) => i.origen === 'cotizacion')!;
        expect(cotizacion).toMatchObject({ total: 600, overdue: true });
        expect(c.clientes).toHaveLength(2);
    });

    it('el flujo proyecta la misma cartera que cobranza', async () => {
        await quote({ cliente_id: CL1, status: 'approved', total: 1000, terminos: 'net30' });
        await m.db.query(`insert into documentos_fiscales(org_id, cliente_id, invoice_number, currency, total, amount_paid, amount_remaining,
            due_date, public_token, lifecycle) values ($1, $2, 'F-2', 'MXN', 500, 200, 300, '2099-01-01', 'tok2', 'open')`, [ORG, CL2]);
        await m.db.query(`insert into cotizacion_suscripciones(org_id, monto, moneda, estado) values ($1, 10, 'USD', 'active')`, [ORG]);
        const cfo = await Q.getCFO();
        expect(cfo.kpis.totalCartera).toBe(1300);
        expect(cfo.mrr.activo).toBe(200);
    });
});

describe('desempeño por vendedor', () => {
    it('compara vendedores en la divisa del negocio', async () => {
        const ANA = 'e1000000-0000-4000-8000-000000000001', LUIS = 'e2000000-0000-4000-8000-000000000002';
        await m.db.query(`insert into org_members values ($1, $2, 'Ana', 'ana@x', 'owner', 'activo'), ($1, $3, 'Luis', 'luis@x', 'member', 'activo')`, [ORG, ANA, LUIS]);
        await quote({ status: 'approved', total: 1000, creado_por: ANA });
        await quote({ status: 'approved', total: 100, base_currency: 'USD', fiscal_currency: 'USD', creado_por: LUIS });
        const d = await Q.getDesempeno();
        expect(d.vendedores.map((v) => [v.nombre, v.cerradoTotal])).toEqual([['Luis', 2000], ['Ana', 1000]]);
    });
});

describe('facturas vencidas', () => {
    it('suma saldos en la divisa del negocio y lista primero lo que más pesa', async () => {
        await m.db.query(`insert into documentos_fiscales(org_id, cliente_id, invoice_number, currency, total, amount_paid, amount_remaining,
            due_date, public_token, lifecycle) values
            ($1, $2, 'F-9', 'USD', 100, 0, 100, '2020-01-01', 'a', 'open'),
            ($1, $2, 'F-8', 'MXN', 500, 0, 500, '2020-02-01', 'b', 'open'),
            ($1, $2, 'F-7', 'MXN', 900, 0, 900, '2099-01-01', 'c', 'open')`, [ORG, CL1]);
        const r = await Q.getFacturasResumen();
        expect(r.vencido).toBe(100 * 20 + 500);
        expect(r.vencidas).toBe(2);
        expect(r.porCobrar).toBe(2000 + 500 + 900);
        expect(r.topVencidas.map((f) => f.folio)).toEqual(['F-9', 'F-8']);
        expect(r.topVencidas[0].dias).toBeGreaterThan(365);
    });
});

describe('informes por rango', () => {
    it('niveles: el descuento promedia clientes, no cotizaciones', async () => {
        for (let i = 0; i < 5; i++) await quote({ cliente_id: CL1, status: 'approved', total: 10 });
        await quote({ cliente_id: CL2, status: 'approved', total: 10 });
        const [nivel] = await Q.getFinanceLevelInsights();
        expect(nivel).toMatchObject({ nivel: 'A', descuento: 20, ganadas: 6, cerrado: 60 });
    });

    it('clientes, productos y tiempos por etapa corren sobre el rango local', async () => {
        const id = await quote({ cliente_id: CL1, status: 'approved', total: 50, base_currency: 'USD', fiscal_currency: 'USD' });
        await m.db.query(`insert into cotizacion_items(cotizacion_id, descripcion, cantidad, precio_unitario) values ($1, 'Servicio', 2, 25)`, [id]);
        const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
        const [clientes, productos, etapas] = await Promise.all([
            Q.getClientReportInsights(hoy, hoy), Q.getProductReportInsights(hoy, hoy), Q.getCommercialStageTiming(hoy, hoy),
        ]);
        expect(clientes.cohortes[0]).toMatchObject({ tipo: 'nuevo', cerrado: 1000 });
        expect(productos[0]).toMatchObject({ nombre: 'Servicio', cerrado: 1000 });
        expect(etapas.map((e) => e.key)).toEqual(['created_sent', 'sent_viewed', 'viewed_approved', 'approved_paid']);
    });
});
