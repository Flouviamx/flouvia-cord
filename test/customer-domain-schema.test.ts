import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect } from 'vitest';
import { customerDomainStatements } from '../scripts/lib/customer-domain-migration.mjs';

describe('customer domain PostgreSQL contract', () => {
    it('enforces tenant RLS, uniqueness and narrow host discovery, and is repeatable', async () => {
        const db = new PGlite();
        const migration = readFileSync(new URL('../db/migrations/custom-domains.sql', import.meta.url), 'utf8');
        expect(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')).toContain(migration.trim());
        try {
            await db.exec(`create table orgs(id uuid primary key); create role cord_app nobypassrls;
                insert into orgs values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');`);
            for (const statement of customerDomainStatements(migration)) await db.exec(statement);
            await db.exec(migration);
            await db.exec(`insert into org_domains(org_id,hostname,verification_token,probe_secret) values
                ('00000000-0000-0000-0000-000000000001','quotes.a.com','a','a'),
                ('00000000-0000-0000-0000-000000000002','quotes.b.com','b','b');
                set role cord_app;`);
            expect((await db.query('select * from org_domains')).rows).toHaveLength(0);
            await db.exec("select set_config('app.org_id', '00000000-0000-0000-0000-000000000001', false)");
            const visible: any = (await db.query('select hostname from org_domains')).rows;
            expect(visible).toEqual([{ hostname: 'quotes.a.com' }]);
            const resolved = await db.query("select * from cord_resolve_customer_domain('quotes.b.com')");
            expect(resolved.rows).toEqual([{ org_id: '00000000-0000-0000-0000-000000000002' }]);
            expect((await db.query("select * from cord_resolve_customer_domain('QUOTES.b.com')")).rows).toHaveLength(0);
            await expect(db.exec("update org_domains set org_id = '00000000-0000-0000-0000-000000000002'")).rejects.toThrow();
            await expect(db.exec("insert into org_domains(org_id,hostname,verification_token,probe_secret) values ('00000000-0000-0000-0000-000000000001','quotes.c.com','c','c')")).rejects.toThrow();
            await db.exec("update org_domains set removing=true");
            expect((await db.query("select * from cord_resolve_customer_domain('quotes.a.com')")).rows).toHaveLength(0);
        } finally { await db.close(); }
    }, 15000); // Local WASM PostgreSQL initialization competes with the full suite.
});
