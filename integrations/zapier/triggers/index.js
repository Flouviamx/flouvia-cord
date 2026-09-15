'use strict';

const { hookTrigger } = require('../lib/hook-trigger');
const { api } = require('../lib/config');
const { CLIENT } = require('../lib/samples');

const hooks = [
    hookTrigger({ key: 'new_event', noun: 'Event', label: 'New Event', description: 'Triggers instantly when the Cord event you choose happens.' }),
    hookTrigger({ key: 'quote_approved', noun: 'Quote', label: 'Quote Approved', description: 'Triggers instantly when a client approves a quote.', events: ['quote.approved'] }),
    hookTrigger({ key: 'quote_paid', noun: 'Quote', label: 'Quote Paid', description: 'Triggers instantly when a quote is paid in full.', events: ['quote.paid'] }),
    hookTrigger({ key: 'quote_sent', noun: 'Quote', label: 'Quote Sent', description: 'Triggers instantly when a quote is sent to a client.', events: ['quote.sent'] }),
    hookTrigger({ key: 'quote_viewed', noun: 'Quote', label: 'Quote Opened by Client', description: 'Triggers instantly the first time a client opens a quote.', events: ['quote.viewed'] }),
    hookTrigger({ key: 'quote_created', noun: 'Quote', label: 'Quote Created', description: 'Triggers instantly when a quote is created.', events: ['quote.created'] }),
    hookTrigger({ key: 'quote_rejected', noun: 'Quote', label: 'Quote Rejected', description: 'Triggers instantly when a client rejects a quote.', events: ['quote.rejected'] }),
    hookTrigger({ key: 'payment_partial', noun: 'Payment', label: 'Partial Payment Received', description: 'Triggers instantly when a deposit, balance or installment is paid without completing the quote.', events: ['payment.partial'] }),
    hookTrigger({ key: 'invoice_paid', noun: 'Invoice', label: 'Invoice Paid', description: 'Triggers instantly when an invoice is paid.', events: ['invoice.paid'] }),
    hookTrigger({ key: 'client_created', noun: 'Client', label: 'New Client', description: 'Triggers instantly when a client is created in Cord.', events: ['client.created'] }),
];

const clientList = {
    key: 'client_list',
    noun: 'Client',
    display: { label: 'List Clients', description: 'Lists clients for dropdowns.', hidden: true },
    operation: {
        canPaginate: true,
        perform: async (z, bundle) => {
            const limit = 100;
            const offset = (bundle.meta && bundle.meta.page ? bundle.meta.page : 0) * limit;
            const response = await z.request({ url: api('/clientes'), params: { limit, offset } });
            return response.data.data;
        },
        sample: { id: CLIENT.object_id, empresa: CLIENT.empresa, email: CLIENT.email },
    },
};

module.exports = Object.fromEntries([...hooks, clientList].map((t) => [t.key, t]));
