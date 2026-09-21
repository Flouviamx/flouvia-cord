import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { getAccessToken } from '../conexiones';
import { HUBSPOT_API } from './config';
import { hsError } from './errors';

export class HubSpotApiError extends Error {
    constructor(message: string, readonly status: number, readonly retryable = false, readonly retryAfterSeconds = 0) {
        super(message);
    }
}

export interface HubSpotResponse<T = any> {
    status: number;
    data: T;
}

const TIMEOUT_MS = 15_000;

async function send(token: string, method: string, path: string, body?: unknown) {
    return fetch(`${HUBSPOT_API}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
}

export async function hubspotRequest<T = any>(orgId: string, conexionId: string, method: string, path: string, body?: unknown): Promise<HubSpotResponse<T>> {
    let token = await getAccessToken(orgId, conexionId);
    let res: Response;
    try {
        res = await send(token, method, path, body);
        if (res.status === 401) {
            await withOrgTx(orgId, sql`update integracion_conexiones set access_expires_at = null where id = ${conexionId} and org_id = ${orgId}`);
            token = await getAccessToken(orgId, conexionId);
            res = await send(token, method, path, body);
        }
    } catch (error) {
        if (error instanceof HubSpotApiError) throw error;
        throw new HubSpotApiError(hsError('timeout'), 0, true, 60);
    }

    const data = await res.json().catch(() => ({}));
    if (res.ok || res.status === 404) return { status: res.status, data: data as T };

    if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after')) || 10;
        throw new HubSpotApiError(hsError('rate'), 429, true, retry);
    }
    if (res.status >= 500) throw new HubSpotApiError(hsError('temporal'), res.status, true, 300);

    const detail = typeof (data as any)?.message === 'string' ? (data as any).message : '';
    log.warn('hubspot rechazó una petición', { route: 'integraciones/hubspot', orgId, status: res.status, path: path.split('?')[0], detail: detail.slice(0, 300) });
    if (res.status === 403) throw new HubSpotApiError(hsError('permisos'), 403);
    if (/deal_currency_code|currency/i.test(detail)) {
        throw new HubSpotApiError(hsError('divisa'), res.status);
    }
    if (/pipeline|dealstage/i.test(detail)) {
        throw new HubSpotApiError(hsError('pipeline'), res.status);
    }
    throw new HubSpotApiError(hsError('datos'), res.status);
}
