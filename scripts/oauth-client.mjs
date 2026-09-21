// scripts/oauth-client.mjs
// Registra o actualiza una app externa como cliente OAuth de Cord.
//
//   node scripts/oauth-client.mjs --slug zapier --nombre Zapier --dominio zapier.com \
//        --redirect https://zapier.com/dashboard/auth/oauth/return/App246344CLIAPI/ \
//        --env integrations/zapier/.env
//
// El secreto se escribe SOLO en el archivo --env (chmod 600) y nunca se imprime;
// en la base solo queda su sha-256. Sin --rotate, un cliente que ya existe
// conserva su secreto y solo se actualizan nombre, dominio y redirects.

import { neon } from '@neondatabase/serverless';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readVar(name) {
    if (process.env[name]) return process.env[name];
    for (const f of ['.env.local', '.env']) {
        const p = join(root, f);
        if (!existsSync(p)) continue;
        for (const line of readFileSync(p, 'utf8').split('\n')) {
            const m = line.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.+)\\s*$`));
            if (m) return m[1].replace(/^["']|["']$/g, '');
        }
    }
    return null;
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

const slug = opt('slug');
const nombre = opt('nombre');
const dominio = opt('dominio');
const envFile = opt('env');
const redirects = args.flatMap((a, i) => (a === '--redirect' ? [args[i + 1]] : []));
const rotate = flag('rotate');

if (!slug || !nombre || redirects.length === 0 || !envFile) {
    console.error('Uso: node scripts/oauth-client.mjs --slug <slug> --nombre <Nombre> [--dominio d.com] --redirect <uri> [--redirect <uri>] --env <archivo> [--rotate]');
    process.exit(1);
}
if (!/^[a-z0-9-]{2,32}$/.test(slug)) { console.error('slug inválido'); process.exit(1); }
for (const r of redirects) {
    const u = new URL(r);
    const local = u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
    if ((u.protocol !== 'https:' && !local) || u.hash) { console.error(`redirect no permitido: ${r}`); process.exit(1); }
}

const url = readVar('DATABASE_URL_UNPOOLED') || readVar('DATABASE_URL');
if (!url) { console.error('No encontré DATABASE_URL.'); process.exit(1); }
const sql = neon(url);

const [existing] = await sql`select client_id from oauth_clients where slug = ${slug}`;
let clientId = existing?.client_id;
let secret = null;

if (!existing) {
    clientId = `cord_oc_${randomBytes(16).toString('hex')}`;
    secret = `cord_cs_${randomBytes(32).toString('hex')}`;
    await sql`insert into oauth_clients (client_id, slug, nombre, dominio, secret_hash, redirect_uris)
              values (${clientId}, ${slug}, ${nombre}, ${dominio}, ${createHash('sha256').update(secret).digest('hex')}, ${redirects})`;
} else {
    await sql`update oauth_clients set nombre = ${nombre}, dominio = ${dominio}, redirect_uris = ${redirects}, revoked_at = null where client_id = ${clientId}`;
    if (rotate) {
        secret = `cord_cs_${randomBytes(32).toString('hex')}`;
        await sql`update oauth_clients set secret_hash = ${createHash('sha256').update(secret).digest('hex')} where client_id = ${clientId}`;
    }
}

if (secret) {
    const path = resolve(root, envFile);
    const lines = existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter((l) => l && !/^(CLIENT_ID|CLIENT_SECRET)=/.test(l)) : [];
    lines.push(`CLIENT_ID=${clientId}`, `CLIENT_SECRET=${secret}`);
    writeFileSync(path, lines.join('\n') + '\n');
    chmodSync(path, 0o600);
    console.log(`Cliente ${slug}: ${clientId}. Credenciales escritas en ${envFile} (el secreto no se imprime).`);
} else {
    console.log(`Cliente ${slug}: ${clientId} actualizado. El secreto no cambió (usa --rotate para generar otro).`);
}
