import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { WEBHOOK_EVENT_IDS } from '../src/lib/webhooks';

const require = createRequire(import.meta.url);

describe('catálogo de eventos de las apps de integración', () => {
    it('Zapier ofrece exactamente los eventos que Cord emite', () => {
        const { EVENT_KEYS } = require('../integrations/zapier/lib/events.js');
        expect([...EVENT_KEYS].sort()).toEqual([...WEBHOOK_EVENT_IDS].sort());
    });
});
