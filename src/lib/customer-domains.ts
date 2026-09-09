import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { sql, withOrgTx, logAudit } from './db';
import { checkEntitlement } from './org-entitlements';
import { normalizeCustomerHostname, DOMAIN_PROBE_PATH, domainIsFresh } from './domain-policy';
import { safeFetch } from './ssrf';
import {
    domainsEnabled, domainProviderConfig, getProviderDomain, addProviderDomain,
    getProviderConfig, verifyProviderDomain, removeProviderDomain, DomainProviderError,
} from './vercel-domains';

export type DomainRecord = { type: 'TXT' | 'CNAME'; name: string; value: string };
export type DomainStatus = 'pending' | 'dns_pending' | 'tls_pending' | 'active' | 'error';
export interface CustomerDomain {
    id: string; org_id: string; hostname: string; verification_token: string; probe_secret: string;
    status: DomainStatus; records: DomainRecord[]; provider_project: string | null; provider_team: string | null;
    provider_owned: boolean; removing: boolean; last_checked_at: string | null; verified_at: string | null;
    error_code: string | null;
}
export class DomainError extends Error {
    constructor(public code: string, public status = 409) { super(code); }
}
export async function readCustomerDomain(orgId: string): Promise<CustomerDomain | null> {
    const [rows] = await withOrgTx(orgId, sql`select * from org_domains where org_id = ${orgId} limit 1`);
    return (rows[0] as unknown as CustomerDomain) || null;
}
export async function domainEligible(orgId: string): Promise<boolean> {
    const result = await checkEntitlement(orgId, 'custom_domain');
    return result.ok && !result.context.isSandbox;
}
export async function domainState(orgId: string) {
    const access = await checkEntitlement(orgId, 'custom_domain');
    const enabled = domainsEnabled();
    // Rollout is additive: disabled feature does not require the new table yet.
    let domain: CustomerDomain | null = null;
    try { domain = await readCustomerDomain(orgId); }
    catch (e: any) { if (enabled || !['42P01', '42883'].includes(e?.code)) throw e; }
    return {
        enabled, eligible: access.ok && !access.context.isSandbox, isSandbox: access.context.isSandbox,
        domain: domain ? {
            hostname: domain.hostname, status: domainIsFresh(domain) ? 'active' : domain.status === 'active' ? 'dns_pending' : domain.status,
            records: domain.records, lastCheckedAt: domain.last_checked_at, errorCode: domain.error_code,
        } : null,
    };
}
export function ownershipRecord(domain: Pick<CustomerDomain, 'hostname' | 'verification_token'>): DomainRecord {
    return { type: 'TXT', name: '_cord.' + domain.hostname, value: 'cord-verification=' + domain.verification_token };
}
export function domainProbeProof(domain: Pick<CustomerDomain, 'probe_secret' | 'hostname'>, nonce: string) {
    return createHmac('sha256', domain.probe_secret).update(domain.hostname + ':' + nonce).digest('hex');
}
export async function registerCustomerDomain(orgId: string, input: unknown) {
    if (!domainsEnabled()) throw new DomainError('domains_unavailable', 503);
    if (!await domainEligible(orgId)) throw new DomainError('subscription_required', 402);
    let hostname: string;
    try { hostname = normalizeCustomerHostname(input); } catch { throw new DomainError('invalid_hostname', 422); }
    const verification_token = randomBytes(32).toString('hex');
    const records = [ownershipRecord({ hostname, verification_token })];
    try {
        await withOrgTx(orgId, sql`insert into org_domains (org_id, hostname, verification_token, probe_secret, records)
            values (${orgId}, ${hostname}, ${verification_token}, ${randomBytes(32).toString('hex')}, ${JSON.stringify(records)}::jsonb)`);
    } catch (e: any) {
        if (e?.code === '23505') throw new DomainError('domain_already_registered');
        throw e;
    }
    await logAudit(orgId, { accion: 'domain.registered', entidad: 'org_domains', detalle: hostname });
}
async function acquire(orgId: string, removing = false): Promise<{ domain: CustomerDomain; lease: string }> {
    const lease = randomUUID();
    const [rows] = await withOrgTx(orgId, sql`update org_domains set operation_token = ${lease}::uuid,
        operation_expires_at = now() + interval '5 minutes',
        removing = removing or ${removing},
        status = case when ${removing} then 'error' else status end
        where org_id = ${orgId}
          and (operation_expires_at is null or operation_expires_at < now())
          and (${removing} or not removing)
        returning *`);
    if (!rows.length) throw new DomainError('domain_busy');
    return { domain: rows[0] as unknown as CustomerDomain, lease };
}
async function saveCheck(orgId: string, lease: string, status: DomainStatus, records: DomainRecord[], error: string | null = null) {
    const [rows] = await withOrgTx(orgId, sql`update org_domains set status = ${status}, records = ${JSON.stringify(records)}::jsonb,
        error_code = ${error}, last_checked_at = now(), verified_at = case when ${status} = 'active' then now() else null end
        where org_id = ${orgId} and operation_token = ${lease}::uuid returning id`);
    if (!rows.length) throw new DomainError('domain_busy');
}
export async function hasDomainOwnership(domain: CustomerDomain): Promise<boolean> {
    const resolver = new Resolver({ timeout: 2500, tries: 1 });
    try {
        const txt = await resolver.resolveTxt(ownershipRecord(domain).name);
        return txt.some(chunks => chunks.join('') === ownershipRecord(domain).value);
    } catch (error: any) {
        if (['ENODATA', 'ENOTFOUND'].includes(error?.code)) return false;
        throw new DomainError('dns_unavailable', 503);
    }
}
export async function verifyCustomerDomain(orgId: string) {
    if (!domainsEnabled()) throw new DomainError('domains_unavailable', 503);
    if (!await domainEligible(orgId)) throw new DomainError('subscription_required', 402);
    const { domain, lease } = await acquire(orgId);
    let records = [ownershipRecord(domain)];
    try {
        // Never bind an arbitrary hostname just because Vercel reports verified.
        if (!await hasDomainOwnership(domain)) {
            await saveCheck(orgId, lease, 'pending', domain.records, 'ownership_pending');
            return;
        }
        const cfg = domainProviderConfig();
        if (domain.provider_project && (domain.provider_project !== cfg.project || domain.provider_team !== cfg.team)) {
            throw new DomainError('provider_scope_changed');
        }
        let remote = await getProviderDomain(domain.hostname);
        if (!domain.provider_owned) {
            // Existing aliases may belong to the operator, not this feature. Never adopt/remove them.
            if (remote) throw new DomainError('domain_requires_support');
            remote = await addProviderDomain(domain.hostname);
            await withOrgTx(orgId, sql`update org_domains set provider_owned = true,
                provider_project = ${cfg.project}, provider_team = ${cfg.team}
                where org_id = ${orgId} and operation_token = ${lease}::uuid`);
        }
        if (!remote || remote.name !== domain.hostname || remote.projectId !== cfg.project ||
            remote.redirect || remote.gitBranch || remote.customEnvironmentId) throw new DomainError('domain_requires_support');
        const config = await getProviderConfig(domain.hostname);
        const cname = [...(config.recommendedCNAME || [])].sort((a, b) => a.rank - b.rank)[0]?.value;
        if (!cname || !/^[a-z0-9.-]+\.?$/i.test(cname)) throw new DomainError('provider_unavailable', 503);
        records.push({ type: 'CNAME', name: domain.hostname, value: cname });
        for (const entry of remote.verification || []) {
            if (entry.type === 'TXT') records.push({ type: 'TXT', name: entry.domain, value: entry.value });
        }
        if (!remote.verified) {
            try { remote = await verifyProviderDomain(domain.hostname); }
            catch (e) { if (!(e instanceof DomainProviderError && e.status === 400)) throw e; }
        }
        if (!remote.verified || config.misconfigured !== false || config.configuredBy !== 'CNAME') {
            await saveCheck(orgId, lease, 'dns_pending', records);
            return;
        }
        // Save pending first so the well-known route can answer the TLS probe.
        await saveCheck(orgId, lease, 'tls_pending', records);
        const nonce = randomBytes(24).toString('hex');
        const probe = await safeFetch('https://' + domain.hostname + DOMAIN_PROBE_PATH + '?nonce=' + nonce,
            { method: 'GET' }, { timeoutMs: 8000, maxBodyBytes: 256 });
        const ready = probe.ok && probe.body === domainProbeProof(domain, nonce);
        await saveCheck(orgId, lease, ready ? 'active' : 'tls_pending', records, ready ? null : 'tls_pending');
        if (ready) await logAudit(orgId, { accion: 'domain.verified', entidad: 'org_domains', detalle: domain.hostname });
    } catch (e) {
        await saveCheck(orgId, lease, 'error', records, e instanceof DomainError ? e.code : 'provider_unavailable');
        throw e;
    } finally {
        await withOrgTx(orgId, sql`update org_domains set operation_token = null, operation_expires_at = null
            where org_id = ${orgId} and operation_token = ${lease}::uuid`);
    }
}
export async function disconnectCustomerDomain(orgId: string) {
    // Removing access is possible after a downgrade or rollout pause, too.
    if (!await readCustomerDomain(orgId)) return;
    const { domain, lease } = await acquire(orgId, true);
    try {
        if (domain.provider_owned) {
            const cfg = domainProviderConfig();
            if (domain.provider_project !== cfg.project || domain.provider_team !== cfg.team) throw new DomainError('provider_scope_changed');
            await removeProviderDomain(domain.hostname);
        }
        await withOrgTx(orgId, sql`delete from org_domains where org_id = ${orgId} and operation_token = ${lease}::uuid`);
        await logAudit(orgId, { accion: 'domain.disconnected', entidad: 'org_domains', detalle: domain.hostname });
    } catch (e) {
        await withOrgTx(orgId, sql`update org_domains set status = 'error', error_code = 'disconnect_failed',
            operation_token = null, operation_expires_at = null
            where org_id = ${orgId} and operation_token = ${lease}::uuid`);
        throw e;
    }
}
