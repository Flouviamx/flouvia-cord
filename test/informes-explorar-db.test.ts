// Explorador e informes guardados (fase 5): corre las consultas REALES contra PGlite,
// sobre las tablas tal cual están en db/schema.sql (test/helpers/schema-subset.ts).
import { makeSchemaDb } from './helpers/schema-subset';
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
vi.mock('../src/lib/context', () => ({ currentLocale: () => 'es' }));
vi.mock('../src/lib/fx/FXService', () => ({
    FXService: { getExchangeRate: async ({ baseCurrency }: { baseCurrency: string }) => {
        const rate = m.rates[baseCurrency]; if (!rate) throw new Error('sin tasa'); return { spotRate: rate };
    } },
}));

const X = await import('../src/lib/informes-explorar');
const G = await import('../src/lib/informes-guardados');
const { tablaToCsv } = await import('../src/lib/informes-csv');

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CL1 = 'c1000000-0000-4000-8000-000000000001';
const CL2 = 'c2000000-0000-4000-8000-000000000002';
const P1 = 'f1000000-0000-4000-8000-000000000001';
const ANA = 'e1000000-0000-4000-8000-000000000001';
const LUIS = 'e2000000-0000-4000-8000-000000000002';
const R = { key: 'custom' as const, desde: '2026-09-01', hasta: '2026-09-30' };

beforeAll(async () => {
    m.db = await makeSchemaDb(['orgs', 'users', 'clientes', 'productos', 'org_members', 'cotizaciones', 'cotizacion_items', 'cotizacion_suscripciones', 'cotizacion_cobros', 'documentos_fiscales', 'documento_pagos', 'informes_guardados']);
    // RLS real de informes_guardados: la política se prueba, no se asume.
    await m.db.exec(`
        alter table informes_guardados enable row level security;
        alter table informes_guardados force row level security;
        create policy rls_informes_guardados on informes_guardados
          using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
          with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
        create role app_test nosuperuser nobypassrls;
        grant all on all tables in schema public to app_test;`);
}, 60000);
afterAll(async () => { await m.db?.close(); });

let folio = 0;
async function quote(input: Record<string, unknown>) {
    const fields = { folio: `COT-${++folio}`, ...input };
    const cols = Object.keys(fields);
    const { rows } = await m.db.query(`insert into cotizaciones(org_id, ${cols.join(',')}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(',')}) returning id`, [ORG, ...Object.values(fields)]);
    return rows[0].id as string;
}

beforeEach(async () => {
    m.org = ORG; m.rates = { USD: 20 };
    await m.db.exec(`reset role; delete from orgs; delete from clientes; delete from productos; delete from org_members; delete from cotizaciones;
        delete from cotizacion_items; delete from informes_guardados;`);
    await m.db.query(`insert into orgs(id, nombre, moneda, zona_horaria, country_code) values ($1, 'Org', 'MXN', 'America/Mexico_City', 'MX'), ($2, 'Otra', 'MXN', 'America/Mexico_City', 'MX')`, [ORG, OTRA]);
    await m.db.query(`insert into clientes(id, org_id, empresa, nivel, country_code) values ($1, $3, 'Acme', 'A', 'MX'), ($2, $3, 'Lumen', 'B', 'US')`, [CL1, CL2, ORG]);
    await m.db.query(`insert into productos(id, org_id, nombre) values ($1, $2, 'Servicio premium')`, [P1, ORG]);
    await m.db.query(`insert into org_members(org_id, user_id, nombre, email, rol, estado) values ($1, $2, 'Ana', 'ana@x', 'owner', 'activo'), ($1, $3, 'Luis', 'luis@x', 'vendedor', 'activo')`, [ORG, ANA, LUIS]);
});

describe('configuración', () => {
    it('solo deja pasar claves conocidas y quita métricas que no aplican a la dimensión', () => {
        expect(X.parseExplorerConfig({ dim: 'drop table', m: ['vendido', 'x; delete', 'margen'] })).toEqual({ dim: 'cliente', m: ['vendido'] });
        expect(X.parseExplorerConfig({ dim: 'producto', m: 'unidades,margen,dias_cierre' })).toEqual({ dim: 'producto', m: ['unidades', 'margen'] });
        expect(X.parseExplorerConfig({ dim: 'mes', m: [] })).toEqual({ dim: 'mes', m: X.DEFAULT_CONFIG.m });
        expect(X.parseExplorerConfig({ m: ['cotizaciones', 'cotizado', 'ganadas', 'vendido', 'tasa', 'ticket', 'perdidas'] }).m).toHaveLength(6);
        expect(X.configFromSearch(new URLSearchParams('dim=vendedor&m=vendido&m=tasa'))).toEqual({ dim: 'vendedor', m: ['vendido', 'tasa'] });
    });
});

describe('explorador', () => {
    it('agrupa por vendedor (creado_por es text) y convierte divisas', async () => {
        await quote({ cliente_id: CL1, status: 'approved', total: 1000, creado_por: ANA, created_at: '2026-09-02T18:00:00Z', approved_at: '2026-09-04T18:00:00Z' });
        await quote({ cliente_id: CL2, status: 'paid', total: 100, base_currency: 'USD', fiscal_currency: 'USD', creado_por: LUIS, created_at: '2026-09-03T18:00:00Z', approved_at: '2026-09-05T18:00:00Z' });
        await quote({ cliente_id: CL2, status: 'rejected', total: 50, creado_por: LUIS, created_at: '2026-09-06T18:00:00Z' });
        await quote({ cliente_id: CL1, status: 'sent', total: 70, created_at: '2026-09-07T18:00:00Z' });
        const r = await X.getExplorer(R, { dim: 'vendedor', m: ['cotizaciones', 'vendido', 'tasa', 'perdidas'] });
        expect(r.rows.map((x) => [x.label, x.cotizaciones, x.vendido, x.tasa, x.perdidas])).toEqual([
            ['Luis', 2, 2000, 50, 1], ['Ana', 1, 1000, 100, 0], ['Sin vendedor', 1, 0, 0, 0],
        ]);
        expect(r.totals).toMatchObject({ cotizaciones: 4, vendido: 3000, tasa: 50, perdidas: 1 });
        expect(r.columns.map((c) => c.label)).toEqual(['inf.t.vendedor', 'inf.t.cotizaciones', 'inf.t.vendido', 'inf.t.tasa_cierre', 'inf.x.perdidas']);
        expect(tablaToCsv(r, 'es').split('\r\n')[0]).toBe('﻿Vendedor,Cotizaciones,Vendido,Tasa de cierre,Perdidas,Divisa');
    });

    it('por producto usa las líneas aprobadas y el margen solo con costo', async () => {
        const q = await quote({ cliente_id: CL1, status: 'approved', total: 0, created_at: '2026-09-09T18:00:00Z', approved_at: '2026-09-10T18:00:00Z' });
        await m.db.query(`insert into cotizacion_items(cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, costo_unitario) values
            ($1, $2, 'Servicio premium', 2, 100, 60), ($1, null, 'Flete', 1, 50, 0)`, [q, P1]);
        const r = await X.getExplorer(R, { dim: 'producto', m: ['unidades', 'vendido', 'margen'] });
        expect(r.rows.find((x) => x.label === 'Servicio premium')).toMatchObject({ unidades: 2, vendido: 200, margen: 80, _href: `/app/productos/${P1}` });
        expect(r.rows.find((x) => x.label === 'Flete')).toMatchObject({ vendido: 50, margen: null, _href: null });
    });

    it('por estado y por país traduce la etiqueta; por mes ordena en el tiempo', async () => {
        await quote({ cliente_id: CL2, status: 'expired', total: 10, created_at: '2026-09-02T18:00:00Z' });
        await quote({ cliente_id: CL1, status: 'approved', total: 10, created_at: '2026-09-20T18:00:00Z', approved_at: '2026-09-21T18:00:00Z' });
        const estado = await X.getExplorer(R, { dim: 'estado', m: ['cotizaciones'] });
        expect(estado.rows.map((x) => x.label).sort()).toEqual(['Aprobada', 'Vencida']);
        const pais = await X.getExplorer(R, { dim: 'pais', m: ['cotizaciones'] });
        expect(pais.rows.map((x) => x.label).sort()).toEqual(['Estados Unidos', 'México']);
        const semana = await X.getExplorer({ key: 'custom', desde: '2026-08-01', hasta: '2026-09-30' }, { dim: 'mes', m: ['cotizaciones'] });
        expect(semana.rows.map((x) => x.label)).toEqual(['2026-09-01']);
        expect(semana.granularity).toBe('month');
    });
});

describe('informes guardados', () => {
    const ana = { orgId: ORG, userId: ANA, rol: 'owner' };
    const luis = { orgId: ORG, userId: LUIS, rol: 'vendedor' };

    it('guarda la configuración normalizada y la lista por organización', async () => {
        const out = await G.createGuardado(luis, { nombre: '  Ventas   por país ', config: { dim: 'pais', m: ['vendido', 'hack'] } });
        expect(out.ok && out.value).toMatchObject({ nombre: 'Ventas por país', config: { dim: 'pais', m: ['vendido'] }, frecuencia: 'ninguna', mio: true });
        expect((await G.listGuardados(ana)).map((g) => [g.nombre, g.mio, g.puedeEditar])).toEqual([['Ventas por país', false, true]]);
        expect(await G.listGuardados({ orgId: OTRA, userId: ANA, rol: 'owner' })).toEqual([]);
        expect((await G.createGuardado(luis, { nombre: '' })).ok).toBe(false);
    });

    it('un admin puede apagar el envío de otra persona, pero no encenderlo', async () => {
        const out = await G.createGuardado(luis, { nombre: 'Mío', config: {}, frecuencia: 'semanal' });
        if (!out.ok) throw new Error('no guardó');
        const { rows: [row] } = await m.db.query('select ultimo_envio_at from informes_guardados where id = $1', [out.value.id]);
        expect(row.ultimo_envio_at).not.toBeNull(); // el reloj arranca hoy, no se manda de inmediato
        expect(await G.updateGuardado(ana, out.value.id, { frecuencia: 'mensual' })).toMatchObject({ ok: false, error: 'programar' });
        expect(await G.updateGuardado(ana, out.value.id, { frecuencia: 'ninguna' })).toMatchObject({ ok: true });
        expect(await G.updateGuardado({ orgId: ORG, userId: 'e3000000-0000-4000-8000-000000000003', rol: 'vendedor' }, out.value.id, { nombre: 'X' })).toMatchObject({ ok: false, error: 'permiso' });
        expect(await G.deleteGuardado(luis, out.value.id)).toMatchObject({ ok: true });
        expect(await G.getGuardado(luis, out.value.id)).toBeNull();
        expect(await G.getGuardado(luis, 'no-es-uuid')).toBeNull();
    });

    it('respeta el tope por organización', async () => {
        for (let i = 0; i < G.MAX_GUARDADOS; i++) {
            await m.db.query(`insert into informes_guardados(org_id, nombre, config) values ($1, $2, '{}')`, [ORG, `I${i}`]);
        }
        expect(await G.createGuardado(luis, { nombre: 'Uno más', config: {} })).toMatchObject({ ok: false, error: 'tope' });
    });

    it('la RLS no deja leer ni escribir informes de otra organización', async () => {
        await m.db.query(`insert into informes_guardados(org_id, nombre, config) values ($1, 'Ajeno', '{}')`, [OTRA]);
        await m.db.exec('set role app_test');
        expect(await G.listGuardados(ana)).toEqual([]);
        await expect(m.db.transaction(async (tx: any) => {
            await tx.query("select set_config('app.org_id', $1, true)", [ORG]);
            await tx.query(`insert into informes_guardados(org_id, nombre, config) values ($1, 'Intruso', '{}')`, [OTRA]);
        })).rejects.toThrow(/row-level security/);
        await m.db.exec('reset role');
    });
});
