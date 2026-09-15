'use strict';

const { version } = require('../package.json');

function addAuth(request, z, bundle) {
    request.headers = request.headers || {};
    if (bundle.authData && bundle.authData.apiKey) request.headers.Authorization = `Bearer ${bundle.authData.apiKey}`;
    request.headers.Accept = 'application/json';
    request.headers['User-Agent'] = `Cord-Zapier/${version}`;
    return request;
}

function handleErrors(response, z) {
    if (response.status < 400) return response;
    const body = response.data && typeof response.data === 'object' ? response.data : {};
    const message = typeof body.error === 'string' && body.error ? body.error : `Cord responded with status ${response.status}.`;
    const code = typeof body.code === 'string' ? body.code : 'CordError';
    throw new z.errors.Error(message, code, response.status);
}

module.exports = { addAuth, handleErrors };
