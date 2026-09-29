import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ sql: vi.fn(), withOrgTx: vi.fn() }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { parseSlackAccess, slackAuthorizeUrl, slackCredentials } = await import('../src/lib/integraciones/slack-oauth');
const { escapeSlack } = await import('../src/lib/slack');

describe('slack-oauth', () => {
    const saved = { id: process.env.SLACK_CLIENT_ID, secret: process.env.SLACK_CLIENT_SECRET };
    beforeEach(() => { delete process.env.SLACK_CLIENT_ID; delete process.env.SLACK_CLIENT_SECRET; });
    afterEach(() => { process.env.SLACK_CLIENT_ID = saved.id; process.env.SLACK_CLIENT_SECRET = saved.secret; if (saved.id === undefined) delete process.env.SLACK_CLIENT_ID; if (saved.secret === undefined) delete process.env.SLACK_CLIENT_SECRET; });

    it('sin credenciales no hay flujo: la tarjeta cae al webhook propio', () => {
        expect(slackCredentials()).toBeNull();
        expect(slackAuthorizeUrl('https://cordhq.app/cb', 'st')).toBeNull();
    });

    it('la URL de autorización pide el webhook y los permisos de la app, y lleva el state', () => {
        process.env.SLACK_CLIENT_ID = '123.456';
        process.env.SLACK_CLIENT_SECRET = 'sec';
        const url = new URL(slackAuthorizeUrl('https://cordhq.app/api/integraciones/slack/callback', 'abc') as string);
        expect(url.origin + url.pathname).toBe('https://slack.com/oauth/v2/authorize');
        expect(url.searchParams.get('scope')).toBe('incoming-webhook,links:read,links:write,commands,users:read,users:read.email');
        expect(url.searchParams.get('scope')).not.toMatch(/history|chat:write|channels:read/);
        expect(url.searchParams.get('client_id')).toBe('123.456');
        expect(url.searchParams.get('state')).toBe('abc');
        expect(url.searchParams.get('redirect_uri')).toBe('https://cordhq.app/api/integraciones/slack/callback');
        expect(url.search).not.toContain('sec');
    });

    it('toma el webhook, el equipo y el token del bot, que se guarda cifrado', () => {
        const install = parseSlackAccess({
            ok: true, access_token: 'xoxb-1-2-abc', scope: 'incoming-webhook,commands', team: { name: 'Acme', id: 'T0C3JUM5NJY' },
            incoming_webhook: { channel: '#ventas', channel_id: 'C1', configuration_url: 'https://x', url: 'https://hooks.slack.com/services/T000/B000/abc123' },
        });
        expect(install).toEqual({
            webhookUrl: 'https://hooks.slack.com/services/T000/B000/abc123', channel: '#ventas', team: 'Acme',
            teamId: 'T0C3JUM5NJY', botToken: 'xoxb-1-2-abc', scopes: ['incoming-webhook', 'commands'],
        });
    });

    it('un token que no es de bot o un equipo inválido no se toman', () => {
        const install = parseSlackAccess({
            ok: true, access_token: 'xoxp-de-usuario', team: { id: 'no-es-un-team' },
            incoming_webhook: { url: 'https://hooks.slack.com/services/T/B/x' },
        });
        expect(install).toMatchObject({ botToken: null, teamId: null });
    });

    it('rechaza lo que no es un webhook de Slack', () => {
        expect(parseSlackAccess(null)).toBeNull();
        expect(parseSlackAccess({ ok: false, error: 'invalid_code' })).toBeNull();
        expect(parseSlackAccess({ ok: true })).toBeNull();
        expect(parseSlackAccess({ ok: true, incoming_webhook: { url: 'https://evil.test/services/T/B/x' } })).toBeNull();
        expect(parseSlackAccess({ ok: true, incoming_webhook: { url: 'http://hooks.slack.com/services/T/B/x' } })).toBeNull();
        expect(parseSlackAccess({ ok: true, incoming_webhook: { url: 'https://hooks.slack.com/services/T/B/x?next=https://evil.test' } })).toBeNull();
    });

    it('un canal o equipo ausente no rompe la conexión', () => {
        expect(parseSlackAccess({ ok: true, incoming_webhook: { url: 'https://hooks.slack.com/services/T/B/x' } })).toEqual({
            webhookUrl: 'https://hooks.slack.com/services/T/B/x', channel: null, team: null, teamId: null, botToken: null, scopes: [],
        });
    });
});

describe('datos ajenos en un mensaje de Slack', () => {
    it('un nombre con sintaxis de enlace llega como texto, no como enlace', () => {
        expect(escapeSlack('<https://evil.example|Da clic aquí>'))
            .toBe('&lt;https://evil.example|Da clic aquí&gt;');
        expect(escapeSlack('ACME & Co')).toBe('ACME &amp; Co');
        expect(escapeSlack('Cliente normal')).toBe('Cliente normal');
    });
});
