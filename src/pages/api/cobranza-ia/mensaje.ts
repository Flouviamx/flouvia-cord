// /api/cobranza-ia/mensaje — el HUMANO escribe en el hilo de cobranza.
//   POST { cotizacion_id, mensaje }
// Se envía al cliente y queda en el historial que el agente lee en su siguiente
// turno, así que el vendedor puede tomar el control de una negociación sin
// romper el contexto del agente. `autor_tipo='usuario'` existía en el schema
// desde jun 2026 y nadie lo escribía: no había UI para intervenir en el hilo.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';
import { requirePerm } from '../../../lib/queries';
import { getCobranzaConfig, renderCollectionEmail } from '../../../lib/agents/cobranza-run';
import { sendEmail, siteOrigin } from '../../../lib/email';
import { rateLimit } from '../../../lib/ratelimit';
import { requireEntitlement } from '../../../lib/org-entitlements';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobranza');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const entitlementDenied = await requireEntitlement(orgId, 'collections_ai');
    if (entitlementDenied) return entitlementDenied;
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const cotizacionId = String(body.cotizacion_id ?? '');
    const texto = String(body.mensaje ?? '').trim().slice(0, 8000);
    if (!cotizacionId) return json({ error: 'Falta la cotización' }, 400);
    if (!texto) return json({ error: 'El mensaje no puede ir vacío' }, 400);

    const rl = await rateLimit(`cobranza-ia-msg:${orgId}`, 30, 60);
    if (!rl.ok) return json({ error: 'Demasiados mensajes seguidos. Espera un momento.' }, 429);

    const [[q]] = await withOrgTx(orgId, sql`
        select c.id, c.public_token, c.total,
               cl.empresa, cl.email as cliente_email,
               (o.stripe_charges_enabled and o.stripe_account_id is not null
                and (o.acepta_tarjeta or o.cobro_spei_auto)) as cobra_online,
               coalesce((select sum(monto) from cotizacion_cobros
                         where cotizacion_id = c.id and status = 'pagado'), 0) as pagado
        from cotizaciones c
        join clientes cl on cl.id = c.cliente_id
        join orgs o on o.id = c.org_id
        where c.id = ${cotizacionId} and c.org_id = ${orgId}`);
    if (!q) return json({ error: 'Cotización no encontrada' }, 404);
    if (!q.cliente_email) return json({ error: 'Este cliente no tiene correo registrado.' }, 422);

    const cfg = await getCobranzaConfig(orgId);
    const origin = siteOrigin();
    const cobraOnline = !!q.cobra_online;
    const payUrl = cobraOnline ? `${origin}/q/${q.public_token}/pay` : `${origin}/q/${q.public_token}`;
    const saldo = Math.max(0, Number(q.total) - Number(q.pagado ?? 0));

    const envio = await sendEmail({
        orgId, operation: 'collection_manual', to: q.cliente_email,
        subject: cfg.idioma === 'en' ? 'About your outstanding balance' : 'Sobre tu saldo pendiente',
        html: renderCollectionEmail({
            cuerpo: texto, payUrl, cobraOnline, montoBoton: saldo, idioma: cfg.idioma,
        }),
    });

    const uid = currentUserId();
    const [[row]] = await withOrgTx(orgId, sql`
        insert into cobranza_conversaciones
          (org_id, cotizacion_id, autor_tipo, mensaje, estado, enviado_at, aprobado_por, aprobado_at, message_id, error)
        values (${orgId}, ${cotizacionId}, 'usuario', ${texto},
                ${envio.sent ? 'enviado' : 'fallido'},
                ${envio.sent ? new Date().toISOString() : null},
                ${uid ?? null}, now(), ${envio.messageId ?? null},
                ${envio.sent ? null : (envio.error ?? envio.skipped ?? 'no enviado')})
        returning id, created_at`);

    await logAudit(orgId, {
        accion: 'cobranza_ia.mensaje_humano', entidad: 'cotizacion', entidad_id: cotizacionId,
        detalle: envio.sent ? 'enviado' : `no enviado: ${envio.error ?? envio.skipped ?? ''}`, ip: reqIp(request),
    });

    if (!envio.sent) return json({ error: envio.error ?? envio.skipped ?? 'No se pudo enviar' }, 502);
    return json({ ok: true, id: row?.id, created_at: row?.created_at });
};
