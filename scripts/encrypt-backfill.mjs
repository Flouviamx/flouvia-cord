import { createCipheriv, randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const apply = process.argv.includes('--apply');
const databaseUrl = process.env.DATABASE_URL;
const keyB64 = process.env.ENCRYPTION_KEY;
const keyId = String(process.env.ENCRYPTION_KEY_ID || 'k1');
const BATCH_SIZE = 500;

if (!databaseUrl) throw new Error('DATABASE_URL no está configurada');
if (!keyB64) throw new Error('ENCRYPTION_KEY no está configurada');
const key = Buffer.from(keyB64, 'base64');
if (key.length !== 32) throw new Error('ENCRYPTION_KEY debe contener 32 bytes en base64');

const sql = neon(databaseUrl);
const encrypt = (plain) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return `enc:v1:${keyId}:` + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
};

const jobs = [
    {
        label: 'orgs.banco_clabe',
        load: () => sql`select id, banco_clabe as value from orgs where banco_clabe is not null and banco_clabe_enc is null order by id limit ${BATCH_SIZE}`,
        save: (row) => sql`update orgs set banco_clabe_enc = ${encrypt(row.value)}, banco_clabe_last4 = ${String(row.value).slice(-4)}, banco_clabe = null where id = ${row.id} and banco_clabe_enc is null`,
    },
    {
        label: 'orgs.facturapi_live_key',
        load: () => sql`select id, facturapi_live_key as value from orgs where facturapi_live_key is not null and facturapi_live_key_enc is null order by id limit ${BATCH_SIZE}`,
        save: (row) => sql`update orgs set facturapi_live_key_enc = ${encrypt(row.value)}, facturapi_live_key = null where id = ${row.id} and facturapi_live_key_enc is null`,
    },
    {
        label: 'users.totp_secret',
        load: () => sql`select id, totp_secret as value from users where totp_secret is not null and totp_secret_enc is null order by id limit ${BATCH_SIZE}`,
        save: (row) => sql`update users set totp_secret_enc = ${encrypt(row.value)}, totp_secret = null where id = ${row.id} and totp_secret_enc is null`,
    },
    {
        label: 'webhooks.secret',
        load: () => sql`select id, secret as value from webhooks where secret is not null and secret_enc is null order by id limit ${BATCH_SIZE}`,
        save: (row) => sql`update webhooks set secret_enc = ${encrypt(row.value)}, secret = null where id = ${row.id} and secret_enc is null`,
    },
    {
        label: 'webhooks.secret_prev',
        load: () => sql`select id, secret_prev as value from webhooks where secret_prev is not null and secret_prev_enc is null order by id limit ${BATCH_SIZE}`,
        save: (row) => sql`update webhooks set secret_prev_enc = ${encrypt(row.value)}, secret_prev = null where id = ${row.id} and secret_prev_enc is null`,
    },
];

const summary = [];
for (const job of jobs) {
    let rows = await job.load();
    let found = rows.length;
    let updated = 0;
    if (apply) {
        while (rows.length) {
            let batchUpdated = 0;
            for (const row of rows) {
                const result = await job.save(row);
                batchUpdated += result.length || 0;
            }
            if (!batchUpdated) throw new Error(`${job.label}: el lote no actualizó filas; se aborta para evitar un ciclo infinito`);
            updated += batchUpdated;
            rows = await job.load();
            found += rows.length;
        }
    }
    summary.push({ field: job.label, found, updated, batchSize: BATCH_SIZE, more: !apply && found === BATCH_SIZE });
}

process.stdout.write(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', keyId, summary }, null, 2) + '\n');
