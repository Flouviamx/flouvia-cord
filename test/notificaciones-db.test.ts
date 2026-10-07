import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// La campana de la topbar: solo acciones del cliente o pagos, cotizaciones y
// facturas juntas, y `eventos.actor` decidido por Postgres con el contexto de la
// sesión. Corre la sección REAL de db/schema.sql para probar la migración.

const m = vi.hoisted(() => ({ db: null as any, userId: '' }));
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: (orgId: string, ...queries: Array<{ text: string; values: unknown[] }>) => m.db.transaction(async (tx: any) => {
        await tx.query("select set_config('app.user_id', $1, true)", [m.userId]);
        await tx.query("select set_config('app.org_id', $1, true)", [orgId]);
        const out = [];
        for (const q of queries) out.push((await tx.query(q.text, q.values)).rows);
        return out;
    }),
}));

import { countNotificacionesSinLeer, listNotificaciones, notifSeenFrom } from '../src/lib/notificaciones';

const ORG = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const OTRA = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const COT = '11111111-1111-4111-8111-111111111111';
const FAC = '22222222-2222-4222-8222-222222222222';
const CLI = '33333333-3333-4333-8333-333333333333';

const insertEvento = (userId: string, org: string, tipo: string, ref: { cot?: string; fac?: string }, detalle = '', at = 'now()') => {
    m.userId = userId;
    return m.db.transaction(async (tx: any) => {
        await tx.query("select set_config('app.user_id', $1, true)", [userId]);
        await tx.query(`insert into eventos (org_id, cotizacion_id, documento_id, tipo, detalle, created_at) values ($1, $2, $3, $4, $5, ${at})`,
            [org, ref.cot ?? null, ref.fac ?? null, tipo, detalle]);
    });
};
const tipos = async () => (await listNotificaciones(ORG)).map((n) => `${n.origen}:${n.tipo}`);

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table clientes (id uuid primary key, empresa text);
        create table cotizaciones (id uuid primary key, org_id uuid, folio text, cliente_id uuid);
        create table documentos_fiscales (id uuid primary key, org_id uuid, invoice_number text, cliente_id uuid);
        create table eventos (
            id uuid default gen_random_uuid() primary key, org_id uuid not null,
            cotizacion_id uuid references cotizaciones(id), documento_id uuid references documentos_fiscales(id),
            tipo text not null, detalle text, created_at timestamptz default now());
        insert into clientes values ('${CLI}', 'Acme');
        insert into cotizaciones values ('${COT}', '${ORG}', 'C-1', '${CLI}');
        insert into documentos_fiscales values ('${FAC}', '${ORG}', 'F-9', '${CLI}');
    `);
}, 30000);
afterAll(async () => { await m.db?.close(); });

describe('campana antes de la migración (sin columna actor)', () => {
    it('solo cuenta lo que inequívocamente es del cliente o del pago', async () => {
        await insertEvento('u-vendedor', ORG, 'sent', { cot: COT }, 'Cotización enviada', "now() - interval '5 min'");
        await insertEvento('u-vendedor', ORG, 'comment', { cot: COT }, 'Borrador actualizado', "now() - interval '4 min'");
        await insertEvento('u-vendedor', ORG, 'approved', { cot: COT }, 'Marcada como aprobada', "now() - interval '3 min'");
        await insertEvento('', ORG, 'viewed', { cot: COT }, 'Abierta por el cliente', "now() - interval '2 min'");
        await insertEvento('', ORG, 'payment', { fac: FAC }, 'Abono', "now() - interval '1 min'");
        expect(await tipos()).toEqual(['factura:payment', 'cotizacion:viewed']);
    });
});

describe('migración de db/schema.sql', () => {
    it('agrega la columna sin reescribir el historial', async () => {
        const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
        const start = schema.indexOf('-- ── Autor de cada evento');
        const end = schema.indexOf('-- ── fin autor de eventos ──');
        expect(start).toBeGreaterThan(0);
        expect(end).toBeGreaterThan(start);
        await m.db.exec(schema.slice(start, end));
        await m.db.exec(schema.slice(start, end)); // re-ejecutable, como scripts/migrate.mjs
        const { rows } = await m.db.query('select count(*)::int as n from eventos where actor is not null');
        expect(rows[0].n).toBe(0);
    });

    it('el DEFAULT distingue sesión de vendedor y externo', async () => {
        await insertEvento('u-vendedor', ORG, 'approved', { cot: COT }, 'Marcada como aprobada a mano');
        await insertEvento('', ORG, 'approved', { cot: COT }, 'Aprobada desde el link');
        const { rows } = await m.db.query("select actor, detalle from eventos where tipo = 'approved' and actor is not null order by created_at");
        expect(rows.map((r: any) => r.actor)).toEqual(['vendedor', 'externo']);
    });
});

describe('campana después de la migración', () => {
    it('muestra lo externo de cotizaciones y facturas, nunca lo del vendedor', async () => {
        await insertEvento('u-vendedor', ORG, 'comment', { cot: COT }, 'Versión 2 creada', "now() + interval '1 min'");
        await insertEvento('', ORG, 'comment', { cot: COT }, '¿Pueden mejorar el precio?', "now() + interval '2 min'");
        await insertEvento('', ORG, 'paid', { fac: FAC }, 'Saldo liquidado', "now() + interval '3 min'");
        await insertEvento('', ORG, 'reminder', { fac: FAC }, 'Recordatorio enviado', "now() + interval '4 min'");
        await insertEvento('', OTRA, 'viewed', { cot: COT }, 'Otra organización', "now() + interval '5 min'");
        const lista = await listNotificaciones(ORG);
        expect(lista.map((n) => `${n.origen}:${n.tipo}`).slice(0, 3)).toEqual(['factura:paid', 'cotizacion:comment', 'cotizacion:approved']);
        expect(lista.find((n) => n.detalle === 'Versión 2 creada')).toBeUndefined();
        expect(lista.find((n) => n.tipo === 'reminder')).toBeUndefined();
        expect(lista.find((n) => n.detalle === 'Otra organización')).toBeUndefined();
        expect(lista[0]).toMatchObject({ folio: 'F-9', cliente: 'Acme', ref_id: FAC });
    });

    it('el contador respeta "visto hasta" y su tope', async () => {
        const total = await countNotificacionesSinLeer(ORG, 0);
        expect(total).toBe(5); // 2 históricos (viewed, payment) + 3 externos (approved, comment, paid)
        expect(await countNotificacionesSinLeer(ORG, 0, 3)).toBe(3);
        expect(await countNotificacionesSinLeer(ORG, Date.now() + 10 * 60_000)).toBe(0);
        expect(await countNotificacionesSinLeer(ORG, Date.now() + 90_000)).toBe(2);
    });

    it('"visto hasta" ignora valores inválidos', () => {
        expect(notifSeenFrom({ seen: 123 })).toBe(123);
        expect(notifSeenFrom({ seen: 'x' })).toBe(0);
        expect(notifSeenFrom(undefined)).toBe(0);
        expect(notifSeenFrom({ seen: -5 })).toBe(0);
    });
});
