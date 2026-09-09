import type { APIRoute } from 'astro';
import { z } from 'zod';
import { parseJsonBody } from '../../../lib/validation';
import { domainApiAccess, domainApiError, domainJson } from '../../../lib/domain-api';
import { domainState, registerCustomerDomain, disconnectCustomerDomain, DomainError } from '../../../lib/customer-domains';
export const prerender = false;

export const GET: APIRoute = async () => {
    try {
        const access = await domainApiAccess();
        if (access instanceof Response) return access;
        return domainJson(await domainState(access));
    } catch (e) { return domainApiError(e); }
};
export const POST: APIRoute = async ({ request }) => {
    try {
        const access = await domainApiAccess(true);
        if (access instanceof Response) return access;
        const body = await parseJsonBody(request, z.object({ hostname: z.string().max(253) }).strict(), 1024);
        if (!body.ok) throw new DomainError('invalid_hostname', body.status === 413 ? 413 : 422);
        await registerCustomerDomain(access, body.data.hostname);
        return domainJson(await domainState(access), 201);
    } catch (e) { return domainApiError(e); }
};
export const DELETE: APIRoute = async () => {
    try {
        const access = await domainApiAccess(true);
        if (access instanceof Response) return access;
        await disconnectCustomerDomain(access);
        return domainJson({ ok: true });
    } catch (e) { return domainApiError(e); }
};
