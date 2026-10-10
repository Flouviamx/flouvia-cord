import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// El cron de recordatorios contra Postgres real (PGlite):
//  · cada cuenta recibe sus correos en SU idioma y con SU zona horaria, sin que
//    una contagie a la siguiente del barrido;
//  · el calendario, el interruptor y la pausa por cliente son del negocio;
//  · una etapa ya enviada no se repite, tampoco después de cambiar el calendario;
//  · dos disparos el mismo día no duplican avisos ni el webhook de vencida.

const m = vi.hoisted(() => ({
    db: null as any,
    facturas: [] as { orgId: string; id: string; momento: string; locale: string; zona?: string }[],
    cotizaciones: [] as { orgId: string; id: string; vence: string; saldo: number; locale: string }[],
    notificados: [] as { orgId: string; tipo: string }[],
    webhooks: [] as string[],
    fallaFactura: false,
}));
const run = (queries: Array<{ text: string; values: unknown[] }>, orgId = '') => m.db.transaction(async (tx: any) => {
    await tx.query("select set_config('app.org_id', $1, true)", [orgId]);
    const out = [];
    for (const q of queries) out.push((await tx.query(q.text, q.values)).rows);
    return out;
});
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: unknown[]) => ({ text: s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: (orgId: string, ...queries: Array<{ text: string; values: unknown[] }>) => run(queries, orgId),
    withSystemTx: (...queries: Array<{ text: string; values: unknown[] }>) => run(queries),
    logAudit: async (orgId: string, e: { accion: string; entidad?: string; entidad_id?: string; detalle?: string }) => {
        await m.db.query('insert into audit_log (org_id, accion, entidad, entidad_id, detalle) values ($1, $2, $3, $4, $5)',
            [orgId, e.accion, e.entidad ?? null, e.entidad_id ?? null, e.detalle ?? null]);
    },
}));
vi.mock('../src/lib/cron-auth', () => ({ assertCronAuth: () => null }));
vi.mock('../src/lib/notify', () => ({ notify: async (orgId: string, tipo: string) => { m.notificados.push({ orgId, tipo }); } }));
vi.mock('../src/lib/webhooks', () => ({ dispatchInvoiceEvent: async (_o: string, id: string, ev: string) => { m.webhooks.push(`${ev}:${id}`); } }));
vi.mock('../src/lib/email', async () => {
    const ctx = await import('../src/lib/context');
    return {
        siteOrigin: () => 'https://cordhq.app',
        // Lo que importa es el contexto CON EL QUE se llama al correo: el idioma
        // y la zona de la organización dueña del documento.
        notifyInvoiceReminder: async (orgId: string, id: string, momento: string) => {
            if (m.fallaFactura) throw new Error('proveedor caído');
            m.facturas.push({ orgId, id, momento, locale: ctx.currentLocale(), zona: ctx.currentTimeZone() });
            return true;
        },
        notifyQuoteReminder: async (orgId: string, id: string, opts: { saldo: number; vence: string }) => {
            m.cotizaciones.push({ orgId, id, vence: opts.vence, saldo: opts.saldo, locale: ctx.currentLocale() });
            return { sent: true, to: 'pagos@cliente.test' };
        },
    };
});

import { GET as cron } from '../src/pages/api/cron/recordatorios';
import { localClock } from '../src/lib/task-reminders';
import { addDays } from '../src/lib/tasks';

const MX = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const US = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLI_MX = '55555555-5555-4555-8555-555555555551';
const CLI_US = '55555555-5555-4555-8555-555555555552';
const FAC_MX = '66666666-6666-4666-8666-666666666661';
const FAC_US = '66666666-6666-4666-8666-666666666662';
const COT_MX = '44444444-4444-4444-8444-444444444441';

// Las dos organizaciones en UTC para que "hoy" sea el mismo día en la prueba;
// la zona propia se prueba aparte.
const hoy = () => localClock('UTC').day;
const llamar = async () => {
    const res = await cron({ request: new Request('https://cordhq.app/api/cron/recordatorios') } as any);
    return { status: res.status, body: await res.json() };
};
const factura = (id: string, org: string, cliente: string, dias: number) => m.db.query(
    `insert into documentos_fiscales (id, org_id, cliente_id, due_date, lifecycle, amount_remaining) values ($1, $2, $3, $4, 'open', 1000)`,
    [id, org, cliente, addDays(hoy(), -dias)]);

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table orgs (id uuid primary key, nombre text, moneda text, idioma text, zona_horaria text, country_code text,
                           sandbox_of uuid, owner_id uuid,
                           recordatorio_etapas int[] not null default '{-7,-1,3,7,14,30}',
                           recordatorios_activos boolean not null default true);
        create table clientes (id uuid primary key, org_id uuid, empresa text, email text);
        create table cotizaciones (id uuid primary key, org_id uuid, cliente_id uuid, folio text, total numeric,
                                   terminos text, base_currency text, status text, es_recurrente boolean, paid_at timestamptz,
                                   approved_at timestamptz, created_at timestamptz default now());
        create table cotizacion_cobros (id uuid default gen_random_uuid() primary key, org_id uuid, cotizacion_id uuid, monto numeric, status text);
        create table documentos_fiscales (id uuid primary key, org_id uuid, due_date date, cotizacion_id uuid, cliente_id uuid,
                                          lifecycle text, amount_remaining numeric);
        create table documento_recordatorios (id uuid default gen_random_uuid() primary key, org_id uuid,
                                              documento_id uuid, etapa int, unique (documento_id, etapa));
        create table eventos (id uuid default gen_random_uuid() primary key, org_id uuid, documento_id uuid,
                              tipo text, detalle text, created_at timestamptz default now());
        create table audit_log (id uuid default gen_random_uuid() primary key, org_id uuid, accion text,
                                entidad text, entidad_id text, detalle text, created_at timestamptz default now());
        create table cobranza_exclusiones (id uuid default gen_random_uuid() primary key, org_id uuid, cliente_id uuid,
                                           cotizacion_id uuid, documento_id uuid);
        insert into orgs (id, nombre, moneda, idioma, zona_horaria, country_code, owner_id) values
            ('${MX}', 'Materiales del Valle', 'MXN', 'es-MX', 'UTC', 'MX', '11111111-1111-4111-8111-111111111111'),
            ('${US}', 'Lone Star Supply', 'USD', 'en-US', 'UTC', 'US', '11111111-1111-4111-8111-111111111112');
        insert into clientes values ('${CLI_MX}', '${MX}', 'Distribuidora El Zarco', 'pagos@elzarco.mx'),
                                    ('${CLI_US}', '${US}', 'Austin Builders', 'ap@austinbuilders.test');
    `);
}, 30000);
afterAll(async () => { await m.db?.close(); });
beforeEach(async () => {
    await m.db.exec(`delete from cotizaciones; delete from cotizacion_cobros; delete from documentos_fiscales;
        delete from documento_recordatorios; delete from audit_log; delete from eventos; delete from cobranza_exclusiones;
        update orgs set recordatorio_etapas = '{-7,-1,3,7,14,30}', recordatorios_activos = true, zona_horaria = 'UTC';`);
    m.facturas = []; m.cotizaciones = []; m.notificados = []; m.webhooks = []; m.fallaFactura = false;
});

describe('cron de recordatorios: idioma y zona de cada cuenta', () => {
    it('cada organización recibe sus correos en su idioma, sin contagiar a la siguiente', async () => {
        await factura(FAC_MX, MX, CLI_MX, 3);
        await factura(FAC_US, US, CLI_US, 3);
        const { status } = await llamar();
        expect(status).toBe(200);
        const porOrg = Object.fromEntries(m.facturas.map((f) => [f.orgId, f.locale]));
        expect(porOrg).toEqual({ [MX]: 'es', [US]: 'en' });
        expect(m.facturas.every((f) => f.momento === 'vencida')).toBe(true);
    });

    it('los días se cuentan con el día civil del negocio, no el del servidor', async () => {
        // Kiritimati va 14 horas adelante de UTC: buena parte del día ya es
        // "mañana" ahí. El vencimiento se fija contra SU calendario.
        await m.db.query(`update orgs set zona_horaria = 'Pacific/Kiritimati' where id = $1`, [MX]);
        const manana = localClock('Pacific/Kiritimati').day;
        await m.db.query(`insert into documentos_fiscales (id, org_id, cliente_id, due_date, lifecycle, amount_remaining)
            values ($1, $2, $3, $4, 'open', 1000)`, [FAC_MX, MX, CLI_MX, addDays(manana, 7)]);
        await llamar();
        // Para el negocio la factura vence en 7 días EXACTOS de SU calendario.
        expect(m.facturas).toEqual([expect.objectContaining({ id: FAC_MX, momento: 'antes', zona: 'Pacific/Kiritimati' })]);
        const [r] = (await m.db.query('select etapa from documento_recordatorios')).rows;
        expect(r.etapa).toBe(-7);
    });

    it('el aviso de cotización sale en el idioma de la cuenta, una vez aunque el cron corra dos veces', async () => {
        await m.db.query(`insert into cotizaciones (id, org_id, cliente_id, folio, total, terminos, base_currency, status, approved_at)
            values ($1, $2, $3, 'COT-0149', 48720, 'contado', 'MXN', 'approved', $4)`, [COT_MX, MX, CLI_MX, `${addDays(hoy(), 3)}T12:00:00Z`]);
        await m.db.query(`insert into cotizacion_cobros (org_id, cotizacion_id, monto, status) values ($1, $2, 8720, 'pagado')`, [MX, COT_MX]);
        await llamar();
        await llamar();
        expect(m.cotizaciones).toEqual([{ orgId: MX, id: COT_MX, vence: addDays(hoy(), 3), saldo: 40000, locale: 'es' }]);
    });
});

describe('cron de recordatorios: el calendario del negocio', () => {
    it('sin tocar nada, la escalera es la de siempre', async () => {
        await factura(FAC_MX, MX, CLI_MX, -7);   // vence en 7 días
        await factura(FAC_US, US, CLI_US, -8);   // vence en 8: todavía no alcanza ninguna etapa
        await llamar();
        expect(m.facturas.map((f) => f.id)).toEqual([FAC_MX]);
        const ev = (await m.db.query('select detalle from eventos')).rows;
        expect(ev).toEqual([{ detalle: 'Aviso de vencimiento (7 días antes)' }]);
    });

    it('honra un calendario propio, incluido el día del vencimiento', async () => {
        await m.db.query(`update orgs set recordatorio_etapas = '{-3,0,60}' where id = $1`, [US]);
        await factura(FAC_US, US, CLI_US, -3);
        await llamar();
        expect(m.facturas).toEqual([expect.objectContaining({ id: FAC_US, momento: 'antes' })]);
        await m.db.query(`update documentos_fiscales set due_date = $1 where id = $2`, [hoy(), FAC_US]);
        await llamar();
        expect(m.facturas.map((f) => f.momento)).toEqual(['antes', 'hoy']);
        expect((await m.db.query('select etapa from documento_recordatorios order by etapa')).rows.map((r: any) => r.etapa)).toEqual([-3, 0]);
        expect((await m.db.query(`select detalle from eventos order by created_at`)).rows.at(-1).detalle).toBe('Aviso de vencimiento (vence hoy)');
    });

    it('cambiar el calendario no repite una etapa ni manda una atrasada', async () => {
        await factura(FAC_MX, MX, CLI_MX, 4);
        await m.db.query(`insert into documento_recordatorios (org_id, documento_id, etapa) values ($1, $2, -7), ($1, $2, -1), ($1, $2, 3)`, [MX, FAC_MX]);
        // El negocio agrega "1 día después" y quita los demás: el 1 quedó ATRÁS del 3 ya enviado.
        await m.db.query(`update orgs set recordatorio_etapas = '{1,3}' where id = $1`, [MX]);
        await llamar();
        await llamar();
        expect(m.facturas).toEqual([]);
        // Y una etapa nueva posterior sí sale cuando llega, una sola vez.
        await m.db.query(`update orgs set recordatorio_etapas = '{1,3,7}' where id = $1`, [MX]);
        await m.db.query(`update documentos_fiscales set due_date = $1 where id = $2`, [addDays(hoy(), -7), FAC_MX]);
        await llamar();
        await llamar();
        expect(m.facturas.map((f) => f.id)).toEqual([FAC_MX]);
    });

    it('apagados: el cliente no recibe nada, pero el webhook de vencida sí sale una vez', async () => {
        await m.db.query(`update orgs set recordatorios_activos = false where id = $1`, [MX]);
        await factura(FAC_MX, MX, CLI_MX, 1);
        const { body } = await llamar();
        await llamar();
        expect(m.facturas).toEqual([]);
        expect(body.apagados).toBe(1);
        expect(m.webhooks).toEqual([`invoice.overdue:${FAC_MX}`]);
        // Sin etapa registrada: si se vuelven a encender, la factura no quedó "consumida".
        expect((await m.db.query('select count(*)::int as n from documento_recordatorios')).rows[0].n).toBe(0);
    });

    it('un cliente en pausa ("No escribir a") no recibe recordatorios; al reanudar, sí', async () => {
        await factura(FAC_MX, MX, CLI_MX, 3);
        await m.db.query(`insert into cobranza_exclusiones (org_id, cliente_id) values ($1, $2)`, [MX, CLI_MX]);
        const { body } = await llamar();
        expect(m.facturas).toEqual([]);
        expect(body.pausados).toBe(1);
        await m.db.query('delete from cobranza_exclusiones');
        await llamar();
        expect(m.facturas.map((f) => f.id)).toEqual([FAC_MX]);
    });

    it('si el correo truena, la etapa se libera para reintentarse', async () => {
        await factura(FAC_MX, MX, CLI_MX, 3);
        m.fallaFactura = true;
        const { body } = await llamar();
        expect(body.fallidos).toBe(1);
        expect((await m.db.query('select count(*)::int as n from documento_recordatorios')).rows[0].n).toBe(0);
        m.fallaFactura = false;
        await llamar();
        expect(m.facturas.map((f) => f.id)).toEqual([FAC_MX]);
    });
});
