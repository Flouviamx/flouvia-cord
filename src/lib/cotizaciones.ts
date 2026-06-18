// src/lib/cotizaciones.ts
// FUENTE ÚNICA de la creación de cotizaciones. La consumen tanto la ruta interna
// (/api/cotizaciones, sesión Clerk) como la API pública (/api/v1/cotizaciones,
// API key). Aquí vive el cálculo server-side de subtotal/IVA, el folio, el flujo
// de aprobación por umbrales y los eventos/auditoría — para no divergir.

import { sql, logAudit } from './db';
import { notifyQuoteSent } from './email';
import { dispatchQuoteEvent } from './webhooks';

const money0 = (n: number) => '$' + new Intl.NumberFormat('es-MX').format(Math.round(n));

export interface NewQuoteItem {
    producto_id?: string | null;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    precio_negociado?: number | null;
    costo_unitario?: number | null;
}

export interface NewQuoteInput {
    cliente_id?: string | null;
    terminos?: string;
    vigencia_dias?: number;
    notas?: string | null;
    send?: boolean;
    items: NewQuoteItem[];
}

export interface CreateQuoteResult {
    id: string;
    folio: string;
    token: string;
    needsApproval: boolean;
    motivo: string | null;
    email?: { sent: boolean; skipped?: string };
}

export class QuoteError extends Error {
    status: number;
    constructor(message: string, status = 400) { super(message); this.status = status; }
}

/**
 * Crea una cotización (borrador o enviada) para `orgId`. NO valida permisos ni
 * parsea el request — eso lo hace cada ruta (Clerk vs API key). `opts.origin` se
 * usa para construir el link público en el correo; `opts.actor` etiqueta la
 * auditoría (ej. 'api:<keyId>').
 */
export async function createCotizacion(
    orgId: string,
    input: NewQuoteInput,
    opts: { origin: string; ip: string; actor?: string },
): Promise<CreateQuoteResult> {
    const items = Array.isArray(input.items) ? input.items : [];
    if (!items.length) throw new QuoteError('Agrega al menos un producto', 400);

    // Subtotal server-side (no confiar en el cliente).
    let subtotal = 0;
    for (const it of items) {
        const precio = it.precio_negociado ?? it.precio_unitario ?? 0;
        subtotal += Number(precio) * Number(it.cantidad ?? 1);
    }

    const [org] = await sql`select * from orgs where id = ${orgId}`;

    const ivaPct = org.iva_pct !== undefined && org.iva_pct !== null ? Number(org.iva_pct) / 100 : 0.16;
    const iva = subtotal * ivaPct;
    const total = subtotal + iva;

    const [{ maxn }] = await sql`
        select coalesce(max(nullif(regexp_replace(folio, '\\D', '', 'g'), '')::int), 0) as maxn
        from cotizaciones where org_id = ${orgId}`;
    const folio = `${org.quote_prefix}-${String(Number(maxn) + 1).padStart(4, '0')}`;

    // Flujo de aprobación: ¿el descuento, monto o margen rebasan los topes?
    let maxDescPct = 0;
    let minMargenPct = Infinity;
    let hayLineasConCosto = false;
    for (const it of items) {
        const lista = Number(it.precio_unitario) || 0;
        const nego = it.precio_negociado;
        if (nego !== null && nego !== undefined && lista > 0 && Number(nego) < lista) {
            maxDescPct = Math.max(maxDescPct, (1 - Number(nego) / lista) * 100);
        }
        const costo = Number(it.costo_unitario) || 0;
        const precioFinal = (nego !== null && nego !== undefined) ? Number(nego) : lista;
        if (costo > 0 && precioFinal > 0) {
            hayLineasConCosto = true;
            minMargenPct = Math.min(minMargenPct, (precioFinal - costo) / precioFinal * 100);
        }
    }
    if (!hayLineasConCosto) minMargenPct = Infinity;

    const aprobDesc = Number(org.aprob_descuento_max) || 0;
    const aprobMonto = Number(org.aprob_monto_max) || 0;
    const aprobMargen = Number(org.aprob_margen_min) || 0;
    const needsApproval = !!input.send && (
        (aprobDesc > 0 && maxDescPct > aprobDesc) ||
        (aprobMonto > 0 && total > aprobMonto) ||
        (aprobMargen > 0 && hayLineasConCosto && minMargenPct < aprobMargen)
    );
    let aprobEstado: string | null = null;
    let aprobMotivo: string | null = null;
    if (needsApproval) {
        const reasons: string[] = [];
        if (aprobDesc > 0 && maxDescPct > aprobDesc) reasons.push(`descuento ${Math.round(maxDescPct)}% supera el ${aprobDesc}% permitido`);
        if (aprobMonto > 0 && total > aprobMonto) reasons.push(`total ${money0(total)} supera el tope de ${money0(aprobMonto)}`);
        if (aprobMargen > 0 && hayLineasConCosto && minMargenPct < aprobMargen) reasons.push(`margen bruto ${Math.round(minMargenPct)}% está por debajo del mínimo de ${aprobMargen}%`);
        aprobEstado = 'pendiente';
        aprobMotivo = reasons.join(' y ');
    }

    const terminos = ['contado', 'net30', 'net60'].includes(input.terminos ?? '') ? input.terminos! : 'contado';
    const dias = Number(input.vigencia_dias) || 30;
    const vigencia = new Date(); vigencia.setDate(vigencia.getDate() + dias);
    const clienteId = input.cliente_id || null;
    const status = needsApproval ? 'draft' : (input.send ? 'sent' : 'draft');
    const sentAt = (!needsApproval && input.send) ? new Date().toISOString() : null;

    const [cot] = await sql`
        insert into cotizaciones
            (org_id, cliente_id, folio, status, subtotal, iva, total, terminos, vigencia, notas, sent_at, aprob_estado, aprob_motivo)
        values
            (${orgId}, ${clienteId}, ${folio}, ${status}, ${subtotal}, ${iva}, ${total},
             ${terminos}, ${vigencia.toISOString()}, ${input.notas || null}, ${sentAt}, ${aprobEstado}, ${aprobMotivo})
        returning id, public_token`;

    let orden = 0;
    for (const it of items) {
        await sql`
            insert into cotizacion_items
                (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, precio_negociado, costo_unitario, orden)
            values
                (${cot.id}, ${it.producto_id || null}, ${it.descripcion}, ${Number(it.cantidad) || 1},
                 ${Number(it.precio_unitario) || 0},
                 ${it.precio_negociado === null || it.precio_negociado === undefined ? null : Number(it.precio_negociado)},
                 ${Number(it.costo_unitario) || 0},
                 ${orden++})`;
    }

    await sql`
        insert into cotizacion_versiones
            (cotizacion_id, org_id, version, subtotal, iva, total, items, notas)
        values
            (${cot.id}, ${orgId}, 1, ${subtotal}, ${iva}, ${total}, ${JSON.stringify(items)}, ${input.notas || null})`;

    await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
              values (${orgId}, ${cot.id}, 'created', 'Borrador creado')`;
    if (input.send && !needsApproval) {
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${orgId}, ${cot.id}, 'sent', 'Cotización enviada — link generado')`;
    }
    if (needsApproval) {
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${orgId}, ${cot.id}, 'comment', ${'Solicitud de aprobación: ' + aprobMotivo})`;
    }
    await logAudit(orgId, {
        accion: needsApproval ? 'cotizacion.aprobacion_solicitada' : (input.send ? 'cotizacion.enviada' : 'cotizacion.creada'),
        entidad: 'cotizacion', entidad_id: cot.id as string,
        detalle: folio + (needsApproval ? ' — ' + aprobMotivo : ''), ip: opts.ip, actor: opts.actor,
    });

    let email: { sent: boolean; skipped?: string } | undefined;
    if (input.send && !needsApproval) {
        email = await notifyQuoteSent(orgId, cot.id as string, opts.origin);
        if (email.sent) {
            await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                      values (${orgId}, ${cot.id}, 'email', 'Correo enviado al cliente')`;
        }
        await dispatchQuoteEvent(orgId, cot.id as string, 'quote.sent');
    }

    return { id: cot.id as string, folio, token: cot.public_token as string, needsApproval, motivo: aprobMotivo, email };
}
