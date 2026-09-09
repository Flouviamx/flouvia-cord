import type { APIRoute } from 'astro';
import { domainApiAccess, domainApiError, domainJson } from '../../../lib/domain-api';
import { domainState, verifyCustomerDomain } from '../../../lib/customer-domains';
export const prerender = false;
export const POST: APIRoute = async () => {
    try {
        const access = await domainApiAccess(true);
        if (access instanceof Response) return access;
        await verifyCustomerDomain(access);
        return domainJson(await domainState(access));
    } catch (e) { return domainApiError(e); }
};
