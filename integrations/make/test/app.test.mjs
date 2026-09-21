import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { API_ORIGIN, BASE, CONNECTION, GROUPS, MODULES, RPCS, WEBHOOK } from '../app.mjs';

const { EVENTS } = createRequire(import.meta.url)('../../zapier/lib/events.js');

test('cada módulo tiene nombre único, tipo válido y secciones completas', () => {
    const names = new Set();
    for (const mod of MODULES) {
        assert.match(mod.name, /^[a-z][A-Za-z0-9]+$/);
        assert.ok(!names.has(mod.name), `duplicado: ${mod.name}`);
        names.add(mod.name);
        assert.ok([4, 9, 10, 12].includes(mod.typeId), mod.name);
        assert.ok(mod.label && mod.description, mod.name);
        for (const section of ['api', 'parameters', 'expect', 'interface', 'samples']) assert.ok(section in mod, `${mod.name}.${section}`);
    }
});

test('solo hay un módulo universal y usa el dominio de Cord', () => {
    const universal = MODULES.filter((m) => m.typeId === 12);
    assert.equal(universal.length, 1);
    assert.equal(universal[0].label, 'Make an API Call');
    assert.ok(universal[0].api.url.startsWith(`${API_ORIGIN}/api/{{`));
});

test('las llamadas relativas no pueden salir de la API de Cord', () => {
    const urls = [];
    const collect = (api) => (Array.isArray(api) ? api : [api]).forEach((r) => r && r.url && urls.push(r.url));
    MODULES.filter((m) => m.typeId !== 12).forEach((m) => collect(m.api));
    RPCS.forEach((r) => collect(r.api));
    collect(WEBHOOK.attach);
    collect(WEBHOOK.detach);
    for (const url of urls) assert.ok(url.startsWith('/') && !url.startsWith('//'), url);
    assert.equal(BASE.baseUrl, `${API_ORIGIN}/api/v1`);
});

test('la conexión es OAuth 2.0 y ningún token ni secreto queda en los logs', () => {
    assert.equal(CONNECTION.type, 'oauth');
    assert.deepEqual(CONNECTION.parameters, []);
    assert.ok(BASE.log.sanitize.includes('request.headers.authorization'));
    assert.ok(CONNECTION.api.info.log.sanitize.includes('request.headers.authorization'));
    for (const step of [CONNECTION.api.token, CONNECTION.api.refresh]) {
        for (const field of ['request.body.client_secret', 'response.body.access_token', 'response.body.refresh_token']) {
            assert.ok(step.log.sanitize.includes(field), field);
        }
    }
});

test('OAuth: endpoints de Cord, credenciales del cliente en common data y renovación antes de vencer', () => {
    const { authorize, token, refresh, invalidate, info } = CONNECTION.api;
    assert.equal(authorize.url, `${API_ORIGIN}/oauth/authorize`);
    assert.equal(authorize.qs.client_id, '{{common.clientId}}');
    assert.equal(authorize.qs.scope, 'write');
    assert.equal(token.url, `${API_ORIGIN}/api/oauth/token`);
    assert.equal(token.body.client_secret, '{{common.clientSecret}}');
    assert.equal(token.body.grant_type, 'authorization_code');
    assert.equal(refresh.body.grant_type, 'refresh_token');
    assert.match(refresh.condition, /addMinutes\(now, 15\)/);
    assert.equal(invalidate.url, `${API_ORIGIN}/api/oauth/revoke`);
    assert.equal(info.url, `${API_ORIGIN}/api/v1/me`);
    assert.equal(BASE.headers.Authorization, 'Bearer {{connection.accessToken}}');
});

test('el webhook se registra y se borra en Cord y filtra por evento', () => {
    assert.equal(WEBHOOK.attach.method, 'POST');
    assert.equal(WEBHOOK.detach.method, 'DELETE');
    assert.match(WEBHOOK.detach.url, /\{\{webhook\.id\}\}/);
    assert.match(WEBHOOK.api.condition, /contains\(parameters\.eventos, body\.event\)/);
    assert.equal(WEBHOOK.parameters[0].options.length, EVENTS.length);
});

test('las búsquedas paginan y respetan el límite', () => {
    for (const mod of MODULES.filter((m) => m.typeId === 9)) {
        assert.ok(mod.api.pagination, mod.name);
        assert.equal(mod.api.response.limit, '{{parameters.limit}}');
        assert.ok(mod.expect.some((p) => p.name === 'limit'), mod.name);
    }
});

test('los grupos cubren todos los módulos una sola vez', () => {
    const grouped = GROUPS.flatMap((g) => g.modules).sort();
    assert.deepEqual(grouped, MODULES.map((m) => m.name).sort());
});
