import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const key1 = Buffer.alloc(32, 17).toString('base64');
const key2 = Buffer.alloc(32, 29).toString('base64');
const baseEnv = {
    ...process.env,
    ENCRYPTION_KEY: '',
    ENCRYPTION_KEY_ID: '',
    ENCRYPTION_KEY_PREV: '',
    ENCRYPTION_KEY_PREV_ID: '',
    MCP_SECRET_KEY: '',
};

function run(source, env = {}) {
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source], {
        cwd: new URL('..', import.meta.url),
        env: { ...baseEnv, ...env },
        encoding: 'utf8',
    });
    if (result.status !== 0) throw new Error(result.stderr || `subproceso terminó con ${result.status}`);
    return result.stdout.trim();
}

const roundTrip = run(`
  const m = await import('./src/lib/crypto-secret.ts');
  const encrypted = m.encryptRequiredSecret('secreto-financiero');
  if (!encrypted.startsWith('enc:v1:k2:')) throw new Error('prefijo inválido');
  if (m.decryptSecret(encrypted) !== 'secreto-financiero') throw new Error('round-trip inválido');
  process.stdout.write(encrypted);
`, { ENCRYPTION_KEY: key2, ENCRYPTION_KEY_ID: 'k2' });
assert.match(roundTrip, /^enc:v1:k2:/);

const encryptedOld = run(`
  const m = await import('./src/lib/crypto-secret.ts');
  process.stdout.write(m.encryptRequiredSecret('rotacion-ok'));
`, { ENCRYPTION_KEY: key1, ENCRYPTION_KEY_ID: 'k1' });
const rotated = run(`
  const m = await import('./src/lib/crypto-secret.ts');
  process.stdout.write(m.decryptSecret(process.env.CIPHERTEXT) || 'null');
`, {
    ENCRYPTION_KEY: key2,
    ENCRYPTION_KEY_ID: 'k2',
    ENCRYPTION_KEY_PREV: key1,
    ENCRYPTION_KEY_PREV_ID: 'k1',
    CIPHERTEXT: encryptedOld,
});
assert.equal(rotated, 'rotacion-ok');

const missing = run(`
  const m = await import('./src/lib/crypto-secret.ts');
  let threw = false;
  try { m.encryptRequiredSecret('x'); } catch { threw = true; }
  if (!threw || m.encryptSecret('legacy') !== 'legacy') throw new Error('degradación inválida');
  process.stdout.write('ok');
`);
assert.equal(missing, 'ok');

const corrupt = run(`
  const m = await import('./src/lib/crypto-secret.ts');
  process.stdout.write(m.decryptSecret('enc:v1:k2:not-base64') === null ? 'ok' : 'bad');
`, { ENCRYPTION_KEY: key2, ENCRYPTION_KEY_ID: 'k2' });
assert.equal(corrupt, 'ok');

process.stdout.write('Crypto secret: round-trip, rotación y fallos correctos\n');
