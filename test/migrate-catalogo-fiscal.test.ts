import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { extractStatements } from '../scripts/migrate-catalogo-fiscal.mjs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const statements = (sqlText: string) => sqlText
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('migración de despliegue del catálogo fiscal', () => {
    it('corre en el build ANTES de compilar, después de la de marca', () => {
        const build = JSON.parse(read('vercel.json')).buildCommand as string;
        const steps = build.split('&&').map((s) => s.trim());
        expect(steps).toEqual([
            'node scripts/migrate-brand-profile.mjs',
            'node scripts/migrate-catalogo-fiscal.mjs',
            'node scripts/migrate-tareas.mjs',
            'npm run build',
        ]);
    });

    it('cada sentencia es espejo literal de db/schema.sql', () => {
        const schema = squash(read('db/schema.sql'));
        const own = statements(read('db/catalogo-fiscal.sql'));
        expect(own.length).toBe(3);
        for (const s of own) expect(schema, s).toContain(squash(s));
    });

    it('extrae la función y la vista del schema en el orden en que se aplican', () => {
        const { fn, view } = extractStatements(read('db/schema.sql'));
        expect(fn).toMatch(/^create or replace function cord_term_days/);
        expect(fn.trim().endsWith('$$;')).toBe(true);
        expect(view).toMatch(/^create or replace view cuentas_por_cobrar as/);
        expect(view).toContain('cord_term_days(c.terminos)');
        expect(view.trim().endsWith(';')).toBe(true);
    });

    it('es idempotente y las restricciones rechazan claves con forma inválida', async () => {
        const db = new PGlite();
        try {
            await db.exec('create table productos (id serial primary key, nombre text not null)');
            const own = statements(read('db/catalogo-fiscal.sql'));
            for (let pass = 0; pass < 2; pass++) for (const s of own) await db.exec(s);
            const { fn } = extractStatements(read('db/schema.sql'));
            await db.exec(fn); await db.exec(fn);
            await db.exec(`insert into productos (nombre, tax_rate, clave_sat, clave_unidad_sat) values ('ok', 0.16, '81111500', 'HUR')`);
            await expect(db.exec(`insert into productos (nombre, clave_sat) values ('x', '8111')`)).rejects.toThrow();
            await expect(db.exec(`insert into productos (nombre, clave_unidad_sat) values ('x', 'hur')`)).rejects.toThrow();
            await expect(db.exec(`insert into productos (nombre, tax_rate) values ('x', 16)`)).rejects.toThrow();
        } finally {
            await db.close();
        }
    }, 30_000);
});
