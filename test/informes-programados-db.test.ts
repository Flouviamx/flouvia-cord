// Envío programado de informes guardados: calendario en la zona del negocio,
// destinatario válido, sin duplicados y con reintento si el correo falla.
import { makeSchemaDb } from './helpers/schema-subset';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ db: null as any, sent: [] as any[], fail: false }));

type Frag = { strings: readonly string[]; values: unknown[] } | { raw: string };
function render(frag: Frag, values: unknown[]): string {
    if ('raw' in frag) return frag.raw;
    return frag.strings.reduce((text, part, i) => {
        if (i === 0) return part;
        const v = frag.values[i - 1];
        if (v && typeof v === 'object' && ('strings' in (v as any) || 'raw' in (v as any))) return text + render(v as Frag, values) + part;
        values.push(v instanceof Date ? v.toISOString() : v);
        return text + `$${values.length}` + part;
    }, '');
}
async function run(org: string | null, queries: Frag[]) {
    return m.db.transaction(async (tx: any) => {
        if (org) await tx.query("select set_config('app.org_id', $1, true)", [org]);
        else await tx.query("select set_config('app.scope', 'system', true)");
        const out = [];
        for (const q of queries) { const values: unknown[] = []; const text = render(q, values); out.push((await tx.query(text, values)).rows); }
        return out;
    });
}

vi.mock('../src/lib/db', async () => {
    const { currentOrgIdOverride } = await import('../src/lib/context');
    const sql: any = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values });
    sql.unsafe = (raw: string) => ({ raw });
    return {
        sql,
        getActiveOrgId: async () => currentOrgIdOverride(),
        withOrgTx: (org: string, ...queries: Frag[]) => run(org, queries),
        withSystemTx: (...queries: Frag[]) => run(null, queries),
        resolvePresentationContext: async () => {},
    };
});
vi.mock('../src/lib/cache', () => ({ cached: (_k: string, _t: number, fn: () => unknown) => fn(), invalidate: vi.fn() }));
vi.mock('../src/lib/email', () => ({
    siteOrigin: () => 'https://cord.test',
    sendEmail: async (opts: any) => { if (m.fail) return { sent: false }; m.sent.push(opts); return { sent: true }; },
}));

const P = await import('../src/lib/informes-programados');

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ANA = 'e1000000-0000-4000-8000-000000000001';
const LUIS = 'e2000000-0000-4000-8000-000000000002';

beforeAll(async () => {
    m.db = await makeSchemaDb(['orgs', 'users', 'clientes', 'productos', 'org_members', 'cotizaciones', 'cotizacion_items', 'cotizacion_suscripciones', 'cotizacion_cobros', 'documentos_fiscales', 'documento_pagos', 'informes_guardados']);
}, 60000);
afterAll(async () => { await m.db?.close(); });

beforeEach(async () => {
    m.sent = []; m.fail = false;
    await m.db.exec(`delete from orgs; delete from users; delete from org_members; delete from cotizaciones; delete from informes_guardados;`);
    await m.db.query(`insert into orgs(id, nombre, moneda, zona_horaria, country_code) values ($1, 'Lumen', 'MXN', 'America/Mexico_City', 'MX')`, [ORG]);
    await m.db.query(`insert into users(id, email) values ($1, 'ana@x.test'), ($2, 'luis@x.test')`, [ANA, LUIS]);
    await m.db.query(`insert into org_members(org_id, user_id, nombre, rol, estado, permisos) values ($1, $2, 'Ana', 'owner', 'activo', '{}'), ($1, $3, 'Luis', 'vendedor', 'activo', '{"analitica": false}')`, [ORG, ANA, LUIS]);
});

async function guardado(creadoPor: string, frecuencia: string, ultimo: string | null) {
    const { rows } = await m.db.query(`insert into informes_guardados(org_id, nombre, config, frecuencia, creado_por, ultimo_envio_at)
        values ($1, 'Ventas por cliente', '{"dim":"cliente","m":["cotizaciones","vendido"]}', $2, $3, $4) returning id`, [ORG, frecuencia, creadoPor, ultimo]);
    return rows[0].id as string;
}

describe('calendario', () => {
    it('semanal: el periodo es la semana anterior de lunes a domingo', () => {
        expect(P.periodStart('semanal', '2026-10-07')).toBe('2026-10-05'); // miércoles → lunes
        expect(P.periodStart('semanal', '2026-10-05')).toBe('2026-10-05');
        expect(P.periodStart('semanal', '2026-10-11')).toBe('2026-10-05'); // domingo
        expect(P.previousPeriod('semanal', '2026-10-07')).toEqual({ desde: '2026-09-28', hasta: '2026-10-04' });
    });
    it('mensual: el mes anterior completo', () => {
        expect(P.previousPeriod('mensual', '2026-10-01')).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
        expect(P.previousPeriod('mensual', '2026-03-15')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    });
    it('toca si el último envío es de antes del periodo en curso; una corrida perdida no se salta la semana', () => {
        expect(P.isDue('semanal', '2026-10-06', '2026-09-28')).toBe(true);
        expect(P.isDue('semanal', '2026-10-06', '2026-10-05')).toBe(false);
        expect(P.isDue('mensual', '2026-10-01', '2026-09-01')).toBe(true);
        expect(P.isDue('mensual', '2026-10-20', '2026-10-01')).toBe(false);
    });
});

describe('envío', () => {
    it('manda a quien lo guardó, con el CSV, y no lo repite en la misma corrida', async () => {
        await m.db.query(`insert into cotizaciones(org_id, folio, status, total, created_at, approved_at) values ($1, 'C-1', 'approved', 500, now() - interval '40 days', now() - interval '39 days')`, [ORG]);
        const id = await guardado(ANA, 'mensual', '2020-01-01T00:00:00Z');
        const r1 = await P.runInformesProgramados();
        expect(r1).toMatchObject({ candidatos: 1, enviados: 1 });
        expect(m.sent[0].to).toBe('ana@x.test');
        expect(m.sent[0].subject).toMatch(/^Ventas por cliente · /);
        expect(m.sent[0].attachments[0].filename).toMatch(/^cord-informe-\d{4}-\d{2}-01_\d{4}-\d{2}-\d{2}\.csv$/);
        expect(new TextDecoder().decode(m.sent[0].attachments[0].content)).toContain('Cliente,Cotizaciones,Vendido,Divisa');
        expect(m.sent[0].html).toContain(`guardado=${id}`);
        expect(m.sent[0].html).toContain('vs.');
        const r2 = await P.runInformesProgramados();
        expect(r2.enviados).toBe(0);
        expect(m.sent).toHaveLength(1);
    });

    it('no manda a quien perdió el permiso ni a quien dejó el equipo', async () => {
        await guardado(LUIS, 'semanal', '2020-01-01T00:00:00Z');
        const exAna = await guardado(ANA, 'semanal', '2020-01-01T00:00:00Z');
        await m.db.query(`update org_members set estado = 'revocado' where user_id = $1`, [ANA]);
        const r = await P.runInformesProgramados();
        expect(r).toMatchObject({ enviados: 0, omitidos: 2 });
        // El reloj no avanza: si recupera el acceso, el informe vuelve a salir.
        const { rows: [row] } = await m.db.query('select ultimo_envio_at from informes_guardados where id = $1', [exAna]);
        expect(new Date(row.ultimo_envio_at).getUTCFullYear()).toBe(2020);
    });

    it('si el correo falla, libera el reloj para reintentar', async () => {
        const id = await guardado(ANA, 'semanal', '2020-01-01T00:00:00Z');
        m.fail = true;
        expect((await P.runInformesProgramados()).errores).toBe(1);
        const { rows: [row] } = await m.db.query('select ultimo_envio_at from informes_guardados where id = $1', [id]);
        expect(new Date(row.ultimo_envio_at).getUTCFullYear()).toBe(2020);
        m.fail = false;
        expect((await P.runInformesProgramados()).enviados).toBe(1);
    });
});

describe('comparación del correo', () => {
    it('el mes anterior completo, no los mismos días hacia atrás', () => {
        expect(P.previousPeriod('mensual', '2026-09-01')).toEqual({ desde: '2026-08-01', hasta: '2026-08-31' });
        expect(P.previousPeriod('semanal', '2026-09-28')).toEqual({ desde: '2026-09-21', hasta: '2026-09-27' });
    });
});
