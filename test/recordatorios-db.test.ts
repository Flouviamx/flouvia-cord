import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// src/lib/recordatorios-db.ts contra Postgres real: el interruptor y el
// calendario se guardan sin pisar lo que no viene, y la pausa por cliente es la
// fila del cliente en `cobranza_exclusiones` (la lista "No escribir a").

const m = vi.hoisted(() => ({ db: null as any }));
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: (_orgId: string, ...queries: Array<{ text: string; values: unknown[] }>) => m.db.transaction(async (tx: any) => {
        const out = [];
        for (const q of queries) out.push((await tx.query(q.text, q.values)).rows);
        return out;
    }),
}));

const { estadoRecordatoriosCliente, guardarAjustesRecordatorios, leerAjustesRecordatorios, pausarCliente } = await import('../src/lib/recordatorios-db');

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLI = '55555555-5555-4555-8555-555555555551';
const AJENO = '55555555-5555-4555-8555-555555555552';

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table orgs (id uuid primary key, recordatorio_etapas int[] not null default '{-7,-1,3,7,14,30}',
                           recordatorios_activos boolean not null default true);
        create table clientes (id uuid primary key, org_id uuid, empresa text);
        create table cobranza_exclusiones (id uuid default gen_random_uuid() primary key, org_id uuid, cliente_id uuid,
                                           cotizacion_id uuid, documento_id uuid, motivo text, created_by uuid,
                                           created_at timestamptz default now());
        create unique index uq_cobranza_excl_cliente on cobranza_exclusiones(org_id, cliente_id) where cliente_id is not null;
        insert into orgs (id) values ('${ORG}'), ('${OTRA}');
        insert into clientes values ('${CLI}', '${ORG}', 'Distribuidora El Zarco'), ('${AJENO}', '${OTRA}', 'Ajeno');
    `);
}, 30000);
afterAll(async () => { await m.db?.close(); });

describe('ajustes de recordatorios en la base', () => {
    it('una cuenta nueva lee el calendario de siempre, encendido', async () => {
        expect(await leerAjustesRecordatorios(ORG)).toEqual({ activos: true, etapas: [-7, -1, 3, 7, 14, 30], pausados: [] });
    });

    it('guarda solo lo que viene', async () => {
        await guardarAjustesRecordatorios(ORG, { etapas: [-14, 0, 60] });
        expect(await leerAjustesRecordatorios(ORG)).toMatchObject({ activos: true, etapas: [-14, 0, 60] });
        await guardarAjustesRecordatorios(ORG, { activos: false });
        expect(await leerAjustesRecordatorios(ORG)).toMatchObject({ activos: false, etapas: [-14, 0, 60] });
        // La otra organización no se toca.
        expect(await leerAjustesRecordatorios(OTRA)).toMatchObject({ activos: true, etapas: [-7, -1, 3, 7, 14, 30] });
    });

    it('pausa y reanuda al cliente en la lista "No escribir a", una sola fila', async () => {
        expect(await pausarCliente(ORG, CLI, true, null)).toBe(true);
        expect(await pausarCliente(ORG, CLI, true, null)).toBe(true);
        expect((await m.db.query('select count(*)::int as n from cobranza_exclusiones')).rows[0].n).toBe(1);
        expect(await estadoRecordatoriosCliente(ORG, CLI)).toEqual({ pausado: true, cuentaActiva: false });
        expect((await leerAjustesRecordatorios(ORG)).pausados).toEqual([expect.objectContaining({ clienteId: CLI, empresa: 'Distribuidora El Zarco' })]);
        expect(await pausarCliente(ORG, CLI, false, null)).toBe(true);
        expect(await estadoRecordatoriosCliente(ORG, CLI)).toMatchObject({ pausado: false });
    });

    it('no pausa a un cliente de otra organización', async () => {
        expect(await pausarCliente(ORG, AJENO, true, null)).toBe(false);
        expect((await m.db.query('select count(*)::int as n from cobranza_exclusiones')).rows[0].n).toBe(0);
    });
});
