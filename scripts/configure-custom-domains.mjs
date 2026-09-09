// Operator utility: prepares only non-secret production settings, feature OFF.
// A dedicated runtime credential must be supplied securely through Vercel.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const project = process.env.CORD_DOMAINS_VERCEL_PROJECT_ID;
const team = process.env.CORD_DOMAINS_VERCEL_TEAM_ID;
assert.match(project || '', /^prj_[a-zA-Z0-9]+$/, 'Provide the exact Cord project ID');
assert.match(team || '', /^team_[a-zA-Z0-9]+$/, 'Provide the exact Cord team ID');
const scope = `teamId=${encodeURIComponent(team)}`;
function api(path, body, method) {
  const args = ['api', path, '--raw'];
  if (method) args.push('-X', method);
  if (body) args.push('--input', '-');
  try {
    const output = execFileSync('vercel', args, {
      input: body ? JSON.stringify(body) : undefined, encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000,
    });
    const result = output.trim() ? JSON.parse(output) : {};
    if (result.error) throw new Error();
    return result;
  } catch (error) {
    const output = String(error.stderr || '');
    const clues = ['403', '401', '400', 'Forbidden', 'not authorized', 'not allowed', 'sudo', 'Sudo',
      'Invalid request', 'not supported', 'insufficient', 'scope', 'permission', 'token creation', 'authentication']
      .filter(value => output.includes(value));
    throw new Error(`Vercel operation failed (${clues.join(', ') || 'provider unavailable'}); provider output omitted to protect credentials.`);
  }
}
const projectInfo = api(`/v9/projects/${project}?${scope}`);
assert.equal(projectInfo.accountId, team, 'Project/team mismatch');
const envs = api(`/v10/projects/${project}/env?${scope}`).envs;
assert.ok(Array.isArray(envs));
const existing = envs.filter(e => e.target?.includes('production') && e.key.startsWith('CORD_') && /DOMAINS/.test(e.key));
console.log(JSON.stringify({ project: projectInfo.name, productionKeys: existing.map(e => e.key),
  runtimeTokenPresent: existing.some(e => e.key === 'CORD_DOMAINS_VERCEL_TOKEN') }));
if (!process.argv.includes('--apply')) {
  console.log('Dry-run. --apply prepares missing non-secret production settings with feature OFF. Existing settings are never overwritten.');
  process.exit(0);
}
const values = {
  CORD_DOMAINS_VERCEL_PROJECT_ID: project,
  CORD_DOMAINS_VERCEL_TEAM_ID: team,
  CORD_CUSTOM_DOMAINS_ENABLED: 'false',
};
const missing = Object.entries(values).filter(([key]) => !existing.some(e => e.key === key));
if (missing.length) {
  const result = api(`/v10/projects/${project}/env?${scope}`, missing.map(([key, value]) => ({
    key, value, target: ['production'], type: 'plain', comment: 'Custom domains staged; activate only after acceptance checks',
  })));
  assert.ok(Array.isArray(result.failed) && !result.failed.length, 'Some settings were not saved; inspect metadata before retrying');
}
console.log(JSON.stringify({ prepared: missing.map(([key]) => key), existingSettingsPreserved: true, deploymentRequired: true }));
