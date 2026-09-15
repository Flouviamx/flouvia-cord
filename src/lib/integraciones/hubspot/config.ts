export const HUBSPOT_API = 'https://api.hubapi.com';
export const HUBSPOT_OAUTH_API = 'https://api.hubspot.com/oauth/2026-09';
export const HUBSPOT_AUTHORIZE_URL = 'https://app.hubspot.com/oauth/authorize';

export const HUBSPOT_SCOPES = [
    'oauth',
    'crm.objects.companies.read',
    'crm.objects.companies.write',
    'crm.objects.contacts.read',
    'crm.objects.contacts.write',
    'crm.objects.deals.read',
    'crm.objects.deals.write',
] as const;

export interface HubSpotCredentials {
    clientId: string;
    clientSecret: string;
}

export function hubspotCredentials(): HubSpotCredentials | null {
    const clientId = String(import.meta.env.HUBSPOT_CLIENT_ID ?? '').trim();
    const clientSecret = String(import.meta.env.HUBSPOT_CLIENT_SECRET ?? '').trim();
    return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function hubspotRedirectUri(requestOrigin: string): string {
    const site = import.meta.env.DEV ? '' : String(import.meta.env.SITE ?? '').trim().replace(/\/+$/, '');
    return `${site || requestOrigin}/api/integraciones/hubspot/callback`;
}
