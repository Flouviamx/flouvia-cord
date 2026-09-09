import { it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
const m = vi.hoisted(() => ({ db: null as any }));
vi.mock('@neondatabase/serverless', () => ({ neon: () => {
    const query = (text: string, values: any[] = []) => ({ text, values, then: (resolve: any, reject: any) => m.db.query(text, values).then((r: any) => r.rows).then(resolve, reject) });
    const sql = Object.assign((parts: TemplateStringsArray, ...values: any[]) => query(parts.reduce((s, part, i) => s + (i ? `$${i}` : '') + part, ''), values), {
        query,
        transaction: async (queries: any[]) => {
            await m.db.exec('begin');
            try { const rows = []; for (const q of queries) rows.push((await m.db.query(q.text, q.values)).rows); await m.db.exec('commit'); return rows; }
            catch (error) { await m.db.exec('rollback'); throw error; }
        },
    });
    return sql;
} }));

it('runs the complete migration runner atomically, including comments and verification', async () => {
    m.db = new PGlite();
    const argv = process.argv;
    vi.stubEnv('DATABASE_URL', 'postgres://fixture');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
        await m.db.exec(`create table orgs(id uuid primary key);
          create table documentos_fiscales(id uuid primary key,org_id uuid,credit_note_of uuid,status text,lifecycle text,currency text);`);
        process.argv = [...argv, '--apply'];
        await import('../scripts/migrate-invoice-reconciliation.mjs');
        expect((await m.db.query("select relforcerowsecurity from pg_class where relname='documento_reembolsos'")).rows[0].relforcerowsecurity).toBe(true);
        expect((await m.db.query("select count(*)::int n from information_schema.columns where table_name='documentos_fiscales' and column_name in ('amount_credited','amount_refunded','refund_due')")).rows[0].n).toBe(3);
    } finally { process.argv = argv; log.mockRestore(); vi.unstubAllEnvs(); await m.db.close(); }
}, 15000);
