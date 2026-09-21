import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Cord } = require('../nodes/Cord/Cord.node.js');
const { CordTrigger, signatureMatches } = require('../nodes/Cord/CordTrigger.node.js');
const { CordApi } = require('../credentials/CordApi.credentials.js');
const { EVENTS, EVENT_KEYS } = require('../lib/events.js');
// El catálogo canónico solo existe dentro del repo de Cord; en el repo público del nodo se compara contra la copia.
const CANONICO = new URL('../../zapier/lib/events.js', import.meta.url);
const canonicos = existsSync(CANONICO) ? require(CANONICO.pathname) : require('../lib/events.js');
const pkg = require('../package.json');

test('el paquete declara los archivos que n8n va a cargar', () => {
    for (const ruta of [...pkg.n8n.nodes, ...pkg.n8n.credentials]) {
        assert.doesNotThrow(() => require(`../${ruta}`), `n8n no podría cargar ${ruta}`);
    }
});

test('la copia de eventos no se separa del catálogo canónico', () => {
    assert.deepEqual(EVENTS, canonicos.EVENTS, 'corre `npm run sync` en integrations/n8n');
    assert.equal(EVENT_KEYS.length, canonicos.EVENT_KEYS.length);
});

test('el nodo de acción pega solo a la API pública de Cord', () => {
    const { description } = new Cord();
    assert.equal(description.requestDefaults.baseURL, 'https://cordhq.app/api/v1');
    assert.deepEqual(description.credentials, [{ name: 'cordApi', required: true }]);
    const rutas = JSON.stringify(description.properties).match(/"url":"[^"]+"/g) ?? [];
    for (const ruta of rutas) assert.ok(!ruta.includes('http'), `ruta absoluta en ${ruta}`);
});

test('cada operación declara su petición', () => {
    const { description } = new Cord();
    const operaciones = description.properties.filter((p) => p.name === 'operation');
    assert.ok(operaciones.length >= 3);
    for (const op of operaciones) {
        for (const opcion of op.options) {
            assert.ok(opcion.routing?.request?.method, `${opcion.value} sin método`);
            assert.ok(opcion.routing?.request?.url, `${opcion.value} sin url`);
        }
    }
});

test('el disparador ofrece los mismos eventos que Cord emite', () => {
    const { description } = new CordTrigger();
    const campo = description.properties.find((p) => p.name === 'eventos');
    assert.deepEqual(campo.options.map((o) => o.value), canonicos.EVENT_KEYS);
    assert.equal(description.webhooks[0].httpMethod, 'POST');
});

test('la credencial guarda la llave como contraseña y se prueba contra /me', () => {
    const cred = new CordApi();
    assert.equal(cred.properties[0].typeOptions.password, true);
    assert.equal(cred.test.request.url, '/me');
    assert.match(cred.authenticate.properties.headers.Authorization, /\{\{\$credentials\.apiKey\}\}/);
});

const firmar = (secret, ts, body) => crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

test('la firma se acepta solo si cuadra, está fresca y no viene vacía', () => {
    const body = JSON.stringify({ event: 'quote.approved' });
    const ts = Math.floor(Date.now() / 1000);
    assert.equal(signatureMatches(body, `t=${ts},v1=${firmar('s3cret', ts, body)}`, 's3cret'), true);
    assert.equal(signatureMatches(body, `t=${ts},v1=${firmar('otro', ts, body)}`, 's3cret'), false);
    assert.equal(signatureMatches(body, `t=${ts},v1=${firmar('s3cret', ts, body)}`, ''), false);
    assert.equal(signatureMatches(body + ' ', `t=${ts},v1=${firmar('s3cret', ts, body)}`, 's3cret'), false);
    const viejo = ts - 3600;
    assert.equal(signatureMatches(body, `t=${viejo},v1=${firmar('s3cret', viejo, body)}`, 's3cret'), false, 'replay de una entrega vieja');
});

test('durante una rotación de secreto basta con que una de las dos firmas cuadre', () => {
    const body = JSON.stringify({ event: 'quote.paid' });
    const ts = Math.floor(Date.now() / 1000);
    const header = `t=${ts},v1=${firmar('nuevo', ts, body)},v1=${firmar('viejo', ts, body)}`;
    assert.equal(signatureMatches(body, header, 'nuevo'), true);
    assert.equal(signatureMatches(body, header, 'viejo'), true);
    assert.equal(signatureMatches(body, header, 'ajeno'), false);
});
