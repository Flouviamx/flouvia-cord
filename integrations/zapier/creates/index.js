'use strict';

const { api } = require('../lib/config');
const { CLIENT, QUOTE, TASK } = require('../lib/samples');

const TERMS = [
    { value: 'contado', sample: 'contado', label: 'Upfront' },
    { value: 'net30', sample: 'net30', label: 'Net 30' },
    { value: 'net60', sample: 'net60', label: 'Net 60' },
];

const clientContactFields = (requireCompany) => [
    { key: 'empresa', label: 'Company name', required: requireCompany },
    { key: 'contacto', label: 'Contact name' },
    { key: 'email', label: 'Email' },
    { key: 'telefono', label: 'Phone' },
    { key: 'rfc', label: 'Tax ID (RFC)', helpText: 'Only for clients invoiced in Mexico.' },
    { key: 'terminos', label: 'Payment terms', choices: TERMS },
    { key: 'country_code', label: 'Country code', helpText: 'Two-letter ISO code, for example MX, US or ES.' },
];

const pickDefined = (input, keys) => Object.fromEntries(keys.filter((k) => input[k] !== undefined && input[k] !== '').map((k) => [k, input[k]]));

const CONTACT_KEYS = ['empresa', 'contacto', 'email', 'telefono', 'rfc', 'terminos', 'country_code'];

async function getClient(z, id) {
    const response = await z.request({ url: api(`/clientes/${encodeURIComponent(id)}`) });
    return response.data.data;
}

async function getQuote(z, id) {
    const response = await z.request({ url: api(`/cotizaciones/${encodeURIComponent(id)}`) });
    return response.data.data;
}

const createClient = {
    key: 'create_client',
    noun: 'Client',
    display: { label: 'Create Client', description: 'Creates a client in your Cord directory.' },
    operation: {
        inputFields: clientContactFields(true),
        perform: async (z, bundle) => {
            const response = await z.request({ method: 'POST', url: api('/clientes'), body: pickDefined(bundle.inputData, CONTACT_KEYS) });
            return getClient(z, response.data.data.id);
        },
        sample: { id: CLIENT.object_id, empresa: CLIENT.empresa, contacto: CLIENT.contacto, email: CLIENT.email },
    },
};

const updateClient = {
    key: 'update_client',
    noun: 'Client',
    display: { label: 'Update Client', description: 'Updates the contact details of an existing client. Fields you leave empty are not changed.' },
    operation: {
        inputFields: [
            { key: 'id', label: 'Client', required: true, dynamic: 'client_list.id.empresa', search: 'find_client.id' },
            ...clientContactFields(false),
        ],
        perform: async (z, bundle) => {
            const { id } = bundle.inputData;
            await z.request({ method: 'PATCH', url: api(`/clientes/${encodeURIComponent(id)}`), body: pickDefined(bundle.inputData, CONTACT_KEYS) });
            return getClient(z, id);
        },
        sample: { id: CLIENT.object_id, empresa: CLIENT.empresa, email: CLIENT.email },
    },
};

const createQuote = {
    key: 'create_quote',
    noun: 'Quote',
    display: { label: 'Create Quote', description: 'Creates a quote with line items. It stays as a draft unless you choose to send it.' },
    operation: {
        inputFields: [
            { key: 'cliente_id', label: 'Client', dynamic: 'client_list.id.empresa', search: 'find_client.id' },
            {
                key: 'items',
                label: 'Line items',
                required: true,
                children: [
                    { key: 'descripcion', label: 'Description', required: true },
                    { key: 'cantidad', label: 'Quantity', type: 'number', required: true },
                    { key: 'precio_unitario', label: 'Unit price', type: 'number', required: true },
                ],
            },
            { key: 'base_currency', label: 'Currency', helpText: 'ISO 4217 code, for example MXN or USD. Leave empty to use your account currency.' },
            { key: 'terminos', label: 'Payment terms', choices: TERMS },
            { key: 'vigencia_dias', label: 'Valid for (days)', type: 'integer' },
            { key: 'notas', label: 'Notes', type: 'text' },
            { key: 'send', label: 'Send to the client now', type: 'boolean', default: 'no' },
        ],
        perform: async (z, bundle) => {
            const input = bundle.inputData;
            const items = (Array.isArray(input.items) ? input.items : []).map((it) => ({
                descripcion: String(it.descripcion || ''),
                cantidad: Number(it.cantidad),
                precio_unitario: Number(it.precio_unitario),
            }));
            const body = {
                ...pickDefined(input, ['cliente_id', 'base_currency', 'terminos', 'notas']),
                items,
                send: input.send === true || input.send === 'true' || input.send === 'yes',
            };
            if (input.vigencia_dias !== undefined && input.vigencia_dias !== '') body.vigencia_dias = Number(input.vigencia_dias);
            const response = await z.request({ method: 'POST', url: api('/cotizaciones'), body });
            return response.data.data;
        },
        sample: { id: QUOTE.object_id, folio: QUOTE.folio, status: 'draft', total: QUOTE.total, link_publico: QUOTE.link_publico },
    },
};

const quoteAction = (key, label, description, action, extraFields = []) => ({
    key,
    noun: 'Quote',
    display: { label, description },
    operation: {
        inputFields: [{ key: 'id', label: 'Quote ID', required: true, search: 'find_quote.id', helpText: 'Use the ID from a trigger or from the Find Quote search.' }, ...extraFields],
        perform: async (z, bundle) => {
            const { id, ...rest } = bundle.inputData;
            await z.request({ method: 'POST', url: api(`/cotizaciones/${encodeURIComponent(id)}`), body: { action, ...pickDefined(rest, extraFields.map((f) => f.key)) } });
            return getQuote(z, id);
        },
        sample: { id: QUOTE.object_id, folio: QUOTE.folio, status: action === 'mark_paid' ? 'paid' : 'sent', total: QUOTE.total },
    },
});

const sendQuote = quoteAction('send_quote', 'Send Quote', 'Sends a draft quote to its client.', 'send');

const markQuotePaid = quoteAction('mark_quote_paid', 'Mark Quote as Paid', 'Records that an approved quote was paid outside Cord, for example by bank transfer.', 'mark_paid', [
    { key: 'payment_method', label: 'Payment method', helpText: 'Optional, for example transfer or cash.' },
]);

const createTask = {
    key: 'create_task',
    noun: 'Task',
    display: { label: 'Create Task', description: 'Creates a follow-up task for your team, optionally linked to a quote.' },
    operation: {
        inputFields: [
            { key: 'titulo', label: 'Title', required: true },
            { key: 'due_date', label: 'Due date', type: 'datetime', helpText: 'Only the date is used.' },
            { key: 'cotizacion_id', label: 'Quote ID', search: 'find_quote.id' },
        ],
        perform: async (z, bundle) => {
            const input = bundle.inputData;
            const body = { titulo: input.titulo };
            if (input.due_date) body.due_date = String(input.due_date).slice(0, 10);
            if (input.cotizacion_id) body.cotizacion_id = input.cotizacion_id;
            const response = await z.request({ method: 'POST', url: api('/tareas'), body });
            return { id: response.data.data.id, ...body };
        },
        sample: { id: TASK.object_id, titulo: TASK.titulo, due_date: TASK.due_date },
    },
};

module.exports = Object.fromEntries([createClient, updateClient, createQuote, sendQuote, markQuotePaid, createTask].map((c) => [c.key, c]));
