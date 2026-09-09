import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), 'utf8');

const schema = read('db/schema.sql');
const route = read('src/pages/api/health.ts');
const middleware = read('src/middleware.ts');
const statusEs = read('src/pages/desarrolladores/status.astro');
const statusEn = read('src/pages/en/desarrolladores/status.astro');
const component = read('src/components/landing/PublicStatus.astro');
const opsRoute = read('src/pages/api/ops/status-incidents.ts');
const vercel = JSON.parse(read('vercel.json'));

assert.match(schema, /create table if not exists health_checks/i);
assert.match(schema, /create table if not exists status_incidents/i);
assert.doesNotMatch(schema, /insert\s+into\s+status_incidents/i,
    'db/schema.sql no debe sembrar incidentes públicos');

const cron = vercel.crons.find((entry) => entry.path === '/api/health');
assert.ok(cron, 'falta el cron /api/health');
assert.equal(cron.schedule, '0 10 * * *', 'la sonda debe respetar la cadencia diaria de Vercel Hobby');

const authIndex = route.indexOf('assertCronAuth(request)');
const scopeIndex = route.indexOf('cronScope: true');
const probeIndex = route.indexOf('probePlatformHealth()');
assert.ok(authIndex >= 0 && scopeIndex > authIndex && probeIndex > scopeIndex,
    'la ruta debe autenticar antes de abrir cronScope y ejecutar las sondas');
assert.match(route, /Cache-Control': 'no-store'/);
assert.match(middleware, /"\/api\/health"/,
    '/api/health debe ser alcanzable sin sesión; su propia Bearer lo protege');

for (const [path, source] of [
    ['src/pages/desarrolladores/status.astro', statusEs],
    ['src/pages/en/desarrolladores/status.astro', statusEn],
]) {
    assert.match(source, /export const prerender = false;/, `${path} debe ser SSR`);
    assert.match(source, /Cache-Control', 'no-store'/, `${path} no debe servir un estado obsoleto desde caché`);
}
assert.match(component, /getPublicStatusSnapshot/);
assert.doesNotMatch(component, /generateHistory|Math\.random/,
    'la página pública no debe generar historial sintético en render');
assert.match(opsRoute, /operator\.role !== 'admin'/,
    'publicar incidentes debe exigir un administrador de Ops');
assert.match(opsRoute, /opsAuditQuery/,
    'cada mutación de incidentes debe registrar auditoría de Ops');
assert.doesNotMatch(opsRoute, /export const DELETE/,
    'los incidentes no deben borrarse desde la API de Ops');

process.stdout.write('platform-health-check: cron autenticado, SSR y tablas sin incidentes sembrados\n');
