// Fixed provider origin, bounded requests, no credentials in returned errors.
export function domainProviderConfig() {
    return {
        token: import.meta.env.CORD_DOMAINS_VERCEL_TOKEN || process.env.CORD_DOMAINS_VERCEL_TOKEN || '',
        project: import.meta.env.CORD_DOMAINS_VERCEL_PROJECT_ID || process.env.CORD_DOMAINS_VERCEL_PROJECT_ID || '',
        team: import.meta.env.CORD_DOMAINS_VERCEL_TEAM_ID || process.env.CORD_DOMAINS_VERCEL_TEAM_ID || '',
    };
}
export function domainsEnabled(): boolean {
    const cfg = domainProviderConfig();
    // A preview deploy must never attach live customer DNS to its branch.
    const environment = import.meta.env.VERCEL_ENV || process.env.VERCEL_ENV;
    if (environment && environment !== 'production') return false;
    return (import.meta.env.CORD_CUSTOM_DOMAINS_ENABLED || process.env.CORD_CUSTOM_DOMAINS_ENABLED) === 'true' &&
        !!cfg.token && !!cfg.project && !!cfg.team;
}
export class DomainProviderError extends Error {
    constructor(public status: number) { super('domain_provider_unavailable'); }
}
export interface ProviderDomain {
    name: string; projectId: string; verified: boolean;
    redirect?: string | null; gitBranch?: string | null; customEnvironmentId?: string | null;
    verification?: Array<{ type: string; domain: string; value: string }>;
}
export interface ProviderConfig {
    misconfigured: boolean; configuredBy: string | null;
    recommendedCNAME: Array<{ rank: number; value: string }>;
}
async function api<T>(path: string, method = 'GET', body?: object): Promise<T> {
    const cfg = domainProviderConfig();
    if (!cfg.token || !cfg.project || !cfg.team) throw new DomainProviderError(503);
    const url = new URL(path, 'https://api.vercel.com');
    url.searchParams.set('teamId', cfg.team);
    const res = await fetch(url, {
        method, redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new DomainProviderError(res.status);
    if (method === 'DELETE') return undefined as T;
    return res.json() as Promise<T>;
}
function projectPath(host: string) {
    return `/v9/projects/${encodeURIComponent(domainProviderConfig().project)}/domains/${encodeURIComponent(host)}`;
}
export async function getProviderDomain(host: string): Promise<ProviderDomain | null> {
    try { return await api<ProviderDomain>(projectPath(host)); }
    catch (e) { if (e instanceof DomainProviderError && e.status === 404) return null; throw e; }
}
export function addProviderDomain(host: string) {
    return api<ProviderDomain>(`/v10/projects/${encodeURIComponent(domainProviderConfig().project)}/domains`, 'POST', { name: host });
}
export function verifyProviderDomain(host: string) {
    return api<ProviderDomain>(`${projectPath(host)}/verify`, 'POST');
}
export function getProviderConfig(host: string) {
    return api<ProviderConfig>(`/v6/domains/${encodeURIComponent(host)}/config?projectIdOrName=${encodeURIComponent(domainProviderConfig().project)}`);
}
export async function removeProviderDomain(host: string) {
    try { await api(projectPath(host), 'DELETE'); }
    catch (e) { if (!(e instanceof DomainProviderError && e.status === 404)) throw e; }
}
