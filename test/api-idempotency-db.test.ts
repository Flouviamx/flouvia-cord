import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const m = vi.hoisted(() => ({ db: null as any, broken: false }));

vi.mock('../src/lib/db', () => ({
    sql: (s: TemplateStringsArray, ...values: any[]) => ({ text: s.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values }),
    withOrgTx: async (org: string, ...queries: any[]) => {
        if (m.broken) throw new Error('db caída');
        return m.db.transaction(async (tx: any) => {
            await tx.query("select set_config('app.org_id',$1,true)", [org]);
            const rows = [];
            for (const q of queries) rows.push((await tx.query(q.text, q.values)).rows);
            return rows;
        });
    },
}));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn() } }));

const { runIdempotent } = await import('../src/lib/api-idempotency');

const ORG = '00000000-0000-4000-8000-00000000000a';
const KEY_1 = '00000000-0000-4000-8000-0000000000a1';
const KEY_2 = '00000000-0000-4000-8000-0000000000b2';
const owner = { orgId: ORG, keyId: KEY_1 };
const migration = readFileSync(new URL('../db/migrations/2026-09-14-api-idempotency.sql', import.meta.url), 'utf8');

const req = (body: unknown, opts: { key?: string | null; method?: string; path?: string } = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.key !== null) headers['idempotency-key'] = opts.key ?? 'clave-1';
    const method = opts.method ?? 'POST';
    return new Request(`https://cord.test${opts.path ?? '/api/v1/clientes'}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body) });
};
const created = (id = 'c-1') => vi.fn(async () => new Response(JSON.stringify({ data: { id } }), { status: 200 }));

beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`create table orgs(id uuid primary key); create table api_keys(id uuid primary key);
        insert into orgs values ('${ORG}'); insert into api_keys values ('${KEY_1}'), ('${KEY_2}');`);
    await m.db.exec(migration);
    await m.db.exec(migration);
}, 15000);

beforeEach(async () => { m.broken = false; await m.db.exec('delete from api_idempotency'); });
afterAll(async () => { await m.db.close(); });

describe('Idempotency-Key', () => {
    it('sin la cabecera ejecuta siempre', async () => {
        const run = created();
        await runIdempotent(owner, req({ empresa: 'A' }, { key: null }), run);
        await runIdempotent(owner, req({ empresa: 'A' }, { key: null }), run);
        expect(run).toHaveBeenCalledTimes(2);
    });

    it('un reintento con la misma clave y cuerpo devuelve la respuesta guardada sin ejecutar', async () => {
        const run = created();
        const first = await runIdempotent(owner, req({ empresa: 'A' }), run);
        const second = await runIdempotent(owner, req({ empresa: 'A' }), run);
        expect(run).toHaveBeenCalledTimes(1);
        expect(second.status).toBe(first.status);
        expect(await second.json()).toEqual({ data: { id: 'c-1' } });
        expect(second.headers.get('Idempotent-Replayed')).toBe('true');
    });

    it('la misma clave con otro cuerpo, método o ruta responde 422', async () => {
        await runIdempotent(owner, req({ empresa: 'A' }), created());
        const run = created('otro');
        expect((await runIdempotent(owner, req({ empresa: 'B' }), run)).status).toBe(422);
        expect((await runIdempotent(owner, req({ empresa: 'A' }, { path: '/api/v1/productos' }), run)).status).toBe(422);
        expect((await runIdempotent(owner, req({ empresa: 'A' }, { method: 'DELETE' }), run)).status).toBe(422);
        expect(run).not.toHaveBeenCalled();
    });

    it('mientras la primera sigue en proceso, la segunda responde 409', async () => {
        let terminar!: () => void;
        const lenta = vi.fn(() => new Promise<Response>((resolve) => { terminar = () => resolve(new Response('{}', { status: 200 })); }));
        const primera = runIdempotent(owner, req({ empresa: 'A' }), lenta);
        await vi.waitFor(() => expect(lenta).toHaveBeenCalled());
        const segunda = await runIdempotent(owner, req({ empresa: 'A' }), created());
        expect(segunda.status).toBe(409);
        expect((await segunda.json()).code).toBe('idempotency_in_progress');
        terminar();
        expect((await primera).status).toBe(200);
    });

    it.each([500, 503, 429])('un %s libera la clave para reintentar', async (status) => {
        const falla = vi.fn(async () => new Response('{}', { status }));
        await runIdempotent(owner, req({ empresa: 'A' }), falla);
        const run = created();
        expect((await runIdempotent(owner, req({ empresa: 'A' }), run)).status).toBe(200);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('un error lanzado libera la clave y se propaga', async () => {
        await expect(runIdempotent(owner, req({ empresa: 'A' }), async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        const run = created();
        await runIdempotent(owner, req({ empresa: 'A' }), run);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('un 4xx de negocio sí se guarda: el reintento no vuelve a ejecutar', async () => {
        const invalido = vi.fn(async () => new Response(JSON.stringify({ error: 'x', code: 'invalid_request' }), { status: 400 }));
        await runIdempotent(owner, req({}), invalido);
        const again = await runIdempotent(owner, req({}), invalido);
        expect(again.status).toBe(400);
        expect(invalido).toHaveBeenCalledTimes(1);
    });

    it('la clave es por llave de API', async () => {
        const run = created();
        await runIdempotent(owner, req({ empresa: 'A' }), run);
        await runIdempotent({ orgId: ORG, keyId: KEY_2 }, req({ empresa: 'A' }), run);
        expect(run).toHaveBeenCalledTimes(2);
    });

    it('una clave de más de 24 horas vuelve a ejecutar', async () => {
        const run = created();
        await runIdempotent(owner, req({ empresa: 'A' }), run);
        await m.db.exec("update api_idempotency set created_at = now() - interval '25 hours'");
        await runIdempotent(owner, req({ empresa: 'A' }), run);
        expect(run).toHaveBeenCalledTimes(2);
    });

    it('una reserva abandonada por más de 10 minutos se puede retomar', async () => {
        await m.db.exec(`insert into api_idempotency (org_id, key_id, idempotency_key, method, path, request_hash, created_at)
            values ('${ORG}', '${KEY_1}', 'clave-1', 'POST', '/api/v1/clientes', '${'0'.repeat(64)}', now() - interval '11 minutes')`);
        const run = created();
        expect((await runIdempotent(owner, req({ empresa: 'A' }), run)).status).toBe(200);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('GET ignora la cabecera', async () => {
        const run = created();
        await runIdempotent(owner, req(null, { method: 'GET' }), run);
        await runIdempotent(owner, req(null, { method: 'GET' }), run);
        expect(run).toHaveBeenCalledTimes(2);
    });

    it.each(['', 'a'.repeat(256), 'con espacio', 'ñ'])('rechaza la clave inválida %j sin ejecutar', async (key) => {
        const run = created();
        expect((await runIdempotent(owner, req({}, { key }), run)).status).toBe(400);
        expect(run).not.toHaveBeenCalled();
    });

    it('si la base no responde falla cerrado sin ejecutar', async () => {
        m.broken = true;
        const run = created();
        const res = await runIdempotent(owner, req({ empresa: 'A' }), run);
        expect(res.status).toBe(503);
        expect(run).not.toHaveBeenCalled();
    });
});
