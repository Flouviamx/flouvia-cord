import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const m = vi.hoisted(() => ({ db: null as any, org: '' }));

vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: any[]) => ({ text: s.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: async (org: string, ...queries: any[]) => m.db.transaction(async (tx: any) => {
        await tx.query("select set_config('app.org_id',$1,true)", [org]);
        const rows = [];
        for (const q of queries) rows.push((await tx.query(q.text, q.values)).rows);
        return rows;
    }),
    withUserTx: vi.fn(),
    getActiveOrgId: async () => m.org,
    resolvePublicQuote: vi.fn(),
    resolvePublicInvoice: vi.fn(),
}));

const { getCotizacionesPage, getClientesPage, getProductosPage } = await import('../src/lib/queries');

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const CLIENTE_B = '00000000-0000-4000-8000-0000000000c2';

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table clientes(id uuid primary key default gen_random_uuid(), org_id uuid, empresa text, contacto text, email text, telefono text,
            rfc text, terminos_default text, limite_credito numeric, nivel text, descuento_pct numeric, regimen_fiscal text, uso_cfdi text,
            cp_fiscal text, country_code text, direccion_line1 text, direccion_line2 text, ciudad text, region text, origen text,
            created_at timestamptz default now());
        create table productos(id uuid primary key default gen_random_uuid(), org_id uuid, sku text, nombre text, unidad text, descripcion text,
            precio_lista numeric, costo numeric, activo boolean default true, precios_volumen jsonb default '[]', created_at timestamptz default now());
        create table cotizaciones(id uuid primary key default gen_random_uuid(), org_id uuid, cliente_id uuid, folio text, status text,
            total numeric, subtotal numeric, iva numeric, terminos text, vigencia date, public_token text, created_at timestamptz);
        insert into clientes(id, org_id, empresa) values ('${CLIENTE_B}', '${B}', 'Secreto de B');
        insert into clientes(org_id, empresa) select '${A}', 'Cliente ' || lpad(g::text, 2, '0') from generate_series(1, 5) g;
        insert into productos(org_id, nombre) select '${A}', 'Producto ' || g from generate_series(1, 3) g;
        insert into productos(org_id, nombre) values ('${B}', 'Producto de B');
        insert into cotizaciones(org_id, folio, status, total, created_at)
            select '${A}', 'COT-' || g, case when g % 2 = 0 then 'sent' else 'draft' end, g * 100, now() - (g || ' minutes')::interval
            from generate_series(1, 7) g;
        insert into cotizaciones(org_id, cliente_id, folio, status, total, created_at) values ('${A}', '${CLIENTE_B}', 'COT-AJENO', 'sent', 1, now());
        insert into cotizaciones(org_id, folio, status, total, created_at) values ('${B}', 'COT-B', 'sent', 1, now());`);
    m.org = A;
}, 15000);

afterAll(async () => { await m.db.close(); });

describe('paginación en SQL', () => {
    it('cotizaciones: filtra por estado, cuenta solo la org y ordena de la más nueva a la más vieja', async () => {
        const page = await getCotizacionesPage({ limit: 2, offset: 0, status: 'sent' });
        expect(page.total).toBe(4);
        expect(page.items.map((q) => q.folio)).toEqual(['COT-AJENO', 'COT-2']);
        const todas = await getCotizacionesPage({ limit: 50, offset: 0, status: null });
        expect(todas.total).toBe(8);
        expect(todas.items.some((q) => q.folio === 'COT-B')).toBe(false);
    });

    it('cotizaciones: no une el nombre del cliente de otra org', async () => {
        const page = await getCotizacionesPage({ limit: 1, offset: 0, status: 'sent' });
        expect(JSON.stringify(page.items[0])).not.toContain('Secreto de B');
    });

    it('el total se conserva aunque el offset rebase el final', async () => {
        expect(await getCotizacionesPage({ limit: 10, offset: 500, status: null })).toMatchObject({ items: [], total: 8 });
        expect(await getClientesPage({ limit: 10, offset: 500 })).toMatchObject({ items: [], total: 5 });
    });

    it('clientes y productos: páginas sin traslapes y sin filas de otra org', async () => {
        const p1 = await getClientesPage({ limit: 2, offset: 0 });
        const p2 = await getClientesPage({ limit: 2, offset: 2 });
        const p3 = await getClientesPage({ limit: 2, offset: 4 });
        const nombres = [...p1.items, ...p2.items, ...p3.items].map((c) => c.empresa);
        expect(nombres).toEqual(['Cliente 01', 'Cliente 02', 'Cliente 03', 'Cliente 04', 'Cliente 05']);
        const productos = await getProductosPage({ limit: 10, offset: 0 });
        expect(productos.total).toBe(3);
        expect(productos.items.map((p) => p.nombre)).not.toContain('Producto de B');
    });
});
