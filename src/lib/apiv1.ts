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

// Tope de cuerpo para los POST/PATCH de la API pública. Generoso para una
// cotización con cientos de líneas, mucho menor que el límite de plataforma.
const MAX_BODY_BYTES = 1_000_000;

/**
 * Lee y valida el cuerpo JSON de una petición de la API pública. Devuelve el
 * objeto ya parseado, o la `Response` de error lista para devolver.
 *
 * Antes cada endpoint hacía `await request.json()` en un try/catch y nada más:
 * sin exigir `Content-Type: application/json` y sin más tope que el de la
 * plataforma. No era explotable de por sí, pero es la capa que evita gastar
 * parseo en peticiones que ya se sabe que no van a servir, y hace que el error
 * diga QUÉ está mal en vez de un "JSON inválido" genérico.
 */
export async function readJsonBody(request: Request): Promise<any | Response> {
    const tipo = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (tipo && tipo !== 'application/json') {
        return fail('El cuerpo debe enviarse como application/json', 'unsupported_media_type', 415);
    }

    // Se confía en content-length solo para RECHAZAR temprano; el tamaño real se
    // vuelve a medir sobre el texto leído, que es el que no se puede falsear.
    const declarado = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(declarado) && declarado > MAX_BODY_BYTES) {
        return fail('El cuerpo de la petición es demasiado grande', 'payload_too_large', 413);
    }

    let raw: string;
    try { raw = await request.text(); } catch { return fail('No se pudo leer el cuerpo', 'invalid_json', 400); }
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
        return fail('El cuerpo de la petición es demasiado grande', 'payload_too_large', 413);
    }

    try { return JSON.parse(raw); } catch { return fail('JSON inválido', 'invalid_json', 400); }
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
