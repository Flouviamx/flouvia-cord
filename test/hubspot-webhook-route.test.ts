import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

const m = vi.hoisted(() => ({
    resolve: vi.fn(),
    enqueue: vi.fn(),
    process: vi.fn(),
    creds: { clientId: 'cid', clientSecret: 'csecret' } as null | { clientId: string; clientSecret: string },
}));

vi.mock('../src/lib/db', () => ({ resolveIntegracion: m.resolve }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn() } }));
vi.mock('../src/lib/after', () => ({ after: vi.fn() }));
vi.mock('../src/lib/integraciones/sync', () => ({ enqueueInbound: m.enqueue, processOrgSync: m.process }));
vi.mock('../src/lib/integraciones/hubspot/config', () => ({ hubspotCredentials: () => m.creds }));

const { POST } = await import('../src/pages/api/integraciones/hubspot/webhook');

const URL_HOOK = 'https://cordhq.app/api/integraciones/hubspot/webhook';

function request(body: string, opts: { signed?: boolean; ts?: number } = {}) {
    const ts = String(opts.ts ?? Date.now());
    const signature = createHmac('sha256', 'csecret').update(`POST${URL_HOOK}${body}${ts}`).digest('base64');
    return new Request(URL_HOOK, {
        method: 'POST',
        body,
        headers: opts.signed === false ? {} : { 'x-hubspot-signature-v3': signature, 'x-hubspot-request-timestamp': ts },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    m.creds = { clientId: 'cid', clientSecret: 'csecret' };
    m.resolve.mockImplementation(async (_p: string, cuenta: string) => (cuenta === '555' ? { orgId: 'org-a', conexionId: 'con-a' } : null));
    m.enqueue.mockResolvedValue(true);
});

describe('POST /api/integraciones/hubspot/webhook', () => {
    const body = JSON.stringify([
        { portalId: 555, objectId: 10, subscriptionType: 'company.propertyChange' },
        { portalId: 999, objectId: 11, subscriptionType: 'contact.propertyChange' },
        { portalId: 555, objectId: 12, subscriptionType: 'deal.propertyChange' },
    ]);

    it('sin firma o con firma vieja responde 401 sin consultar la base', async () => {
        expect((await POST({ request: request(body, { signed: false }) } as any)).status).toBe(401);
        expect((await POST({ request: request(body, { ts: Date.now() - 10 * 60 * 1000 }) } as any)).status).toBe(401);
        expect(m.resolve).not.toHaveBeenCalled();
        expect(m.enqueue).not.toHaveBeenCalled();
    });

    it('con firma válida encola solo cambios de cuentas conectadas y nunca deals', async () => {
        const res = await POST({ request: request(body) } as any);
        expect(res.status).toBe(204);
        expect(m.enqueue).toHaveBeenCalledTimes(1);
        expect(m.enqueue).toHaveBeenCalledWith('org-a', 'con-a', 'company', '10');
    });

    it('sin credenciales configuradas responde 503', async () => {
        m.creds = null;
        expect((await POST({ request: request(body) } as any)).status).toBe(503);
    });

    it('rechaza cuerpos demasiado grandes', async () => {
        const grande = JSON.stringify([{ pad: 'x'.repeat(600 * 1024) }]);
        expect((await POST({ request: request(grande) } as any)).status).toBe(413);
    });
});
