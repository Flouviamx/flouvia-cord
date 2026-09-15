import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP, BASE, CONNECTION, GROUPS, MODULES, README, RPCS, WEBHOOK } from './app.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));

function readEnvFile() {
    const file = path.join(dir, '.env');
    if (!fs.existsSync(file)) return {};
    return Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n')
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
}

const env = { ...readEnvFile(), ...process.env };
const token = env.MAKE_API_TOKEN || '';
const zone = String(env.MAKE_ZONE || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const appName = env.MAKE_APP_NAME || APP.name;
const dry = process.argv.includes('--dry');

if (!token || !/^[a-z0-9-]+\.make\.(com|celonis\.com)$/.test(zone)) {
    console.error('Falta MAKE_API_TOKEN o MAKE_ZONE (por ejemplo us1.make.com) en integrations/make/.env');
    process.exit(1);
}

const API = `https://${zone}/api/v2`;

async function call(method, route, body, contentType = 'application/json') {
    if (dry && method !== 'GET') {
        console.log(`[dry] ${method} ${route}`);
        return {};
    }
    const res = await fetch(`${API}${route}`, {
        method,
        headers: { Authorization: `Token ${token}`, ...(body === undefined ? {} : { 'Content-Type': contentType }) },
        body: body === undefined ? undefined : (typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${route} → ${res.status}: ${text.slice(0, 400)}`);
    try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

const listOf = (payload) => Object.values(payload || {}).find(Array.isArray) || [];
const objectOf = (payload) => Object.values(payload || {}).find((v) => v && typeof v === 'object' && !Array.isArray(v)) || {};

async function ensureApp() {
    const apps = listOf(await call('GET', '/sdk/apps'));
    const found = apps.find((a) => a.name === appName);
    if (found) return found;
    const created = objectOf(await call('POST', '/sdk/apps', { name: appName, label: APP.label, description: APP.description, theme: APP.theme, language: APP.language }));
    return { name: appName, version: 1, ...created };
}

async function setSection(route, content) {
    await call('PUT', route, content);
}

async function ensureConnection(app) {
    const existing = listOf(await call('GET', `/sdk/apps/${app}/connections`)).find((c) => c.label === CONNECTION.label);
    const name = existing?.name || objectOf(await call('POST', `/sdk/apps/${app}/connections`, { type: CONNECTION.type, label: CONNECTION.label })).name;
    await setSection(`/sdk/apps/connections/${name}/api`, CONNECTION.api);
    await setSection(`/sdk/apps/connections/${name}/parameters`, CONNECTION.parameters);
    return name;
}

async function ensureWebhook(app, connection) {
    const existing = listOf(await call('GET', `/sdk/apps/${app}/webhooks`)).find((w) => w.label === WEBHOOK.label);
    const name = existing?.name || objectOf(await call('POST', `/sdk/apps/${app}/webhooks`, { type: WEBHOOK.type, label: WEBHOOK.label, connection })).name;
    for (const section of ['api', 'parameters', 'attach', 'detach']) await setSection(`/sdk/apps/webhooks/${name}/${section}`, WEBHOOK[section]);
    return name;
}

async function ensureRpcs(app, version, connection) {
    const existing = listOf(await call('GET', `/sdk/apps/${app}/${version}/rpcs`)).map((r) => r.name);
    for (const rpc of RPCS) {
        if (!existing.includes(rpc.name)) await call('POST', `/sdk/apps/${app}/${version}/rpcs`, { name: rpc.name, label: rpc.label, connection });
        await setSection(`/sdk/apps/${app}/${version}/rpcs/${rpc.name}/api`, rpc.api);
    }
}

async function ensureModules(app, version, connection, webhook) {
    const existing = listOf(await call('GET', `/sdk/apps/${app}/${version}/modules`)).map((m) => m.name);
    for (const mod of MODULES) {
        const route = `/sdk/apps/${app}/${version}/modules/${mod.name}`;
        if (existing.includes(mod.name)) {
            await call('PATCH', route, { label: mod.label, description: mod.description });
        } else {
            await call('POST', `/sdk/apps/${app}/${version}/modules`, {
                name: mod.name,
                typeId: mod.typeId,
                label: mod.label,
                description: mod.description,
                moduleInitMode: 'blank',
                ...(mod.webhook ? { webhook } : { connection }),
            });
        }
        for (const section of ['api', 'parameters', 'expect', 'interface', 'samples']) await setSection(`${route}/${section}`, mod[section]);
        console.log(`  módulo ${mod.name}`);
    }
}

const app = await ensureApp();
const version = app.version || 1;
console.log(`App ${app.name} v${version} en ${zone}`);
await call('POST', `/sdk/apps/${app.name}/${version}/base`, BASE);
await call('PUT', `/sdk/apps/${app.name}/${version}/readme`, README, 'text/markdown');
const connection = await ensureConnection(app.name);
console.log(`  conexión ${connection}`);
const webhook = await ensureWebhook(app.name, connection);
console.log(`  webhook ${webhook}`);
await ensureRpcs(app.name, version, connection);
await ensureModules(app.name, version, connection, webhook);
await call('PUT', `/sdk/apps/${app.name}/${version}/groups`, GROUPS);
const icon = path.join(dir, '..', 'hubspot', 'src', 'app', 'cord-logo.png');
if (fs.existsSync(icon)) await call('PUT', `/sdk/apps/${app.name}/${version}/icon`, fs.readFileSync(icon), 'image/png');
console.log('Listo.');
