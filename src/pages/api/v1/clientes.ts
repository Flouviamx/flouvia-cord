// /api/v1/clientes — API PÚBLICA del directorio de clientes.
//   GET  ?limit=&offset=   → { data: [...], meta }
//   POST { empresa, contacto?, email?, telefono?, rfc?, terminos?, limite?, nivel?, descuento_pct? }
//        → { data: { id } }   (scope: write)
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { sql, getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { getClientes } from '../../../lib/queries';
import { ok, fail, pageParams } from '../../../lib/apiv1';
import { requireResourceCapacity, resourceLimitError } from '../../../lib/org-entitlements';

const TERMINOS = ['contado', 'net30', 'net60'];
const NIVELES = ['estandar', 'plata', 'oro', 'distribuidor'];

export const GET = withApiAuth('read', async ({ url }) => {
    const all = await getClientes();
    const { limit, offset } = pageParams(url);
    return ok(all.slice(offset, offset + limit), { limit, offset, total: all.length });
});

export const POST = withApiAuth('write', async ({ request }, auth) => {
    let body: any;
    try { body = await request.json(); } catch { return fail('JSON inválido', 'invalid_json', 400); }

    const empresa = String(body.empresa ?? '').trim();
    if (!empresa) return fail('El nombre de la empresa es obligatorio', 'invalid_request', 400);

    const c = {
        empresa,
        contacto: String(body.contacto ?? '').trim() || null,
        email: String(body.email ?? '').trim() || null,
        telefono: String(body.telefono ?? '').trim() || null,
        rfc: String(body.rfc ?? '').trim().toUpperCase() || null,
        terminos: TERMINOS.includes(body.terminos) ? body.terminos : 'contado',
        limite: body.limite === '' || body.limite === null || body.limite === undefined
            ? null : Math.max(0, Number(body.limite) || 0),
        nivel: NIVELES.includes(body.nivel) ? body.nivel : 'estandar',
        descuento: Math.min(100, Math.max(0, Number(body.descuento_pct) || 0)),
    };

    const orgId = await getActiveOrgId();
    const capacityDenied = await requireResourceCapacity(orgId, 'clients');
    if (capacityDenied) return capacityDenied;
    let row: any;
    try {
        [row] = await sql`
            insert into clientes (org_id, empresa, contacto, email, telefono, rfc, terminos_default, limite_credito, nivel, descuento_pct)
            values (${orgId}, ${c.empresa}, ${c.contacto}, ${c.email}, ${c.telefono}, ${c.rfc}, ${c.terminos}, ${c.limite}, ${c.nivel}, ${c.descuento})
            returning id`;
    } catch (error) {
        return resourceLimitError(error) ?? fail('No se pudo crear el cliente.', 'server_error', 500);
    }
    await logAudit(orgId, { accion: 'cliente.creado', entidad: 'cliente', entidad_id: row.id as string, detalle: `${c.empresa} (vía API)`, ip: reqIp(request), actor: `api:${auth.keyId}` });
    return ok({ id: row.id });
});
