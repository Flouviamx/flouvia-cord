// src/lib/apiv1.ts
// Helpers compartidos de la API pública v1: respuestas con shape estable y
// serializadores que exponen SOLO campos seguros (nunca tokens internos, hashes
// ni columnas crudas de DB). Las rutas reusan las queries de queries.ts y pasan
// el resultado por estos serializadores.

import type { MockQuote } from './queries';

export function ok(data: unknown, meta?: Record<string, unknown>): Response {
    return new Response(JSON.stringify(meta ? { data, meta } : { data }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
    });
}

export function fail(error: string, code: string, status = 400): Response {
    return new Response(JSON.stringify({ error, code }), {
        status, headers: { 'Content-Type': 'application/json' },
    });
}

// Paginación por offset (simple y predecible). Tope duro para no devolver todo.
export function pageParams(url: URL): { limit: number; offset: number } {
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
    return { limit, offset };
}

// ── Serializadores ───────────────────────────────────────────────────────────
export function quoteListItem(q: MockQuote) {
    return {
        id: q.id,
        folio: q.folio,
        cliente: q.cliente,
        status: q.status,
        total: q.total,
        terminos: q.terminos,
        vigencia: q.vigencia,
        creada: q.creada,
        link_publico: `/q/${q.token}`,
    };
}

export function quoteDetail(q: MockQuote) {
    return {
        ...quoteListItem(q),
        notas: q.notas ?? null,
        aprobacion: q.aprobEstado ? { estado: q.aprobEstado, motivo: q.aprobMotivo ?? null } : null,
        items: q.items.map((it) => ({
            descripcion: it.descripcion,
            cantidad: it.cantidad,
            unidad: it.unidad,
            precio_lista: it.precioLista,
            precio_negociado: it.precioNegociado,
        })),
        eventos: q.eventos.map((e) => ({ tipo: e.tipo, detalle: e.detalle, cuando: e.cuando })),
    };
}

/**
 * Serializador de factura. Expone el saldo y el ciclo de vida —lo que un
 * integrador necesita para conciliar— y NUNCA el `public_token`, que es la
 * única credencial de la hosted invoice page: publicarlo en un listado de API
 * convertiría cualquier llave de solo lectura en un repartidor de links de pago.
 */
export function invoiceListItem(f: any) {
    return {
        id: f.id,
        numero: f.invoiceNumber,
        folio_fiscal: f.fiscalId,
        cliente: f.cliente,
        estado: f.estado,
        estado_fiscal: f.estadoFiscal,
        pais: f.pais,
        tipo: f.tipo,
        moneda: f.currency,
        total: f.total,
        pagado: f.pagado,
        saldo: f.saldo,
        vence: f.venceISO,
        vencida: f.vencida,
        cotizacion_id: f.cotizacionId,
        creada: f.creado,
    };
}

export function invoiceDetail(f: any) {
    return {
        ...invoiceListItem(f),
        subtotal: f.subtotal,
        impuestos: f.impuestos,
        moneda_contable: f.ledgerCurrency,
        tipo_cambio: f.fxRate,
        total_contable: f.ledgerTotal,
        notas: f.notas,
        nota_credito_de: f.notaCreditoDe,
        emisor: f.emisor,
        receptor: f.receptor,
        conceptos: (f.lineas ?? []).map((l: any) => ({
            descripcion: l.descripcion,
            cantidad: l.cantidad,
            precio_unitario: l.precioUnitario,
            subtotal: l.subtotal,
            impuesto: l.impuesto,
            total: l.total,
        })),
        pagos: (f.pagos ?? []).map((p: any) => ({
            monto: p.monto,
            moneda: p.currency,
            metodo: p.metodo,
            referencia: p.referencia,
            cuando: p.cuando,
        })),
    };
}
