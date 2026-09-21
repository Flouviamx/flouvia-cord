'use strict';

// Credencial de Cord: una llave secreta de la API v1. La prueba de conexión
// pega a /v1/me, igual que Zapier y Make — así el usuario sabe en el momento si
// la llave es de prueba o de producción, en vez de descubrirlo con el primer
// escenario en vivo.
class CordApi {
    constructor() {
        this.name = 'cordApi';
        this.displayName = 'Cord API';
        this.documentationUrl = 'https://cordhq.app/soporte/conectar-n8n';
        this.properties = [
            {
                displayName: 'API Key',
                name: 'apiKey',
                type: 'string',
                typeOptions: { password: true },
                default: '',
                required: true,
                description: 'Secret key from Cord (sk_live_… or sk_test_…). Create it in Settings, Developer mode, API tab. Publishable keys (pk_) do not work here.',
            },
        ];
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    Authorization: '=Bearer {{$credentials.apiKey}}',
                    Accept: 'application/json',
                    'User-Agent': 'Cord-n8n/1.0',
                },
            },
        };
        this.test = {
            request: {
                baseURL: 'https://cordhq.app/api/v1',
                url: '/me',
                method: 'GET',
            },
        };
    }
}

module.exports = { CordApi };
