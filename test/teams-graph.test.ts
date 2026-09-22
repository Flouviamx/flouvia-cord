import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const withOrgTx = vi.fn();
vi.mock('../src/lib/db', () => ({ sql: vi.fn(() => ''), withOrgTx: (...a: unknown[]) => withOrgTx(...a) }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('../src/lib/crypto-secret', () => ({
    encryptRequiredSecret: (v: string) => `enc:${v}`,
    decryptSecret: (v: string | null) => (v ? v.replace(/^enc:/, '') : null),
}));

const G = await import('../src/lib/integraciones/teams-graph');
const { quoteCard, textCard } = await import('../src/lib/teams');

const TEAM = '8f4c6f0e-7a1b-4c2d-9e3f-1a2b3c4d5e6f';
const CHANNEL = '19:4a95f7d8db4c4e7fae857bcebe0623e6@thread.tacv2';

describe('teams-graph', () => {
    const saved = { id: process.env.TEAMS_CLIENT_ID, secret: process.env.TEAMS_CLIENT_SECRET };
    beforeEach(() => { delete process.env.TEAMS_CLIENT_ID; delete process.env.TEAMS_CLIENT_SECRET; withOrgTx.mockReset(); });
    afterEach(() => {
        vi.unstubAllGlobals();
        for (const [k, v] of [['TEAMS_CLIENT_ID', saved.id], ['TEAMS_CLIENT_SECRET', saved.secret]] as const) {
            if (v === undefined) delete process.env[k]; else process.env[k] = v;
        }
    });

    it('sin credenciales no hay botón: la tarjeta cae al flujo de Power Automate', () => {
        expect(G.teamsCredentials()).toBeNull();
        expect(G.teamsAuthorizeUrl('https://cordhq.app/cb', 'st')).toBeNull();
    });

    it('pide solo cuentas de trabajo, los permisos delegados mínimos y lleva el state', () => {
        process.env.TEAMS_CLIENT_ID = 'app-id';
        process.env.TEAMS_CLIENT_SECRET = 'sec';
        const url = new URL(G.teamsAuthorizeUrl('https://cordhq.app/api/integraciones/teams/callback', 'abc') as string);
        expect(url.origin + url.pathname).toBe('https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize');
        expect(url.searchParams.get('scope')?.split(' ').sort()).toEqual(
            ['Channel.ReadBasic.All', 'ChannelMessage.Send', 'Team.ReadBasic.All', 'User.Read', 'offline_access'].sort());
        expect(url.searchParams.get('state')).toBe('abc');
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.search).not.toContain('sec');
    });

    it('un token sin refresh no sirve: sin él la conexión muere en una hora', () => {
        expect(G.parseTokenResponse({ access_token: 'a', expires_in: 3600 })).toBeNull();
        expect(G.parseTokenResponse({ access_token: 'a', refresh_token: 'r', expires_in: '3599' })).toEqual({ accessToken: 'a', refreshToken: 'r', expiresIn: 3599 });
        expect(G.parseTokenResponse({ access_token: 'a', refresh_token: 'r' })?.expiresIn).toBe(3600);
    });

    it('solo invalid_grant e interaction_required piden volver a conectar', () => {
        expect(G.isRevokedTokenError({ error: 'invalid_grant' })).toBe(true);
        expect(G.isRevokedTokenError({ error: 'interaction_required' })).toBe(true);
        expect(G.isRevokedTokenError({ error: 'temporarily_unavailable' })).toBe(false);
        expect(G.isRevokedTokenError(null)).toBe(false);
    });

    it('los ids del navegador se validan antes de armar una ruta de Graph', () => {
        expect(G.isTeamId(TEAM)).toBe(true);
        expect(G.isTeamId('../me')).toBe(false);
        expect(G.isChannelId(CHANNEL)).toBe(true);
        expect(G.isChannelId('19:abc/../../users')).toBe(false);
        expect(G.isChannelId('general')).toBe(false);
    });

    it('la tarjeta viaja como texto JSON referenciado desde el cuerpo', () => {
        const card = quoteCard('notify.quote_paid', { folio: 'COT-1', cliente: 'ACME', total: 100, link: 'https://cordhq.app/q/x' });
        const msg = G.graphMessage(card);
        expect(msg.body.content).toBe('<attachment id="cord"></attachment>');
        expect(msg.attachments[0].id).toBe('cord');
        expect(typeof msg.attachments[0].content).toBe('string');
        expect(JSON.parse(msg.attachments[0].content)).toEqual(card);
    });

    it('con canal elegido publica por Graph, no por el flujo', async () => {
        withOrgTx
            .mockResolvedValueOnce([[{ teams_webhook_url: 'https://x.logic.azure.com/wf', teams_team_id: TEAM, teams_channel_id: CHANNEL, teams_graph_estado: 'activa' }]])
            .mockResolvedValueOnce([[{ teams_graph_access_enc: 'enc:tok', teams_graph_refresh_enc: 'enc:ref', teams_graph_estado: 'activa', expira: false }]]);
        const fetch = vi.fn(async () => new Response('{}', { status: 201 }));
        vi.stubGlobal('fetch', fetch);
        expect(await G.deliverTeams('org', textCard('hola'))).toEqual({ ok: true });
        const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(`https://graph.microsoft.com/v1.0/teams/${TEAM}/channels/${encodeURIComponent(CHANNEL)}/messages`);
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('si Microsoft revocó el acceso, marca la conexión y pide volver a conectar', async () => {
        process.env.TEAMS_CLIENT_ID = 'app-id';
        process.env.TEAMS_CLIENT_SECRET = 'sec';
        withOrgTx
            .mockResolvedValueOnce([[{ teams_team_id: TEAM, teams_channel_id: CHANNEL, teams_graph_estado: 'activa' }]])
            .mockResolvedValueOnce([[{ teams_graph_access_enc: 'enc:tok', teams_graph_refresh_enc: 'enc:ref', teams_graph_estado: 'activa', expira: true }]])
            .mockResolvedValueOnce([[]]);
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })));
        expect(await G.deliverTeams('org', textCard('hola'))).toEqual({ ok: false, reason: 'reconectar' });
        expect(withOrgTx).toHaveBeenCalledTimes(3);
    });

    it('sin canal usa el flujo de Power Automate, y sin nada lo dice', async () => {
        withOrgTx.mockResolvedValueOnce([[{ teams_webhook_url: 'https://x.logic.azure.com/wf', teams_graph_estado: null }]]);
        const fetch = vi.fn(async () => new Response('', { status: 202 }));
        vi.stubGlobal('fetch', fetch);
        expect(await G.deliverTeams('org', textCard('hola'))).toEqual({ ok: true });
        expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe('https://x.logic.azure.com/wf');

        withOrgTx.mockResolvedValueOnce([[{ teams_webhook_url: null, teams_graph_estado: null }]]);
        expect(await G.deliverTeams('org', textCard('hola'))).toEqual({ ok: false, reason: 'sin_conexion' });
    });
});
