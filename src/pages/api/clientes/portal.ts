// /api/clientes/portal — el negocio administra el portal de un cliente.
//   POST { cliente_id, accion: 'crear' | 'rotar' | 'apagar' | 'enviar' | 'autopay_off' }
//
// El cobro automático lo ACTIVA el cliente (es su autorización); aquí el
// negocio solo puede apagarlo. Rotar el link invalida el anterior: es la
// respuesta a un link que se compartió de más.
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../../lib/queries';
import { getActiveOrgId, logAudit, sql, withOrgTx } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';
import { limitConnectMutation } from '../../../lib/connect-security';
import { apagarLinkPortal, linkPortal } from '../../../lib/cobros/portal';
import { enviarLinkPortal } from '../../../lib/cobros/avisos';
import { desactivarAutopay } from '../../../lib/cobros/agrupados';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('clientes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'portal-cliente', orgId, 30);
    if (limited) return limited;
    const body = await request.json().catch(() => ({} as any));
    const clienteId = String(body?.cliente_id || '');
    if (!UUID.test(clienteId)) return json({ error: 'Cliente inválido.' }, 400);
    const [[existe]] = await withOrgTx(orgId, sql`select id from clientes where id = ${clienteId} and org_id = ${orgId}`);
    if (!existe) return json({ error: 'Cliente no encontrado.' }, 404);

    const audit = (accion: string, detalle?: string) => logAudit(orgId, {
        accion, entidad: 'cliente', entidad_id: clienteId, ...(detalle ? { detalle } : {}),
    });

    switch (String(body?.accion || '')) {
        case 'crear': {
            const url = await linkPortal(orgId, clienteId);
            if (!url) return json({ error: 'No se pudo crear el link.' }, 409);
            await audit('cliente.portal_creado');
            return json({ ok: true, url });
        }
        case 'rotar': {
            const url = await linkPortal(orgId, clienteId, { rotar: true });
            if (!url) return json({ error: 'No se pudo generar el link.' }, 409);
            await audit('cliente.portal_rotado', 'El link anterior dejó de abrir.');
            return json({ ok: true, url });
        }
        case 'apagar': {
            await apagarLinkPortal(orgId, clienteId);
            await audit('cliente.portal_apagado');
            return json({ ok: true });
        }
        case 'enviar': {
            const r = await enviarLinkPortal(orgId, clienteId);
            if (!r.ok) return json({ error: r.error }, 409);
            await audit('cliente.portal_enviado');
            return json({ ok: true });
        }
        case 'autopay_off': {
            await desactivarAutopay(orgId, clienteId, { por: 'negocio', usuarioId: currentUserId() });
            await audit('cliente.cobro_automatico_desactivado');
            return json({ ok: true });
        }
        default:
            return json({ error: 'Acción no reconocida.' }, 400);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
