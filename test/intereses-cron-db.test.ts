import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { schemaFor } from './helpers/schema-subset';

// Cron de intereses moratorios contra Postgres real. Lo disparan dos relojes
// (vercel.json el día 1 y cord-crons.yml cualquier día posterior del mes): el
// cargo ya era idempotente por (documento, periodo), pero el resumen al dueño y
// el registro de auditoría contaban también los cargos que ya existían, así que
// una segunda corrida le volvía a mandar el mismo correo. Y una organización
// cuya cartera no se podía leer abortaba la corrida de todas las demás.
//
// La política jurídica tiene el interés apagado en todos los países; aquí se
// enciende para ejercer el camino que se encenderá cuando se apruebe.

const m = vi.hoisted(() => {
    process.env.RESEND_API_KEY = 're_prueba';
    return { db: null as any, correos: [] as { to: string; subject: string }[], auditoria: [] as string[], rota: '' };
});
const run = (queries: Array<{ text: string; values: unknown[] }>, orgId = '') => m.db.transaction(async (tx: any) => {
    if (orgId && orgId === m.rota) throw new Error('cartera ilegible');
    await tx.query("select set_config('app.org_id', $1, true)", [orgId]);
    const out = [];
    for (const q of queries) out.push((await tx.query(q.text, q.values)).rows);
    return out;
});
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: (orgId: string, ...queries: Array<{ text: string; values: unknown[] }>) => run(queries, orgId),
    // Sin tabla cron_runs en esta base: el reclamo falla abierto y lo que se
    // prueba es la idempotencia propia del cron.
    withSystemTx: (...queries: Array<{ text: string; values: unknown[] }>) => run(queries),
    logAudit: async (_orgId: string, e: { accion: string; detalle?: string }) => { m.auditoria.push(`${e.accion}:${e.detalle}`); },
}));
vi.mock('../src/lib/cron-auth', () => ({ assertCronAuth: () => null }));
vi.mock('../src/lib/late-interest-policy', () => ({ lateInterestPolicy: () => ({ enabled: true, maxMonthlyPct: 5 }) }));

import { GET as cronIntereses } from '../src/pages/api/cron/intereses';

const ORG = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const ROTA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTRA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FACTURA = '66666666-6666-4666-8666-666666666661';
const FACTURA_OTRA = '66666666-6666-4666-8666-666666666662';

const llamar = async () => {
    const res = await cronIntereses({ request: new Request('https://cordhq.app/api/cron/intereses') } as any);
    return { status: res.status, body: await res.json() };
};

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table orgs (id uuid primary key, nombre text, interes_moratorio_pct numeric, moneda text,
                           country_code text, sandbox_of uuid);
        create function cord_effective_plan(uuid) returns text language sql as $$ select 'scale'::text $$;
        create table org_members (org_id uuid, email text, rol text);
        create table clientes (id uuid primary key, empresa text);
        create table cotizaciones (id uuid primary key);
        create table documentos_fiscales (id uuid primary key);
        -- La vista real une los dos rieles; aquí basta su forma.
        create table cuentas_por_cobrar (org_id uuid, origen text, ref_id uuid, folio text, saldo numeric,
                                         dias_vencido int, cliente_id uuid);
    `);
    for (const stmt of schemaFor(['intereses_moratorios'])) await m.db.exec(stmt);
    await m.db.exec(`create unique index uq_intereses_documento on intereses_moratorios(documento_id, periodo) where documento_id is not null;`);
    await m.db.exec(`
        insert into orgs values
          ('${ORG}', 'Materiales del Valle', 3, 'MXN', 'MX', null),
          ('${ROTA}', 'Cartera rota', 3, 'MXN', 'MX', null),
          ('${OTRA}', 'Ferretería Norte', 2, 'MXN', 'MX', null);
        insert into org_members values ('${ORG}', 'dueno@valle.mx', 'owner'), ('${ROTA}', 'x@rota.mx', 'owner'), ('${OTRA}', 'dueno@norte.mx', 'owner');
        insert into documentos_fiscales values ('${FACTURA}'), ('${FACTURA_OTRA}');
        insert into cuentas_por_cobrar values
          ('${ORG}', 'factura', '${FACTURA}', 'F-0091', 12400, 12, null),
          ('${OTRA}', 'factura', '${FACTURA_OTRA}', 'F-0007', 5000, 40, null);
    `);
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
        const b = JSON.parse(init.body);
        m.correos.push({ to: b.to, subject: b.subject });
        return new Response('{}');
    }));
}, 30000);
afterAll(async () => { vi.unstubAllGlobals(); await m.db?.close(); });
beforeEach(async () => { await m.db.exec('delete from intereses_moratorios'); m.correos = []; m.auditoria = []; m.rota = ROTA; });

describe('cron de intereses', () => {
    it('una organización con la cartera ilegible no deja sin cargo a las demás', async () => {
        const { status, body } = await llamar();
        expect(status).toBe(200);
        expect(body).toMatchObject({ orgs: 2, cargos: 2, orgsFallidas: 1 });
        expect(m.correos.map((c) => c.to).sort()).toEqual(['dueno@norte.mx', 'dueno@valle.mx']);
    });

    it('una segunda corrida del mes no repite el resumen ni la auditoría', async () => {
        await llamar();
        const segunda = await llamar();
        expect(segunda.body).toMatchObject({ orgs: 0, cargos: 0 });
        expect(m.correos).toHaveLength(2);
        expect(m.auditoria).toHaveLength(2);
        const { rows } = await m.db.query('select count(*)::int as n from intereses_moratorios');
        expect(rows[0].n).toBe(2);
    });

    it('lo que la primera corrida no alcanzó, la segunda lo cobra una sola vez', async () => {
        await llamar();
        m.rota = '';
        await m.db.query(`insert into documentos_fiscales values ('66666666-6666-4666-8666-666666666663')`);
        await m.db.query(`insert into cuentas_por_cobrar values ($1, 'factura', '66666666-6666-4666-8666-666666666663', 'F-0001', 800, 5, null)`, [ROTA]);
        const segunda = await llamar();
        expect(segunda.body).toMatchObject({ orgs: 1, cargos: 1, orgsFallidas: 0 });
        expect(m.correos.map((c) => c.to)).toEqual(expect.arrayContaining(['x@rota.mx']));
        expect(m.correos).toHaveLength(3);
    });
});
