export const prerender = false;

// /api/facturas/[id]/reembolso — reembolsar desde Cord el pago EN LÍNEA de una
// factura (tarjeta, SEPA, ACH o Mercado Pago), total o parcial.
//
// Mismo contrato que el reembolso de un cobro de cotización
// (`/api/cobros/[cobroId]/reembolso`): permiso propio "Reembolsos" (ni el
// administrador lo tiene por omisión), autorización de un solo uso que pide el
// diálogo (GET) y reautenticación reciente para ejecutar (POST). La lógica de
// dinero vive en `src/lib/cobros/reembolsos.ts`; esta ruta decide quién y
// cuántas veces (regla 33: carril de tenencia, rate limit propio, clave de
// idempotencia determinística y ningún mensaje crudo del proveedor).

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { currentLocale, currentUserId } from '../../../../lib/context';
import { invalidateMoneyCaches, requirePerm } from '../../../../lib/queries';
import { requireFreshAuth } from '../../../../lib/step-up';
import { strictLimitResponse, strictRateLimit } from '../../../../lib/ratelimit';
import { parseJsonBody } from '../../../../lib/validation';
import { ejecutarReembolso, prepararReembolso, type ResultadoReembolso } from '../../../../lib/cobros/reembolsos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestSchema = z.object({
    nonce: z.string().min(24).max(200),
    alcance: z.enum(['factura', 'cobro']),
    amountMinor: z.number().int().positive(),
    reason: z.string().trim().max(240).optional(),
    feeDisclosureAccepted: z.literal(true),
}).strict();

export const GET: APIRoute = async ({ params, url }) => {
    const denied = await requirePerm('reembolsar');
    if (denied) return denied;
    const orgId = await getActiveOrgId();
    const id = params.id || '';
    const pagoId = url.searchParams.get('pago') || '';
    if (!UUID.test(id) || !UUID.test(pagoId)) return json({ error: msg('no_encontrado') }, 404);
    const limited = strictLimitResponse(await strictRateLimit(`invoice-refund-nonce:${orgId}`, 30, 3600));
    if (limited) return limited;

    const opcion = await prepararReembolso(orgId, id, pagoId, currentUserId());
    if (!opcion) return json({ error: msg('no_encontrado') }, 404);
    return json(opcion);
};

export const POST: APIRoute = async ({ request, params }) => {
    const denied = await requirePerm('reembolsar');
    if (denied) return denied;
    const orgId = await getActiveOrgId();
    const id = params.id || '';
    if (!UUID.test(id)) return json({ error: msg('no_encontrado') }, 404);
    // Mismo techo que los cobros de cotización, con su propio contador: devolver
    // dinero es raro, y un tope bajo acota el daño de una sesión robada.
    const limited = strictLimitResponse(await strictRateLimit(`invoice-refund:${orgId}`, 20, 86_400));
    if (limited) return limited;
    const staleAuth = await requireFreshAuth();
    if (staleAuth) return staleAuth;
    const parsed = await parseJsonBody(request, requestSchema);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

    const r = await ejecutarReembolso(orgId, id, {
        nonce: parsed.data.nonce,
        alcance: parsed.data.alcance,
        montoMinimo: parsed.data.amountMinor,
        motivo: parsed.data.reason || null,
        userId: currentUserId(),
    });
    if (!r.ok) return fallo(r);

    invalidateMoneyCaches(orgId);
    await logAudit(orgId, {
        accion: 'facturas.reembolso_solicitado', entidad: 'factura', entidad_id: id,
        detalle: `${r.monto} ${r.currency}; alcance=${r.alcance}; estado=${r.estado}; solicitud=${r.solicitudId}${parsed.data.reason ? `; ${parsed.data.reason}` : ''}; tarifa_plataforma_reembolsada=no`,
        ip: reqIp(request),
    });
    return json({ ok: true, status: r.estado, monto: r.monto, currency: r.currency, alcance: r.alcance, cfdi: r.cfdi }, 202);
};

type Fallo = Extract<ResultadoReembolso, { ok: false }>;

function fallo(r: Fallo): Response {
    if (r.error === 'rechazo') return json({ error: r.mensaje, code: r.error, reference: r.referencia }, 502);
    if (r.error === 'incierto') return json({ error: msg('incierto'), code: r.error, reference: r.referencia }, 502);
    const status = r.error === 'monto' || r.error === 'completo' || r.error === 'alcance' ? 422 : 409;
    return json({ error: msg(r.error), code: r.error }, status);
}

// Mensajes para el dueño del negocio (regla 14): el estado y el siguiente paso,
// nunca el mecanismo. El diálogo ya dice casi todos ANTES de enviar; aquí son la
// respuesta cuando algo cambió entre abrirlo y confirmarlo.
const MENSAJES: Record<string, { es: string; en: string }> = {
    no_encontrado: { es: 'Pago no encontrado en esta factura.', en: 'Payment not found on this invoice.' },
    autorizacion: { es: 'La autorización de reembolso venció o ya se usó. Vuelve a abrir el reembolso.', en: 'The refund authorization expired or was already used. Open the refund again.' },
    capacidad: { es: 'El monto supera lo que queda por reembolsar de este pago. Vuelve a abrir el reembolso.', en: 'The amount exceeds what is left to refund on this payment. Open the refund again.' },
    monto: { es: 'Escribe un monto mayor que cero y que no supere lo disponible.', en: 'Enter an amount above zero that does not exceed what is available.' },
    completo: { es: 'Este reembolso solo puede ser por el monto completo.', en: 'This refund can only be for the full amount.' },
    alcance: { es: 'Este pago no admite ese tipo de reembolso.', en: 'This payment does not allow that kind of refund.' },
    incierto: { es: 'No pudimos confirmar el reembolso. No lo repitas: en unos minutos aparecerá en la factura si se hizo.', en: 'We could not confirm the refund. Do not repeat it: if it went through, it will appear on the invoice in a few minutes.' },
    manual: { es: 'Este pago se registró a mano: Cord no movió ese dinero y no puede devolverlo.', en: 'This payment was recorded manually: Cord did not move that money and cannot return it.' },
    cotizacion: { es: 'Este pago entró por la cotización: se reembolsa desde su cobro en Ingresos › Cobros (o desde tu cuenta de Mercado Pago, si lo cobró Mercado Pago).', en: 'This payment came in through the quote: refund it from its payment in Revenue › Payments (or from your Mercado Pago account, if Mercado Pago collected it).' },
    transferencia: { es: 'Un pago por transferencia todavía no se reembolsa desde Cord: devuélvelo por transferencia desde tu banco.', en: 'A bank transfer payment cannot be refunded from Cord yet: return it by transfer from your bank.' },
    metodo: { es: 'Este método de pago no se reembolsa desde Cord.', en: 'This payment method cannot be refunded from Cord.' },
    no_confirmado: { es: 'Este pago todavía no está confirmado (o está en disputa): no se puede reembolsar por ahora.', en: 'This payment is not confirmed yet (or is disputed): it cannot be refunded for now.' },
    plazo: { es: 'Venció el plazo para reembolsar este débito bancario (180 días desde el cobro).', en: 'The window to refund this bank debit has passed (180 days from the charge).' },
    reembolsado: { es: 'Este pago ya se reembolsó por completo.', en: 'This payment has already been fully refunded.' },
    pendiente_registro: { es: 'Hay un reembolso de este pago que Cord todavía está registrando. Intenta de nuevo en unos minutos.', en: 'There is a refund on this payment that Cord is still recording. Try again in a few minutes.' },
    sin_cuenta: { es: 'Tu cuenta de cobros no está disponible. Revísala en Ajustes › Cobros.', en: 'Your payments account is not available. Check it in Settings › Payments.' },
    proveedor: { es: 'No pudimos consultar este pago. Intenta de nuevo en unos minutos.', en: 'We could not check this payment. Try again in a few minutes.' },
};

function msg(code: string): string {
    const m = MENSAJES[code] ?? MENSAJES.proveedor;
    return currentLocale() === 'en' ? m.en : m.es;
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
