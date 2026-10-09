// /api/facturas/global — factura global (CFDI 4.0) de las ventas al público
// en general. Solo México. Ver src/lib/fiscal/factura-global.ts.
//   GET  ?periodicidad=04&meses=09&anio=2026[&desde=&hasta=]
//        → { desde, hasta, elegibles: [...], excluidas: [...], forma_pago_sugerida }
//   POST { periodicidad, meses, anio, desde?, hasta?, cotizaciones: [id…], forma_pago? }
//        → { ok, id, numero, fiscal_id }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { requirePerm, invalidateMoneyCaches } from '../../../lib/queries';
import { requireEntitlement } from '../../../lib/org-entitlements';
import { orgCountry } from '../../../lib/fiscal/gate';
import { currentUserId } from '../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../lib/ratelimit';
import { createGlobalInvoice, ventasParaGlobal, anioEnMexico } from '../../../lib/fiscal/factura-global';
import { globalPeriodError, globalPeriodRange } from '../../../lib/fiscal/cfdi-catalogos';
import { sql, withOrgTx } from '../../../lib/db';

async function guard(): Promise<{ orgId: string } | Response> {
    const denied = await requirePerm('cotizar');
    if (denied) return denied;
    const orgId = await getActiveOrgId();
    if (await orgCountry(orgId) !== 'MX') return json({ error: 'La factura global es un comprobante de México.' }, 409);
    // Regla 17: es un CFDI; se gatea igual que cualquier timbrado.
    const subscriptionDenied = await requireEntitlement(orgId, 'cfdi');
    if (subscriptionDenied) return subscriptionDenied;
    return { orgId };
}

export const GET: APIRoute = async ({ url }) => {
    const g = await guard();
    if (g instanceof Response) return g;
    const periodo = {
        periodicidad: String(url.searchParams.get('periodicidad') ?? ''),
        meses: String(url.searchParams.get('meses') ?? ''),
        anio: Number(url.searchParams.get('anio')),
    };
    const [[org]] = await withOrgTx(g.orgId, sql`select regimen_fiscal from orgs where id = ${g.orgId} limit 1`);
    const error = globalPeriodError({ ...periodo, regimen: org?.regimen_fiscal as string, anioEmision: anioEnMexico() });
    if (error) return json({ error }, 400);
    const rango = globalPeriodRange({ ...periodo, desde: url.searchParams.get('desde'), hasta: url.searchParams.get('hasta') });
    if ('error' in rango) return json({ error: rango.error }, 400);
    const { elegibles, excluidas, formaPagoSugerida } = await ventasParaGlobal(g.orgId, rango);
    return json({
        desde: rango.desde, hasta: rango.hasta,
        elegibles: elegibles.map((v) => ({
            id: v.id, folio: v.folio, cliente: v.cliente, cliente_rfc: v.clienteRfc, pagada: v.pagadaEn,
            subtotal: v.subtotal, impuestos: v.impuestos, total: v.total, forma_pago: v.formaPago,
        })),
        excluidas,
        forma_pago_sugerida: formaPagoSugerida,
    });
};

export const POST: APIRoute = async ({ request }) => {
    const g = await guard();
    if (g instanceof Response) return g;
    // Timbrar consume un CFDI y habla con el PAC: tope por organización, que
    // falla cerrado si el contador no responde.
    const limitado = strictLimitResponse(await strictRateLimit(`factura-global:${g.orgId}`, 10, 60));
    if (limitado) return limitado;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const result = await createGlobalInvoice(g.orgId, {
        periodicidad: String(body.periodicidad ?? ''),
        meses: String(body.meses ?? ''),
        anio: Number(body.anio),
        desde: body.desde ? String(body.desde) : null,
        hasta: body.hasta ? String(body.hasta) : null,
        cotizacionIds: Array.isArray(body.cotizaciones) ? body.cotizaciones.map(String) : [],
        formaPago: body.forma_pago ? String(body.forma_pago) : null,
        createdBy: currentUserId(),
    });
    invalidateMoneyCaches(g.orgId);
    if (result.documentId) {
        await logAudit(g.orgId, {
            accion: result.ok ? 'factura.global_emitida' : 'factura.global_borrador', entidad: 'factura', entidad_id: result.documentId,
            detalle: `${body.periodicidad}/${body.meses}/${body.anio} · ${Array.isArray(body.cotizaciones) ? body.cotizaciones.length : 0} venta(s)`,
            ip: reqIp(request),
        });
    }
    if (!result.ok) {
        // Un borrador que no se pudo timbrar se conserva con sus ventas: el
        // detalle ofrece reintentar o descartarlo.
        return json({ error: result.error || 'No se pudo emitir la factura global.', id: result.documentId ?? null }, result.httpStatus || 400);
    }
    return json({ ok: true, id: result.documentId, numero: result.invoiceNumber, fiscal_id: result.fiscalId ?? null });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
