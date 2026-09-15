import { sql, withOrgTx } from '../../db';
import { hubspotRequest } from './client';

export class HubSpotActionError extends Error {
    constructor(message: string, readonly final = true) {
        super(message);
    }
}

const NOTE_TO_DEAL = 214;
const NOTE_TO_COMPANY = 190;

export async function addHubSpotNote(orgId: string, refs: { quoteId: string | null; clientId: string | null }, htmlBody: string): Promise<'deal' | 'company'> {
    const [[conn]] = await withOrgTx(orgId, sql`
        select id, estado from integracion_conexiones
         where org_id = ${orgId} and proveedor = 'hubspot' and estado <> 'desconectada'`);
    if (!conn) throw new HubSpotActionError('Conecta HubSpot en Ajustes › Integraciones para usar esta acción.');
    if (conn.estado !== 'activa') throw new HubSpotActionError('HubSpot necesita reconectarse en Ajustes › Integraciones.');

    const [links] = await withOrgTx(orgId, sql`
        select objeto, externo_id from integracion_vinculos
         where org_id = ${orgId} and conexion_id = ${conn.id as string}
           and ((objeto = 'quote' and local_id = ${refs.quoteId}::uuid) or (objeto = 'client' and local_id = ${refs.clientId}::uuid))`);
    const deal = links.find((l) => l.objeto === 'quote');
    const company = links.find((l) => l.objeto === 'client');
    const target = deal
        ? { id: String(deal.externo_id), typeId: NOTE_TO_DEAL, kind: 'deal' as const }
        : company ? { id: String(company.externo_id), typeId: NOTE_TO_COMPANY, kind: 'company' as const } : null;
    if (!target) {
        throw new HubSpotActionError('Este registro todavía no está en HubSpot. Se reintenta cuando termine de sincronizarse.', false);
    }

    const res = await hubspotRequest(orgId, conn.id as string, 'POST', '/crm/v3/objects/notes', {
        properties: { hs_timestamp: new Date().toISOString(), hs_note_body: htmlBody },
        associations: [{ to: { id: target.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: target.typeId }] }],
    });
    if (res.status === 404) throw new HubSpotActionError('El registro ya no existe en HubSpot.');
    return target.kind;
}
