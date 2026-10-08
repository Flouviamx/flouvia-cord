// Cupones contra Postgres real (PGlite): la sección "Descuentos de documento y
// cupones" de db/schema.sql tal cual, con un rol sin privilegios para que la
// RLS se aplique de verdad. Se prueba lo que no puede fallar: la redención es
// atómica, respeta los dos topes, una factura que nace de una cotización no
// cuenta dos veces, anular devuelve el uso y otra organización no ve nada.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { evaluarCupon, hoyEnZona, validarCuponInput, type Cupon } from '../src/lib/cupones';
import { descuentoDesdeJson, etiquetaDescuento, leerDescuentoBody, normalizarCodigo } from '../src/lib/descuentos';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const CLI1 = '00000000-0000-4000-8000-0000000000c1';
const CLI2 = '00000000-0000-4000-8000-0000000000c2';
const COT = '00000000-0000-4000-8000-0000000000d1';
const DOC1 = '00000000-0000-4000-8000-0000000000e1';
const DOC2 = '00000000-0000-4000-8000-0000000000e2';
const DOC3 = '00000000-0000-4000-8000-0000000000e3';
const CUPON = '00000000-0000-4000-8000-0000000000f1';

function seccion(): string {
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    const inicio = schema.indexOf('-- ── Descuentos de documento y cupones (oct 2026)');
    const fin = schema.indexOf('-- END descuentos');
    expect(inicio).toBeGreaterThan(0);
    return schema.slice(inicio, fin);
}

let db: PGlite;

async function como(org: string, query: string, params: unknown[] = []) {
    await db.exec(`reset role; set role app_test;`);
    await db.query(`select set_config('app.org_id', $1, false)`, [org]);
    try {
        return (await db.query<any>(query, params as any[])).rows;
    } finally {
        await db.exec('reset role;');
    }
}
const redimir = (org: string, cliente: string | null, cot: string | null, doc: string | null) =>
    como(org, `select cord_cupon_redimir($1, $2, $3, $4, $5, 100, 'MXN') as r`, [org, CUPON, cliente, cot, doc]).then((r) => r[0].r as string);
const liberar = (org: string, cot: string | null, doc: string | null) =>
    como(org, `select cord_cupon_liberar($1, $2, $3) as n`, [org, cot, doc]).then((r) => Number(r[0].n));
const usos = async () => Number((await db.query<{ usos: number }>(`select usos from cupones where id = '${CUPON}'`)).rows[0].usos);

beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
        create table users (id uuid primary key);
        create table orgs (id uuid primary key);
        create table clientes (id uuid primary key, org_id uuid not null references orgs(id));
        create table cotizaciones (id uuid primary key, org_id uuid not null references orgs(id), descuento numeric not null default 0);
        create table documentos_fiscales (id uuid primary key, org_id uuid not null references orgs(id));
        create table documento_recurrencias (id uuid primary key, org_id uuid not null references orgs(id));
        insert into orgs values ('${A}'), ('${B}');
        insert into clientes values ('${CLI1}', '${A}'), ('${CLI2}', '${A}');
        insert into cotizaciones (id, org_id) values ('${COT}', '${A}');
        insert into documentos_fiscales values ('${DOC1}', '${A}'), ('${DOC2}', '${A}'), ('${DOC3}', '${A}');
    `);
    await db.exec(seccion());
    await db.exec(`
        create role app_test nologin;
        grant select, insert, update, delete on cupones, cupon_redenciones to app_test;
        grant execute on function cord_cupon_redimir(uuid, uuid, uuid, uuid, uuid, numeric, text) to app_test;
        grant execute on function cord_cupon_liberar(uuid, uuid, uuid) to app_test;
    `);
}, 30_000);

afterAll(async () => { await db?.close(); });

beforeEach(async () => {
    await db.exec(`reset role; delete from cupon_redenciones; delete from cupones;
        insert into cupones (id, org_id, codigo, tipo, valor, max_usos, max_usos_por_cliente)
        values ('${CUPON}', '${A}', 'BIENVENIDA10', 'porcentaje', 10, 2, 1);`);
});

describe('cord_cupon_redimir', () => {
    it('cuenta un uso por documento y es idempotente al reintentar', async () => {
        expect(await redimir(A, CLI1, null, DOC1)).toBe('ok');
        expect(await redimir(A, CLI1, null, DOC1)).toBe('ok');
        expect(await usos()).toBe(1);
    });

    it('respeta el tope por cliente y el tope global', async () => {
        expect(await redimir(A, CLI1, null, DOC1)).toBe('ok');
        expect(await redimir(A, CLI1, null, DOC2)).toBe('agotado_cliente');
        expect(await redimir(A, CLI2, null, DOC2)).toBe('ok');
        expect(await redimir(A, null, null, DOC3)).toBe('agotado');
        expect(await usos()).toBe(2);
    });

    it('la factura de una cotización reusa la redención de la cotización', async () => {
        expect(await redimir(A, CLI1, COT, null)).toBe('ok');
        expect(await redimir(A, CLI1, COT, DOC1)).toBe('ok');
        expect(await usos()).toBe(1);
        const filas = await como(A, `select cotizacion_id, documento_id from cupon_redenciones`);
        expect(filas).toEqual([{ cotizacion_id: COT, documento_id: DOC1 }]);
    });

    it('anular devuelve el uso; liberar dos veces no descuenta de más', async () => {
        await redimir(A, CLI1, null, DOC1);
        expect(await liberar(A, null, DOC1)).toBe(1);
        expect(await liberar(A, null, DOC1)).toBe(0);
        expect(await usos()).toBe(0);
        expect(await redimir(A, CLI1, null, DOC2)).toBe('ok');
    });

    it('otra organización no ve el cupón ni sus redenciones', async () => {
        expect(await redimir(B, CLI1, null, DOC1)).toBe('no_existe');
        await redimir(A, CLI1, null, DOC1);
        expect(await como(B, `select * from cupones`)).toEqual([]);
        expect(await como(B, `select * from cupon_redenciones`)).toEqual([]);
        expect(await liberar(B, null, DOC1)).toBe(0);
        expect(await usos()).toBe(1);
    });

    it('el código es único por organización y tiene forma cerrada', async () => {
        await expect(db.exec(`insert into cupones (org_id, codigo, tipo, valor) values ('${A}', 'BIENVENIDA10', 'porcentaje', 5)`)).rejects.toThrow();
        await expect(db.exec(`insert into cupones (org_id, codigo, tipo, valor) values ('${A}', 'minusculas', 'porcentaje', 5)`)).rejects.toThrow();
        await expect(db.exec(`insert into cupones (org_id, codigo, tipo, valor) values ('${A}', 'SINMONEDA', 'monto', 5)`)).rejects.toThrow();
        await expect(db.exec(`insert into cupones (org_id, codigo, tipo, valor) values ('${A}', 'DEMASIADO', 'porcentaje', 101)`)).rejects.toThrow();
        await db.exec(`insert into cupones (org_id, codigo, tipo, valor) values ('${B}', 'BIENVENIDA10', 'porcentaje', 5)`);
    });
});

const cupon = (over: Partial<Cupon> = {}): Cupon => ({
    id: CUPON, codigo: 'BIENVENIDA10', nombre: null, tipo: 'porcentaje', valor: 10, moneda: null,
    vigente_desde: null, vigente_hasta: null, max_usos: null, max_usos_por_cliente: null, usos: 0, activo: true, ...over,
});
const ctx = { moneda: 'MXN', clienteId: CLI1, hoy: '2026-10-08', usosCliente: 0, yaRedimido: false };

describe('evaluarCupon (aplicar)', () => {
    it('vigencia inclusiva en el día civil de la organización', () => {
        expect(evaluarCupon(cupon({ vigente_desde: '2026-10-08', vigente_hasta: '2026-10-08' }), ctx)).toEqual({ ok: true });
        expect(evaluarCupon(cupon({ vigente_desde: '2026-10-09' }), ctx)).toEqual({ ok: false, motivo: 'aun_no_vigente' });
        expect(evaluarCupon(cupon({ vigente_hasta: '2026-10-07' }), ctx)).toEqual({ ok: false, motivo: 'vencido' });
        // 23:30 del 7 en Ciudad de México ya es el 8 en UTC: manda la zona del negocio.
        expect(hoyEnZona('America/Mexico_City', new Date('2026-10-08T05:30:00Z'))).toBe('2026-10-07');
        expect(hoyEnZona('Asia/Tokyo', new Date('2026-10-08T05:30:00Z'))).toBe('2026-10-08');
    });

    it('un cupón de monto solo aplica en su divisa; uno de porcentaje en cualquiera', () => {
        expect(evaluarCupon(cupon({ tipo: 'monto', valor: 100, moneda: 'USD' }), ctx)).toEqual({ ok: false, motivo: 'moneda' });
        expect(evaluarCupon(cupon({ tipo: 'monto', valor: 100, moneda: 'MXN' }), ctx)).toEqual({ ok: true });
        expect(evaluarCupon(cupon(), { ...ctx, moneda: 'EUR' })).toEqual({ ok: true });
    });

    it('topes: global, por cliente y sin cliente', () => {
        expect(evaluarCupon(cupon({ max_usos: 3, usos: 3 }), ctx)).toEqual({ ok: false, motivo: 'agotado' });
        expect(evaluarCupon(cupon({ max_usos_por_cliente: 1 }), { ...ctx, usosCliente: 1 })).toEqual({ ok: false, motivo: 'agotado_cliente' });
        expect(evaluarCupon(cupon({ max_usos_por_cliente: 1 }), { ...ctx, clienteId: null })).toEqual({ ok: false, motivo: 'requiere_cliente' });
        // El documento ya tiene su uso (reintento de emisión): no compite por otro.
        expect(evaluarCupon(cupon({ max_usos: 3, usos: 3 }), { ...ctx, yaRedimido: true })).toEqual({ ok: true });
    });

    it('desactivado o inexistente', () => {
        expect(evaluarCupon(cupon({ activo: false }), ctx)).toEqual({ ok: false, motivo: 'inactivo' });
        expect(evaluarCupon(null, ctx)).toEqual({ ok: false, motivo: 'no_existe' });
    });
});

describe('contrato del body y de la definición', () => {
    it('sin llaves se conserva; null o 0 quita; el cupón se normaliza', () => {
        expect(leerDescuentoBody({ items: [] })).toEqual({ presente: false });
        expect(leerDescuentoBody({ descuento: null })).toEqual({ presente: true, solicitud: { manual: null, cupon: null } });
        expect(leerDescuentoBody({ descuento: { tipo: 'porcentaje', valor: 0 } })).toEqual({ presente: true, solicitud: { manual: null, cupon: null } });
        expect(leerDescuentoBody({ cupon: ' bienvenida10 ' })).toEqual({ presente: true, solicitud: { manual: null, cupon: 'BIENVENIDA10' } });
        expect(leerDescuentoBody({ descuento: { tipo: 'monto', valor: 50 } })).toEqual({ presente: true, solicitud: { manual: { tipo: 'monto', valor: 50 }, cupon: null } });
    });

    it('rechaza lo que no es un descuento', () => {
        for (const body of [
            { descuento: { tipo: 'porcentaje', valor: 120 } },
            { descuento: { tipo: 'monto', valor: -5 } },
            { descuento: { tipo: 'regalo', valor: 5 } },
            { descuento: 'diez' },
            { cupon: 'a b' },
        ]) expect('error' in leerDescuentoBody(body), JSON.stringify(body)).toBe(true);
    });

    it('una definición guardada se relee sin aceptar basura', () => {
        expect(descuentoDesdeJson({ tipo: 'porcentaje', valor: '10', codigo: 'promo', cupon_id: CUPON })).toEqual({ tipo: 'porcentaje', valor: 10, codigo: 'PROMO', cupon_id: CUPON });
        expect(descuentoDesdeJson({ tipo: 'porcentaje', valor: 0 })).toBeNull();
        expect(descuentoDesdeJson(null)).toBeNull();
        expect(normalizarCodigo('ab')).toBeNull();
    });

    it('etiqueta en los dos idiomas', () => {
        expect(etiquetaDescuento({ tipo: 'porcentaje', valor: 10, codigo: 'PROMO' }, 'es')).toBe('Descuento (PROMO)');
        expect(etiquetaDescuento({ tipo: 'porcentaje', valor: 12.5 }, 'es')).toBe('Descuento (12.5 %)');
        expect(etiquetaDescuento({ tipo: 'porcentaje', valor: 10 }, 'en')).toBe('Discount (10%)');
        expect(etiquetaDescuento({ tipo: 'monto', valor: 10 }, 'en')).toBe('Discount');
    });
});

describe('validarCuponInput (Ajustes)', () => {
    it('normaliza y exige divisa para un monto', () => {
        const ok = validarCuponInput({ codigo: 'promo-1', tipo: 'monto', valor: 99.999, moneda: 'mxn', max_usos: '10' }, ['MXN', 'USD']);
        expect(ok).toEqual({ ok: true, value: expect.objectContaining({ codigo: 'PROMO-1', valor: 100, moneda: 'MXN', max_usos: 10, max_usos_por_cliente: null }) });
        expect(validarCuponInput({ codigo: 'PROMO', tipo: 'monto', valor: 10 }, ['MXN']).ok).toBe(false);
        expect(validarCuponInput({ codigo: 'PROMO', tipo: 'monto', valor: 10, moneda: 'JPY' }, ['MXN']).ok).toBe(false);
        expect(validarCuponInput({ codigo: 'PROMO', tipo: 'monto', valor: 1000.4, moneda: 'JPY' }, ['JPY'])).toEqual({ ok: true, value: expect.objectContaining({ valor: 1000 }) });
    });

    it('rechaza vigencias invertidas, topes no enteros y porcentajes imposibles', () => {
        expect(validarCuponInput({ codigo: 'PROMO', tipo: 'porcentaje', valor: 10, vigente_desde: '2026-10-10', vigente_hasta: '2026-10-01' }, []).ok).toBe(false);
        expect(validarCuponInput({ codigo: 'PROMO', tipo: 'porcentaje', valor: 10, max_usos: 1.5 }, []).ok).toBe(false);
        expect(validarCuponInput({ codigo: 'PROMO', tipo: 'porcentaje', valor: 150 }, []).ok).toBe(false);
        expect(validarCuponInput({ codigo: 'PROMO', tipo: 'porcentaje', valor: 10, moneda: 'USD' }, ['USD'])).toEqual({ ok: true, value: expect.objectContaining({ moneda: null }) });
    });
});
