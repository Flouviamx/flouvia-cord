// /api/v1/facturas — API PÚBLICA de facturas.
//   GET  ?estado=&cliente=&q=&limit=&cursor=  → { data: [...], meta }
//   POST { cliente_id, items[], currency?, due_date?, notas? } → { data: { id } }
//        (scope: write — crea un BORRADOR; emitir es POST /v1/facturas/{id}/finalize)
//
// Hasta ago 2026 este endpoint no existía y la documentación lo admitía en
// src/content/support/es/api-facturas.md: se podía crear una cotización por API
// pero no consultar ni emitir una factura.
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { getFacturas } from '../../../lib/queries';
import { createInvoiceDraft, parseInvoiceItems, MAX_INVOICE_ITEMS } from '../../../lib/fiscal/invoices';
import { ok, fail, invoiceListItem } from '../../../lib/apiv1';
import { requireEntitlement } from '../../../lib/org-entitlements';
import { invoicingFeatureFor } from '../../../lib/fiscal/gate';

export const GET = withApiAuth('read', async ({ url }) => {
    // Keyset, no offset: con offset una factura nueva desplaza la página y
    // esconde un registro sin que el integrador se entere.
    const page = await getFacturas({
        estado: url.searchParams.get('estado'),
        clienteId: url.searchParams.get('cliente'),
        desde: url.searchParams.get('desde'),
        hasta: url.searchParams.get('hasta'),
        q: url.searchParams.get('q'),
        cursor: url.searchParams.get('cursor'),
        limit: Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50)),
    });
    return ok(page.facturas.map(invoiceListItem), { next_cursor: page.nextCursor });
});

export const POST = withApiAuth('write', async ({ request }, auth) => {
    let body: any;
    try { body = await request.json(); } catch { return fail('JSON inválido', 'invalid_json', 400); }

    const orgId = await getActiveOrgId();
    // Regla 17: la API pública es un camino de ejecución más, y se gatea igual
    // que el endpoint de la app y que el MCP.
    const subscriptionDenied = await requireEntitlement(orgId, await invoicingFeatureFor(orgId));
    if (subscriptionDenied) return subscriptionDenied;

    const clienteId = String(body.cliente_id ?? '').trim();
    if (!clienteId) return fail('cliente_id es obligatorio', 'invalid_request', 400);

    const raw = Array.isArray(body.items) ? body.items : [];
    if (!raw.length) return fail('items no puede ir vacío', 'invalid_request', 400);
    if (raw.length > MAX_INVOICE_ITEMS) return fail(`Máximo ${MAX_INVOICE_ITEMS} conceptos por factura`, 'invalid_request', 400);

    const items = parseInvoiceItems(raw);
    if (!items.length) return fail('Cada concepto necesita descripcion y cantidad', 'invalid_request', 400);

    const dueDate = String(body.due_date ?? '').trim();
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        return fail('due_date debe ser YYYY-MM-DD', 'invalid_request', 400);
    }

    const result = await createInvoiceDraft(orgId, {
        clienteId,
        items,
        currency: body.currency ? String(body.currency) : undefined,
        dueDate: dueDate || null,
        notes: String(body.notas ?? '').trim().slice(0, 1000) || null,
        bufferPct: Number(body.fx_buffer_pct) || 0,
        ivaIncluido: body.iva_incluido === true,
    });
    if (!result.ok) {
        // Regla 22: sin tasa demostrable no se factura. 503, no 400 — el
        // integrador debe reintentar, no corregir su payload.
        const fxDown = /tipo de cambio/i.test(result.error || '');
        return fxDown
            ? fail(result.error!, 'fx_unavailable', 503)
            : fail(result.error!, 'invalid_request', 400);
    }

    await logAudit(orgId, {
        accion: 'factura.borrador_creado', entidad: 'factura',
        entidad_id: result.documentId as string,
        detalle: `Borrador con ${items.length} concepto(s) (vía API)`,
        ip: reqIp(request), actor: `api:${auth.keyId}`,
    });
    return ok({ id: result.documentId });
});
