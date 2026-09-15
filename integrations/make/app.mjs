import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { EVENTS } = require('../zapier/lib/events.js');

export const API_ORIGIN = 'https://cordhq.app';
const API = `${API_ORIGIN}/api/v1`;

export const APP = {
    name: 'cord',
    label: 'Cord',
    description: 'Quotes, invoices and payments in one link. Create clients and quotes, send them, record payments and react instantly to what your clients do.',
    theme: '#0a192f',
    language: 'en',
};

export const BASE = {
    baseUrl: API,
    headers: {
        Authorization: 'Bearer {{connection.apiKey}}',
        Accept: 'application/json',
        'User-Agent': 'Cord-Make/1.0',
    },
    response: {
        error: {
            message: '[{{statusCode}}] {{ifempty(body.error, "Cord returned an error.")}}',
        },
    },
    log: { sanitize: ['request.headers.authorization'] },
};

export const CONNECTION = {
    label: 'Cord',
    type: 'apikey',
    parameters: [
        {
            name: 'apiKey',
            type: 'password',
            label: 'Secret API key',
            required: true,
            editable: true,
            help: 'Create a secret key in Cord: turn on Developer mode at the bottom of the Settings index and open the API tab. Use a key with write permission. Keys that start with sk_test_ work with your test environment. Publishable keys (pk_) do not work here.',
        },
    ],
    api: {
        url: `${API}/me`,
        method: 'GET',
        headers: {
            Authorization: 'Bearer {{parameters.apiKey}}',
            Accept: 'application/json',
        },
        response: {
            valid: '{{indexOf(parameters.apiKey, "sk_") == 0}}',
            error: {
                message: '[{{statusCode}}] {{ifempty(body.error, "Use a secret API key from Cord (sk_live_ or sk_test_).")}}',
            },
            metadata: {
                type: 'text',
                value: '{{body.data.org.nombre}}{{if(body.data.mode == "test", " (test)", "")}}',
            },
        },
        log: { sanitize: ['request.headers.authorization'] },
    },
};

const eventOptions = EVENTS.map((e) => ({ label: `${e.category}: ${e.label}`, value: e.key }));

const DATA_SPEC = [
    { name: 'id', type: 'text', label: 'Object ID' },
    { name: 'object', type: 'text', label: 'Object type' },
    { name: 'folio', type: 'text', label: 'Quote number' },
    { name: 'numero', type: 'text', label: 'Invoice number' },
    { name: 'status', type: 'text', label: 'Quote status' },
    { name: 'estado', type: 'text', label: 'Status' },
    { name: 'moneda', type: 'text', label: 'Currency' },
    { name: 'total', type: 'number', label: 'Total' },
    { name: 'monto', type: 'number', label: 'Amount' },
    { name: 'saldo', type: 'number', label: 'Balance' },
    { name: 'cliente', type: 'text', label: 'Client name' },
    { name: 'cliente_id', type: 'text', label: 'Client ID' },
    { name: 'cotizacion_id', type: 'text', label: 'Quote ID' },
    { name: 'empresa', type: 'text', label: 'Company' },
    { name: 'contacto', type: 'text', label: 'Contact name' },
    { name: 'email', type: 'email', label: 'Email' },
    { name: 'telefono', type: 'text', label: 'Phone' },
    { name: 'titulo', type: 'text', label: 'Task title' },
    { name: 'due_date', type: 'date', label: 'Due date' },
    { name: 'link_publico', type: 'url', label: 'Public link' },
];

export const WEBHOOK = {
    label: 'Cord events',
    type: 'web',
    parameters: [
        {
            name: 'eventos',
            type: 'select',
            multiple: true,
            label: 'Events',
            required: true,
            help: 'Cord sends only the events you choose to this scenario.',
            options: eventOptions,
        },
    ],
    attach: {
        url: '/webhooks',
        method: 'POST',
        body: { url: '{{webhook.url}}', eventos: '{{parameters.eventos}}' },
        response: { data: { id: '{{body.data.id}}' } },
    },
    detach: {
        url: '/webhooks/{{webhook.id}}',
        method: 'DELETE',
    },
    api: {
        condition: '{{contains(parameters.eventos, body.event)}}',
        output: {
            id: '{{body.id}}',
            event: '{{body.event}}',
            created_at: '{{body.created_at}}',
            data: '{{body.data}}',
        },
    },
};

const CLIENT_INTERFACE = [
    { name: 'id', type: 'text', label: 'Client ID' },
    { name: 'empresa', type: 'text', label: 'Company' },
    { name: 'contacto', type: 'text', label: 'Contact name' },
    { name: 'email', type: 'email', label: 'Email' },
    { name: 'telefono', type: 'text', label: 'Phone' },
    { name: 'rfc', type: 'text', label: 'Tax ID (RFC)' },
    { name: 'terminos', type: 'text', label: 'Payment terms' },
    { name: 'country_code', type: 'text', label: 'Country code' },
    { name: 'created_at', type: 'date', label: 'Created at' },
];

const QUOTE_INTERFACE = [
    { name: 'id', type: 'text', label: 'Quote ID' },
    { name: 'folio', type: 'text', label: 'Quote number' },
    { name: 'status', type: 'text', label: 'Status' },
    { name: 'moneda', type: 'text', label: 'Currency' },
    { name: 'subtotal', type: 'number', label: 'Subtotal' },
    { name: 'total', type: 'number', label: 'Total' },
    { name: 'cliente', type: 'text', label: 'Client name' },
    { name: 'cliente_id', type: 'text', label: 'Client ID' },
    { name: 'link_publico', type: 'url', label: 'Public link' },
    { name: 'created_at', type: 'date', label: 'Created at' },
];

const TERMS = [
    { label: 'Upfront', value: 'contado' },
    { label: 'Net 30', value: 'net30' },
    { label: 'Net 60', value: 'net60' },
];

const clientFields = (requireCompany) => [
    { name: 'empresa', type: 'text', label: 'Company name', required: requireCompany },
    { name: 'contacto', type: 'text', label: 'Contact name' },
    { name: 'email', type: 'email', label: 'Email' },
    { name: 'telefono', type: 'text', label: 'Phone' },
    { name: 'rfc', type: 'text', label: 'Tax ID (RFC)', help: 'Only for clients invoiced in Mexico.' },
    { name: 'terminos', type: 'select', label: 'Payment terms', options: TERMS },
    { name: 'country_code', type: 'text', label: 'Country code', help: 'Two-letter ISO code, for example MX, US or ES.' },
];

const clientSelect = { name: 'id', type: 'select', label: 'Client', required: true, options: 'rpc://listClients', mappable: true };
const quoteId = { name: 'id', type: 'text', label: 'Quote ID', required: true, help: 'Use the ID from a Cord trigger or from Search Quotes.' };
const limitParam = { name: 'limit', type: 'uinteger', label: 'Limit', default: 10, help: 'Maximum number of results to return during one execution cycle.' };

const CLIENT_SAMPLE = { id: '8a2d4e6f-1b3c-4d5e-8f9a-0b1c2d3e4f5a', empresa: 'Stark Industries', contacto: 'Pepper Potts', email: 'compras@stark.com', terminos: 'net30', country_code: 'MX' };
const QUOTE_SAMPLE = { id: '3f1c9a52-7b8e-4d21-9c0a-5e6f7a8b9c0d', folio: 'COT-00104', status: 'approved', moneda: 'MXN', total: 58000, cliente: 'Stark Industries', link_publico: 'https://cordhq.app/q/3xYz9KpQ' };

const thenGet = (request, url) => [
    { ...request, response: { temp: { id: '{{ifempty(body.data.id, parameters.id)}}' } } },
    { url, method: 'GET', response: { output: '{{body.data}}' } },
];

const pageOf = (url, qs) => ({
    url,
    method: 'GET',
    qs: { ...qs, limit: 100 },
    response: { iterate: '{{body.data}}', output: '{{item}}', limit: '{{parameters.limit}}' },
    pagination: { qs: { offset: '{{(pagination.page - 1) * 100}}' }, condition: '{{body.meta.offset + body.meta.limit < body.meta.total}}' },
});

export const MODULES = [
    {
        name: 'watchEvents',
        typeId: 10,
        webhook: true,
        label: 'Watch Events',
        description: 'Triggers when any of the selected events happens in Cord.',
        api: {},
        parameters: [],
        expect: [],
        interface: [
            { name: 'id', type: 'text', label: 'Event ID' },
            { name: 'event', type: 'text', label: 'Event type' },
            { name: 'created_at', type: 'date', label: 'Created at' },
            { name: 'data', type: 'collection', label: 'Data', spec: DATA_SPEC },
        ],
        samples: { id: 'evt_7d3f1a9b2c4e6f80', event: 'quote.approved', created_at: '2026-09-14T18:30:00.000Z', data: QUOTE_SAMPLE },
    },
    {
        name: 'createClient',
        typeId: 4,
        label: 'Create a Client',
        description: 'Creates a client in your Cord directory.',
        api: thenGet({ url: '/clientes', method: 'POST', body: '{{parameters}}' }, '/clientes/{{temp.id}}'),
        parameters: [],
        expect: clientFields(true),
        interface: CLIENT_INTERFACE,
        samples: CLIENT_SAMPLE,
    },
    {
        name: 'updateClient',
        typeId: 4,
        label: 'Update a Client',
        description: 'Updates the contact details of a client. Fields you leave empty are not changed.',
        api: thenGet({ url: '/clientes/{{parameters.id}}', method: 'PATCH', body: '{{omit(parameters, "id")}}' }, '/clientes/{{temp.id}}'),
        parameters: [],
        expect: [clientSelect, ...clientFields(false)],
        interface: CLIENT_INTERFACE,
        samples: CLIENT_SAMPLE,
    },
    {
        name: 'getClient',
        typeId: 4,
        label: 'Get a Client',
        description: 'Returns a client by its ID.',
        api: { url: '/clientes/{{parameters.id}}', method: 'GET', response: { output: '{{body.data}}' } },
        parameters: [],
        expect: [clientSelect],
        interface: CLIENT_INTERFACE,
        samples: CLIENT_SAMPLE,
    },
    {
        name: 'searchClients',
        typeId: 9,
        label: 'Search Clients',
        description: 'Searches clients by exact email or by name, contact or tax ID.',
        api: pageOf('/clientes', { email: '{{parameters.email}}', q: '{{parameters.q}}' }),
        parameters: [],
        expect: [
            { name: 'email', type: 'email', label: 'Email', help: 'Exact match, not case sensitive. Takes priority over the name.' },
            { name: 'q', type: 'text', label: 'Name, contact or tax ID' },
            limitParam,
        ],
        interface: CLIENT_INTERFACE,
        samples: CLIENT_SAMPLE,
    },
    {
        name: 'createQuote',
        typeId: 4,
        label: 'Create a Quote',
        description: 'Creates a quote with line items. It stays as a draft unless you choose to send it.',
        api: thenGet({ url: '/cotizaciones', method: 'POST', body: '{{parameters}}' }, '/cotizaciones/{{temp.id}}'),
        parameters: [],
        expect: [
            { name: 'cliente_id', type: 'select', label: 'Client', options: 'rpc://listClients', mappable: true },
            {
                name: 'items',
                type: 'array',
                label: 'Line items',
                required: true,
                spec: [
                    { name: 'descripcion', type: 'text', label: 'Description', required: true },
                    { name: 'cantidad', type: 'number', label: 'Quantity', required: true },
                    { name: 'precio_unitario', type: 'number', label: 'Unit price', required: true },
                ],
            },
            { name: 'base_currency', type: 'text', label: 'Currency', help: 'ISO 4217 code, for example MXN or USD. Leave empty to use your account currency.' },
            { name: 'terminos', type: 'select', label: 'Payment terms', options: TERMS },
            { name: 'vigencia_dias', type: 'uinteger', label: 'Valid for (days)' },
            { name: 'notas', type: 'text', label: 'Notes', multiline: true },
            { name: 'send', type: 'boolean', label: 'Send to the client now', default: false },
        ],
        interface: QUOTE_INTERFACE,
        samples: { ...QUOTE_SAMPLE, status: 'draft' },
    },
    {
        name: 'getQuote',
        typeId: 4,
        label: 'Get a Quote',
        description: 'Returns a quote by its ID.',
        api: { url: '/cotizaciones/{{parameters.id}}', method: 'GET', response: { output: '{{body.data}}' } },
        parameters: [],
        expect: [quoteId],
        interface: QUOTE_INTERFACE,
        samples: QUOTE_SAMPLE,
    },
    {
        name: 'searchQuotes',
        typeId: 9,
        label: 'Search Quotes',
        description: 'Searches quotes by number.',
        api: pageOf('/cotizaciones', { folio: '{{parameters.folio}}' }),
        parameters: [],
        expect: [{ name: 'folio', type: 'text', label: 'Quote number', help: 'For example COT-00104.' }, limitParam],
        interface: QUOTE_INTERFACE,
        samples: QUOTE_SAMPLE,
    },
    {
        name: 'sendQuote',
        typeId: 4,
        label: 'Send a Quote',
        description: 'Sends a draft quote to its client.',
        api: thenGet({ url: '/cotizaciones/{{parameters.id}}', method: 'POST', body: { action: 'send' } }, '/cotizaciones/{{temp.id}}'),
        parameters: [],
        expect: [quoteId],
        interface: QUOTE_INTERFACE,
        samples: { ...QUOTE_SAMPLE, status: 'sent' },
    },
    {
        name: 'markQuotePaid',
        typeId: 4,
        label: 'Mark a Quote as Paid',
        description: 'Records that an approved quote was paid outside Cord, for example by bank transfer.',
        api: thenGet({ url: '/cotizaciones/{{parameters.id}}', method: 'POST', body: { action: 'mark_paid', payment_method: '{{parameters.payment_method}}' } }, '/cotizaciones/{{temp.id}}'),
        parameters: [],
        expect: [quoteId, { name: 'payment_method', type: 'text', label: 'Payment method', help: 'Optional, for example transfer or cash.' }],
        interface: QUOTE_INTERFACE,
        samples: { ...QUOTE_SAMPLE, status: 'paid' },
    },
    {
        name: 'createTask',
        typeId: 4,
        label: 'Create a Task',
        description: 'Creates a follow-up task for your team, optionally linked to a quote.',
        api: {
            url: '/tareas',
            method: 'POST',
            body: {
                titulo: '{{parameters.titulo}}',
                due_date: '{{if(parameters.due_date, formatDate(parameters.due_date, "YYYY-MM-DD"), "")}}',
                cotizacion_id: '{{parameters.cotizacion_id}}',
            },
            response: {
                output: {
                    id: '{{body.data.id}}',
                    titulo: '{{parameters.titulo}}',
                    due_date: '{{if(parameters.due_date, formatDate(parameters.due_date, "YYYY-MM-DD"), "")}}',
                    cotizacion_id: '{{parameters.cotizacion_id}}',
                },
            },
        },
        parameters: [],
        expect: [
            { name: 'titulo', type: 'text', label: 'Title', required: true },
            { name: 'due_date', type: 'date', label: 'Due date', help: 'Only the date is used.' },
            { name: 'cotizacion_id', type: 'text', label: 'Quote ID' },
        ],
        interface: [
            { name: 'id', type: 'text', label: 'Task ID' },
            { name: 'titulo', type: 'text', label: 'Title' },
            { name: 'due_date', type: 'date', label: 'Due date' },
            { name: 'cotizacion_id', type: 'text', label: 'Quote ID' },
        ],
        samples: { id: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a', titulo: 'Call Stark Industries about COT-00104', due_date: '2026-09-20' },
    },
    {
        name: 'makeApiCall',
        typeId: 12,
        label: 'Make an API Call',
        description: 'Performs an arbitrary authorized API call.',
        api: {
            url: `${API_ORIGIN}/api/{{parameters.url}}`,
            method: '{{parameters.method}}',
            qs: { '{{...}}': "{{toCollection(parameters.qs, 'key', 'value')}}" },
            headers: { '{{...}}': "{{toCollection(parameters.headers, 'key', 'value')}}" },
            body: '{{parameters.body}}',
            type: 'text',
            response: { output: { body: '{{body}}', headers: '{{headers}}', statusCode: '{{statusCode}}' } },
        },
        parameters: [],
        expect: [
            { name: 'url', type: 'text', label: 'URL', required: true, help: `Enter a path relative to \`${API_ORIGIN}/api\`. For example: \`/v1/clientes\`` },
            {
                name: 'method',
                type: 'select',
                label: 'Method',
                required: true,
                default: 'GET',
                options: ['GET', 'POST', 'PATCH', 'DELETE'].map((m) => ({ label: m, value: m })),
            },
            {
                name: 'headers',
                type: 'array',
                label: 'Headers',
                help: "You don't have to add authorization headers; we already did that for you.",
                default: [{ key: 'Content-Type', value: 'application/json' }],
                spec: [{ name: 'key', type: 'text', label: 'Key' }, { name: 'value', type: 'text', label: 'Value' }],
            },
            { name: 'qs', type: 'array', label: 'Query String', spec: [{ name: 'key', type: 'text', label: 'Key' }, { name: 'value', type: 'text', label: 'Value' }] },
            { name: 'body', type: 'any', label: 'Body' },
        ],
        interface: [
            { name: 'body', type: 'any', label: 'Body' },
            { name: 'headers', type: 'collection', label: 'Headers' },
            { name: 'statusCode', type: 'number', label: 'Status code' },
        ],
        samples: {},
    },
];

export const RPCS = [
    {
        name: 'listClients',
        label: 'List Clients',
        api: {
            url: '/clientes',
            method: 'GET',
            qs: { limit: 100 },
            response: { iterate: '{{body.data}}', output: { label: '{{item.empresa}}', value: '{{item.id}}' } },
            pagination: { qs: { offset: '{{(pagination.page - 1) * 100}}' }, condition: '{{body.meta.offset + body.meta.limit < body.meta.total}}' },
        },
    },
];

export const GROUPS = [
    { label: 'Events', modules: ['watchEvents'] },
    { label: 'Clients', modules: ['createClient', 'updateClient', 'getClient', 'searchClients'] },
    { label: 'Quotes', modules: ['createQuote', 'getQuote', 'searchQuotes', 'sendQuote', 'markQuotePaid'] },
    { label: 'Tasks', modules: ['createTask'] },
    { label: 'Other', modules: ['makeApiCall'] },
];

export const README = `# Cord

Cord connects your quotes, invoices and payments with the rest of your stack.

1. In Cord, turn on Developer mode at the bottom of the Settings index and create a secret API key with write permission in the API tab.
2. In Make, add a Cord module and create a connection with that key.
3. Use **Watch Events** to start a scenario the moment a quote is approved, paid or any other Cord event happens.

Setup guide: ${API_ORIGIN}/soporte/conectar-make
`;
