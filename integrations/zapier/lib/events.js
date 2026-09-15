'use strict';

const EVENTS = [
    { key: 'quote.created', label: 'Quote created', category: 'Quotes' },
    { key: 'quote.sent', label: 'Quote sent', category: 'Quotes' },
    { key: 'quote.viewed', label: 'Client opened a quote', category: 'Quotes' },
    { key: 'quote.approved', label: 'Quote approved', category: 'Quotes' },
    { key: 'quote.rejected', label: 'Quote rejected', category: 'Quotes' },
    { key: 'quote.updated', label: 'Quote edited and resent', category: 'Quotes' },
    { key: 'quote.expired', label: 'Quote expired', category: 'Quotes' },
    { key: 'quote.deleted', label: 'Draft deleted', category: 'Quotes' },
    { key: 'quote.comment_added', label: 'Message posted on a quote', category: 'Quotes' },
    { key: 'quote.approval_requested', label: 'Internal approval requested', category: 'Approvals' },
    { key: 'quote.approval_decided', label: 'Internal approval decided', category: 'Approvals' },
    { key: 'quote.paid', label: 'Quote paid in full', category: 'Payments' },
    { key: 'payment.partial', label: 'Partial payment received', category: 'Payments' },
    { key: 'payment.failed', label: 'Recurring charge failed', category: 'Payments' },
    { key: 'invoice.issued', label: 'Quote invoiced', category: 'Invoices' },
    { key: 'invoice.stamped', label: 'Quote CFDI stamped', category: 'Invoices' },
    { key: 'invoice.finalized', label: 'Invoice issued', category: 'Invoices' },
    { key: 'invoice.sent', label: 'Invoice sent', category: 'Invoices' },
    { key: 'invoice.paid', label: 'Invoice paid', category: 'Invoices' },
    { key: 'invoice.payment_failed', label: 'Invoice payment failed', category: 'Invoices' },
    { key: 'invoice.overdue', label: 'Invoice overdue', category: 'Invoices' },
    { key: 'invoice.voided', label: 'Invoice voided', category: 'Invoices' },
    { key: 'invoice.marked_uncollectible', label: 'Invoice marked uncollectible', category: 'Invoices' },
    { key: 'client.created', label: 'Client created', category: 'Clients' },
    { key: 'client.updated', label: 'Client updated', category: 'Clients' },
    { key: 'client.deleted', label: 'Client deleted', category: 'Clients' },
    { key: 'product.created', label: 'Product created', category: 'Products' },
    { key: 'product.updated', label: 'Product updated', category: 'Products' },
    { key: 'product.deleted', label: 'Product deleted', category: 'Products' },
    { key: 'task.created', label: 'Task created', category: 'Tasks' },
    { key: 'task.completed', label: 'Task completed', category: 'Tasks' },
    { key: 'promise.created', label: 'Payment promise recorded', category: 'Tasks' },
    { key: 'promise.kept', label: 'Payment promise kept', category: 'Tasks' },
    { key: 'promise.broken', label: 'Payment promise broken', category: 'Tasks' },
    { key: 'dispute.created', label: 'Dispute opened', category: 'Payments' },
    { key: 'dispute.closed', label: 'Dispute closed', category: 'Payments' },
    { key: 'refund.succeeded', label: 'Refund succeeded', category: 'Payments' },
    { key: 'refund.failed', label: 'Refund failed', category: 'Payments' },
    { key: 'payout.paid', label: 'Payout paid', category: 'Payments' },
    { key: 'payout.failed', label: 'Payout failed', category: 'Payments' },
    { key: 'account.updated', label: 'Payments account updated', category: 'Payments' },
];

const EVENT_KEYS = EVENTS.map((e) => e.key);

const EVENT_CHOICES = EVENTS.map((e) => ({ value: e.key, label: `${e.category}: ${e.label}`, sample: e.key }));

module.exports = { EVENTS, EVENT_KEYS, EVENT_CHOICES };
