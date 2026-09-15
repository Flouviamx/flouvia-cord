import { createHash, randomBytes } from 'node:crypto';
import { sql, withOrgTx } from '../db';
import { decryptSecret, encryptRequiredSecret } from '../crypto-secret';
import { hubspotCredentials } from './hubspot/config';
import { HubSpotAuthError, refreshTokens, revokeRefreshToken, type HubSpotTokens } from './hubspot/oauth';

export type Proveedor = 'hubspot';

export interface Conexion {
    id: string;
    orgId: string;
    proveedor: Proveedor;
    estado: 'activa' | 'error' | 'desconectada';
    cuentaExterna: string;
    cuentaNombre: string | null;
    scopes: string[];
    ajustes: Record<string, unknown>;
    ultimoError: string | null;
    ultimoErrorAt: string | null;
    ultimaSyncAt: string | null;
    createdAt: string;
}

const STATE_TTL_MINUTES = 10;
const hashState = (state: string) => createHash('sha256').update(state).digest('hex');
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

function toConexion(r: Record<string, unknown>): Conexion {
    return {
        id: r.id as string,
        orgId: r.org_id as string,
        proveedor: r.proveedor as Proveedor,
        estado: r.estado as Conexion['estado'],
        cuentaExterna: r.cuenta_externa as string,
        cuentaNombre: (r.cuenta_nombre as string) ?? null,
        scopes: Array.isArray(r.scopes) ? (r.scopes as string[]) : [],
        ajustes: r.ajustes && typeof r.ajustes === 'object' ? (r.ajustes as Record<string, unknown>) : {},
        ultimoError: (r.ultimo_error as string) ?? null,
        ultimoErrorAt: iso(r.ultimo_error_at),
        ultimaSyncAt: iso(r.ultima_sync_at),
        createdAt: iso(r.created_at) as string,
    };
}

export async function createOAuthState(orgId: string, userId: string, proveedor: Proveedor): Promise<string> {
    const state = randomBytes(32).toString('base64url');
    await withOrgTx(orgId,
        sql`delete from integracion_oauth_estados where org_id = ${orgId} and (expires_at < now() or used_at is not null)`,
        sql`insert into integracion_oauth_estados (state_hash, org_id, user_id, proveedor, expires_at)
            values (${hashState(state)}, ${orgId}, ${userId}, ${proveedor}, now() + (${STATE_TTL_MINUTES} * interval '1 minute'))`);
    return state;
}

export async function consumeOAuthState(orgId: string, userId: string, proveedor: Proveedor, state: string): Promise<boolean> {
    if (!state || state.length > 200) return false;
    const [rows] = await withOrgTx(orgId, sql`
        update integracion_oauth_estados set used_at = now()
         where state_hash = ${hashState(state)} and org_id = ${orgId} and user_id = ${userId}
           and proveedor = ${proveedor} and used_at is null and expires_at > now()
        returning state_hash`);
    return rows.length === 1;
}

export async function getConexion(orgId: string, proveedor: Proveedor): Promise<Conexion | null> {
    const [[row]] = await withOrgTx(orgId, sql`
        select id, org_id, proveedor, estado, cuenta_externa, cuenta_nombre, scopes, ajustes,
               ultimo_error, ultimo_error_at, ultima_sync_at, created_at
          from integracion_conexiones where org_id = ${orgId} and proveedor = ${proveedor}`);
    return row ? toConexion(row) : null;
}

export class CuentaYaConectadaError extends Error {}

export async function saveConexion(orgId: string, userId: string, proveedor: Proveedor, tokens: HubSpotTokens, cuentaNombre: string | null): Promise<Conexion> {
    const accessEnc = encryptRequiredSecret(tokens.accessToken);
    const refreshEnc = encryptRequiredSecret(tokens.refreshToken);
    const nombre = cuentaNombre ? cuentaNombre.slice(0, 200) : null;
    try {
        const [, , [row]] = await withOrgTx(orgId,
            sql`delete from integracion_vinculos v using integracion_conexiones c
                 where v.org_id = ${orgId} and v.conexion_id = c.id and c.org_id = ${orgId}
                   and c.proveedor = ${proveedor} and c.cuenta_externa <> ${tokens.hubId}`,
            sql`delete from integracion_sync s using integracion_conexiones c
                 where s.org_id = ${orgId} and s.conexion_id = c.id and c.org_id = ${orgId}
                   and c.proveedor = ${proveedor} and c.cuenta_externa <> ${tokens.hubId}`,
            sql`insert into integracion_conexiones
                    (org_id, proveedor, estado, cuenta_externa, cuenta_nombre, scopes, access_token_enc, access_expires_at, refresh_token_enc, conectada_por)
                values (${orgId}, ${proveedor}, 'activa', ${tokens.hubId}, ${nombre}, ${tokens.scopes}::text[], ${accessEnc},
                        now() + (${tokens.expiresIn} * interval '1 second'), ${refreshEnc}, ${userId})
                on conflict (org_id, proveedor) do update set
                    estado = 'activa', cuenta_externa = excluded.cuenta_externa, cuenta_nombre = excluded.cuenta_nombre,
                    scopes = excluded.scopes, access_token_enc = excluded.access_token_enc,
                    access_expires_at = excluded.access_expires_at, refresh_token_enc = excluded.refresh_token_enc,
                    conectada_por = excluded.conectada_por, ultimo_error = null, ultimo_error_at = null,
                    ajustes = case when integracion_conexiones.cuenta_externa = excluded.cuenta_externa
                                   then integracion_conexiones.ajustes else '{}'::jsonb end,
                    updated_at = now()
                returning id, org_id, proveedor, estado, cuenta_externa, cuenta_nombre, scopes, ajustes,
                          ultimo_error, ultimo_error_at, ultima_sync_at, created_at`);
        return toConexion(row);
    } catch (error) {
        if ((error as { code?: string })?.code === '23505') throw new CuentaYaConectadaError();
        throw error;
    }
}

export async function setConexionError(orgId: string, conexionId: string, message: string, revoked = false): Promise<void> {
    await withOrgTx(orgId, sql`
        update integracion_conexiones
           set ultimo_error = ${message.slice(0, 500)}, ultimo_error_at = now(),
               estado = case when ${revoked} then 'error' else estado end, updated_at = now()
         where id = ${conexionId} and org_id = ${orgId} and estado <> 'desconectada'`);
}

const REFRESH_MARGIN_SECONDS = 120;

export async function getAccessToken(orgId: string, conexionId: string): Promise<string> {
    const [[row]] = await withOrgTx(orgId, sql`
        select access_token_enc, refresh_token_enc, estado,
               (access_expires_at is null or access_expires_at < now() + (${REFRESH_MARGIN_SECONDS} * interval '1 second')) as expira
          from integracion_conexiones where id = ${conexionId} and org_id = ${orgId}`);
    if (!row || row.estado !== 'activa') throw new HubSpotAuthError('La conexión con HubSpot no está activa.', true);
    const current = decryptSecret(row.access_token_enc as string);
    if (current && !row.expira) return current;

    const creds = hubspotCredentials();
    const refresh = decryptSecret(row.refresh_token_enc as string);
    if (!creds || !refresh) throw new HubSpotAuthError('HubSpot no está disponible por ahora.');
    try {
        const tokens = await refreshTokens(creds, refresh);
        await withOrgTx(orgId, sql`
            update integracion_conexiones
               set access_token_enc = ${encryptRequiredSecret(tokens.accessToken)},
                   access_expires_at = now() + (${tokens.expiresIn} * interval '1 second'),
                   refresh_token_enc = ${encryptRequiredSecret(tokens.refreshToken)}, updated_at = now()
             where id = ${conexionId} and org_id = ${orgId} and estado = 'activa'`);
        return tokens.accessToken;
    } catch (error) {
        if (error instanceof HubSpotAuthError && error.revoked) await setConexionError(orgId, conexionId, error.message, true);
        throw error;
    }
}

export async function disconnectConexion(orgId: string, proveedor: Proveedor): Promise<boolean> {
    const [[row]] = await withOrgTx(orgId, sql`
        select id, refresh_token_enc from integracion_conexiones
         where org_id = ${orgId} and proveedor = ${proveedor} and estado <> 'desconectada'`);
    if (!row) return false;
    const refresh = decryptSecret(row.refresh_token_enc as string);
    const creds = hubspotCredentials();
    if (refresh && creds) await revokeRefreshToken(creds, refresh);
    await withOrgTx(orgId,
        sql`delete from integracion_sync where org_id = ${orgId} and conexion_id = ${row.id as string} and status in ('queued', 'running')`,
        sql`update integracion_conexiones
               set estado = 'desconectada', access_token_enc = null, refresh_token_enc = null,
                   access_expires_at = null, updated_at = now()
             where id = ${row.id as string} and org_id = ${orgId}`);
    return true;
}

export async function updateAjustes(orgId: string, proveedor: Proveedor, ajustes: Record<string, unknown>): Promise<boolean> {
    const [rows] = await withOrgTx(orgId, sql`
        update integracion_conexiones set ajustes = ${JSON.stringify(ajustes)}::jsonb, updated_at = now()
         where org_id = ${orgId} and proveedor = ${proveedor} and estado <> 'desconectada'
        returning id`);
    return rows.length === 1;
}
