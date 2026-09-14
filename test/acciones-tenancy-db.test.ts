import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const m = vi.hoisted(() => ({ db: null as any, audit: vi.fn() }));

vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: any[]) => ({ text: s.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: async (org: string, ...queries: any[]) => m.db.transaction(async (tx: any) => {
        await tx.query("select set_config('app.org_id',$1,true)", [org]);
        const rows = [];
        for (const q of queries) rows.push((await tx.query(q.text, q.values)).rows);
        return rows;
    }),
    logAudit: m.audit,
}));
vi.mock('../src/lib/queries', () => ({ normVolumen: () => [], invalidateMoneyCaches: vi.fn() }));
vi.mock('../src/lib/org-entitlements', () => ({ requireResourceCapacity: async () => null, resourceLimitError: () => null }));
vi.mock('../src/lib/context', () => ({ currentLocale: () => 'es' }));

const clients = await import('../src/lib/actions/clients');
const products = await import('../src/lib/actions/products');
const tasks = await import('../src/lib/actions/tasks');
const promises = await import('../src/lib/actions/promises');

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const CLIENTE_B = '00000000-0000-4000-8000-0000000000c1';
const PRODUCTO_B = '00000000-0000-4000-8000-0000000000d1';
const COT_B = '00000000-0000-4000-8000-0000000000e1';
const TAREA_B = '00000000-0000-4000-8000-0000000000f1';
const PROMESA_B = '00000000-0000-4000-8000-0000000000f2';
const ctxA = { orgId: A, origin: 'https://cord.test' };
const count = async (q: string) => (await m.db.query(q)).rows[0].n as number;

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table clientes(id uuid primary key default gen_random_uuid(), org_id uuid not null, empresa text not null, contacto text, email text,
            telefono text, rfc text, terminos_default text, limite_credito numeric, nivel text, descuento_pct numeric, regimen_fiscal text,
            uso_cfdi text, cp_fiscal text, country_code text, direccion_line1 text, direccion_line2 text, ciudad text, region text);
        create table productos(id uuid primary key default gen_random_uuid(), org_id uuid not null, sku text, nombre text not null, unidad text,
            descripcion text, precio_lista numeric, costo numeric, activo boolean, precios_volumen jsonb);
        create table cotizaciones(id uuid primary key, org_id uuid not null);
        create table tareas(id uuid primary key default gen_random_uuid(), org_id uuid not null, cotizacion_id uuid, titulo text, due_date date, done boolean default false);
        create table promesas_pago(id uuid primary key default gen_random_uuid(), org_id uuid not null, cotizacion_id uuid, fecha_promesa date, monto numeric, nota text, estado text default 'pendiente');`);
});

beforeEach(async () => {
    vi.clearAllMocks();
    await m.db.exec(`
        delete from clientes; delete from productos; delete from cotizaciones; delete from tareas; delete from promesas_pago;
        insert into clientes(id, org_id, empresa) values ('${CLIENTE_B}', '${B}', 'Cliente de B');
        insert into productos(id, org_id, nombre, precio_lista) values ('${PRODUCTO_B}', '${B}', 'Producto de B', 10);
        insert into cotizaciones(id, org_id) values ('${COT_B}', '${B}');
        insert into tareas(id, org_id, titulo) values ('${TAREA_B}', '${B}', 'Tarea de B');
        insert into promesas_pago(id, org_id, cotizacion_id, fecha_promesa) values ('${PROMESA_B}', '${B}', '${COT_B}', '2026-10-01');`);
});

afterAll(async () => { await m.db.close(); });

describe('una org no alcanza los registros de otra', () => {
    it('clientes: editar y borrar responden 404 sin tocar la fila', async () => {
        expect((await clients.updateClient(ctxA, CLIENTE_B, { empresa: 'Robado' })).status).toBe(404);
        expect((await clients.deleteClient(ctxA, CLIENTE_B)).status).toBe(404);
        expect((await m.db.query('select empresa from clientes')).rows).toEqual([{ empresa: 'Cliente de B' }]);
        expect(m.audit).not.toHaveBeenCalled();
    });

    it('productos: editar y borrar responden 404 sin tocar la fila', async () => {
        expect((await products.updateProduct(ctxA, PRODUCTO_B, { nombre: 'Robado', precio: 0 })).status).toBe(404);
        expect((await products.deleteProduct(ctxA, PRODUCTO_B)).status).toBe(404);
        expect((await m.db.query('select nombre from productos')).rows).toEqual([{ nombre: 'Producto de B' }]);
    });

    it('tareas: no completa, no borra y no liga a una cotización ajena', async () => {
        expect((await tasks.setTaskDone(ctxA, TAREA_B, true)).status).toBe(404);
        expect((await tasks.deleteTask(ctxA, TAREA_B)).status).toBe(404);
        expect((await tasks.createTask(ctxA, { titulo: 'x', cotizacion_id: COT_B })).status).toBe(404);
        expect(await count('select count(*)::int n from tareas')).toBe(1);
        expect(await count('select count(*)::int n from tareas where done')).toBe(0);
    });

    it('promesas: no cambia, no borra y no crea sobre una cotización ajena', async () => {
        expect((await promises.setPromiseState(ctxA, PROMESA_B, 'cumplida')).status).toBe(404);
        expect((await promises.deletePromise(ctxA, PROMESA_B)).status).toBe(404);
        expect((await promises.createPromise(ctxA, { cotizacion_id: COT_B, fecha_promesa: '2026-10-02' })).status).toBe(404);
        expect((await m.db.query('select estado from promesas_pago')).rows).toEqual([{ estado: 'pendiente' }]);
    });
});

describe('camino normal y actor', () => {
    it('crea un cliente en la org del contexto y audita con el actor de la API', async () => {
        const r = await clients.createClient({ ...ctxA, actor: 'api:key-1', source: 'api' }, { empresa: 'Nuevo', rfc: 'xaxx010101000' });
        expect(r.status).toBe(200);
        expect((await m.db.query(`select org_id, rfc from clientes where id = '${r.body.id}'`)).rows).toEqual([{ org_id: A, rfc: 'XAXX010101000' }]);
        expect(m.audit).toHaveBeenCalledWith(A, expect.objectContaining({ accion: 'cliente.creado', actor: 'api:key-1', detalle: 'Nuevo (vía API)' }));
    });

    it('ids mal formados responden 404 sin error de base', async () => {
        expect((await clients.updateClient(ctxA, "x' or 1=1 --", { empresa: 'x' })).status).toBe(404);
        expect((await products.deleteProduct(ctxA, 'abc')).status).toBe(404);
        expect((await promises.createPromise(ctxA, { cotizacion_id: 'abc', fecha_promesa: '2026-10-02' })).status).toBe(404);
    });
});
