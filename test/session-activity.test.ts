import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ db: null as any }));
vi.mock('../src/lib/db', () => ({ sql: async (s: TemplateStringsArray, ...values: any[]) => {
    const text = s.reduce((out, part, i) => out + (i ? `$${i}` : '') + part, '');
    return (await m.db.query(text, values)).rows;
} }));
import { authorizeSessionActivity, sha256Hex, validateSession } from '../src/lib/auth';
const TOKEN = 'fixture-session-token', HASH = sha256Hex(TOKEN);
beforeAll(async () => {
    m.db = new PGlite();
    await m.db.exec(`create table users(id text primary key, suspended_at timestamptz);
        create table sessions(id text primary key, user_id text, expires_at timestamptz, absolute_expires_at timestamptz,
            revoked_at timestamptz, last_used_at timestamptz);
        insert into users values ('user-a', null);`);
}, 15000);
afterAll(async () => { await m.db.close(); });
beforeEach(async () => {
    await m.db.exec('delete from sessions; update users set suspended_at=null');
    await m.db.query(`insert into sessions values ($1,'user-a',now()+interval '20 days',now()+interval '90 days',null,now()-interval '20 minutes')`, [HASH]);
});
const row = async () => (await m.db.query('select * from sessions')).rows[0];
describe('sesiones: leer no equivale a renovar', () => {
    it('consultar la misma cookie conserva la actividad y la expiración anteriores', async () => {
        const before = await row();
        expect(await validateSession(TOKEN)).toMatchObject({ userId: 'user-a', slid: false });
        await validateSession(TOKEN);
        expect(await row()).toEqual(before);
        expect(await authorizeSessionActivity(HASH, 'user-a', 15)).toBeNull();
        expect(await row()).toBeUndefined();
    });
    it('la primera petición después del límite no puede renovar la sesión', async () => {
        expect(await authorizeSessionActivity(HASH, 'user-a', 15)).toBeNull();
        expect(await authorizeSessionActivity(HASH, 'user-a', 15)).toBeNull();
        expect(await row()).toBeUndefined();
    });
    it('peticiones concurrentes no resucitan una sesión vencida', async () => {
        expect(await Promise.all([authorizeSessionActivity(HASH, 'user-a', 15), authorizeSessionActivity(HASH, 'user-a', 15)])).toEqual([null, null]);
        expect(await row()).toBeUndefined();
    });
    it('renueva una sesión activa y su cookie cuando toca deslizar la expiración', async () => {
        expect(await authorizeSessionActivity(HASH, 'user-a', 30)).toEqual({ slid: true });
        const saved = await row();
        expect(Date.now() - new Date(saved.last_used_at).getTime()).toBeLessThan(2000);
        expect(new Date(saved.expires_at).getTime()).toBeGreaterThan(Date.now() + 29 * 86400000);
    });
    it('registra cada petición válida sin renovar la cookie en cada una', async () => {
        await authorizeSessionActivity(HASH, 'user-a', 30);
        await m.db.exec("update sessions set last_used_at=now()-interval '1 minute'");
        const old = await row();
        expect(await authorizeSessionActivity(HASH, 'user-a', 30)).toEqual({ slid: false });
        const current = await row();
        expect(new Date(current.last_used_at).getTime()).toBeGreaterThan(new Date(old.last_used_at).getTime());
        expect(current.expires_at).toEqual(old.expires_at);
    });
    it('un timeout cero conserva el límite absoluto de la sesión', async () => {
        await m.db.exec("update sessions set absolute_expires_at=now()+interval '2 days',expires_at=now()+interval '1 day'");
        expect(await authorizeSessionActivity(HASH, 'user-a', 0)).toEqual({ slid: true });
        const current = await row(); expect(current.expires_at).toEqual(current.absolute_expires_at);
    });
    it.each(["revoked_at=now()", "expires_at=now()-interval '1 second'", "absolute_expires_at=now()-interval '1 second'"])(
        'revisa también %s al renovar', async update => {
            await m.db.exec(`update sessions set ${update}`);
            expect(await authorizeSessionActivity(HASH, 'user-a', 0)).toBeNull();
            expect(await row()).toBeUndefined();
        },
    );
    it('rechaza una suspensión ocurrida después de leer la cookie', async () => {
        expect(await validateSession(TOKEN)).not.toBeNull();
        await m.db.exec('update users set suspended_at=now()');
        expect(await authorizeSessionActivity(HASH, 'user-a', 0)).toBeNull();
    });
    it('otro usuario no puede renovar ni borrar la sesión ajena', async () => {
        const before = await row();
        expect(await authorizeSessionActivity(HASH, 'user-b', 15)).toBeNull();
        expect(await row()).toEqual(before);
    });
    it.each([-1, NaN, Infinity])('rechaza una política inválida: %s', async timeout => {
        const before = await row();
        await expect(authorizeSessionActivity(HASH, 'user-a', timeout)).rejects.toThrow();
        expect(await row()).toEqual(before);
    });
});
