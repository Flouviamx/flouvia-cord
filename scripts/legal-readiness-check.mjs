import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LEGAL_IDENTITY, missingLegalIdentityFields } from '../src/lib/legal-identity.ts';
import { LEGAL_PROVIDERS } from '../src/lib/legal-providers.ts';

const root = join(import.meta.dirname, '..');
const strict = process.argv.includes('--strict');
const ids = new Set();

for (const provider of LEGAL_PROVIDERS) {
  assert.match(provider.id, /^[a-z][a-z0-9-]*$/, `provider id inválido: ${provider.id}`);
  assert.ok(!ids.has(provider.id), `provider duplicado: ${provider.id}`);
  ids.add(provider.id);
  assert.ok(provider.codeEvidence.length > 0, `${provider.id}: falta evidencia de código`);
  for (const evidence of provider.codeEvidence) {
    const path = evidence.split(':')[0];
    assert.ok(existsSync(join(root, path)), `${provider.id}: no existe ${path}`);
  }
  if (provider.publicEvidenceUrl) {
    assert.match(provider.publicEvidenceUrl, /^https:\/\//, `${provider.id}: evidencia pública no HTTPS`);
  }
}

for (const expectedRole of ['subprocessor', 'provider-with-own-duties', 'authority', 'customer-directed']) {
  assert.ok(LEGAL_PROVIDERS.some((provider) => provider.role === expectedRole), `falta rol ${expectedRole}`);
}

const pendingIdentity = missingLegalIdentityFields(LEGAL_IDENTITY);
const pendingProviderContracts = LEGAL_PROVIDERS
  .filter((provider) => provider.contractEvidence === 'account-evidence-pending')
  .map((provider) => provider.id);

process.stdout.write(
  `legal-readiness-check: ${LEGAL_PROVIDERS.length} terceros clasificados; ` +
  `${pendingIdentity.length} campos de identidad y ${pendingProviderContracts.length} evidencias contractuales pendientes\n`,
);

if (pendingIdentity.length) {
  process.stdout.write(`identidad pendiente: ${pendingIdentity.join(', ')}\n`);
}
if (pendingProviderContracts.length) {
  process.stdout.write(`evidencia de cuenta pendiente: ${pendingProviderContracts.join(', ')}\n`);
}

if (strict && (pendingIdentity.length || pendingProviderContracts.length)) {
  process.stderr.write('legal-readiness-check: publicación contractual estricta bloqueada\n');
  process.exitCode = 1;
}

