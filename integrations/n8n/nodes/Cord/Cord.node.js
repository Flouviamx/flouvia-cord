'use strict';

// Nodo de acción de Cord para n8n. Estilo declarativo (`routing`): n8n arma la
// petición desde la descripción, así que no hay código de red que mantener ni
// una segunda forma de construir la URL.
//
// La API v1 es la misma que usan Zapier y Make; lo que cambia aquí es sólo la
// forma en que n8n describe campos y operaciones.

const API = 'https://cordhq.app/api/v1';

const terminos = [
    { name: 'Upfront', value: 'contado' },
    { name: 'Net 30', value: 'net30' },
    { name: 'Net 60', value: 'net60' },
];

const contactFields = (resource, operation, required) => [
    {
        displayName: 'Company',
        name: 'empresa',
        type: 'string',
        default: '',
        required,
        displayOptions: { show: { resource: [resource], operation: [operation] } },
        routing: { send: { type: 'body', property: 'empresa' } },
    },
    {
        displayName: 'Additional Fields',
        name: 'extra',
        type: 'collection',
        placeholder: 'Add field',
        default: {},
        displayOptions: { show: { resource: [resource], operation: [operation] } },
        options: [
            { displayName: 'Contact', name: 'contacto', type: 'string', default: '', routing: { send: { type: 'body', property: 'contacto' } } },
            { displayName: 'Email', name: 'email', type: 'string', placeholder: 'nombre@empresa.com', default: '', routing: { send: { type: 'body', property: 'email' } } },
            { displayName: 'Phone', name: 'telefono', type: 'string', default: '', routing: { send: { type: 'body', property: 'telefono' } } },
            { displayName: 'Tax ID', name: 'rfc', type: 'string', default: '', description: 'Only for clients invoiced in Mexico', routing: { send: { type: 'body', property: 'rfc' } } },
            { displayName: 'Payment Terms', name: 'terminos', type: 'options', options: terminos, default: 'contado', routing: { send: { type: 'body', property: 'terminos' } } },
            { displayName: 'Country Code', name: 'country_code', type: 'string', default: '', description: 'Two-letter ISO code, for example MX, US or ES', routing: { send: { type: 'body', property: 'country_code' } } },
        ],
    },
];

const properties = [
    {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        default: 'quote',
        options: [
            { name: 'Client', value: 'client' },
            { name: 'Quote', value: 'quote' },
            { name: 'Task', value: 'task' },
        ],
    },

    // ── Clientes ────────────────────────────────────────────────────────────
    {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'create',
        displayOptions: { show: { resource: ['client'] } },
        options: [
            { name: 'Create', value: 'create', action: 'Create a client', routing: { request: { method: 'POST', url: '/clientes' } } },
            { name: 'Update', value: 'update', action: 'Update a client', routing: { request: { method: 'PATCH', url: '=/clientes/{{$parameter.clientId}}' } } },
            { name: 'Get', value: 'get', action: 'Get a client', routing: { request: { method: 'GET', url: '=/clientes/{{$parameter.clientId}}' } } },
            { name: 'Search', value: 'search', action: 'Search clients', routing: { request: { method: 'GET', url: '/clientes' } } },
        ],
    },
    {
        displayName: 'Client ID',
        name: 'clientId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['client'], operation: ['update', 'get'] } },
    },
    ...contactFields('client', 'create', true),
    ...contactFields('client', 'update', false),
    {
        displayName: 'Search',
        name: 'q',
        type: 'string',
        default: '',
        description: 'Text or email to look for',
        displayOptions: { show: { resource: ['client'], operation: ['search'] } },
        routing: { send: { type: 'query', property: 'q' } },
    },

    // ── Cotizaciones ────────────────────────────────────────────────────────
    {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'create',
        displayOptions: { show: { resource: ['quote'] } },
        options: [
            { name: 'Create', value: 'create', action: 'Create a quote', routing: { request: { method: 'POST', url: '/cotizaciones' } } },
            { name: 'Get', value: 'get', action: 'Get a quote', routing: { request: { method: 'GET', url: '=/cotizaciones/{{$parameter.quoteId}}' } } },
            { name: 'Search', value: 'search', action: 'Search quotes', routing: { request: { method: 'GET', url: '/cotizaciones' } } },
            { name: 'Send', value: 'send', action: 'Send a quote', routing: { request: { method: 'POST', url: '=/cotizaciones/{{$parameter.quoteId}}', body: { action: 'send' } } } },
            { name: 'Mark as Paid', value: 'paid', action: 'Mark a quote as paid', routing: { request: { method: 'POST', url: '=/cotizaciones/{{$parameter.quoteId}}', body: { action: 'paid' } } } },
        ],
    },
    {
        displayName: 'Quote ID',
        name: 'quoteId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['quote'], operation: ['get', 'send', 'paid'] } },
    },
    {
        displayName: 'Client ID',
        name: 'cliente_id',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['quote'], operation: ['create'] } },
        routing: { send: { type: 'body', property: 'cliente_id' } },
    },
    {
        displayName: 'Items',
        name: 'items',
        placeholder: 'Add item',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        default: {},
        displayOptions: { show: { resource: ['quote'], operation: ['create'] } },
        options: [
            {
                name: 'item',
                displayName: 'Item',
                values: [
                    { displayName: 'Description', name: 'descripcion', type: 'string', default: '' },
                    { displayName: 'Quantity', name: 'cantidad', type: 'number', default: 1 },
                    { displayName: 'Unit Price', name: 'precio_unitario', type: 'number', default: 0 },
                ],
            },
        ],
        routing: { send: { type: 'body', property: 'items', value: '={{ $value.item }}' } },
    },
    {
        displayName: 'Additional Fields',
        name: 'quoteExtra',
        type: 'collection',
        placeholder: 'Add field',
        default: {},
        displayOptions: { show: { resource: ['quote'], operation: ['create'] } },
        options: [
            { displayName: 'Currency', name: 'base_currency', type: 'string', default: '', description: 'ISO 4217 code, for example MXN or USD. Empty uses your account currency.', routing: { send: { type: 'body', property: 'base_currency' } } },
            { displayName: 'Payment Terms', name: 'terminos', type: 'options', options: terminos, default: 'contado', routing: { send: { type: 'body', property: 'terminos' } } },
            { displayName: 'Valid For (Days)', name: 'vigencia_dias', type: 'number', default: 15, routing: { send: { type: 'body', property: 'vigencia_dias' } } },
            { displayName: 'Notes', name: 'notas', type: 'string', typeOptions: { rows: 3 }, default: '', routing: { send: { type: 'body', property: 'notas' } } },
            { displayName: 'Send Now', name: 'send', type: 'boolean', default: false, description: 'Whether to send the quote to the client right away', routing: { send: { type: 'body', property: 'send' } } },
        ],
    },
    {
        displayName: 'Search',
        name: 'q',
        type: 'string',
        default: '',
        description: 'Quote number or client to look for',
        displayOptions: { show: { resource: ['quote'], operation: ['search'] } },
        routing: { send: { type: 'query', property: 'q' } },
    },
    {
        displayName: 'Payment Method',
        name: 'payment_method',
        type: 'string',
        default: '',
        description: 'Optional, for example transfer or cash',
        displayOptions: { show: { resource: ['quote'], operation: ['paid'] } },
        routing: { send: { type: 'body', property: 'payment_method' } },
    },

    // ── Tareas ──────────────────────────────────────────────────────────────
    {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'create',
        displayOptions: { show: { resource: ['task'] } },
        options: [
            { name: 'Create', value: 'create', action: 'Create a task', routing: { request: { method: 'POST', url: '/tareas' } } },
        ],
    },
    {
        displayName: 'Title',
        name: 'titulo',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['task'], operation: ['create'] } },
        routing: { send: { type: 'body', property: 'titulo' } },
    },
    {
        displayName: 'Additional Fields',
        name: 'taskExtra',
        type: 'collection',
        placeholder: 'Add field',
        default: {},
        displayOptions: { show: { resource: ['task'], operation: ['create'] } },
        options: [
            { displayName: 'Due Date', name: 'due_date', type: 'dateTime', default: '', description: 'Only the date is used', routing: { send: { type: 'body', property: 'due_date' } } },
            { displayName: 'Quote ID', name: 'cotizacion_id', type: 'string', default: '', routing: { send: { type: 'body', property: 'cotizacion_id' } } },
        ],
    },
];

class Cord {
    constructor() {
        this.description = {
            displayName: 'Cord',
            name: 'cord',
            icon: 'file:cord.svg',
            group: ['transform'],
            version: 1,
            subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
            description: 'From proposal to payment, all in one link',
            defaults: { name: 'Cord' },
            inputs: ['main'],
            outputs: ['main'],
            credentials: [{ name: 'cordApi', required: true }],
            requestDefaults: {
                baseURL: API,
                headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            },
            properties,
        };
    }
}

module.exports = { Cord, properties, API };
