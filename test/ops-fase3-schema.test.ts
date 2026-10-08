import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect } from 'vitest';

// Las notas y etiquetas internas de Ops sobre una organización son de Cord: el
// carril de la propia organización no las ve, y Ops no las reescribe.
const ORG_A = '00000000-0000-0000-0000-00000000000a';
const ORG_B = '00000000-0000-0000-0000-00000000000b';

describe('Cord Ops fase 3 — contrato PostgreSQL', () => {
    it('solo el carril de Ops lee y escribe notas y etiquetas, y la migración se repite', async () => {
        const db = new PGlite();
        const migration = readFileSync(new URL('../db/migrations/2026-10-08-ops-fase3.sql', import.meta.url), 'utf8');
        expect(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')).toContain(migration.trim());
        try {
            await db.exec(`create role cord_app nobypassrls;
                create table orgs(id uuid primary key);
                create table ops_operators(user_id uuid primary key);
                create table cobro_reembolsos(id uuid primary key default gen_random_uuid(), org_id uuid not null);
                create table cobro_disputas(id uuid primary key default gen_random_uuid(), org_id uuid not null);
                create table webhook_events(id uuid primary key default gen_random_uuid(), org_id uuid not null);
                create table suscripcion_facturas(id uuid primary key default gen_random_uuid(), org_id uuid not null);
                insert into orgs values ('${ORG_A}'), ('${ORG_B}');
                insert into cobro_disputas(org_id) values ('${ORG_A}');`);
            await db.exec(migration);
            await db.exec(migration); // corre en cada build: debe ser repetible
            await db.exec(`alter table cobro_disputas enable row level security;
                alter table cobro_disputas force row level security;
                grant select, insert, update, delete on all tables in schema public to cord_app;
                set role cord_app;`);

            // Sin carril declarado no se ve nada.
            expect((await db.query('select * from ops_org_notes')).rows).toHaveLength(0);
            await expect(db.exec(`insert into ops_org_notes(org_id, author_email, body) values ('${ORG_A}', 'x@cord', 'hola')`)).rejects.toThrow();

            await db.exec("select set_config('app.scope', 'ops', false)");
            await db.exec(`insert into ops_org_notes(org_id, author_email, body) values ('${ORG_A}', 'ops@cord', 'Cliente estratégico')`);
            await db.exec(`insert into ops_org_tags(org_id, tag, created_by) values ('${ORG_A}', 'vip', 'ops@cord')`);
            expect((await db.query('select body from ops_org_notes')).rows).toEqual([{ body: 'Cliente estratégico' }]);
            expect((await db.query('select count(*)::int n from cobro_disputas')).rows).toEqual([{ n: 1 }]);
            // Ops no reescribe una nota: se borra y se escribe otra, y ambas cosas se auditan.
            const updated = await db.query("update ops_org_notes set body = 'otra cosa' returning id");
            expect(updated.rows).toHaveLength(0);
            await expect(db.exec(`insert into ops_org_tags(org_id, tag, created_by) values ('${ORG_A}', 'Con Mayúsculas', 'ops@cord')`)).rejects.toThrow();
            await expect(db.exec(`insert into ops_org_notes(org_id, author_email, body) values ('${ORG_A}', 'ops@cord', '   ')`)).rejects.toThrow();

            // El carril de la organización no ve lo que Cord anota de ella.
            await db.exec("select set_config('app.scope', '', false)");
            await db.exec(`select set_config('app.org_id', '${ORG_A}', false)`);
            expect((await db.query('select * from ops_org_notes')).rows).toHaveLength(0);
            expect((await db.query('select * from ops_org_tags')).rows).toHaveLength(0);
            const deleted = await db.query('delete from ops_org_notes returning id');
            expect(deleted.rows).toHaveLength(0);
        } finally { await db.close(); }
    }, 15000);
});
