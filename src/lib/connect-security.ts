import { createHash } from 'node:crypto';
import { trustedIp } from './ip';
import { rateLimit, strictLimitResponse, strictRateLimit, tooMany } from './ratelimit';

const keyPart = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 24);

export async function limitConnectMutation(
    request: Request,
    scope: string,
    principal: string,
    limit = 20,
): Promise<Response | null> {
    const ip = trustedIp(request);
    const [principalResult, ipResult] = await Promise.all([
        strictRateLimit(`connect:${scope}:principal:${keyPart(principal)}`, limit, 60),
        strictRateLimit(`connect:${scope}:ip:${keyPart(ip)}`, Math.max(limit * 3, 30), 60),
    ]);
    return strictLimitResponse(!principalResult.ok ? principalResult : ipResult);
}

export async function limitConnectRead(request: Request, scope: string, principal: string): Promise<Response | null> {
    const result = await rateLimit(`connect-read:${scope}:${keyPart(principal)}:${keyPart(trustedIp(request))}`, 120, 60);
    return result.ok ? null : tooMany(result.retryAfter);
}
