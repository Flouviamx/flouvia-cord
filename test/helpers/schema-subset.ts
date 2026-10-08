// Esquema de prueba sacado de db/schema.sql (no escrito a mano): los `create table`
// y `add column` reales de las tablas pedidas, con sus TIPOS reales. Un esquema a
// mano escondió un `text = uuid` (cotizaciones.creado_por es text) que tumbó un
// informe en producción con 500.
//
// Se quitan las llaves foráneas (para no arrastrar el resto del esquema) y se
// conservan tipos, defaults y checks.
import { readFileSync } from 'node:fs';

const SCHEMA = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8');

function stripRefs(sql: string) {
    return sql
        .replace(/\s+references\s+\w+\s*\([^)]*\)(\s+on\s+delete\s+(cascade|set null|restrict|no action))?(\s+on\s+update\s+\w+)?/gi, '')
        .replace(/,\s*unique\s*\([^)]*\)/gi, '');
}

/** Bloque `create table` completo (con paréntesis balanceados) de una tabla. */
function createBlock(table: string): string {
    const re = new RegExp(`create table (if not exists )?${table}\\s*\\(`, 'i');
    const m = re.exec(SCHEMA);
    if (!m) throw new Error(`schema-subset: no encontré create table ${table}`);
    let depth = 0, i = m.index + m[0].length - 1;
    for (; i < SCHEMA.length; i++) {
        if (SCHEMA[i] === '(') depth++;
        else if (SCHEMA[i] === ')') { depth--; if (depth === 0) break; }
    }
    return SCHEMA.slice(m.index, i + 1).replace(/--[^\n]*/g, '');
}

function addColumns(table: string): string[] {
    const re = new RegExp(`alter table ${table}\\s+add column if not exists [^;]+;`, 'gi');
    return [...SCHEMA.matchAll(re)].map((m) => m[0].replace(/--[^\n]*/g, ''));
}

/** `alter column ... drop/set not null` posteriores: sin ellos una columna que el
 *  esquema ya relajó (documentos_fiscales.cotizacion_id) seguiría siendo obligatoria. */
function nullability(table: string): string[] {
    const re = new RegExp(`alter table ${table}\\s+alter column \\w+ (drop|set) not null;`, 'gi');
    return [...SCHEMA.matchAll(re)].map((m) => m[0]);
}

export function schemaFor(tables: string[]): string[] {
    const out: string[] = [];
    for (const t of tables) {
        out.push(stripRefs(createBlock(t)).replace(/create table (if not exists )?/i, 'create table if not exists ') + ';');
        out.push(...addColumns(t).map(stripRefs));
        out.push(...nullability(t));
    }
    return out;
}

/**
 * Vista `cuentas_por_cobrar` tal cual está en el esquema, precedida de
 * `cord_term_days()`, que la vista usa para el vencimiento.
 */
export function cuentasPorCobrarView(): string {
    const fn = /create or replace function cord_term_days[\s\S]*?\$\$;/.exec(SCHEMA)?.[0] ?? '';
    const start = SCHEMA.indexOf('create or replace view cuentas_por_cobrar as');
    const end = SCHEMA.indexOf(';', SCHEMA.indexOf('where d2.cotizacion_id = c.id', start)) + 1;
    return `${fn}\n${SCHEMA.slice(start, end)}`;
}

/** PGlite con pgcrypto y las tablas pedidas; falla en voz alta si una sentencia no aplica. */
export async function makeSchemaDb(tables: string[], extra: string[] = []) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
    const db = new PGlite({ extensions: { pgcrypto } });
    await db.exec('create extension if not exists pgcrypto;');
    for (const stmt of [...schemaFor(tables), ...extra]) {
        try { await db.exec(stmt); } catch (e) { throw new Error(`schema-subset: ${(e as Error).message}\n${stmt.slice(0, 200)}`); }
    }
    return db;
}
