'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const schemaTools = require('zapier-platform-core/src/tools/schema');
const App = require('../index');
const { verifyCordSignature } = require('../lib/signature');
const { handleErrors } = require('../lib/middleware');
const { fakeZ } = require('./helpers');

const SECRET = 'whsec_prueba';
const signed = (content, ts = Math.floor(Date.now() / 1000), secret = SECRET) =>
    ({ 'Http-X-Cord-Signature-V1': `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${content}`).digest('hex')}` });

test('la app cumple el esquema oficial de Zapier', () => {
    assert.deepEqual(schemaTools.validateApp(schemaTools.prepareApp(App)), []);
});

test('firma: acepta la de Cord, cualquier v1 válido y rechaza alteraciones', () => {
    const content = JSON.stringify({ id: 'evt_1', event: 'quote.approved', data: { id: 'q1' } });
    assert.equal(verifyCordSignature({ secret: SECRET, headers: signed(content), content }), true);
    const ts = Math.floor(Date.now() / 1000);
    const doble = { 'X-Cord-Signature-V1': `t=${ts},v1=${'0'.repeat(64)},v1=${createHmac('sha256', SECRET).update(`${ts}.${content}`).digest('hex')}` };
    assert.equal(verifyCordSignature({ secret: SECRET, headers: doble, content }), true);
    assert.equal(verifyCordSignature({ secret: SECRET, headers: signed(content), content: content.replace('q1', 'q2') }), false);
    assert.equal(verifyCordSignature({ secret: 'otro', headers: signed(content), content }), false);
    assert.equal(verifyCordSignature({ secret: SECRET, headers: signed(content, ts - 3600), content }), false);
    assert.equal(verifyCordSignature({ secret: SECRET, headers: {}, content }), false);
    assert.equal(verifyCordSignature({ secret: undefined, headers: signed(content), content }), false);
});

test('autenticación: OAuth 2.0 con PKCE, renovación automática y etiqueta de la conexión', async () => {
    const auth = App.authentication;
    assert.equal(auth.type, 'oauth2');
    assert.equal(auth.oauth2Config.enablePkce, true);
    assert.equal(auth.oauth2Config.autoRefresh, true);
    assert.match(auth.oauth2Config.authorizeUrl.url, /\/oauth\/authorize$/);
    assert.equal(auth.oauth2Config.authorizeUrl.params.scope, 'write');
    assert.match(auth.oauth2Config.getAccessToken.url, /\/api\/oauth\/token$/);
    assert.equal(auth.oauth2Config.getAccessToken.body.grant_type, 'authorization_code');
    assert.equal(auth.oauth2Config.getAccessToken.body.code_verifier, '{{bundle.inputData.code_verifier}}');
    assert.equal(auth.oauth2Config.refreshAccessToken.body.grant_type, 'refresh_token');
    const ok = fakeZ({ 'GET /api/v1/me': { data: { org: { nombre: 'ACME' }, scope: 'write', mode: 'test' } } });
    const data = await auth.test(ok);
    assert.equal(auth.connectionLabel(ok, { inputData: data }), 'ACME (test)');
});

test('errores de Cord llegan con su mensaje', () => {
    const z = fakeZ();
    assert.throws(() => handleErrors({ status: 403, data: { error: 'Tu plan Gratis permite 1 webhook.', code: 'plan_limit_reached' } }, z), /Tu plan Gratis permite 1 webhook/);
    const okResponse = { status: 200, data: {} };
    assert.equal(handleErrors(okResponse, z), okResponse);
});

test('suscripción: crea el webhook solo con el evento del disparador y guarda id y secreto', async () => {
    const z = fakeZ({ 'POST /api/v1/webhooks': { data: { id: 'wh_1', url: 'https://hooks.zapier.com/x', eventos: ['quote.approved'], secret: SECRET } } });
    const out = await App.triggers.quote_approved.operation.performSubscribe(z, { targetUrl: 'https://hooks.zapier.com/x', inputData: {} });
    assert.deepEqual(out, { id: 'wh_1', secret: SECRET });
    assert.deepEqual(z.calls[0].body, { url: 'https://hooks.zapier.com/x', eventos: ['quote.approved'] });
});

test('suscripción genérica: exige elegir un evento conocido', async () => {
    const z = fakeZ();
    await assert.rejects(App.triggers.new_event.operation.performSubscribe(z, { targetUrl: 'https://h', inputData: { event: 'algo.inventado' } }), /Choose which Cord event/);
    assert.equal(z.calls.length, 0);
});

test('baja: borra solo el webhook de esta suscripción', async () => {
    const z = fakeZ({ 'DELETE /api/v1/webhooks/wh_1': { data: { ok: true } } });
    await App.triggers.quote_paid.operation.performUnsubscribe(z, { subscribeData: { id: 'wh_1' } });
    assert.equal(z.calls.length, 1);
});

test('evento entrante: sin firma válida se ignora, con firma se aplana', () => {
    const op = App.triggers.quote_approved.operation;
    const envelope = { id: 'evt_9', event: 'quote.approved', created_at: '2026-09-14T18:00:00.000Z', data: { id: 'q1', folio: 'COT-1', total: 10, moneda: 'MXN' } };
    const content = JSON.stringify(envelope);
    const z = fakeZ();
    assert.throws(() => op.perform(z, { subscribeData: { id: 'wh', secret: SECRET }, rawRequest: { content, headers: {} }, cleanedRequest: envelope }), (e) => e.name === 'HaltedError');
    const out = op.perform(z, { subscribeData: { id: 'wh', secret: SECRET }, rawRequest: { content, headers: signed(content) }, cleanedRequest: envelope });
    assert.deepEqual(out, [{ id: 'evt_9', event: 'quote.approved', created_at: '2026-09-14T18:00:00.000Z', object_id: 'q1', folio: 'COT-1', total: 10, moneda: 'MXN' }]);
    const ping = { ...envelope, event: 'ping' };
    const pingContent = JSON.stringify(ping);
    assert.deepEqual(op.perform(z, { subscribeData: { secret: SECRET }, rawRequest: { content: pingContent, headers: signed(pingContent) }, cleanedRequest: ping }), []);
});

test('muestras: lee eventos reales del tipo del disparador', async () => {
    const z = fakeZ({ 'GET /api/v1/events': (o) => ({ data: [{ id: 'evt_1', type: o.params.type, object: 'invoice', object_id: 'd1', data: { id: 'd1', numero: 'F-1' }, created_at: '2026-09-14T00:00:00.000Z' }] }) });
    const out = await App.triggers.invoice_paid.operation.performList(z, { inputData: {} });
    assert.equal(z.calls[0].params.type, 'invoice.paid');
    assert.deepEqual(out[0], { id: 'evt_1', event: 'invoice.paid', created_at: '2026-09-14T00:00:00.000Z', object_id: 'd1', numero: 'F-1' });
});

test('crear cliente devuelve el cliente completo y no manda campos vacíos', async () => {
    const z = fakeZ({
        'POST /api/v1/clientes': { data: { id: 'c1' } },
        'GET /api/v1/clientes/c1': { data: { id: 'c1', empresa: 'ACME', email: 'a@acme.mx' } },
    });
    const out = await App.creates.create_client.operation.perform(z, { inputData: { empresa: 'ACME', email: 'a@acme.mx', telefono: '' } });
    assert.deepEqual(z.calls[0].body, { empresa: 'ACME', email: 'a@acme.mx' });
    assert.equal(out.empresa, 'ACME');
});

test('actualizar cliente solo manda lo que se llenó', async () => {
    const z = fakeZ({
        'PATCH /api/v1/clientes/c1': { data: { ok: true } },
        'GET /api/v1/clientes/c1': { data: { id: 'c1', empresa: 'ACME', email: 'nuevo@acme.mx' } },
    });
    await App.creates.update_client.operation.perform(z, { inputData: { id: 'c1', email: 'nuevo@acme.mx', empresa: '' } });
    assert.deepEqual(z.calls[0].body, { email: 'nuevo@acme.mx' });
});

test('crear cotización convierte líneas y el envío', async () => {
    const z = fakeZ({ 'POST /api/v1/cotizaciones': { data: { id: 'q1', folio: 'COT-9' } } });
    await App.creates.create_quote.operation.perform(z, { inputData: {
        cliente_id: 'c1', items: [{ descripcion: 'Servicio', cantidad: '2', precio_unitario: '1500.5' }], send: 'false', vigencia_dias: '15',
    } });
    assert.deepEqual(z.calls[0].body, { cliente_id: 'c1', items: [{ descripcion: 'Servicio', cantidad: 2, precio_unitario: 1500.5 }], send: false, vigencia_dias: 15 });
});

test('marcar pagada manda la acción de la API y solo el método de pago', async () => {
    const z = fakeZ({
        'POST /api/v1/cotizaciones/q1': { data: { id: 'q1', estado: 'paid' } },
        'GET /api/v1/cotizaciones/q1': { data: { id: 'q1', status: 'paid' } },
    });
    await App.creates.mark_quote_paid.operation.perform(z, { inputData: { id: 'q1', payment_method: 'transfer', otra: 'x' } });
    assert.deepEqual(z.calls[0].body, { action: 'mark_paid', payment_method: 'transfer' });
});

test('crear tarea usa solo la fecha', async () => {
    const z = fakeZ({ 'POST /api/v1/tareas': { data: { id: 't1' } } });
    const out = await App.creates.create_task.operation.perform(z, { inputData: { titulo: 'Llamar', due_date: '2026-09-20T10:00:00-06:00' } });
    assert.deepEqual(z.calls[0].body, { titulo: 'Llamar', due_date: '2026-09-20' });
    assert.equal(out.id, 't1');
});

test('buscar cliente prioriza el correo exacto', async () => {
    const z = fakeZ({ 'GET /api/v1/clientes': { data: [{ id: 'c1' }] } });
    await App.searches.find_client.operation.perform(z, { inputData: { email: 'A@acme.mx', q: 'acme' } });
    assert.deepEqual(z.calls[0].params, { email: 'A@acme.mx', limit: 10 });
    await assert.rejects(App.searches.find_client.operation.perform(z, { inputData: {} }), /Enter an email or a name/);
});

test('el token va en el header y nunca en la URL', () => {
    const { addAuth } = require('../lib/middleware');
    const req = addAuth({ url: 'https://cordhq.app/api/v1/me', headers: {} }, fakeZ(), { authData: { access_token: 'cord_at_x' } });
    assert.equal(req.headers.Authorization, 'Bearer cord_at_x');
    assert.ok(!req.url.includes('cord_at_x'));
});
