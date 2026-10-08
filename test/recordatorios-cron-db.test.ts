import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// El cron de recordatorios contra Postgres real. Dos regresiones que tumbaban o
// duplicaban cobros:
//  1. `${origin}` sin declarar: el primer día que una cotización quedaba vencida,
//     el ReferenceError abortaba la corrida antes de la escalera de facturas.
//  2. El endpoint lo disparan dos relojes (vercel.json y cord-crons.yml): sin
//     dedup, el cliente recibía el mismo recordatorio dos veces el mismo día.

const m = vi.hoisted(() => ({
    db: null as any,
    sent: [] as { to: string; subject: string }[],
    notified: [] as { tipo: string; link: string }[],
    dispatched: [] as string[],
    invoiceReminders: [] as string[],
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
    // Real: la dedup del cron se apoya en el registro de auditoría.
    logAudit: async (orgId: string, e: { accion: string; entidad?: string; entidad_id?: string; detalle?: string }) => {
        await m.db.query('insert into audit_log (org_id, accion, entidad, entidad_id, detalle) values ($1, $2, $3, $4, $5)',
            [orgId, e.accion, e.entidad ?? null, e.entidad_id ?? null, e.detalle ?? null]);
    },
}));
vi.mock('../src/lib/cron-auth', () => ({ assertCronAuth: () => null }));
vi.mock('../src/lib/public-links', () => ({ publicDocumentUrl: async (_o: string, k: string, t: string) => `https://cordhq.app/${k}/${t}` }));
vi.mock('../src/lib/notify', () => ({
    notify: async (_orgId: string, tipo: string, data: { link: string }) => { m.notified.push({ tipo, link: data.link }); },
}));
vi.mock('../src/lib/webhooks', () => ({ dispatchInvoiceEvent: async (_o: string, id: string, ev: string) => { m.dispatched.push(`${ev}:${id}`); } }));
vi.mock('../src/lib/email', () => ({
    siteOrigin: () => 'https://cordhq.app',
    sendEmail: async (o: { to: string; subject: string }) => { m.sent.push({ to: o.to, subject: o.subject }); return { sent: true }; },
    notifyInvoiceReminder: async (_o: string, id: string) => { m.invoiceReminders.push(id); return true; },
}));

import { GET as cronRecordatorios } from '../src/pages/api/cron/recordatorios';

const ORG = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const CLI = '55555555-5555-4555-8555-555555555555';
const VENCIDA = '44444444-4444-4444-8444-444444444441';   // venció ayer
const POR_VENCER = '44444444-4444-4444-8444-444444444442'; // vence en 2 días
const FACTURA = '66666666-6666-4666-8666-666666666661';   // venció ayer

// Medianoche LOCAL de hoy ± días: el cron compara contra `setHours(0)` local.
const dia = (delta: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + delta); return d.toISOString(); };
const llamar = async () => {
    const res = await cronRecordatorios({ request: new Request('https://cordhq.app/api/cron/recordatorios') } as any);
    return { status: res.status, body: await res.json() };
};

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table orgs (id uuid primary key, nombre text, moneda text, color_marca text, logo_url text,
                           color_secundario text, brand_profile jsonb, portal_powered boolean default true,
                           sandbox_of uuid, owner_id uuid, recordatorio_etapas int[]);
        create function cord_effective_plan(uuid) returns text language sql as $$ select 'pro'::text $$;
        create table clientes (id uuid primary key, empresa text, email text);
        create table cotizaciones (id uuid primary key, org_id uuid, cliente_id uuid, folio text, total numeric,
                                   terminos text, public_token text, base_currency text, status text,
                                   es_recurrente boolean, approved_at timestamptz, created_at timestamptz default now());
        create table documentos_fiscales (id uuid primary key, org_id uuid, due_date date, cotizacion_id uuid,
                                          lifecycle text, amount_remaining numeric);
        create table documento_recordatorios (id uuid default gen_random_uuid() primary key, org_id uuid,
                                              documento_id uuid, etapa int, unique (documento_id, etapa));
        create table eventos (id uuid default gen_random_uuid() primary key, org_id uuid, documento_id uuid,
                              cotizacion_id uuid, tipo text, detalle text, created_at timestamptz default now());
        create table audit_log (id uuid default gen_random_uuid() primary key, org_id uuid, actor text, accion text,
                                entidad text, entidad_id text, detalle text, created_at timestamptz default now());
        insert into orgs (id, nombre, moneda, owner_id) values ('${ORG}', 'Materiales del Valle', 'MXN', '11111111-1111-4111-8111-111111111111');
        insert into clientes values ('${CLI}', 'Distribuidora El Zarco', 'pagos@elzarco.mx');
    `);
}, 30000);
afterAll(async () => { await m.db?.close(); });
beforeEach(async () => {
    await m.db.exec('delete from cotizaciones; delete from documentos_fiscales; delete from documento_recordatorios; delete from audit_log; delete from eventos;');
    // Contado: vence el mismo día de aprobada.
    await m.db.query(`insert into cotizaciones (id, org_id, cliente_id, folio, total, terminos, public_token, base_currency, status, approved_at)
        values ($1, $2, $3, 'COT-0148', 196469.20, 'contado', 'tokvencida', 'MXN', 'approved', $4),
               ($5, $2, $3, 'COT-0149', 48720.00, 'contado', 'tokporvencer', 'MXN', 'approved', $6)`,
        [VENCIDA, ORG, CLI, dia(-1), POR_VENCER, dia(2)]);
    await m.db.query(`insert into documentos_fiscales (id, org_id, due_date, lifecycle, amount_remaining)
        values ($1, $2, current_date - 1, 'open', 12400)`, [FACTURA, ORG]);
    m.sent = []; m.notified = []; m.dispatched = []; m.invoiceReminders = [];
});

describe('cron de recordatorios', () => {
    it('una cotización vencida ayer no aborta la corrida: avisa al dueño y sigue con las facturas', async () => {
        const { status, body } = await llamar();
        expect(status).toBe(200);
        expect(body).toMatchObject({ enviados: 1, candidatos: 1, vencidasHoy: 1 });
        expect(m.notified).toEqual([{ tipo: 'payment_overdue', link: 'https://cordhq.app/app/cobranza' }]);
        // La escalera de facturas sí corrió (antes el ReferenceError la cortaba).
        expect(m.dispatched).toEqual([`invoice.overdue:${FACTURA}`]);
        expect(m.invoiceReminders).toEqual([FACTURA]);
    });

    it('una segunda corrida el mismo día no repite recordatorio, aviso ni webhook', async () => {
        await llamar();
        const segunda = await llamar();
        expect(segunda.status).toBe(200);
        expect(segunda.body).toMatchObject({ enviados: 0, facturas: { enviados: 0, vencidasHoy: 0 } });
        expect(m.sent).toHaveLength(1);
        expect(m.notified).toHaveLength(1);
        expect(m.dispatched).toHaveLength(1);
        expect(m.invoiceReminders).toHaveLength(1);
    });

    it('la marca es del día: mañana el recordatorio vuelve a salir', async () => {
        await llamar();
        await m.db.exec("update audit_log set created_at = now() - interval '1 day'");
        await llamar();
        expect(m.sent).toHaveLength(2);
    });
});
