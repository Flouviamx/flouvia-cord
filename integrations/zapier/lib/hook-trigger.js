'use strict';

const { api } = require('./config');
const { EVENT_KEYS, EVENT_CHOICES } = require('./events');
const { verifyCordSignature } = require('./signature');
const { sampleFor } = require('./samples');

function flattenEvent(envelope) {
    const data = envelope && typeof envelope.data === 'object' && envelope.data ? envelope.data : {};
    const { id: objectId, ...rest } = data;
    return {
        id: envelope.id,
        event: envelope.event,
        created_at: envelope.created_at,
        object_id: objectId === undefined ? null : objectId,
        ...rest,
    };
}

function selectedEvents(bundle, fixed) {
    if (fixed) return fixed;
    const chosen = bundle.inputData && bundle.inputData.event;
    return EVENT_KEYS.includes(chosen) ? [chosen] : [];
}

function hookTrigger({ key, noun, label, description, events, hidden = false }) {
    const pick = (bundle) => selectedEvents(bundle, events);

    const performSubscribe = async (z, bundle) => {
        const eventos = pick(bundle);
        if (!eventos.length) throw new z.errors.Error('Choose which Cord event should start this Zap.', 'MissingEvent', 400);
        const response = await z.request({
            method: 'POST',
            url: api('/webhooks'),
            body: { url: bundle.targetUrl, eventos },
        });
        const hook = response.data.data;
        return { id: hook.id, secret: hook.secret };
    };

    const performUnsubscribe = async (z, bundle) => {
        const id = bundle.subscribeData && bundle.subscribeData.id;
        if (!id) return {};
        const response = await z.request({ method: 'DELETE', url: api(`/webhooks/${encodeURIComponent(id)}`) });
        return response.data || {};
    };

    const perform = (z, bundle) => {
        const raw = bundle.rawRequest || {};
        const valid = verifyCordSignature({
            secret: bundle.subscribeData && bundle.subscribeData.secret,
            headers: raw.headers,
            content: raw.content,
        });
        if (!valid) throw new z.errors.HaltedError('Ignored a request that was not signed by Cord.');
        const envelope = bundle.cleanedRequest || {};
        if (!pick(bundle).includes(envelope.event)) return [];
        return [flattenEvent(envelope)];
    };

    const performList = async (z, bundle) => {
        const [type] = pick(bundle);
        if (!type) return [];
        const response = await z.request({ url: api('/events'), params: { type, limit: 3 } });
        const items = Array.isArray(response.data.data) ? response.data.data : [];
        return items.map((e) => flattenEvent({ id: e.id, event: e.type, created_at: e.created_at, data: e.data }));
    };

    return {
        key,
        noun,
        display: { label, description, hidden },
        operation: {
            type: 'hook',
            inputFields: events ? [] : [{ key: 'event', label: 'Event', required: true, choices: EVENT_CHOICES, altersDynamicFields: false }],
            performSubscribe,
            performUnsubscribe,
            perform,
            performList,
            sample: sampleFor(events ? events[0] : 'quote.approved'),
        },
    };
}

module.exports = { hookTrigger, flattenEvent };
