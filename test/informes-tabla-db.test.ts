// Informes tabla (fase 4): corre las consultas REALES de src/lib/informes-tabla.ts
// contra PGlite, sobre las tablas y la vista cuentas_por_cobrar tal cual están en db/schema.sql.
import { cuentasPorCobrarView, makeSchemaDb } from './helpers/schema-subset';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ db: null as any, org: '', rates: {} as Record<string, number> }));

type Frag = { strings: readonly string[]; values: unknown[] } | { raw: string };
function render(frag: Frag, values: unknown[]): string {
    if ('raw' in frag) return frag.raw;
    return frag.strings.reduce((text, part, i) => {
        if (i === 0) return part;
        const v = frag.values[i - 1];
        if (v && typeof v === 'object' && ('strings' in (v as any) || 'raw' in (v as any))) return text + render(v as Frag, values) + part;
        values.push(v);
        return text + `$${values.length}` + part;
    }, '');
}

vi.mock('../src/lib/db', () => {
    const sql: any = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
    sql.unsafe = (raw: string) => ({ raw });
    return {
        sql,
        getActiveOrgId: async () => m.org,
        withOrgTx: async (org: string, ...queries: Frag[]) => m.db.transaction(async (tx: any) => {
            await tx.query("select set_config('app.org_id', $1, true)", [org]);
            const out = [];
            for (const q of queries) { const values: unknown[] = []; const text = render(q, values); out.push((await tx.query(text, values)).rows); }
            return out;
        }),
    };
});
vi.mock('../src/lib/cache', () => ({ cached: (_k: string, _t: number, fn: () => unknown) => fn(), invalidate: vi.fn() }));
vi.mock('../src/lib/fx/FXService', () => ({
    FXService: { getExchangeRate: async ({ baseCurrency }: { baseCurrency: string }) => {
        const rate = m.rates[baseCurrency]; if (!rate) throw new Error('sin tasa'); return { spotRate: rate };
    } },
}));

const T = await import('../src/lib/informes-tabla');
const { tablaToCsv } = await import('../src/lib/informes-csv');

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CL1 = 'c1000000-0000-4000-8000-000000000001';
const CL2 = 'c2000000-0000-4000-8000-000000000002';
const P1 = 'f1000000-0000-4000-8000-000000000001';
const ANA = 'e1000000-0000-4000-8000-000000000001';
const R = (desde: string, hasta: string) => ({ key: 'custom' as const, desde, hasta });

beforeAll(async () => {
    // Esquema REAL (tipos incluidos) sacado de db/schema.sql: ver test/helpers/schema-subset.ts.
    m.db = await makeSchemaDb(['orgs', 'users', 'clientes', 'productos', 'org_members', 'cotizaciones', 'cotizacion_items', 'eventos', 'cotizacion_cobros', 'cotizacion_suscripciones', 'promesas_pago', 'documentos_fiscales', 'documento_pagos'], [cuentasPorCobrarView()]);
}, 60000);
afterAll(async () => { await m.db?.close(); });

beforeEach(async () => {
    m.org = ORG; m.rates = { USD: 20 };
    await m.db.exec(`delete from orgs; delete from clientes; delete from productos; delete from org_members; delete from cotizaciones;
        delete from cotizacion_items; delete from cotizacion_cobros; delete from documentos_fiscales; delete from documento_pagos;`);
    await m.db.query(`insert into orgs(id, nombre, moneda, zona_horaria, country_code) values ($1, 'Org', 'MXN', 'America/Mexico_City', 'MX')`, [ORG]);
    await m.db.query(`insert into clientes(id, org_id, empresa) values ($1, $3, 'Acme'), ($2, $3, 'Lumen')`, [CL1, CL2, ORG]);
    await m.db.query(`insert into productos(id, org_id, nombre, sku) values ($1, $2, 'Servicio premium', 'SRV-1')`, [P1, ORG]);
});

let folio = 0;
async function quote(input: Record<string, unknown>) {
    const fields = { folio: `COT-${++folio}`, ...input };
    const cols = Object.keys(fields);
    const { rows } = await m.db.query(`insert into cotizaciones(org_id, ${cols.join(',')}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(',')}) returning id`, [ORG, ...Object.values(fields)]);
    return rows[0].id as string;
}

describe('ventas en el tiempo', () => {
    it('agrupa por mes, compara contra el periodo anterior y suma cobrado de los dos rieles', async () => {
        await quote({ cliente_id: CL1, status: 'approved', total: 1000, created_at: '2026-08-05T18:00:00Z', approved_at: '2026-08-10T18:00:00Z' });
        await quote({ cliente_id: CL2, status: 'paid', total: 100, base_currency: 'USD', fiscal_currency: 'USD', created_at: '2026-09-02T18:00:00Z', approved_at: '2026-09-03T18:00:00Z', paid_at: '2026-09-04T18:00:00Z' });
        await quote({ status: 'approved', total: 400, created_at: '2026-06-01T18:00:00Z', approved_at: '2026-06-15T18:00:00Z' });
        const { rows: [doc] } = await m.db.query(`insert into documentos_fiscales(org_id, document_type, cliente_id, invoice_number, currency, total, lifecycle) values ($1, 'invoice', $2, 'F-1', 'MXN', 300, 'paid') returning id`, [ORG, CL1]);
        await m.db.query(`insert into documento_pagos(org_id, documento_id, monto, currency, metodo, aplicado_at) values ($1, $2, 300, 'MXN', 'transferencia', '2026-09-20T18:00:00Z')`, [ORG, doc.id]);
        const r = await T.getVentasTiempo(R('2026-08-01', '2026-09-30'), 'month');
        expect(r.rows.map((x) => [x.periodo, x.ventas, x.vendido, x.cobrado])).toEqual([
            ['2026-08-01', 1, 1000, 0],
            ['2026-09-01', 1, 2000, 2000 + 300],
        ]);
        const kpi = Object.fromEntries(r.kpis.map((k) => [k.key, k]));
        expect(kpi.vendido).toMatchObject({ value: 3000, prev: 400 });
        expect(kpi.ticket.value).toBe(1500);
        // 61 días (ago–sep): el periodo anterior son los 61 días previos.
        expect(r.rango.compare).toEqual({ desde: '2026-06-01', hasta: '2026-07-31' });
    });

    it('elige granularidad sola según el largo del rango', () => {
        expect(T.autoGranularity('2026-09-01', '2026-09-30')).toBe('day');
        expect(T.autoGranularity('2026-07-01', '2026-09-30')).toBe('week');
        expect(T.autoGranularity('2026-01-01', '2026-09-30')).toBe('month');
    });
});

describe('ventas por cliente y por producto', () => {
    it('cliente: vendido, ticket, saldo de hoy y recurrencia', async () => {
        await quote({ cliente_id: CL1, status: 'approved', total: 500, approved_at: '2026-01-10T18:00:00Z', created_at: '2026-01-05T18:00:00Z' });
        await quote({ cliente_id: CL1, status: 'approved', total: 800, approved_at: '2026-09-10T18:00:00Z', created_at: '2026-09-01T18:00:00Z', terminos: 'net30' });
        await quote({ cliente_id: CL2, status: 'sent', total: 50, created_at: '2026-09-02T18:00:00Z' });
        const r = await T.getVentasCliente(R('2026-09-01', '2026-09-30'));
        const acme = r.rows.find((x) => x.cliente === 'Acme')!;
        expect(acme).toMatchObject({ ventas: 1, vendido: 800, ticket: 800, saldo: 1300, ultima: '2026-09-10' });
        expect(acme._href).toBe(`/app/clientes/${CL1}`);
        expect(r.rows.find((x) => x.cliente === 'Lumen')).toMatchObject({ cotizaciones: 1, ventas: 0 });
        expect(r.kpis.find((k) => k.key === 'recurrencia')!.value).toBe(100);
    });

    it('producto: margen solo con costo capturado', async () => {
        const q = await quote({ status: 'approved', total: 0, approved_at: '2026-09-10T18:00:00Z', created_at: '2026-09-09T18:00:00Z' });
        await m.db.query(`insert into cotizacion_items(cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, costo_unitario) values
            ($1, $2, 'Servicio premium', 2, 100, 60), ($1, null, 'Flete', 1, 50, 0), ($1, $2, 'Servicio premium', 1, 999, 0)`, [q, P1]);
        await m.db.query(`update cotizacion_items set aprobado = false where precio_unitario = 999`);
        const r = await T.getVentasProducto(R('2026-09-01', '2026-09-30'));
        expect(r.rows.find((x) => x.producto === 'Servicio premium')).toMatchObject({ unidades: 2, vendido: 200, margen: 80, margen_pct: 40, sku: 'SRV-1' });
        expect(r.rows.find((x) => x.producto === 'Flete')).toMatchObject({ vendido: 50, margen: null });
        expect(r.kpis.find((k) => k.key === 'margen_pct')!.value).toBe(40);
    });
});

describe('finanzas', () => {
    it('pagos: un pago por fila, sin duplicar un cobro que también se aplicó a factura', async () => {
        const q = await quote({ cliente_id: CL1, folio: 'COT-1', status: 'approved', total: 1000 });
        const { rows: [cobro] } = await m.db.query(`insert into cotizacion_cobros(org_id, cotizacion_id, tipo, monto, status, paid_at, payment_method, reembolsado_cents)
            values ($1, $2, 'total', 600, 'pagado', '2026-09-05T18:00:00Z', 'spei', 10000) returning id`, [ORG, q]);
        const { rows: [doc] } = await m.db.query(`insert into documentos_fiscales(org_id, document_type, cliente_id, invoice_number, currency, total, lifecycle) values ($1, 'invoice', $2, 'F-9', 'USD', 50, 'open') returning id`, [ORG, CL2]);
        await m.db.query(`insert into documento_pagos(org_id, documento_id, cobro_id, monto, currency, aplicado_at) values
            ($1, $2, $3, 600, 'MXN', '2026-09-05T18:00:00Z'), ($1, $2, null, 50, 'USD', '2026-09-06T18:00:00Z')`, [ORG, doc.id, cobro.id]);
        await quote({ cliente_id: CL2, folio: 'COT-2', status: 'paid', total: 70, paid_at: '2026-09-07T18:00:00Z' });
        const r = await T.getPagosRecibidos(R('2026-09-01', '2026-09-30'));
        expect(r.rows.map((x) => [x.folio, x.metodo, x.monto, x.neto])).toEqual([
            ['COT-2', 'manual', 70, 70], ['F-9', 'manual', 1000, 1000], ['COT-1', 'spei', 600, 500],
        ]);
        expect(Object.fromEntries(r.kpis.map((k) => [k.key, k.value]))).toMatchObject({ bruto: 1670, reembolsado: 100, neto: 1570, pagos: 3 });
        const csv = tablaToCsv(r, 'es');
        expect(csv.split('\r\n')[0]).toBe('﻿Fecha,Folio,Cliente,Método,Monto,Reembolsado,Neto,Divisa');
        expect(csv).toContain('2026-09-05,COT-1,Acme,SPEI,600,100,500,MXN');
        // Un nombre que parece fórmula se exporta como texto, nunca como fórmula.
        const malicioso = tablaToCsv({ ...r, rows: [{ ...r.rows[0], cliente: '=HYPERLINK("x")' }] }, 'es');
        expect(malicioso).toContain(`"'=HYPERLINK(""x"")"`);
    });

    it('impuestos: de facturas emitidas, sin borradores ni notas de crédito', async () => {
        await m.db.query(`insert into documentos_fiscales(org_id, document_type, invoice_number, currency, subtotal, tax_total, retencion_total, total, lifecycle, status, issued_at, credit_note_of) values
            ($1, 'invoice', 'A', 'MXN', 1000, 160, 40, 1120, 'open', 'issued', '2026-09-10T18:00:00Z', null),
            ($1, 'invoice', 'B', 'USD', 100, 16, 0, 116, 'paid', 'issued', '2026-09-11T18:00:00Z', null),
            ($1, 'invoice', 'C', 'MXN', 999, 999, 0, 999, 'draft', 'issued', '2026-09-12T18:00:00Z', null),
            ($1, 'invoice', 'D', 'MXN', 50, 8, 0, 58, 'open', 'issued', '2026-09-13T18:00:00Z', gen_random_uuid())`, [ORG]);
        const r = await T.getImpuestos(R('2026-09-01', '2026-09-30'));
        expect(r.rows).toEqual([{ periodo: '2026-09-01', facturas: 2, subtotal: 3000, impuestos: 480, retenciones: 40, total: 3440 }]);
    });
});

describe('clientes y equipo', () => {
    it('recompra: % de la cohorte que volvió, y un mes futuro no es 0%', async () => {
        const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
        const mes = (offset: number) => { const d = new Date(`${hoy.slice(0, 7)}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + offset); return d.toISOString(); };
        await quote({ cliente_id: CL1, status: 'approved', total: 1, approved_at: mes(-3) });
        await quote({ cliente_id: CL1, status: 'approved', total: 1, approved_at: mes(-2) });
        await quote({ cliente_id: CL2, status: 'approved', total: 1, approved_at: mes(-3) });
        const r = await T.getRecompra();
        expect(r.rows).toHaveLength(1);
        expect(r.rows[0]).toMatchObject({ clientes: 2, m1: 50, m2: 0, m3: 0, m4: null });
    });

    it('vendedores: por persona activa, con tasa de la cohorte enviada', async () => {
        await m.db.query(`insert into org_members(org_id, user_id, nombre, email, rol, estado) values ($1, $2, 'Ana', 'ana@x', 'owner', 'activo')`, [ORG, ANA]);
        await quote({ status: 'approved', total: 900, creado_por: ANA, created_at: '2026-09-02T18:00:00Z', approved_at: '2026-09-05T18:00:00Z' });
        await quote({ status: 'sent', total: 100, creado_por: ANA, created_at: '2026-09-03T18:00:00Z' });
        const r = await T.getVentasVendedor(R('2026-09-01', '2026-09-30'));
        expect(r.rows[0]).toMatchObject({ vendedor: 'Ana', enviadas: 2, ventas: 1, vendido: 900, tasa: 50, ticket: 900, dias: 3 });
    });
});

describe('vendedores y exmiembros', () => {
    it('lo que creó alguien que ya no está activo va en su propia fila y la tabla cuadra con los KPIs', async () => {
        const EX = 'e9000000-0000-4000-8000-000000000009';
        await m.db.query(`insert into org_members(org_id, user_id, nombre, email, rol, estado) values ($1, $2, 'Ana', 'ana@x', 'owner', 'activo'), ($1, $3, 'Beto', 'beto@x', 'vendedor', 'revocado')`, [ORG, ANA, EX]);
        await quote({ status: 'approved', total: 900, creado_por: ANA, created_at: '2026-09-02T18:00:00Z', approved_at: '2026-09-05T18:00:00Z' });
        await quote({ status: 'approved', total: 300, creado_por: EX, created_at: '2026-09-02T18:00:00Z', approved_at: '2026-09-06T18:00:00Z' });
        const r = await T.getVentasVendedor(R('2026-09-01', '2026-09-30'));
        expect(r.rows.map((x) => [x.vendedor, x.vendido])).toEqual([['Ana', 900], ['Exmiembros del equipo', 300]]);
        expect(r.totals!.vendido).toBe(r.kpis.find((k) => k.key === 'vendido')!.value);
    });
});
