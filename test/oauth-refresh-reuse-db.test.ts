// Reuso de refresh token (RFC 9700 §4.14.2), ejecutado contra PostgreSQL real.
//
// La rotación ya impedía usar dos veces el mismo refresh: el UPDATE no encuentra
// fila y el canje falla. Lo que faltaba era DETECTAR el reuso: si alguien robó el
// token, el ladrón lo usa y el cliente legítimo —o al revés— presenta el viejo.
// Ahí no basta con negar ese canje; hay que revocar la conexión entera, porque
// uno de los dos tiene una credencial que no le pertenece y no se sabe cuál.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let db: PGlite;
const q = (text: string, values: unknown[] = []) => db.query<any>(text, values);
const ORG = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const CLIENT = 'cord_oc_00000000000000000000000000000001';

const refrescar = (hash: string, nuevo: string) => q(
  `select * from cord_oauth_refresh($1,$2,$3,$4,$5,$6,$7,$8)`,
  [CLIENT, hash, `acc_${nuevo}`, 'cord_at_x', 'abcd', 3600, nuevo, 180],
);
const grant = async () => (await q('select * from oauth_grants')).rows[0];
const llave = async () => (await q('select * from api_keys')).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table orgs (id uuid primary key);
    create table api_keys (
      id uuid primary key default gen_random_uuid(), org_id uuid not null,
      hash text, prefix text, last4 text, expires_at timestamptz, revoked_at timestamptz
    );
    create table oauth_grants (
      id uuid primary key default gen_random_uuid(), org_id uuid not null, client_id text not null,
      api_key_id uuid not null, scope text not null, refresh_hash text not null,
      refresh_prev_hash text, refresh_prev_at timestamptz, refreshed_at timestamptz,
      refresh_expires_at timestamptz not null, revoked_at timestamptz
    );
    create table audit_log (
      id uuid primary key default gen_random_uuid(), org_id uuid not null, actor text, accion text not null,
      entidad text, entidad_id text, detalle text, ip text, created_at timestamptz default now()
    );
  `);
  // La función se toma del schema real: probar una copia no prueba nada.
  const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const desde = schema.indexOf('create or replace function cord_oauth_refresh(');
  const hasta = schema.indexOf('$$;', schema.indexOf('end;\n$$;', desde)) + 3;
  expect(desde).toBeGreaterThan(0);
  await db.exec(schema.slice(desde, hasta));
}, 30000);

afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec('truncate oauth_grants, api_keys, audit_log, orgs cascade');
  await q('insert into orgs(id) values ($1)', [ORG]);
  const key = (await q(
    `insert into api_keys(org_id, hash, prefix, last4, expires_at) values ($1,'acc_viejo','cord_at_x','0000', now() + interval '1 hour') returning id`,
    [ORG],
  )).rows[0].id;
  await q(
    `insert into oauth_grants(org_id, client_id, api_key_id, scope, refresh_hash, refresh_expires_at)
     values ($1,$2,$3,'write','rt_1', now() + interval '180 days')`,
    [ORG, CLIENT, key],
  );
});

describe('rotación y reuso del refresh token', () => {
  it('el canje normal rota el refresh y renueva el access token', async () => {
    const r = await refrescar('rt_1', 'rt_2');
    expect(r.rows[0]).toMatchObject({ scope: 'write', replay: false });
    const g = await grant();
    expect(g.refresh_hash).toBe('rt_2');
    expect(g.refresh_prev_hash).toBe('rt_1');
    expect((await llave()).hash).toBe('acc_rt_2');
  });

  it('el refresh viejo ya no sirve', async () => {
    await refrescar('rt_1', 'rt_2');
    expect((await refrescar('rt_1', 'rt_3')).rows).toHaveLength(0);
    expect((await grant()).refresh_hash).toBe('rt_2');
  });

  it('un reintento inmediato no castiga al cliente legítimo', async () => {
    await refrescar('rt_1', 'rt_2');
    const reintento = await refrescar('rt_1', 'rt_3');
    expect(reintento.rows).toHaveLength(0);
    expect((await grant()).revoked_at).toBeNull();
    expect((await llave()).revoked_at).toBeNull();
  });

  it('fuera de la ventana de gracia, el reuso revoca la conexión entera y deja rastro', async () => {
    await refrescar('rt_1', 'rt_2');
    await q(`update oauth_grants set refresh_prev_at = now() - interval '5 minutes'`);
    const robo = await refrescar('rt_1', 'rt_3');
    expect(robo.rows[0]).toMatchObject({ replay: true });
    expect((await grant()).revoked_at).not.toBeNull();
    expect((await llave()).revoked_at).not.toBeNull();
    const auditoria = (await q('select accion, entidad from audit_log')).rows;
    expect(auditoria).toEqual([{ accion: 'oauth.refresh_reuso', entidad: 'oauth_grant' }]);
  });

  it('un grant ya revocado no se puede resucitar', async () => {
    await q('update oauth_grants set revoked_at = now()');
    expect((await refrescar('rt_1', 'rt_2')).rows).toHaveLength(0);
  });

  it('el refresh de una app no sirve en otra', async () => {
    const otro = await q(
      `select * from cord_oauth_refresh('cord_oc_00000000000000000000000000000002','rt_1','acc','p','l',3600,'rt_9',180)`,
    );
    expect(otro.rows).toHaveLength(0);
    expect((await grant()).refresh_hash).toBe('rt_1');
  });

  it('una llave revocada corta el refresh aunque el grant siga vivo', async () => {
    await q('update api_keys set revoked_at = now()');
    expect((await refrescar('rt_1', 'rt_2')).rows).toHaveLength(0);
  });
});
