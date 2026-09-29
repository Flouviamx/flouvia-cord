import { sql, withOrgTx } from '../db';
import { encryptRequiredSecret } from '../crypto-secret';
import { log } from '../log';

const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const ACCESS_URL = 'https://slack.com/api/oauth.v2.access';
const TIMEOUT_MS = 10_000;
const WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/;

export const slackCredentials = () => {
    const clientId = import.meta.env.SLACK_CLIENT_ID || process.env.SLACK_CLIENT_ID;
    const clientSecret = import.meta.env.SLACK_CLIENT_SECRET || process.env.SLACK_CLIENT_SECRET;
    return clientId && clientSecret ? { clientId, clientSecret } : null;
};

export function slackAuthorizeUrl(redirectUri: string, state: string): string | null {
    const creds = slackCredentials();
    if (!creds) return null;
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', creds.clientId);
    url.searchParams.set('scope', SLACK_SCOPES);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
}

/**
 * Además del webhook del canal: vista previa de links de cotización
 * (`links:read`/`links:write`), el comando /cord (`commands`) y el correo de
 * quien pulsa Aprobar, para verificar que sea un miembro de Cord con permiso
 * (`users:read`, `users:read.email`). Ninguno lee mensajes.
 */
export const SLACK_SCOPES = 'incoming-webhook,links:read,links:write,commands,users:read,users:read.email';

export interface SlackInstall {
    webhookUrl: string;
    channel: string | null;
    team: string | null;
    teamId: string | null;
    botToken: string | null;
    scopes: string[];
}

/** Lo único que Cord conserva de la respuesta de Slack: el webhook del canal elegido y sus nombres. */
export function parseSlackAccess(data: any): SlackInstall | null {
    if (!data || data.ok !== true) return null;
    const hook = data.incoming_webhook;
    const url = typeof hook?.url === 'string' ? hook.url : '';
    if (!WEBHOOK_RE.test(url)) return null;
    const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
    const teamId = typeof data.team?.id === 'string' && /^T[A-Z0-9]{6,20}$/.test(data.team.id) ? data.team.id : null;
    const botToken = typeof data.access_token === 'string' && data.access_token.startsWith('xoxb-') ? data.access_token : null;
    const scopes = typeof data.scope === 'string' ? data.scope.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
    return { webhookUrl: url, channel: clean(hook.channel), team: clean(data.team?.name), teamId, botToken, scopes };
}

export async function exchangeSlackCode(code: string, redirectUri: string): Promise<SlackInstall | null> {
    const creds = slackCredentials();
    if (!creds) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(ACCESS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, code, redirect_uri: redirectUri }).toString(),
            signal: ctrl.signal,
            redirect: 'error',
        });
        const install = parseSlackAccess(await res.json().catch(() => null));
        if (!install) log.error('Slack no aceptó la autorización', { route: 'slack-oauth', status: res.status });
        return install;
    } catch {
        log.error('Slack no respondió a la autorización', { route: 'slack-oauth' });
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export async function saveSlackInstall(orgId: string, install: SlackInstall, userId: string | null = null): Promise<void> {
    await withOrgTx(orgId, sql`
        update orgs set slack_webhook_url = ${install.webhookUrl}, slack_channel = ${install.channel}, slack_team = ${install.team}
         where id = ${orgId}`);
    // La app (vista previa, /cord, aprobar) necesita el token del bot y el
    // equipo, que resuelve la organización cuando Slack llama sin sesión.
    if (install.teamId && install.botToken) {
        await withOrgTx(orgId, sql`
            insert into integracion_conexiones (org_id, proveedor, estado, cuenta_externa, cuenta_nombre, scopes, access_token_enc, conectada_por)
            values (${orgId}, 'slack', 'activa', ${install.teamId}, ${install.team}, ${install.scopes}, ${encryptRequiredSecret(install.botToken)}, ${userId})
            on conflict (org_id, proveedor) do update
               set estado = 'activa', cuenta_externa = excluded.cuenta_externa, cuenta_nombre = excluded.cuenta_nombre,
                   scopes = excluded.scopes, access_token_enc = excluded.access_token_enc,
                   conectada_por = excluded.conectada_por, ultimo_error = null, ultimo_error_at = null, updated_at = now()`);
    }
}

export async function disconnectSlack(orgId: string): Promise<void> {
    await withOrgTx(orgId,
        sql`update orgs set slack_webhook_url = null, slack_channel = null, slack_team = null where id = ${orgId}`,
        sql`update integracion_conexiones set estado = 'desconectada', access_token_enc = null, updated_at = now()
             where org_id = ${orgId} and proveedor = 'slack'`);
}
