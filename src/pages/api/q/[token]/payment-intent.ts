export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { dueDateFor, isoDay, venceDia, materializeAnticipoCobros } from '../../../../lib/cobros';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export const POST: APIRoute = async ({ params, request }) => {
    if (!STRIPE_KEY) return json({ error: 'El pago en línea aún no está configurado.' }, 503);
    const token = params.token ?? '';
    const rl = await rateLimit(`pi:${token}`, 10, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    // Cobro específico (anticipo/saldo/cuota) — opcional; sin él se elige el
    // siguiente cobro pendiente cuya fecha ya llegó.
    let requestedCobroId = '';
    try {
        const body = await request.json();
        if (body && typeof body.cobro_id === 'string') requestedCobroId = body.cobro_id;
    } catch { /* sin body = pagar el siguiente cobro pendiente */ }

    const rows = await sql`
        select c.id, c.folio, c.total, c.status, c.anticipo_pct,
               coalesce(c.terminos, cl.terminos_default) as terminos,
               coalesce(c.approved_at, c.created_at) as base_date,
               o.sandbox_of, o.stripe_account_id, o.stripe_charges_enabled,
               o.acepta_tarjeta, o.cobro_spei_auto, o.nombre as org_nombre
        from cotizaciones c
        left join clientes cl on cl.id = c.cliente_id
        join orgs o on o.id = c.org_id
        where c.public_token = ${token}`;
    if (!rows.length) return json({ error: 'Cotización no encontrada' }, 404);
    const c = rows[0];
    if (c.status === 'paid') {
        return json({ alreadyPaid: true });
    }
    if (!['approved', 'invoiced'].includes(c.status as string)) {
        return json({ error: 'Esta cotización no está lista para pago' }, 409);
    }
    if (c.sandbox_of) {
        return json({ error: 'Esta cotización es de prueba — el pago en línea está deshabilitado.' }, 409);
    }
    if (!c.stripe_account_id || !c.stripe_charges_enabled) {
        return json({ error: 'El vendedor no tiene configurada su cuenta para recibir pagos' }, 403);
    }
    if (!c.acepta_tarjeta && !c.cobro_spei_auto) {
        return json({ error: 'El vendedor no acepta pagos en línea' }, 403);
    }

    const totalCents = Math.round(Number(c.total) * 100);
    const hoyISO = new Date().toISOString().slice(0, 10);
    const acct = c.stripe_account_id as string;
    const connectHeaders = {
        Authorization: `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Account': acct,
    };

    // ── Resolver QUÉ cobro se paga ─────────────────────────────────────────
    // La cotización se cobra por "rebanadas" (cotizacion_cobros): anticipo +
    // saldo, cuotas negociadas, o una fila 'total' para el pago simple —
    // creada aquí de forma perezosa la primera vez que alguien intenta pagar.
    let cobros = await sql`
        select id, tipo, numero_cuota, monto, status, vence, stripe_payment_intent_id
        from cotizacion_cobros where cotizacion_id = ${c.id}
        order by vence asc nulls first, created_at asc`;

    // Re-versión: si el total cambió después de materializar los cobros y aún
    // no se pagó NINGUNO, se regeneran (sus montos congelados ya no suman el total).
    // ANTES de borrar, se cancelan sus PaymentIntents en Stripe: un PI en vuelo
    // (CLABE SPEI emitida) podría liquidarse después y quedaría huérfano. Si
    // algún PI no se puede cancelar (p. ej. SPEI 'processing'), se ABORTA la
    // regeneración — mejor un desglose desactualizado que un pago sin rastro.
    const activos = cobros.filter((co: any) => co.status !== 'cancelado');
    const sumCents = activos.reduce((s: number, co: any) => s + Math.round(Number(co.monto) * 100), 0);
    const nadaPagado = cobros.every((co: any) => co.status !== 'pagado');
    if (cobros.length && nadaPagado && sumCents !== totalCents) {
        let cancelablesOk = true;
        for (const co of cobros) {
            if (co.status !== 'pendiente' || !co.stripe_payment_intent_id) continue;
            try {
                const r = await fetch(`https://api.stripe.com/v1/payment_intents/${co.stripe_payment_intent_id}/cancel`, {
                    method: 'POST', headers: connectHeaders,
                });
                if (!r.ok) {
                    const d: any = await r.json().catch(() => ({}));
                    // "ya cancelado" es aceptable; cualquier otro fallo aborta.
                    const yaCancelado = String(d?.error?.message || '').includes('canceled');
                    if (!yaCancelado) { cancelablesOk = false; break; }
                }
            } catch { cancelablesOk = false; break; }
        }
        if (cancelablesOk) {
            await sql`delete from cotizacion_cobros where cotizacion_id = ${c.id} and status = 'pendiente'`;
            cobros = [];
            requestedCobroId = '';
        }
    }

    if (!cobros.length) {
        const pct = Number(c.anticipo_pct);
        if (pct > 0 && pct < 100) {
            await materializeAnticipoCobros(c.id as string);
        } else {
            // Pago total simple. El vencimiento hereda los términos de crédito:
            // contado = hoy; net30/net60 = la fecha de vencimiento (defensa en
            // profundidad — la UI ya oculta el botón, esto bloquea el API directo).
            const venceTotal = isoDay(dueDateFor(c.base_date as string, c.terminos as string));
            await sql`
                insert into cotizacion_cobros (org_id, cotizacion_id, tipo, monto, vence)
                select org_id, id, 'total', total, ${venceTotal}
                from cotizaciones where id = ${c.id}
                on conflict (cotizacion_id, tipo, numero_cuota) do nothing`;
        }
        cobros = await sql`
            select id, tipo, numero_cuota, monto, status, vence, stripe_payment_intent_id
            from cotizacion_cobros where cotizacion_id = ${c.id}
            order by vence asc nulls first, created_at asc`;
        if (!cobros.length) return json({ error: 'No se pudo preparar el cobro' }, 500);
    }

    let cobro: any = null;
    if (requestedCobroId) {
        // Solo cobros de ESTA cotización (la query ya filtra por cotizacion_id).
        cobro = cobros.find((co: any) => co.id === requestedCobroId) || null;
        if (!cobro) return json({ error: 'Cobro no encontrado' }, 404);
        if (cobro.status === 'pagado') return json({ alreadyPaid: true });
        if (cobro.status === 'cancelado') return json({ error: 'Este cobro ya no está vigente' }, 409);
    } else {
        const pendientes = cobros.filter((co: any) => co.status === 'pendiente');
        if (!pendientes.length) return json({ alreadyPaid: true });
        cobro = pendientes.find((co: any) => !co.vence || venceDia(co.vence) <= hoyISO) || null;
        if (!cobro) cobro = pendientes[0]; // el gate de fecha de abajo responde con el 409
    }
    // Gate por fecha de vencimiento (aplica también con cobro explícito).
    if (cobro.vence && venceDia(cobro.vence) > hoyISO) {
        return json({ error: `Este pago aún no está disponible — se habilita el ${venceDia(cobro.vence)}.` }, 409);
    }

    const amount = Math.round(Number(cobro.monto) * 100); // centavos
    if (!(amount > 0)) return json({ error: 'Monto de cobro inválido' }, 500);
    const pubKey = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;

    // Los payment_method_types según la config vigente del vendedor. Se calculan
    // aquí porque también deciden si un PI previo sigue siendo reutilizable.
    const pmTypes: string[] = [];
    if (c.acepta_tarjeta) pmTypes.push('card');
    if (c.cobro_spei_auto) pmTypes.push('customer_balance');

    try {
        // ── 1) Reutilizar el PaymentIntent existente del COBRO si sigue vigente ──
        // Crucial para SPEI: la CLABE se asigna por customer — un PI/customer nuevo
        // en cada visita significaría una CLABE distinta en cada recarga.
        const prevId = cobro.stripe_payment_intent_id as string | null;
        if (prevId) {
            const prevRes = await fetch(`https://api.stripe.com/v1/payment_intents/${prevId}`, {
                headers: connectHeaders,
            });
            const prev: any = await prevRes.json();
            if (prevRes.ok && prev?.id) {
                if (prev.status === 'succeeded') {
                    return json({ alreadyPaid: true });
                }
                const sameMethods = Array.isArray(prev.payment_method_types)
                    && prev.payment_method_types.length === pmTypes.length
                    && pmTypes.every((t) => prev.payment_method_types.includes(t));
                const reusable = !['canceled'].includes(prev.status) && sameMethods;
                if (reusable) {
                    // Si el monto cambió (cotización re-versionada), se actualiza.
                    if (prev.amount !== amount && ['requires_payment_method', 'requires_confirmation'].includes(prev.status)) {
                        const upd = new URLSearchParams({ amount: String(amount) });
                        await fetch(`https://api.stripe.com/v1/payment_intents/${prevId}`, {
                            method: 'POST', headers: connectHeaders, body: upd.toString(),
                        });
                    }
                    return json({ clientSecret: prev.client_secret, publishableKey: pubKey, accountId: acct, amount, cobroId: cobro.id, cobroTipo: cobro.tipo });
                }
            }
            // No existe / cancelado / cambió la config → crear uno nuevo abajo.
        }

        // ── 2) Customer (solo requerido por customer_balance / SPEI) ──────────
        // Un customer POR COBRO (no por cotización): la CLABE de SPEI se asigna
        // por customer, y cada cobro necesita la suya para conciliarse solo.
        let customerId = '';
        if (c.cobro_spei_auto) {
            const cusForm = new URLSearchParams();
            cusForm.set('metadata[cotizacion_id]', c.id as string);
            cusForm.set('metadata[cobro_id]', cobro.id as string);
            cusForm.set('description', `Cliente de cotización ${c.folio} (${cobro.tipo})`);
            const cusRes = await fetch('https://api.stripe.com/v1/customers', {
                method: 'POST', headers: connectHeaders, body: cusForm.toString(),
            });
            const cus: any = await cusRes.json();
            if (!cusRes.ok || !cus?.id) return json({ error: cus?.error?.message || 'No se pudo iniciar el pago' }, 502);
            customerId = cus.id;
        }

        // ── 3) Crear el PaymentIntent ─────────────────────────────────────────
        // NO se manda payment_method_data: el Payment Element decide el método al
        // confirmar. Forzarlo a customer_balance aquí rompía el pago con tarjeta
        // cuando ambos métodos estaban activos.
        const tipoDesc = cobro.tipo === 'anticipo' ? ' (anticipo)'
            : cobro.tipo === 'saldo' ? ' (saldo)'
            : cobro.tipo === 'cuota' ? ` (cuota ${cobro.numero_cuota})`
            : '';
        const form = new URLSearchParams();
        form.set('amount', String(amount));
        form.set('currency', 'mxn');
        form.set('description', `Cotización ${c.folio}${tipoDesc} — ${c.org_nombre}`);
        form.set('metadata[token]', token);
        form.set('metadata[cotizacion_id]', c.id as string);
        form.set('metadata[folio]', String(c.folio ?? ''));
        form.set('metadata[cobro_id]', cobro.id as string);
        form.set('metadata[cobro_tipo]', String(cobro.tipo ?? 'total'));
        pmTypes.forEach((t, i) => form.set(`payment_method_types[${i}]`, t));
        if (c.cobro_spei_auto) {
            form.set('payment_method_options[customer_balance][funding_type]', 'bank_transfer');
            form.set('payment_method_options[customer_balance][bank_transfer][type]', 'mx_bank_transfer');
        }
        if (customerId) form.set('customer', customerId);

        const res = await fetch('https://api.stripe.com/v1/payment_intents', {
            method: 'POST',
            headers: connectHeaders,
            body: form.toString(),
        });
        const data: any = await res.json();
        if (!res.ok) return json({ error: data?.error?.message || 'Error al crear el intento de pago' }, 502);

        await sql`update cotizacion_cobros set stripe_payment_intent_id = ${data.id} where id = ${cobro.id}`;
        // Compat: la columna legacy sigue reflejando el PI del pago total simple
        // (nadie más la escribe; queda de solo-lectura para cotizaciones viejas).
        if (cobro.tipo === 'total') {
            await sql`update cotizaciones set stripe_payment_intent_id = ${data.id} where id = ${c.id}`;
        }

        return json({ clientSecret: data.client_secret, publishableKey: pubKey, accountId: acct, amount, cobroId: cobro.id, cobroTipo: cobro.tipo });
    } catch (e) {
        console.error(e);
        return json({ error: 'No se pudo conectar con Stripe' }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
