// /api/q/[token] — acciones del CLIENTE final sobre el link público.
// No requiere auth: el token (random de 16 bytes) es el secreto.
//   POST { action: 'approve' | 'reject' | 'comment' | 'counter' | 'ping' | 'hito',
//          comentario?, mensaje?, propuesta?, rev? }  → { ok, status? }
// approve/reject cambian el estado; comment/counter NO (alimentan la conversación).
//
// 'ping' es el latido del documento vivo y hace TRES cosas que antes no hacía:
//   1) marca la vista — se movió aquí desde el SSR de /q/[token], porque un GET
//      al SSR lo hace cualquiera (el propio vendedor, el bot de WhatsApp
//      generando la tarjeta del enlace, un prefetch). Llegar hasta aquí exige
//      JavaScript corriendo con la pestaña visible;
//   2) registra presencia CON ACTOR, distinguiendo al equipo del cliente;
//   3) acumula la atención por sección.
export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { sql, resolvePublicQuote, withOrgTx } from '../../../lib/db';
import { dispatchQuoteEvent } from '../../../lib/webhooks';
import { notifyQuoteEvent } from '../../../lib/notify';
import { after } from '../../../lib/after';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { materializeAnticipoCobros } from '../../../lib/cobros';
import { trackServer } from '../../../lib/posthog-server';
import { resolveViewer } from '../../../lib/public-viewer';
import { recordHeartbeat, recordHito } from '../../../lib/atencion';
import { markViewed } from '../../../lib/queries';
import { currencyDecimals, normalizeCurrency } from '../../../lib/currency';

// Los eventos que escribe el link público (firma parcial, contrapropuesta) los
// lee el vendedor en su historial: el importe va con la divisa de la cotización.
const money = (n: number, currency?: string) => {
    const code = normalizeCurrency(currency);
    const decimals = currencyDecimals(code);
    return new Intl.NumberFormat('es-MX', {
        style: 'currency', currency: code,
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(n);
};

export const POST: APIRoute = async ({ params, request, cookies }) => {
    const token = params.token ?? '';
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const action = body.action;

    // Rate limit por token (el link es público, sin sesión): el 'ping' de presencia
    // es frecuente (límite alto); las acciones que ESCRIBEN (comentar/contraofertar/
    // aprobar/rechazar) van más apretadas para frenar el spam de filas en 'eventos'.
    const ligero = action === 'ping' || action === 'hito';
    const rl = await rateLimit(`q:${ligero ? 'ping:' : ''}${token}`, ligero ? 120 : 30, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const identity = await resolvePublicQuote(token);
    if (!identity) return json({ error: 'Cotización no encontrada' }, 404);
    const [rows] = await withOrgTx(identity.orgId, sql`
        select c.id, c.org_id, c.status, c.rev, c.base_currency, o.moneda,
               (o.sandbox_of is not null) as is_sandbox, o.is_demo
        from cotizaciones c join orgs o on o.id = c.org_id
        where c.id = ${identity.id} and c.org_id = ${identity.orgId}`);
    if (!rows.length) return json({ error: 'Cotización no encontrada' }, 404);
    const c = rows[0];
    // Divisa de la cotización: la comparten los eventos que escribe este endpoint.
    const quoteCurrency = normalizeCurrency((c.base_currency as string) || (c.moneda as string));
    const orgId = c.org_id as string;
    const alive = ['sent', 'viewed'].includes(c.status as string);

    // ── Latido del documento vivo ──
    // Presencia con actor + atención por sección + (una sola vez) la vista.
    if (action === 'ping') {
        const viewer = await resolveViewer(orgId, { request, cookies });
        if (viewer.rol === 'bot') return json({ ok: true, rol: 'bot' });

        await recordHeartbeat(orgId, c.id as string, viewer, {
            seccion: body.seccion,
            dwell: body.dwell,
            typing: body.typing,
            nuevaSesion: body.nueva_sesion,
        });

        // Solo cuando puede cambiar algo: markViewed hace su propia comprobación
        // idempotente (status = 'sent'), pero llamarlo en cada latido costaría
        // dos queries extra cada 10s durante toda la vida de la pestaña.
        if (c.status === 'sent' && viewer.rol === 'client') {
            after(markViewed(orgId, c.id as string, viewer));
        }
        return json({ ok: true, rol: viewer.rol, rev: Number(c.rev) || 1 });
    }

    // ── Hito discreto: abrió el PDF, expandió una línea ──
    if (action === 'hito') {
        const viewer = await resolveViewer(orgId, { request, cookies });
        if (viewer.rol === 'bot') return json({ ok: true });
        await recordHito(orgId, c.id as string, viewer, body.clave);
        return json({ ok: true });
    }

    // ── Aprobar ──
    if (action === 'approve') {
        if (!alive) return json({ error: 'Esta cotización ya no se puede modificar', status: c.status }, 409);
        // Integridad de la firma. Ahora que el vendedor puede editar mientras el
        // cliente lee, el cliente podría estar firmando un snapshot viejo: vio
        // $45,500, el vendedor lo subió a $48,000, y la firma quedaría sobre un
        // total que el cliente nunca aceptó. El card manda el `rev` que tenía en
        // pantalla; si ya no es el vigente, se rechaza y se le piden revisar los
        // cambios. La UI también bloquea el botón, pero eso es cortesía — la
        // autorización real es este 409.
        const revCliente = Number(body.rev);
        if (Number.isFinite(revCliente) && revCliente > 0 && revCliente !== Number(c.rev)) {
            return json({ error: 'La cotización cambió mientras la revisabas', stale: true, rev: Number(c.rev) }, 409);
        }
        const signedBy = String(body.signed_by ?? '').trim().slice(0, 200);
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconocida';
        const ua = request.headers.get('user-agent') ?? 'desconocido';
        const email = String(body.email ?? '').trim().slice(0, 200);
        
        const [allItems] = await withOrgTx(orgId, sql`
            select id, descripcion, cantidad, precio_unitario, precio_negociado
            from cotizacion_items where cotizacion_id = ${c.id} order by orden`);

        // Aprobación parcial: el cliente puede incluir solo un subconjunto de líneas.
        // accepted_items = ids que SÍ aprueba; si no viene o las cubre todas, es total.
        const acceptedRaw = Array.isArray(body.accepted_items) ? body.accepted_items.map((x: any) => String(x)) : null;
        const validIds = new Set(allItems.map((it: any) => String(it.id)));
        const accepted = acceptedRaw ? new Set(acceptedRaw.filter((id: string) => validIds.has(id))) : null;
        if (accepted && accepted.size === 0) return json({ error: 'Selecciona al menos una línea para aprobar' }, 400);
        const isPartial = !!accepted && accepted.size < allItems.length;

        // Las líneas que firma legalmente el cliente = las aceptadas (o todas).
        const lineSub = (it: any) => Number(it.cantidad) * Number(it.precio_negociado ?? it.precio_unitario);
        const firmadas = accepted ? allItems.filter((it: any) => accepted.has(String(it.id))) : allItems;
        const subAceptado = firmadas.reduce((s: number, it: any) => s + lineSub(it), 0);
        const subTotal = allItems.reduce((s: number, it: any) => s + lineSub(it), 0);

        // El hash inmutable cubre SOLO lo aceptado (lo que el cliente realmente firmó).
        const payload = JSON.stringify({
            quote_id: c.id,
            status: isPartial ? 'approved_partial' : 'approved',
            signed_by: signedBy,
            ip,
            items: firmadas,
        });
        const snapshotHash = createHash('sha256').update(payload).digest('hex');

        const detalle = isPartial
            ? `Firmado por "${signedBy || 'Anónimo'}" — aprobó ${firmadas.length} de ${allItems.length} líneas (${money(subAceptado, quoteCurrency)} de ${money(subTotal, quoteCurrency)}) (IP ${ip})`
            : (signedBy ? `Firmado digitalmente por "${signedBy}" (IP ${ip})` : 'El cliente aprobó la cotización desde el link');

        // El driver HTTP de Neon NO soporta sql.begin(callback); usa sql.transaction([...]).
        const txQueries: any[] = [];
        if (isPartial) {
            const [orgInfo] = await withOrgTx(orgId, sql`select iva_pct from orgs where id = ${orgId}`);
            const ivaPct = Number(orgInfo[0]?.iva_pct ?? 16) / 100;
            const newIva = subAceptado * ivaPct;
            const newTotal = subAceptado + newIva;
            txQueries.push(sql`update cotizaciones set status = 'approved', approved_at = now(), subtotal = ${subAceptado}, iva = ${newIva}, total = ${newTotal} where id = ${c.id} and org_id = ${orgId}`);
        } else {
            txQueries.push(sql`update cotizaciones set status = 'approved', approved_at = now() where id = ${c.id} and org_id = ${orgId}`);
        }
        // Marca el estado de cada línea (solo cambia algo en aprobación parcial).
        if (isPartial) {
            for (const it of allItems) {
                const ok = accepted!.has(String(it.id));
                txQueries.push(sql`update cotizacion_items set aprobado = ${ok} where id = ${it.id} and cotizacion_id = ${c.id}`);
            }
        }
        txQueries.push(sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${c.org_id}, ${c.id}, 'approved', ${detalle})`);
        txQueries.push(sql`insert into cotizacion_firmas (org_id, cotizacion_id, firmante_nombre, firmante_email, firmante_ip, user_agent, snapshot_hash)
                  values (${c.org_id}, ${c.id}, ${signedBy || 'Anónimo'}, ${email || null}, ${ip}, ${ua}, ${snapshotHash})`);
        await withOrgTx(orgId, ...txQueries);
        // Anticipo: materializa las filas anticipo + saldo DESPUÉS de que el total
        // quedó final (la aprobación parcial lo recalcula arriba). Idempotente;
        // no hace nada si la cotización no pide anticipo. Best-effort: si falla,
        // payment-intent.ts las crea al primer intento de pago.
        try { await materializeAnticipoCobros(c.id as string, c.org_id as string); } catch { /* fallback en payment-intent */ }
        // Fondo: el webhook/Slack jamás debe hacer esperar al cliente que aprueba.
        after(dispatchQuoteEvent(c.org_id as string, c.id as string, 'quote.approved'));
        after(notifyQuoteEvent(c.org_id as string, c.id as string, 'quote_approved'));
        const [metricRows] = await withOrgTx(orgId, sql`
            select total, base_currency from cotizaciones
            where id = ${c.id} and org_id = ${orgId}`);
        const metric = metricRows[0];
        after(trackServer('quote_approved', orgId, {
            event_id: c.id,
            quote_id: c.id,
            total: Number(metric?.total ?? 0),
            currency: (metric?.base_currency as string) || 'MXN',
            source: 'external',
            is_partial: isPartial,
            item_count: firmadas.length,
        }, !!c.is_sandbox, !!c.is_demo));
        return json({ ok: true, status: 'approved', hash: snapshotHash, partial: isPartial });
    }

    // ── Rechazar ──
    if (action === 'reject') {
        if (!alive) return json({ error: 'Esta cotización ya no se puede modificar', status: c.status }, 409);
        await withOrgTx(orgId, sql`update cotizaciones set status = 'rejected'
            where id = ${c.id} and org_id = ${orgId}`);
        const comentario = String(body.comentario ?? '').trim().slice(0, 500);
        await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${orgId}, ${c.id}, 'rejected', ${comentario ? `El cliente rechazó: "${comentario}"` : 'El cliente rechazó la cotización desde el link'})`);
        after(dispatchQuoteEvent(c.org_id as string, c.id as string, 'quote.rejected'));
        after(notifyQuoteEvent(c.org_id as string, c.id as string, 'quote_rejected'));
        return json({ ok: true, status: 'rejected' });
    }

    // ── Comentario / pregunta (no cambia estado) ──
    // NOTA: `detalle` es el texto TAL CUAL se muestra en la burbuja del chat (tanto
    // en /q como en la vista de detalle del vendedor) — no narrar en tercera persona
    // ("El cliente escribió...") porque la burbuja ya comunica quién habla por su
    // posición/color. Narrarlo aquí se veía como una bitácora, no como un chat real.
    if (action === 'comment') {
        const mensaje = String(body.mensaje ?? '').trim().slice(0, 800);
        if (!mensaje) return json({ error: 'Escribe un mensaje' }, 400);
        if (c.status === 'draft') return json({ error: 'Cotización no disponible' }, 409);
        await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${orgId}, ${c.id}, 'comment', ${mensaje})`);
        return json({ ok: true });
    }

    // ── Contraoferta (no cambia estado; avisa al vendedor) ──
    // La burbuja se pinta distinta (ámbar) vía el tipo 'counter', así que el monto
    // propuesto puede ir como un rótulo corto ("Propuesta: $X") sin sonar a bitácora.
    if (action === 'counter') {
        if (!alive) return json({ error: 'Esta cotización ya no admite contraofertas', status: c.status }, 409);
        const mensaje = String(body.mensaje ?? '').trim().slice(0, 800);
        const propuesta = Number(body.propuesta) > 0 ? Number(body.propuesta) : null;
        if (!mensaje && !propuesta) return json({ error: 'Indica tu propuesta o escribe un mensaje' }, 400);
        const detalle = propuesta
            ? `Propuesta: ${money(propuesta, quoteCurrency)}${mensaje ? ` — ${mensaje}` : ''}`
            : mensaje;
        await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${orgId}, ${c.id}, 'counter', ${detalle})`);
        return json({ ok: true });
    }

    // ── Comentario por línea (no cambia estado) ──
    if (action === 'item_comment') {
        const mensaje = String(body.mensaje ?? '').trim().slice(0, 800);
        const itemId = String(body.item_id ?? '').trim();
        if (!mensaje || !itemId) return json({ error: 'Datos incompletos' }, 400);
        if (c.status === 'draft') return json({ error: 'Cotización no disponible' }, 409);
        
        // Verificar que el item pertenece a la cotización
        const [[item]] = await withOrgTx(orgId, sql`
            select id from cotizacion_items where id = ${itemId} and cotizacion_id = ${c.id}`);
        if (!item) return json({ error: 'Línea no encontrada' }, 404);

        await withOrgTx(orgId, sql`insert into cotizacion_comentarios (org_id, cotizacion_id, item_id, autor_tipo, autor_nombre, contenido)
            values (${orgId}, ${c.id}, ${itemId}, 'cliente', 'Cliente', ${mensaje})`);
        return json({ ok: true });
    }

    return json({ error: 'Acción no válida' }, 400);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
