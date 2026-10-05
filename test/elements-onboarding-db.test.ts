import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const m = vi.hoisted(() => ({ db: null as any }));
vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: any[]) => ({ text: s.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: async (_org: string, ...queries: any[]) => {
        const rows = [];
        for (const q of queries) rows.push((await m.db.query(q.text, q.values)).rows);
        return rows;
    },
}));
const { getOnboarding } = await import('../src/lib/elements-onboarding');
const ORG = '00000000-0000-4000-8000-00000000000a';

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`
        create table orgs(id uuid primary key, sandbox_of uuid, embed_domains text);
        create table api_keys(id uuid primary key default gen_random_uuid(), org_id uuid, revoked_at timestamptz, oauth_client_id text);
        create table api_requests(id serial, org_id uuid, metodo text, ruta text, status int);
        create table webhooks(id uuid primary key default gen_random_uuid(), org_id uuid, activo boolean default true, cli_hasta timestamptz);
        create table webhook_events(id serial, org_id uuid, estado text);
        insert into orgs values ('${ORG}', null, '');`);
});

describe('onboarding de Elements', () => {
    it('empieza vacío', async () => {
        const r = await getOnboarding(ORG);
        expect(r.completo).toBe(false);
        expect(Object.values(r.steps).some(Boolean)).toBe(false);
    });

    it('cada paso sale de un dato real, y una sesión de cord listen no cuenta como webhook', async () => {
        await m.db.exec(`
            insert into api_keys(org_id, oauth_client_id) values ('${ORG}', 'zapier');
            insert into api_requests(org_id, metodo, ruta, status) values ('${ORG}', 'POST', '/v1/cotizaciones', 400);
            insert into webhooks(org_id, cli_hasta) values ('${ORG}', now() + interval '1 hour');`);
        let r = await getOnboarding(ORG);
        expect(r.steps).toMatchObject({ llave: false, peticion: false, cotizacion_api: false, webhook: false });

        await m.db.exec(`
            insert into api_keys(org_id) values ('${ORG}');
            update orgs set embed_domains = 'tienda.com';
            insert into api_requests(org_id, metodo, ruta, status) values ('${ORG}', 'POST', '/v1/cotizaciones', 200);
            insert into webhooks(org_id) values ('${ORG}');
            insert into webhook_events(org_id, estado) values ('${ORG}', 'succeeded');`);
        r = await getOnboarding(ORG);
        expect(r.completo).toBe(true);
    });
});
