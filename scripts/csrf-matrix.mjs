import assert from 'node:assert/strict';
import { isAllowedMutationOrigin, isCsrfExemptWrite } from '../src/lib/csrf-policy.ts';

const uuid = '123e4567-e89b-12d3-a456-426614174000';
const exempt = [
    ['/api/stripe/webhook', 'POST'],
    ['/api/v1/cotizaciones', 'POST'],
    ['/api/mcp', 'POST'],
    ['/api/mcp/message', 'POST'],
    ['/api/cron/webhook-heartbeat', 'POST'],
    [`/api/auth/saml/${uuid}/acs`, 'POST'],
];
for (const [path, method] of exempt) {
    assert.equal(isCsrfExemptWrite(path, method), true, `${method} ${path} debe ser CSRF-exempt`);
}

const guarded = [
    ['/api/auth/login', 'POST'],
    ['/api/org', 'PATCH'],
    ['/api/q/token/payment-intent', 'POST'],
    ['/api/billing/connect/capture/token', 'POST'],
    ['/api/contacto/ventas', 'POST'],
    ['/api/ops/operators', 'POST'],
];
for (const [path, method] of guarded) {
    assert.equal(isCsrfExemptWrite(path, method), false, `${method} ${path} debe exigir Origin`);
}

assert.equal(isAllowedMutationOrigin('/api/org', null, 'https://cordhq.app', 'https://cordhq.app'), false);
assert.equal(isAllowedMutationOrigin('/api/org', 'https://cordhq.app.evil.com', 'https://cordhq.app', 'https://cordhq.app'), false);
assert.equal(isAllowedMutationOrigin('/api/org', 'https://cordhq.app', 'https://cordhq.app', 'https://cordhq.app'), true);
assert.equal(isAllowedMutationOrigin('/api/ops/operators', 'https://cordhq.app', 'https://ops.cordhq.app', 'https://cordhq.app'), false);

console.log('Matriz CSRF correcta.');
