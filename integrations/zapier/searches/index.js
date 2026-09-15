'use strict';

const { api } = require('../lib/config');
const { CLIENT, QUOTE } = require('../lib/samples');

const findClient = {
    key: 'find_client',
    noun: 'Client',
    display: { label: 'Find Client', description: 'Finds a client by exact email or by name.' },
    operation: {
        inputFields: [
            { key: 'email', label: 'Email', helpText: 'Exact match, not case sensitive. Takes priority over the name.' },
            { key: 'q', label: 'Name, contact or tax ID' },
        ],
        perform: async (z, bundle) => {
            const email = String(bundle.inputData.email || '').trim();
            const q = String(bundle.inputData.q || '').trim();
            if (!email && !q) throw new z.errors.Error('Enter an email or a name to search for.', 'MissingSearch', 400);
            const response = await z.request({ url: api('/clientes'), params: email ? { email, limit: 10 } : { q, limit: 10 } });
            return response.data.data;
        },
        sample: { id: CLIENT.object_id, empresa: CLIENT.empresa, email: CLIENT.email },
    },
};

const findQuote = {
    key: 'find_quote',
    noun: 'Quote',
    display: { label: 'Find Quote', description: 'Finds a quote by its number, for example COT-00104.' },
    operation: {
        inputFields: [{ key: 'folio', label: 'Quote number', required: true }],
        perform: async (z, bundle) => {
            const response = await z.request({ url: api('/cotizaciones'), params: { folio: String(bundle.inputData.folio || '').trim(), limit: 1 } });
            return response.data.data;
        },
        sample: { id: QUOTE.object_id, folio: QUOTE.folio, status: QUOTE.status, total: QUOTE.total },
    },
};

module.exports = { find_client: findClient, find_quote: findQuote };
