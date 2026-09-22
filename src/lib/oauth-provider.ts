import { sql, withOrgTx, withUserTx, logAudit } from './db';
import { sendOpsAlert } from './ops-alert';
import { memberCan, type PermMap } from './permissions';
import {
    OAUTH_ACCESS_TTL_S, OAUTH_CODE_TTL_S, OAUTH_REFRESH_TTL_DAYS, newAccessToken, newAuthCode, newRefreshToken,
    sha256Hex, tokenDisplay, verifyPkce, type OAuthScope,
} from './oauth-core';

const CLIENT_ID_RE = /^cord_oc_[a-f0-9]{32}$/;

export interface OAuthClient {
    clientId: string;
    slug: string;
    nombre: string;
    dominio: string | null;
    secretHash: string;
    redirectUris: string[];
}

export interface AuthorizableOrg {
    id: string;
    nombre: string;
}

export interface TokenSet {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    refresh_token: string;
    scope: OAuthScope;
}

export type TokenResult =
    | { ok: true; tokens: TokenSet; orgId?: string; userId?: string; grantId?: string }
    | { ok: false; error: 'invalid_grant' | 'too_many_grants' };

export async function getOAuthClient(clientId: string | null | undefined): Promise<OAuthClient | null> {
    if (!clientId || !CLIENT_ID_RE.test(clientId)) return null;
    const [row] = await sql`select client_id, slug, nombre, dominio, secret_hash, redirect_uris from cord_oauth_client(${clientId})`;
    if (!row) return null;
    return {
        clientId: row.client_id as string,
        slug: row.slug as string,
        nombre: row.nombre as string,
        dominio: (row.dominio as string | null) ?? null,
        secretHash: row.secret_hash as string,
        redirectUris: (row.redirect_uris as string[]) ?? [],
    };
}

/** Espacios donde la persona puede conectar una app: los mismos que pueden crear llaves de API. */
export async function authorizableOrgs(userId: string): Promise<AuthorizableOrg[]> {
    const [rows] = await withUserTx(userId, sql`
        select o.id, o.nombre, m.rol, m.permisos
          from org_members m
          join orgs o on o.id = m.org_id and o.sandbox_of is null
         where m.user_id = ${userId} and m.estado = 'activo'
         order by o.nombre asc`);
    return rows
        .filter((r) => memberCan({ rol: r.rol as string, permisos: (r.permisos as PermMap) ?? {}, esOwner: r.rol === 'owner' }, 'ajustes'))
        .map((r) => ({ id: r.id as string, nombre: r.nombre as string }));
}

export async function issueAuthorizationCode(input: {
    client: OAuthClient;
    userId: string;
    orgId: string;
    scope: OAuthScope;
    redirectUri: string;
    codeChallenge: string | null;
}): Promise<string> {
    const code = newAuthCode();
    await withOrgTx(
        input.orgId,
        sql`delete from oauth_codes where org_id = ${input.orgId} and expires_at < now() - interval '1 day'`,
        sql`insert into oauth_codes (code_hash, client_id, org_id, user_id, scope, redirect_uri, code_challenge, expires_at)
            values (${sha256Hex(code)}, ${input.client.clientId}, ${input.orgId}, ${input.userId}, ${input.scope},
                    ${input.redirectUri}, ${input.codeChallenge}, now() + make_interval(secs => ${OAUTH_CODE_TTL_S}))`,
    );
    return code;
}

export async function exchangeAuthorizationCode(input: {
    client: OAuthClient;
    code: string;
    redirectUri: string;
    codeVerifier: string | null;
    ip: string | null;
}): Promise<TokenResult> {
    const [used] = await sql`select org_id, user_id, scope, code_challenge from cord_oauth_consume_code(${input.client.clientId}, ${sha256Hex(input.code)}, ${input.redirectUri})`;
    if (!used) return { ok: false, error: 'invalid_grant' };

    const challenge = (used.code_challenge as string | null) ?? null;
    if (challenge ? !verifyPkce(input.codeVerifier, challenge) : !!input.codeVerifier) {
        return { ok: false, error: 'invalid_grant' };
    }

    const access = newAccessToken();
    const refresh = newRefreshToken();
    const shown = tokenDisplay(access);
    const scope = used.scope as OAuthScope;
    const orgId = used.org_id as string;
    const userId = used.user_id as string;

    const [issued] = await sql`
        select cord_oauth_issue(${orgId}, ${userId}, ${input.client.clientId}, ${scope},
                                ${sha256Hex(access)}, ${shown.prefix}, ${shown.last4}, ${OAUTH_ACCESS_TTL_S},
                                ${sha256Hex(refresh)}, ${OAUTH_REFRESH_TTL_DAYS}) as grant_id`;
    const grantId = (issued?.grant_id as string | null) ?? null;
    if (!grantId) return { ok: false, error: 'too_many_grants' };

    await logAudit(orgId, {
        accion: 'oauth.autorizada', entidad: 'oauth_grant', entidad_id: grantId, actor: userId, ip: input.ip,
        detalle: `Autorizó ${input.client.nombre} (${scope === 'write' ? 'lectura y escritura' : 'solo lectura'})`,
    });
    return {
        ok: true, orgId, userId, grantId,
        tokens: { access_token: access, token_type: 'Bearer', expires_in: OAUTH_ACCESS_TTL_S, refresh_token: refresh, scope },
    };
}

export async function refreshTokens(client: OAuthClient, refreshToken: string): Promise<TokenResult> {
    const access = newAccessToken();
    const refresh = newRefreshToken();
    const shown = tokenDisplay(access);
    const [row] = await sql`
        select grant_id, scope, replay from cord_oauth_refresh(${client.clientId}, ${sha256Hex(refreshToken)},
                                                       ${sha256Hex(access)}, ${shown.prefix}, ${shown.last4}, ${OAUTH_ACCESS_TTL_S},
                                                       ${sha256Hex(refresh)}, ${OAUTH_REFRESH_TTL_DAYS})`;
    if (!row) return { ok: false, error: 'invalid_grant' };
    // Un refresh ya rotado se presentó de nuevo: puede ser robo, así que la
    // función revocó la conexión entera. Se avisa a operaciones porque el
    // cliente legítimo va a ver su integración desconectada sin haber tocado nada.
    if (row.replay) {
        await sendOpsAlert('Reuso de refresh token OAuth',
            `Cliente ${client.clientId}; grant ${row.grant_id}. Se revocó la conexión: el mismo refresh token se usó dos veces.`);
        return { ok: false, error: 'invalid_grant' };
    }
    return {
        ok: true, grantId: row.grant_id as string,
        tokens: { access_token: access, token_type: 'Bearer', expires_in: OAUTH_ACCESS_TTL_S, refresh_token: refresh, scope: row.scope as OAuthScope },
    };
}

/** Slugs de las apps con una autorización viva en la organización (Zapier, Make). */
export async function connectedOAuthApps(orgId: string): Promise<string[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select distinct c.slug
          from oauth_grants g
          join oauth_clients c on c.client_id = g.client_id
          join api_keys k on k.id = g.api_key_id
         where g.org_id = ${orgId} and g.revoked_at is null and g.refresh_expires_at > now()
           and k.revoked_at is null`);
    return rows.map((r) => r.slug as string);
}

export async function revokeToken(client: OAuthClient, token: string): Promise<void> {
    await sql`select cord_oauth_revoke(${client.clientId}, ${sha256Hex(token)})`;
}
