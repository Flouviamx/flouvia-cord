// /api/facturas — facturas como objeto propio, sin cotización de por medio.
//   GET  ?estado=&cliente=&q=&desde=&hasta=&cursor=  → { facturas, nextCursor }
//   POST { cliente_id, items[], currency?, due_date?, notas? } → { id, token }
//
// El POST crea un BORRADOR: no llama al proveedor fiscal ni consume medidor.
// Emitir es una acción aparte (PATCH .../[id] { action: 'finalize' }), porque
// timbrar es irreversible y cuesta dinero real.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../lib/db';
import { requirePerm, getFacturas, invalidateMoneyCaches } from '../../lib/queries';
import { createInvoiceDraft, parseInvoiceItems, MAX_INVOICE_ITEMS } from '../../lib/fiscal/invoices';
import { requireEntitlement } from '../../lib/org-entitlements';
import { currentUserId } from '../../lib/context';
import { invoicingFeatureFor } from '../../lib/fiscal/gate';

export const GET: APIRoute = async ({ url }) => {
    const denied = await requirePerm('cobranza'); if (denied) return denied;
    const page = await getFacturas({
        estado: url.searchParams.get('estado'),
        clienteId: url.searchParams.get('cliente'),
        desde: url.searchParams.get('desde'),
        hasta: url.searchParams.get('hasta'),
        q: url.searchParams.get('q'),
        cursor: url.searchParams.get('cursor'),
        limit: Number(url.searchParams.get('limit')) || 50,
    });
    return json(page);
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cotizar'); if (denied) return denied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const orgId = await getActiveOrgId();
    // Regla 17: se gatea en CADA camino que ejecuta la capacidad, no solo donde
    // se ve el botón. Crear el borrador ya es Cord Invoicing.
    const subscriptionDenied = await requireEntitlement(orgId, await invoicingFeatureFor(orgId));
    if (subscriptionDenied) return subscriptionDenied;

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length) return json({ error: 'Agrega al menos un concepto.' }, 400);
    if (rawItems.length > MAX_INVOICE_ITEMS) return json({ error: `Máximo ${MAX_INVOICE_ITEMS} conceptos por factura.` }, 400);

    const items = parseInvoiceItems(rawItems);
    if (!items.length) return json({ error: 'Cada concepto necesita descripción y cantidad.' }, 400);

    const dueDate = String(body.due_date ?? '').trim();
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        return json({ error: 'La fecha de vencimiento no es válida.' }, 400);
    }

    const result = await createInvoiceDraft(orgId, {
        clienteId: String(body.cliente_id ?? '').trim(),
        items,
        currency: body.currency ? String(body.currency) : undefined,
        dueDate: dueDate || null,
        notes: String(body.notas ?? '').trim().slice(0, 1000) || null,
        bufferPct: Number(body.fx_buffer_pct) || 0,
        ivaIncluido: body.iva_incluido === true,
        createdBy: currentUserId(),
    });
    // Un fallo de FX es 503 (Regla 22: no se inventa la tasa, se dice que no se
    // pudo obtener); el resto son datos mal capturados.
    if (!result.ok) {
        const fxDown = /tipo de cambio/i.test(result.error || '');
        return json({ error: result.error }, fxDown ? 503 : 400);
    }

    await logAudit(orgId, {
        accion: 'factura.borrador_creado', entidad: 'factura',
        entidad_id: result.documentId as string,
        detalle: `Borrador con ${items.length} concepto(s)`, ip: reqIp(request),
    });
    invalidateMoneyCaches(orgId);
    return json({ id: result.documentId, token: result.publicToken });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
