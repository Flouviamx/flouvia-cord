'use strict';

const { BASE_URL, api } = require('./lib/config');

const form = { 'Content-Type': 'application/x-www-form-urlencoded' };

async function test(z) {
    const response = await z.request({ url: api('/me') });
    return response.data.data;
}

module.exports = {
    type: 'oauth2',
    oauth2Config: {
        authorizeUrl: {
            url: `${BASE_URL}/oauth/authorize`,
            params: {
                client_id: '{{process.env.CLIENT_ID}}',
                state: '{{bundle.inputData.state}}',
                redirect_uri: '{{bundle.inputData.redirect_uri}}',
                response_type: 'code',
                scope: 'write',
            },
        },
        getAccessToken: {
            url: `${BASE_URL}/api/oauth/token`,
            method: 'POST',
            headers: form,
            body: {
                code: '{{bundle.inputData.code}}',
                client_id: '{{process.env.CLIENT_ID}}',
                client_secret: '{{process.env.CLIENT_SECRET}}',
                grant_type: 'authorization_code',
                redirect_uri: '{{bundle.inputData.redirect_uri}}',
                code_verifier: '{{bundle.inputData.code_verifier}}',
            },
        },
        refreshAccessToken: {
            url: `${BASE_URL}/api/oauth/token`,
            method: 'POST',
            headers: form,
            body: {
                refresh_token: '{{bundle.authData.refresh_token}}',
                client_id: '{{process.env.CLIENT_ID}}',
                client_secret: '{{process.env.CLIENT_SECRET}}',
                grant_type: 'refresh_token',
            },
        },
        enablePkce: true,
        autoRefresh: true,
    },
    test,
    connectionLabel: (z, bundle) => {
        const data = bundle.inputData || {};
        const name = (data.org && data.org.nombre) || 'Cord';
        return data.mode === 'test' ? `${name} (test)` : name;
    },
};
