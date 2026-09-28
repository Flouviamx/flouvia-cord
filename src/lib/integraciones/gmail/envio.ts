// El negocio conecta su Gmail y los correos a SUS clientes (cotización, factura,
// recordatorio de pago) salen desde su dirección: quedan en sus Enviados, la
// respuesta le llega a él y el cliente reconoce al remitente.
//
// Pide solo `gmail.send`: mandar, sin leer nada de la cuenta. Es un permiso
// sensible, no restringido, así que no cae en la auditoría anual de Google.
// Si el envío por Gmail falla, el correo sale por el camino normal de Cord y la
// conexión queda en error: un correo de cobro no se pierde por una conexión rota.

import { sql, withOrgTx } from '../../db';
import { decryptSecret, encryptRequiredSecret } from '../../crypto-secret';
import { log } from '../../log';
import { credencialesHoja } from '../hojas/config';
import { googleRefresh } from '../hojas/google';
import type { TokensHoja } from '../hojas/cliente';
import { construirMime, type CorreoMime } from './mime';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const GMAIL_SCOPES = `openid email ${GMAIL_SEND_SCOPE}`;

/** Correos que van al CLIENTE del negocio. Los avisos internos siguen saliendo de Cord. */
export const OPERACIONES_GMAIL = new Set(['quote_sent', 'invoice_issued', 'invoice_reminder', 'workflow_client_email']);

/** Usa la misma app de Google que Sheets: un solo proyecto, una sola verificación. */
export const GMAIL_ENVIO_LISTO = Boolean(credencialesHoja('google_sheets'));

const MAX_BYTES = 25 * 1024 * 1024;

export function gmailAuthorizeUrl(redirectUri: string, state: string): string | null {
    const creds = credencialesHoja('google_sheets');
    if (!creds) return null;
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', creds.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GMAIL_SCOPES);
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    return url.toString();
}

export interface EstadoGmail {
    cuenta: string;
    estado: string;
}

export async function estadoGmail(orgId: string): Promise<EstadoGmail | null> {
    const [[row]] = await withOrgTx(orgId, sql`
        select cuenta_externa, estado from integracion_conexiones
         where org_id = ${orgId} and proveedor = 'gmail' and estado <> 'desconectada'`);
    return row ? { cuenta: String(row.cuenta_externa), estado: String(row.estado) } : null;
}

export async function conectarGmail(orgId: string, userId: string, t: TokensHoja, cuenta: string): Promise<void> {
    if (!t.refreshToken) throw new Error('sin refresh token');
    await withOrgTx(orgId, sql`
        insert into integracion_conexiones
            (org_id, proveedor, estado, cuenta_externa, cuenta_nombre, scopes,
             access_token_enc, access_expires_at, refresh_token_enc, conectada_por)
        values (${orgId}, 'gmail', 'activa', ${cuenta}, ${cuenta}, ${t.scopes},
                ${encryptRequiredSecret(t.accessToken)}, now() + (${Math.max(60, t.expiresIn)} * interval '1 second'),
                ${encryptRequiredSecret(t.refreshToken)}, ${userId})
        on conflict (org_id, proveedor) do update
           set estado = 'activa', cuenta_externa = excluded.cuenta_externa, cuenta_nombre = excluded.cuenta_nombre,
               scopes = excluded.scopes, access_token_enc = excluded.access_token_enc,
               access_expires_at = excluded.access_expires_at, refresh_token_enc = excluded.refresh_token_enc,
               conectada_por = excluded.conectada_por, ultimo_error = null, ultimo_error_at = null, updated_at = now()`);
}

export async function desconectarGmail(orgId: string): Promise<void> {
    await withOrgTx(orgId, sql`
        update integracion_conexiones
           set estado = 'desconectada', access_token_enc = null, refresh_token_enc = null,
               access_expires_at = null, updated_at = now()
         where org_id = ${orgId} and proveedor = 'gmail'`);
}

async function marcarError(orgId: string, motivo: string): Promise<void> {
    await withOrgTx(orgId, sql`
        update integracion_conexiones
           set estado = 'error', ultimo_error = ${motivo.slice(0, 500)}, ultimo_error_at = now(), updated_at = now()
         where org_id = ${orgId} and proveedor = 'gmail' and estado <> 'desconectada'`);
}

async function tokenVivo(orgId: string): Promise<{ token: string; cuenta: string } | null> {
    const [[row]] = await withOrgTx(orgId, sql`
        select id, cuenta_externa, access_token_enc, access_expires_at, refresh_token_enc
          from integracion_conexiones
         where org_id = ${orgId} and proveedor = 'gmail' and estado = 'activa'`);
    if (!row) return null;
    const vence = row.access_expires_at ? new Date(row.access_expires_at as string).getTime() : 0;
    let token = row.access_token_enc ? decryptSecret(row.access_token_enc as string) : '';
    if (!token || vence < Date.now() + 60_000) {
        const refresh = row.refresh_token_enc ? decryptSecret(row.refresh_token_enc as string) : '';
        if (!refresh) throw new Error('sin refresh token');
        const frescos = await googleRefresh(refresh);
        token = frescos.accessToken;
        await withOrgTx(orgId, sql`
            update integracion_conexiones
               set access_token_enc = ${encryptRequiredSecret(frescos.accessToken)},
                   access_expires_at = now() + (${Math.max(60, frescos.expiresIn)} * interval '1 second'),
                   refresh_token_enc = ${encryptRequiredSecret(frescos.refreshToken || refresh)}, updated_at = now()
             where id = ${row.id} and org_id = ${orgId}`);
    }
    return token ? { token, cuenta: String(row.cuenta_externa) } : null;
}

export type ResultadoGmail = { ok: true; id: string | null } | { ok: false };

/**
 * Manda por el Gmail del negocio. `null` = no hay Gmail conectado y el correo
 * sigue su camino normal; `{ ok: false }` = falló, la conexión queda en error y
 * quien llama cae al camino normal.
 */
export async function enviarPorGmail(orgId: string, m: Omit<CorreoMime, 'from'>): Promise<ResultadoGmail | null> {
    let cx: { token: string; cuenta: string } | null;
    try {
        cx = await tokenVivo(orgId);
    } catch (err) {
        log.error('Gmail: no se pudo renovar el token', { route: 'gmail-envio', orgId, err });
        await marcarError(orgId, 'auth');
        return { ok: false };
    }
    if (!cx) return null;

    const mime = construirMime({ ...m, from: cx.cuenta });
    if (Buffer.byteLength(mime) > MAX_BYTES) return { ok: false };
    try {
        const res = await fetch('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media', {
            method: 'POST',
            headers: { Authorization: `Bearer ${cx.token}`, 'Content-Type': 'message/rfc822' },
            body: mime,
            signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
            const detalle = (await res.text().catch(() => '')).slice(0, 300);
            log.error('Gmail rechazó el envío', { route: 'gmail-envio', orgId, status: res.status, detalle });
            if (res.status === 401 || res.status === 403) await marcarError(orgId, res.status === 401 ? 'auth' : 'permiso');
            return { ok: false };
        }
        const data = await res.json().catch(() => null);
        return { ok: true, id: data?.id ? String(data.id) : null };
    } catch (err) {
        log.error('Gmail: fallo de red al enviar', { route: 'gmail-envio', orgId, err });
        return { ok: false };
    }
}
