import { sql, withOrgTx } from '../db';
import { log } from '../log';
import { decryptSecret, encryptRequiredSecret } from '../crypto-secret';
import { postTeamsCard, type AdaptiveCard } from '../teams';

// Solo cuentas de trabajo o escuela: los canales de Teams no existen en cuentas personales.
const LOGIN = 'https://login.microsoftonline.com/organizations/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'offline_access User.Read Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Send';
const TIMEOUT_MS = 10_000;
const REFRESH_MARGIN_SECONDS = 120;
const TEAM_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNEL_RE = /^19:[\w.=@-]{1,200}$/;

export const isTeamId = (v: unknown): v is string => typeof v === 'string' && TEAM_RE.test(v);
export const isChannelId = (v: unknown): v is string => typeof v === 'string' && CHANNEL_RE.test(v);

export const teamsCredentials = () => {
    const clientId = import.meta.env.TEAMS_CLIENT_ID || process.env.TEAMS_CLIENT_ID;
    const clientSecret = import.meta.env.TEAMS_CLIENT_SECRET || process.env.TEAMS_CLIENT_SECRET;
    return clientId && clientSecret ? { clientId, clientSecret } : null;
};

export function teamsAuthorizeUrl(redirectUri: string, state: string): string | null {
    const creds = teamsCredentials();
    if (!creds) return null;
    const url = new URL(`${LOGIN}/authorize`);
    url.searchParams.set('client_id', creds.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');
    return url.toString();
}

export interface GraphTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

export function parseTokenResponse(data: any): GraphTokens | null {
    if (!data || typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') return null;
    if (!data.access_token || !data.refresh_token) return null;
    const expiresIn = Number(data.expires_in);
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600 };
}

/** invalid_grant e interaction_required: Microsoft ya no acepta la conexión y hay que volver a iniciar sesión. */
export const isRevokedTokenError = (data: any) => data?.error === 'invalid_grant' || data?.error === 'interaction_required';

type TokenResult = { ok: true; tokens: GraphTokens } | { ok: false; revoked: boolean };

async function timed(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: ctrl.signal, redirect: 'error' });
    } finally {
        clearTimeout(timer);
    }
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResult> {
    const creds = teamsCredentials();
    if (!creds) return { ok: false, revoked: false };
    try {
        const res = await timed(`${LOGIN}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, scope: SCOPES, ...params }).toString(),
        });
        const data = await res.json().catch(() => null);
        const tokens = res.ok ? parseTokenResponse(data) : null;
        if (tokens) return { ok: true, tokens };
        log.error('Microsoft no aceptó el token', { route: 'teams-graph', status: res.status, error: data?.error ?? null });
        return { ok: false, revoked: isRevokedTokenError(data) };
    } catch {
        log.error('Microsoft no respondió al token', { route: 'teams-graph' });
        return { ok: false, revoked: false };
    }
}

export async function exchangeTeamsCode(code: string, redirectUri: string): Promise<GraphTokens | null> {
    const r = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    return r.ok ? r.tokens : null;
}

async function graph(token: string, path: string, init: RequestInit = {}): Promise<Response> {
    return timed(`${GRAPH}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
}

const clean = (v: unknown, max = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export async function graphUser(token: string): Promise<string | null> {
    try {
        const res = await graph(token, '/me?$select=displayName,mail,userPrincipalName');
        if (!res.ok) return null;
        const me = await res.json();
        return clean(me?.mail, 200) ?? clean(me?.userPrincipalName, 200) ?? clean(me?.displayName, 200);
    } catch {
        return null;
    }
}

export async function saveTeamsGraph(orgId: string, tokens: GraphTokens, usuario: string | null): Promise<void> {
    await withOrgTx(orgId, sql`
        update orgs set teams_graph_access_enc = ${encryptRequiredSecret(tokens.accessToken)},
                        teams_graph_refresh_enc = ${encryptRequiredSecret(tokens.refreshToken)},
                        teams_graph_expira = now() + (${tokens.expiresIn} * interval '1 second'),
                        teams_graph_usuario = ${usuario}, teams_graph_estado = 'activa'
         where id = ${orgId}`);
}

export async function disconnectTeamsGraph(orgId: string): Promise<void> {
    await withOrgTx(orgId, sql`
        update orgs set teams_graph_access_enc = null, teams_graph_refresh_enc = null, teams_graph_expira = null,
                        teams_graph_usuario = null, teams_graph_estado = null,
                        teams_team_id = null, teams_team_nombre = null, teams_channel_id = null, teams_channel_nombre = null
         where id = ${orgId}`);
}

type Access = { ok: true; token: string } | { ok: false; reason: 'sin_conexion' | 'reconectar' | 'rechazo' };

export async function graphAccessToken(orgId: string, force = false): Promise<Access> {
    const [[row]] = await withOrgTx(orgId, sql`
        select teams_graph_access_enc, teams_graph_refresh_enc, teams_graph_estado,
               (teams_graph_expira is null or teams_graph_expira < now() + (${REFRESH_MARGIN_SECONDS} * interval '1 second')) as expira
          from orgs where id = ${orgId}`);
    if (!row?.teams_graph_estado) return { ok: false, reason: 'sin_conexion' };
    if (row.teams_graph_estado !== 'activa') return { ok: false, reason: 'reconectar' };
    const current = decryptSecret(row.teams_graph_access_enc as string);
    if (current && !row.expira && !force) return { ok: true, token: current };

    const refresh = decryptSecret(row.teams_graph_refresh_enc as string);
    if (!refresh) return { ok: false, reason: 'reconectar' };
    const r = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
    if (!r.ok) {
        if (r.revoked) await withOrgTx(orgId, sql`update orgs set teams_graph_estado = 'error' where id = ${orgId} and teams_graph_estado = 'activa'`);
        return { ok: false, reason: r.revoked ? 'reconectar' : 'rechazo' };
    }
    await withOrgTx(orgId, sql`
        update orgs set teams_graph_access_enc = ${encryptRequiredSecret(r.tokens.accessToken)},
                        teams_graph_refresh_enc = ${encryptRequiredSecret(r.tokens.refreshToken)},
                        teams_graph_expira = now() + (${r.tokens.expiresIn} * interval '1 second')
         where id = ${orgId} and teams_graph_estado = 'activa'`);
    return { ok: true, token: r.tokens.accessToken };
}

export interface GraphOption { id: string; nombre: string }

async function listing(orgId: string, path: string, valid: (id: unknown) => boolean): Promise<GraphOption[] | Exclude<Access, { ok: true }>> {
    const access = await graphAccessToken(orgId);
    if (!access.ok) return access;
    try {
        const res = await graph(access.token, path);
        if (!res.ok) {
            log.error('Microsoft Graph rechazó la lista', { route: 'teams-graph', status: res.status });
            return { ok: false, reason: 'rechazo' };
        }
        const data = await res.json();
        const items = Array.isArray(data?.value) ? data.value : [];
        return items
            .filter((x: any) => valid(x?.id))
            .map((x: any) => ({ id: x.id as string, nombre: clean(x.displayName) ?? (x.id as string) }))
            .slice(0, 200);
    } catch {
        return { ok: false, reason: 'rechazo' };
    }
}

export const listTeams = (orgId: string) => listing(orgId, '/me/joinedTeams?$select=id,displayName', isTeamId);

export const listChannels = (orgId: string, teamId: string) =>
    listing(orgId, `/teams/${encodeURIComponent(teamId)}/channels?$select=id,displayName`, isChannelId);

/** Los nombres salen de Microsoft, no del navegador: el canal se confirma contra la lista real del equipo. */
export async function setTeamsChannel(orgId: string, teamId: string, channelId: string): Promise<{ equipo: string; canal: string } | Exclude<Access, { ok: true }> | null> {
    const [teams, channels] = await Promise.all([listTeams(orgId), listChannels(orgId, teamId)]);
    if (!Array.isArray(teams)) return teams;
    if (!Array.isArray(channels)) return channels;
    const team = teams.find((x) => x.id === teamId);
    const channel = channels.find((x) => x.id === channelId);
    if (!team || !channel) return null;
    await withOrgTx(orgId, sql`
        update orgs set teams_team_id = ${team.id}, teams_team_nombre = ${team.nombre},
                        teams_channel_id = ${channel.id}, teams_channel_nombre = ${channel.nombre},
                        teams_webhook_url = null
         where id = ${orgId}`);
    return { equipo: team.nombre, canal: channel.nombre };
}

/** Graph recibe la tarjeta como texto JSON y la coloca donde el cuerpo HTML la referencia. */
export const graphMessage = (content: AdaptiveCard) => ({
    body: { contentType: 'html', content: '<attachment id="cord"></attachment>' },
    attachments: [{ id: 'cord', contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: JSON.stringify(content) }],
});

async function postGraphCard(token: string, teamId: string, channelId: string, content: AdaptiveCard): Promise<number> {
    try {
        const res = await graph(token, `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`, {
            method: 'POST',
            body: JSON.stringify(graphMessage(content)),
        });
        return res.status;
    } catch {
        return 0;
    }
}

export type TeamsDelivery = { ok: true } | { ok: false; reason: 'sin_conexion' | 'reconectar' | 'rechazo' };

/** Un solo destino por organización: el canal elegido con Microsoft o, si no hay, el flujo de Power Automate. */
export async function deliverTeams(orgId: string, content: AdaptiveCard): Promise<TeamsDelivery> {
    const [[org]] = await withOrgTx(orgId, sql`
        select teams_webhook_url, teams_team_id, teams_channel_id, teams_graph_estado from orgs where id = ${orgId}`);
    if (org?.teams_graph_estado && isTeamId(org.teams_team_id) && isChannelId(org.teams_channel_id)) {
        let access = await graphAccessToken(orgId);
        if (!access.ok) return access;
        let status = await postGraphCard(access.token, org.teams_team_id, org.teams_channel_id, content);
        if (status === 401) {
            access = await graphAccessToken(orgId, true);
            if (!access.ok) return access;
            status = await postGraphCard(access.token, org.teams_team_id, org.teams_channel_id, content);
        }
        if (status >= 200 && status < 300) return { ok: true };
        log.error('Microsoft Graph no publicó la tarjeta', { route: 'teams-graph', status });
        return { ok: false, reason: 'rechazo' };
    }
    if (org?.teams_webhook_url) {
        const r = await postTeamsCard(org.teams_webhook_url as string, content);
        return r.ok ? { ok: true } : { ok: false, reason: 'rechazo' };
    }
    return { ok: false, reason: 'sin_conexion' };
}
