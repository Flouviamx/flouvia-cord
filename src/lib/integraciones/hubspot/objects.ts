import { hubspotRequest, HubSpotApiError } from './client';

export type CrmObject = 'companies' | 'contacts' | 'deals';

export interface Ref {
    orgId: string;
    conexionId: string;
}

const ID_RE = /^[0-9]{1,20}$/;

function requireId(value: unknown): string {
    const id = value === undefined || value === null ? '' : String(value);
    if (!ID_RE.test(id)) throw new HubSpotApiError('HubSpot devolvió un identificador inesperado.', 502);
    return id;
}

export async function createObject(ref: Ref, type: CrmObject, properties: Record<string, string>): Promise<string> {
    const res = await hubspotRequest(ref.orgId, ref.conexionId, 'POST', `/crm/v3/objects/${type}`, { properties });
    if (res.status === 404) throw new HubSpotApiError('HubSpot no encontró el recurso para crear el registro.', 404);
    return requireId(res.data?.id);
}

export async function updateObject(ref: Ref, type: CrmObject, id: string, properties: Record<string, string>): Promise<boolean> {
    const res = await hubspotRequest(ref.orgId, ref.conexionId, 'PATCH', `/crm/v3/objects/${type}/${requireId(id)}`, { properties });
    return res.status !== 404;
}

export async function readObject(ref: Ref, type: CrmObject, id: string, properties: string[]): Promise<Record<string, unknown> | null> {
    const qs = new URLSearchParams({ properties: properties.join(','), archived: 'false' });
    const res = await hubspotRequest(ref.orgId, ref.conexionId, 'GET', `/crm/v3/objects/${type}/${requireId(id)}?${qs}`);
    if (res.status === 404) return null;
    return res.data?.properties && typeof res.data.properties === 'object' ? res.data.properties : {};
}

export async function findContactByEmail(ref: Ref, email: string): Promise<string | null> {
    const res = await hubspotRequest(ref.orgId, ref.conexionId, 'POST', '/crm/v3/objects/contacts/search', {
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
        properties: ['email'],
        limit: 1,
    });
    const first = Array.isArray(res.data?.results) ? res.data.results[0] : null;
    return first ? requireId(first.id) : null;
}

export async function associate(ref: Ref, from: CrmObject, fromId: string, to: CrmObject, toId: string): Promise<void> {
    await hubspotRequest(ref.orgId, ref.conexionId, 'PUT', `/crm/v4/objects/${from}/${requireId(fromId)}/associations/default/${to}/${requireId(toId)}`);
}

export async function listDealPipelines(ref: Ref): Promise<{ id: string; label: string; stages: { id: string; label: string }[] }[]> {
    const res = await hubspotRequest(ref.orgId, ref.conexionId, 'GET', '/crm/v3/pipelines/deals');
    const results = Array.isArray(res.data?.results) ? res.data.results : [];
    return results.slice(0, 50).map((p: any) => ({
        id: String(p.id),
        label: String(p.label ?? p.id).slice(0, 120),
        stages: (Array.isArray(p.stages) ? p.stages : []).slice(0, 50).map((s: any) => ({ id: String(s.id), label: String(s.label ?? s.id).slice(0, 120) })),
    }));
}
