import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const m = vi.hoisted(() => ({ db: null as any, audit: vi.fn(), event: vi.fn() }));

vi.mock('../src/lib/after', () => ({ after: (p: unknown) => p }));
vi.mock('../src/lib/webhooks', () => ({ dispatchEvent: m.event }));

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
            uso_cfdi text, cp_fiscal text, country_code text, direccion_line1 text, direccion_line2 text, ciudad text, region text, condicion_iva smallint,
            einvoice_address text, buyer_reference text, giro text, comuna text, dian jsonb);
        create table productos(id uuid primary key default gen_random_uuid(), org_id uuid not null, sku text, nombre text not null, unidad text,
            descripcion text, precio_lista numeric, costo numeric, activo boolean, precios_volumen jsonb, tax_rate numeric,
            clave_sat text, clave_unidad_sat text);
        create table cotizaciones(id uuid primary key, org_id uuid not null, base_currency text default 'MXN');
        create table orgs(id uuid primary key, iva_pct numeric, country_code text not null default 'MX');
        create table impuestos(id uuid primary key default gen_random_uuid(), org_id uuid not null, tasa numeric, kind text, tipo text,
            nombre text, es_default boolean, activo boolean, retencion_base text);
        create table tareas(id uuid primary key default gen_random_uuid(), org_id uuid not null, cotizacion_id uuid, titulo text, due_date date, done boolean default false,
            prioridad text not null default 'normal', notas text, asignado_a uuid, creado_por uuid, completed_at timestamptz, completed_by uuid, recordada_el date);
        create table promesas_pago(id uuid primary key default gen_random_uuid(), org_id uuid not null, cotizacion_id uuid, fecha_promesa date, monto numeric, nota text, estado text default 'pendiente');`);
});

beforeEach(async () => {
    vi.clearAllMocks();
    await m.db.exec(`
        delete from clientes; delete from productos; delete from cotizaciones; delete from tareas; delete from promesas_pago;
        delete from orgs; delete from impuestos;
        insert into orgs(id, iva_pct) values ('${A}', 16), ('${B}', 16);
        insert into impuestos(org_id, tasa, kind, nombre, es_default, activo) values
            ('${A}', 16, 'consumo', 'IVA 16%', true, true), ('${A}', 8, 'consumo', 'IVA 8%', false, true),
            ('${B}', 5, 'consumo', 'IVA 5%', true, true);
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

    it('un intento sobre registros ajenos no emite ningún evento', async () => {
        await clients.updateClient(ctxA, CLIENTE_B, { empresa: 'Robado' });
        await clients.deleteClient(ctxA, CLIENTE_B);
        await products.updateProduct(ctxA, PRODUCTO_B, { nombre: 'Robado' });
        await products.deleteProduct(ctxA, PRODUCTO_B);
        await tasks.setTaskDone(ctxA, TAREA_B, true);
        await tasks.createTask(ctxA, { titulo: 'x', cotizacion_id: COT_B });
        await promises.setPromiseState(ctxA, PROMESA_B, 'incumplida');
        await promises.createPromise(ctxA, { cotizacion_id: COT_B, fecha_promesa: '2026-10-02' });
        expect(m.event).not.toHaveBeenCalled();
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

describe('eventos del camino normal', () => {
    it('cliente: creado, actualizado y eliminado con el actor del contexto', async () => {
        const ctx = { ...ctxA, actor: 'api:key-1', source: 'api' as const };
        const r = await clients.createClient(ctx, { empresa: 'Nuevo', email: 'a@b.test' });
        await clients.updateClient(ctx, r.body.id as string, { empresa: 'Nuevo SA' });
        await clients.deleteClient(ctx, r.body.id as string);
        expect(m.event.mock.calls.map((c) => [c[1], c[3]])).toEqual([
            ['client.created', 'api:key-1'], ['client.updated', 'api:key-1'], ['client.deleted', 'api:key-1'],
        ]);
        expect(m.event.mock.calls[0][2]).toMatchObject({ id: r.body.id, object: 'client', empresa: 'Nuevo', email: 'a@b.test' });
        expect(m.event.mock.calls[1][2]).toMatchObject({ empresa: 'Nuevo SA' });
    });

    it('producto: el evento nunca incluye el costo', async () => {
        const r = await products.createProduct(ctxA, { nombre: 'Servicio', precio: 100, costo: 60 });
        await products.updateProduct(ctxA, r.body.id as string, { nombre: 'Servicio', precio: 120, costo: 70 });
        for (const call of m.event.mock.calls) {
            expect(call[2]).not.toHaveProperty('costo');
            expect(Object.values(call[2])).not.toContain(60);
            expect(Object.values(call[2])).not.toContain(70);
        }
        expect(m.event.mock.calls.map((c) => c[1])).toEqual(['product.created', 'product.updated']);
    });

    it('producto: el impuesto sugerido se valida contra el catálogo de SU organización', async () => {
        const ok = await products.createProduct(ctxA, { nombre: 'Frontera', precio: 10, tax_rate: 0.08 });
        expect(ok.status).toBe(200);
        const exento = await products.createProduct(ctxA, { nombre: 'Exento', precio: 10, tax_rate: 0 });
        expect(exento.status).toBe(200);
        // 5 % existe, pero en el catálogo de OTRA organización.
        const ajena = await products.createProduct(ctxA, { nombre: 'Ajena', precio: 10, tax_rate: 0.05 });
        expect(ajena.status).toBe(400);
        expect((await products.updateProduct(ctxA, ok.body.id as string, { nombre: 'Frontera', precio: 10, tax_rate: 'abc' })).status).toBe(400);
        const rows = (await m.db.query(`select nombre, tax_rate::float as tax_rate from productos where org_id = '${A}' order by nombre`)).rows;
        expect(rows).toEqual([{ nombre: 'Exento', tax_rate: 0 }, { nombre: 'Frontera', tax_rate: 0.08 }]);
    });

    it('producto: claves SAT con formato del catálogo, y lo que no viene no se borra', async () => {
        expect((await products.createProduct(ctxA, { nombre: 'Mala', precio: 1, clave_sat: '8111' })).status).toBe(400);
        expect((await products.createProduct(ctxA, { nombre: 'Mala', precio: 1, clave_unidad_sat: 'HORA' })).status).toBe(400);
        const ok = await products.createProduct(ctxA, {
            nombre: 'Consultoría', precio: 100, tax_rate: 0.08, clave_sat: '81111500', clave_unidad_sat: 'hur',
        });
        expect(ok.status).toBe(200);
        const id = ok.body.id as string;
        const read = async () => (await m.db.query(`select clave_sat, clave_unidad_sat, tax_rate::float as tax_rate from productos where id = '${id}'`)).rows[0];
        expect(await read()).toEqual({ clave_sat: '81111500', clave_unidad_sat: 'HUR', tax_rate: 0.08 });
        // Una pantalla que no muestra impuesto ni claves (otro país, una sola tasa) no las manda.
        expect((await products.updateProduct(ctxA, id, { nombre: 'Consultoría', precio: 120 })).status).toBe(200);
        expect(await read()).toEqual({ clave_sat: '81111500', clave_unidad_sat: 'HUR', tax_rate: 0.08 });
        // Mandarlas vacías sí las limpia.
        expect((await products.updateProduct(ctxA, id, { nombre: 'Consultoría', precio: 120, tax_rate: null, clave_sat: '', clave_unidad_sat: null })).status).toBe(200);
        expect(await read()).toEqual({ clave_sat: null, clave_unidad_sat: null, tax_rate: null });
    });

    it('tarea: completar dos veces emite task.completed una sola vez', async () => {
        const r = await tasks.createTask(ctxA, { titulo: 'Llamar' });
        await tasks.setTaskDone(ctxA, r.body.id as string, true);
        await tasks.setTaskDone(ctxA, r.body.id as string, true);
        expect(m.event.mock.calls.map((c) => c[1])).toEqual(['task.created', 'task.completed']);
    });

    it('promesa: cumplida e incumplida emiten su evento, pendiente no', async () => {
        await m.db.exec(`insert into cotizaciones(id, org_id) values ('00000000-0000-4000-8000-0000000000e9', '${A}')`);
        const r = await promises.createPromise(ctxA, { cotizacion_id: '00000000-0000-4000-8000-0000000000e9', fecha_promesa: '2026-10-02', monto: 500 });
        const id = r.body.id as string;
        await promises.setPromiseState(ctxA, id, 'cumplida');
        await promises.setPromiseState(ctxA, id, 'cumplida');
        await promises.setPromiseState(ctxA, id, 'pendiente');
        await promises.setPromiseState(ctxA, id, 'incumplida');
        expect(m.event.mock.calls.map((c) => c[1])).toEqual(['promise.created', 'promise.kept', 'promise.broken']);
        expect(m.event.mock.calls[0][2]).toMatchObject({ object: 'promise', fecha_promesa: '2026-10-02', monto: 500, moneda: 'MXN' });
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
