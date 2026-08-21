// POST /api/facturas/bulk — acciones sobre varias facturas a la vez.
//   { action: 'send', ids: [uuid, …] } → { enviadas, fallidas, detalle }
//
// El artículo de soporte "Envío masivo de facturas" describía esta capacidad
// desde antes de que existiera —con una navegación inventada, "Contabilidad >
// Facturas"— y no había endpoint detrás. Regla 15: una promesa documentada sin
// consumidor es una promesa falsa.
//
// El envío es SECUENCIAL a propósito. En paralelo, cien facturas disparan cien
// PDFs y cien llamadas a Resend a la vez: el proveedor limita, la función se
// pasa de tiempo y el vendedor no sabe cuáles salieron.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { requireEntitlement } from '../../../lib/org-entitlements';
import { invoicingFeatureFor } from '../../../lib/fiscal/gate';
import { notifyInvoiceIssued } from '../../../lib/email';
import { logInvoiceEvent } from '../../../lib/fiscal/timeline';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Tope por petición: más que esto no cabe en el tiempo de una función. */
const MAX_LOTE = 50;

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobranza'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const gate = await requireEntitlement(orgId, await invoicingFeatureFor(orgId));
    if (gate) return gate;

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (body.action !== 'send') return json({ error: 'Acción no válida' }, 400);

    const ids: string[] = Array.isArray(body.ids)
        ? Array.from(new Set<string>(body.ids.map((v: unknown) => String(v)))).filter((v) => UUID_RE.test(v))
        : [];
    if (!ids.length) return json({ error: 'Selecciona al menos una factura.' }, 400);
    if (ids.length > MAX_LOTE) {
        return json({ error: `Puedes enviar hasta ${MAX_LOTE} facturas a la vez. Selecciona menos y repite.` }, 400);
    }

    // Se filtra en SERVIDOR qué es enviable. El cliente manda ids; que una de
    // ellas sea un borrador, esté anulada o sea de otra organización no puede
    // depender de que la UI haya deshabilitado la casilla.
    const [candidatas] = await withOrgTx(orgId, sql`
        select d.id, d.invoice_number, d.lifecycle,
               coalesce(cl.email, cq.email) as email
          from documentos_fiscales d
          left join clientes cl on cl.id = d.cliente_id
          left join cotizaciones c on c.id = d.cotizacion_id
          left join clientes cq on cq.id = c.cliente_id
         where d.org_id = ${orgId}
           and d.id = any(${ids}::uuid[])
           and d.status = 'issued'
           and d.sent_at is null
           and d.lifecycle in ('open', 'uncollectible')`);

    let enviadas = 0;
    const fallidas: Array<{ id: string; folio: string | null; motivo: string }> = [];

    for (const f of candidatas) {
        const id = String(f.id);
        if (!f.email) {
            fallidas.push({ id, folio: (f.invoice_number as string) ?? null, motivo: 'sin_correo' });
            continue;
        }
        const sent = await notifyInvoiceIssued(orgId, id);
        if (!sent) {
            fallidas.push({ id, folio: (f.invoice_number as string) ?? null, motivo: 'no_enviado' });
            continue;
        }
        enviadas++;
        await withOrgTx(orgId, sql`
            update documentos_fiscales set sent_at = now(), updated_at = now()
             where id = ${id} and org_id = ${orgId}`);
        await logInvoiceEvent(orgId, id, 'sent', `Enviada a ${f.email} (envío masivo)`);
    }

    // Las que el filtro descartó por estado: se reportan para que el vendedor
    // sepa por qué su selección de 20 mandó 17, en vez de contarlas en silencio.
    const encontradas = new Set(candidatas.map((f: any) => String(f.id)));
    for (const id of ids) {
        if (!encontradas.has(id)) fallidas.push({ id, folio: null, motivo: 'no_enviable' });
    }

    await logAudit(orgId, {
        accion: 'factura.envio_masivo', entidad: 'factura',
        detalle: `${enviadas} enviadas, ${fallidas.length} sin enviar`, ip: reqIp(request),
    });

    return json({ enviadas, fallidas: fallidas.length, detalle: fallidas });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
