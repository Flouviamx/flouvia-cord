'use strict';

const { api } = require('./lib/config');

async function test(z, bundle) {
    const key = String((bundle.authData && bundle.authData.apiKey) || '').trim();
    if (!/^sk_(live|test)_/.test(key)) {
        throw new z.errors.Error('Use a secret API key from Cord (it starts with sk_live_ or sk_test_). Publishable keys (pk_) do not work here.', 'InvalidKey', 401);
    }
    const response = await z.request({ url: api('/me') });
    return response.data.data;
}

module.exports = {
    type: 'custom',
    fields: [
        {
            key: 'apiKey',
            label: 'Secret API key',
            type: 'password',
            required: true,
            helpText: 'Create a secret key in Cord: turn on Developer mode at the bottom of the Settings index and open the **API** tab in the Developers dock. Use a key with write permission: Zapier needs it to receive instant events and to create or update records. Keys that start with `sk_test_` work with your test environment. [How to create an API key](https://cordhq.app/en/support/claves-api)',
        },
    ],
    test,
    connectionLabel: (z, bundle) => {
        const data = bundle.inputData || {};
        const name = (data.org && data.org.nombre) || 'Cord';
        return data.mode === 'test' ? `${name} (test)` : name;
    },
};
