import { getActiveOrgId, reqIp } from '../db';
import type { ActionContext, ActionOutcome } from './outcome';

export async function sessionContext(request: Request): Promise<ActionContext> {
    return { orgId: await getActiveOrgId(), ip: reqIp(request), origin: new URL(request.url).origin };
}

export function outcomeResponse(outcome: ActionOutcome): Response {
    return new Response(JSON.stringify(outcome.body), { status: outcome.status, headers: { 'Content-Type': 'application/json' } });
}
