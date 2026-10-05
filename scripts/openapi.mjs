#!/usr/bin/env node
// Genera public/openapi.json (OpenAPI 3.1) desde src/lib/api-schema.ts.
//   node --experimental-strip-types scripts/openapi.mjs          → escribe
//   node --experimental-strip-types scripts/openapi.mjs --check  → falla si difiere
import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import {
    OPERATIONS, ApiError, WEBHOOK_DATA_BY_OBJECT, webhookEnvelope, webhookEvents,
} from '../src/lib/api-schema.ts';
import { API_VERSIONS, LATEST_API_VERSION } from '../src/lib/api-versions.ts';

const OUT = new URL('../public/openapi.json', import.meta.url);
// Todo JSON es YAML válido: el enlace histórico a openapi.yaml sirve la misma spec.
const OUT_YAML = new URL('../public/openapi.yaml', import.meta.url);

const schema = (s) => {
    const json = z.toJSONSchema(s, { unrepresentable: 'any' });
    delete json.$schema;
    return json;
};

const errorResponse = (description) => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } });

function envelope(op) {
    if (op.response === 'stream') {
        return { description: 'Eventos `item`, `done` y `error` en text/event-stream.', content: { 'text/event-stream': { schema: { type: 'string' } } } };
    }
    const data = schema(op.response);
    const props = { data: op.page ? { type: 'array', items: data } : data };
    if (op.page === 'offset') props.meta = { type: 'object', properties: { limit: { type: 'integer' }, offset: { type: 'integer' }, total: { type: 'integer' } }, required: ['limit', 'offset', 'total'] };
    if (op.page === 'cursor') props.meta = { type: 'object', properties: { next_cursor: { type: ['string', 'null'] } }, required: ['next_cursor'] };
    return {
        description: 'OK',
        headers: {
            'Cord-Request-Id': { schema: { type: 'string' }, description: 'Identificador de la petición; inclúyelo al pedir soporte.' },
            'Cord-Version': { schema: { type: 'string' }, description: 'Versión de la API con la que se respondió.' },
        },
        content: { 'application/json': { schema: { type: 'object', properties: props, required: Object.keys(props) } } },
    };
}

function operation(op) {
    const params = [
        { name: 'Cord-Version', in: 'header', required: false, schema: { type: 'string', enum: [...API_VERSIONS] }, description: 'Default: la versión fijada de tu llave.' },
    ];
    for (const name of op.path.match(/\{(\w+)\}/g) ?? []) {
        params.push({ name: name.slice(1, -1), in: 'path', required: true, schema: { type: 'string' } });
    }
    for (const [name, s] of Object.entries(op.query ?? {})) params.push({ name, in: 'query', required: false, schema: schema(s) });
    if (op.method !== 'GET') params.push({ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string', maxLength: 255 }, description: 'Reintento seguro: misma clave y mismo cuerpo, mismo resultado (24 h).' });

    const security = op.publishable ? [{ secretKey: [] }, { publishableKey: [] }] : [{ secretKey: [] }];
    const out = {
        operationId: `${op.method.toLowerCase()}${op.path.replace(/\{(\w+)\}/g, 'By_$1').replace(/[^A-Za-z0-9]+(\w)/g, (_, c) => c.toUpperCase())}`,
        summary: op.summary,
        tags: [op.tag],
        security,
        parameters: params,
        'x-cord-scope': op.scope,
        ...(op.testOnly ? { 'x-cord-test-only': true, description: 'Solo con una llave de prueba (sk_test_).' } : {}),
        responses: {
            200: envelope(op),
            400: errorResponse('Petición inválida'),
            401: errorResponse('Llave ausente, inválida o revocada'),
            403: errorResponse('Sin permiso para esta operación'),
            429: errorResponse('Límite de peticiones; respeta Retry-After'),
        },
    };
    if (op.body) {
        out.requestBody = {
            required: true,
            content: op.multipart ? { 'multipart/form-data': { schema: schema(op.body) } } : { 'application/json': { schema: schema(op.body) } },
        };
    }
    return out;
}

const paths = {};
for (const op of OPERATIONS) {
    paths[op.path] ??= {};
    paths[op.path][op.method.toLowerCase()] = operation(op);
}

const webhooks = {};
for (const [event, object] of webhookEvents()) {
    webhooks[event] = {
        post: {
            operationId: `webhook_${event.replace('.', '_')}`,
            summary: event,
            description: 'Firmado con X-Cord-Signature-V1: t=<unix>,v1=<HMAC-SHA256(secreto, "<t>.<cuerpo>")>.',
            requestBody: { content: { 'application/json': { schema: schema(webhookEnvelope(event, WEBHOOK_DATA_BY_OBJECT[object])) } } },
            responses: { 200: { description: 'Responde 2xx para confirmar la entrega.' } },
        },
    };
}

const spec = {
    openapi: '3.1.0',
    info: {
        title: 'Cord API',
        version: LATEST_API_VERSION,
        description: 'API pública de Cord. Toda respuesta viene en { data }; los errores, en { error, code, request_id, doc_url }. Generada desde src/lib/api-schema.ts.',
    },
    servers: [{ url: 'https://cordhq.app/api/v1' }],
    security: [{ secretKey: [] }],
    components: {
        securitySchemes: {
            secretKey: { type: 'http', scheme: 'bearer', description: 'sk_live_… o sk_test_…, solo desde tu servidor.' },
            publishableKey: { type: 'http', scheme: 'bearer', description: 'pk_live_… o pk_test_…, para el navegador; solo las operaciones marcadas.' },
        },
        schemas: { ApiError: schema(ApiError) },
    },
    paths,
    webhooks,
};

const json = JSON.stringify(spec, null, 2) + '\n';
if (process.argv.includes('--check')) {
    const read = (u) => { try { return readFileSync(u, 'utf8'); } catch { return ''; } };
    if (read(OUT) !== json || read(OUT_YAML) !== json) {
        console.error('✗ public/openapi.json no coincide con src/lib/api-schema.ts. Corre `npm run api:spec`.');
        process.exit(1);
    }
    console.log(`api:spec OK — ${OPERATIONS.length} operaciones, ${Object.keys(webhooks).length} webhooks.`);
} else {
    writeFileSync(OUT, json);
    writeFileSync(OUT_YAML, json);
    console.log(`✓ public/openapi.json: ${OPERATIONS.length} operaciones, ${Object.keys(webhooks).length} webhooks.`);
}
