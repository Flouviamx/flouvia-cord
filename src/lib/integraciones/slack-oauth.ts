import { sql, withOrgTx } from '../db';
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
    url.searchParams.set('scope', 'incoming-webhook');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
}

export interface SlackInstall {
    webhookUrl: string;
    channel: string | null;
    team: string | null;
}

/** Lo único que Cord conserva de la respuesta de Slack: el webhook del canal elegido y sus nombres. */
export function parseSlackAccess(data: any): SlackInstall | null {
    if (!data || data.ok !== true) return null;
    const hook = data.incoming_webhook;
    const url = typeof hook?.url === 'string' ? hook.url : '';
    if (!WEBHOOK_RE.test(url)) return null;
    const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
    return { webhookUrl: url, channel: clean(hook.channel), team: clean(data.team?.name) };
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

export async function saveSlackInstall(orgId: string, install: SlackInstall): Promise<void> {
    await withOrgTx(orgId, sql`
        update orgs set slack_webhook_url = ${install.webhookUrl}, slack_channel = ${install.channel}, slack_team = ${install.team}
         where id = ${orgId}`);
}

export async function disconnectSlack(orgId: string): Promise<void> {
    await withOrgTx(orgId, sql`update orgs set slack_webhook_url = null, slack_channel = null, slack_team = null where id = ${orgId}`);
}
