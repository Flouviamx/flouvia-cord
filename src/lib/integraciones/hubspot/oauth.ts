import { HUBSPOT_AUTHORIZE_URL, HUBSPOT_OAUTH_API, HUBSPOT_SCOPES, type HubSpotCredentials } from './config';
import { hsError } from './errors';

export interface HubSpotTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    hubId: string;
    scopes: string[];
}

export class HubSpotAuthError extends Error {
    constructor(message: string, readonly revoked = false) {
        super(message);
    }
}

const TIMEOUT_MS = 10_000;

export function buildAuthorizeUrl(creds: HubSpotCredentials, redirectUri: string, state: string): string {
    const url = new URL(HUBSPOT_AUTHORIZE_URL);
    url.searchParams.set('client_id', creds.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', HUBSPOT_SCOPES.join(' '));
    url.searchParams.set('state', state);
    return url.toString();
}

async function postForm(path: string, body: Record<string, string>): Promise<{ status: number; data: any }> {
    const res = await fetch(`${HUBSPOT_OAUTH_API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(body),
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
}

function parseTokens(data: any): HubSpotTokens {
    const hubId = data?.hub_id === undefined || data?.hub_id === null ? '' : String(data.hub_id);
    if (typeof data?.access_token !== 'string' || typeof data?.refresh_token !== 'string' || !/^[0-9]{1,20}$/.test(hubId)) {
        throw new HubSpotAuthError(hsError('autorizacion'));
    }
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: Math.max(60, Number(data.expires_in) || 1800),
        hubId,
        scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : [],
    };
}

export async function exchangeCode(creds: HubSpotCredentials, code: string, redirectUri: string): Promise<HubSpotTokens> {
    const { status, data } = await postForm('/token', {
        grant_type: 'authorization_code',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri,
        code,
    });
    if (status !== 200) throw new HubSpotAuthError(hsError('autorizacion_rechazada'));
    return parseTokens(data);
}

export async function refreshTokens(creds: HubSpotCredentials, refreshToken: string): Promise<HubSpotTokens> {
    const { status, data } = await postForm('/token', {
        grant_type: 'refresh_token',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: refreshToken,
    });
    if (status === 400 || status === 401) {
        throw new HubSpotAuthError(hsError('acceso_retirado'), true);
    }
    if (status !== 200) throw new HubSpotAuthError(hsError('renovacion'));
    return parseTokens({ ...data, refresh_token: data?.refresh_token ?? refreshToken });
}

export async function revokeRefreshToken(creds: HubSpotCredentials, refreshToken: string): Promise<boolean> {
    try {
        const { status } = await postForm('/token/revoke', {
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            token: refreshToken,
            token_type_hint: 'refresh_token',
        });
        return status >= 200 && status < 300;
    } catch {
        return false;
    }
}
