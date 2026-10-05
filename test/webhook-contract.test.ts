import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { WEBHOOK_EVENT_OBJECTS, WEBHOOK_EVENT_TYPES, isWebhookEventType } from '../packages/elements/src/contract/webhook-events';

vi.mock('../src/lib/db', () => ({ sql: vi.fn(), withOrgTx: vi.fn() }));
vi.mock('../src/lib/after', () => ({ after: vi.fn() }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn() } }));

const { DOMAIN_EVENTS } = await import('../src/lib/domain-events');

describe('contrato de webhooks', () => {
    it('coincide uno a uno con los eventos públicos de dominio, con el mismo objeto', () => {
        const publicos = Object.entries(DOMAIN_EVENTS)
            .filter(([, meta]) => meta.public)
            .map(([type, meta]) => [type, meta.object]);
        expect(Object.fromEntries(publicos)).toEqual(WEBHOOK_EVENT_OBJECTS);
    });

    it('no expone eventos internos', () => {
        for (const [type, meta] of Object.entries(DOMAIN_EVENTS)) {
            if (!meta.public) expect(isWebhookEventType(type), type).toBe(false);
        }
    });

    it('la documentación de webhooks lista cada evento en los dos idiomas', () => {
        for (const lang of ['es', 'en']) {
            const doc = readFileSync(`src/content/docs/${lang}/desarrolladores/herramientas/webhooks.mdx`, 'utf8');
            const faltan = WEBHOOK_EVENT_TYPES.filter((t) => !doc.includes(`\`${t}\``));
            expect(faltan, lang).toEqual([]);
        }
    });
});
