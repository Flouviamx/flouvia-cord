'use strict';

const { errors } = require('zapier-platform-core');

function fakeZ(responses = {}) {
    const calls = [];
    const z = {
        errors,
        calls,
        request: async (options) => {
            calls.push(options);
            const method = (options.method || 'GET').toUpperCase();
            const path = new URL(options.url).pathname;
            const handler = responses[`${method} ${path}`];
            if (!handler) throw new Error(`petición no esperada: ${method} ${path}`);
            const data = typeof handler === 'function' ? handler(options) : handler;
            return { status: 200, data };
        },
    };
    return z;
}

module.exports = { fakeZ };
