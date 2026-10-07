import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { databaseSearchColumns, formatDatabaseValue, isProtectedDatabaseValue } from '../src/lib/ops-database';

// Columnas reales del schema: `create table` + `alter table ... add column`.
// Leerlas del archivo, y no de una lista a mano, es lo que impide que una
// columna nueva nazca visible en el explorador de Ops sin que nadie lo note.
function schemaColumns(): Array<{ table: string; column: string; type: string }> {
    const schema = readFileSync('db/schema.sql', 'utf8');
    const out: Array<{ table: string; column: string; type: string }> = [];
    const create = /create table (?:if not exists )?([a-z_]+)\s*\(([\s\S]*?)\n\);/g;
    for (const m of schema.matchAll(create)) {
        for (const line of m[2].split('\n')) {
            const col = line.match(/^\s+([a-z_][a-z0-9_]*)\s+([a-z]+)/);
            if (col && !['primary', 'unique', 'constraint', 'check', 'foreign'].includes(col[1])) {
                out.push({ table: m[1], column: col[1], type: col[2] });
            }
        }
    }
    const alter = /alter table ([a-z_]+) add column if not exists ([a-z_][a-z0-9_]*)\s+([a-z]+)/g;
    for (const m of schema.matchAll(alter)) out.push({ table: m[1], column: m[2], type: m[3] });
    return out;
}

const COLUMNS = schemaColumns();

describe('explorador de base de Ops — redacción', () => {
    it('lee suficientes columnas del schema para que la prueba signifique algo', () => {
        expect(COLUMNS.length).toBeGreaterThan(500);
    });

    it('toda columna con forma de credencial queda redactada', () => {
        const credential = /(_enc|_hash|password|secret|token|webhook_url|totp|nonce)$|^(code|user_code|public_key|hash)$/;
        const visibles = COLUMNS
            .filter(({ column }) => credential.test(column))
            .filter(({ table, column, type }) => !isProtectedDatabaseValue(table, column, type))
            .map(({ table, column }) => `${table}.${column}`);
        expect(visibles).toEqual([]);
    });

    it('cubre los hallazgos concretos de la auditoría de oct 2026', () => {
        const casos: Array<[string, string, string?]> = [
            ['orgs', 'slack_webhook_url'],
            ['orgs', 'teams_webhook_url'],
            ['orgs', 'facturapi_live_key_enc'],
            ['orgs', 'teams_graph_access_enc'],
            ['orgs', 'teams_graph_refresh_enc'],
            ['oauth_grants', 'refresh_hash'],
            ['oauth_grants', 'refresh_prev_hash'],
            ['oauth_codes', 'code_hash'],
            ['oauth_entregas', 'code'],
            ['cli_logins', 'user_code'],
            ['cli_logins', 'device_hash'],
            ['cli_logins', 'secret_enc'],
            ['rate_limit_counters', 'id'],
            ['domain_events', 'data', 'jsonb'],
            ['legal_acceptances', 'evidence', 'jsonb'],
            ['ops_passkeys', 'public_key'],
        ];
        for (const [table, column, type] of casos) {
            expect(isProtectedDatabaseValue(table, column, type), `${table}.${column}`).toBe(true);
        }
    });

    it('un jsonb o bytea se oculta salvo la lista corta de configuración', () => {
        expect(isProtectedDatabaseValue('workflows', 'config', 'jsonb')).toBe(true);
        expect(isProtectedDatabaseValue('anything', 'blob', 'bytea')).toBe(true);
        expect(isProtectedDatabaseValue('ops_audit_log', 'metadata', 'jsonb')).toBe(false);
    });

    it('no oculta lo que Ops necesita para operar', () => {
        for (const [table, column] of [['orgs', 'nombre'], ['users', 'email'], ['cotizaciones', 'status'], ['api_keys', 'prefix'], ['payouts', 'failure_code']]) {
            expect(isProtectedDatabaseValue(table, column, 'text'), `${table}.${column}`).toBe(false);
        }
    });

    it('formatea lo redactado sin filtrar el valor', () => {
        expect(formatDatabaseValue('orgs', 'slack_webhook_url', 'https://hooks.slack.com/services/T/B/x')).toEqual({ text: 'Protegido', redacted: true });
        expect(formatDatabaseValue('domain_events', 'data', { email: 'a@b.c' }, 'jsonb').redacted).toBe(true);
    });

    it('el buscador nunca consulta una columna redactada', () => {
        const cols = [
            { column_name: 'id', data_type: 'uuid' },
            { column_name: 'token_hash', data_type: 'text' },
            { column_name: 'data', data_type: 'jsonb' },
            { column_name: 'email', data_type: 'text' },
        ];
        const nombres = databaseSearchColumns('cualquiera', cols).map((c) => c.column_name);
        expect(nombres).not.toContain('token_hash');
        expect(nombres).not.toContain('data');
    });
});
