// /api/cobranza-ia/[id] — acciones sobre UN mensaje del agente de cobranza.
//   POST { action: 'aprobar' }              → materializa el plan propuesto (si lo hay) y envía
//   POST { action: 'editar', mensaje }      → reescribe el borrador (marca editado)
//   POST { action: 'descartar' }            → descarta el borrador y su plan propuesto
//   POST { action: 'regenerar', instruccion? } → vuelve a redactar con una indicación humana
// Requiere permiso 'cobranza'.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';
import { requirePerm } from '../../../lib/queries';
import { runARAgent, materializePlan } from '../../../lib/agents/ar-agent';
import { getCobranzaConfig, renderCollectionEmail } from '../../../lib/agents/cobranza-run';
import { sendEmail, siteOrigin } from '../../../lib/email';
import { rateLimit } from '../../../lib/ratelimit';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Contexto de envío de una conversación: saldo real, link y monto del botón. */
async function loadContexto(orgId: string, cotizacionId: string) {
    const [[q]] = await withOrgTx(orgId, sql`
        select c.id, c.folio, c.total, c.public_token, c.approved_at, c.created_at, c.terminos,
               cl.empresa, cl.email as cliente_email, cl.terminos_default,
               (o.stripe_charges_enabled and o.stripe_account_id is not null
                and (o.acepta_tarjeta or o.cobro_spei_auto)) as cobra_online,
               coalesce((select sum(monto) from cotizacion_cobros
                         where cotizacion_id = c.id and status = 'pagado'), 0) as pagado,
               floor(date_part('day', now() - (
                 coalesce(c.approved_at, c.created_at)
                 + make_interval(days => case coalesce(c.terminos, cl.terminos_default, 'contado')
                     when 'net30' then 30 when 'net60' then 60 else 0 end)
               )))::int as dias_vencido
        from cotizaciones c
        join clientes cl on cl.id = c.cliente_id
        join orgs o on o.id = c.org_id
        where c.id = ${cotizacionId} and c.org_id = ${orgId}`);
    if (!q) return null;

    const saldo = Math.max(0, Number(q.total) - Number(q.pagado ?? 0));
    const [[prox]] = await withOrgTx(orgId, sql`
        select monto from cotizacion_cobros
        where cotizacion_id = ${cotizacionId} and status = 'pendiente'
          and (vence is null or vence <= current_date)
        order by vence asc nulls first, created_at asc limit 1`);
    const cobraOnline = !!q.cobra_online;
    const origin = siteOrigin();
    return {
        q, saldo, cobraOnline,
        diasVencido: Math.max(0, Number(q.dias_vencido) || 0),
        montoBoton: prox ? Number(prox.monto) : saldo,
        payUrl: cobraOnline ? `${origin}/q/${q.public_token}/pay` : `${origin}/q/${q.public_token}`,
    };
}

export const POST: APIRoute = async ({ request, params }) => {
    const denied = await requirePerm('cobranza');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const id = String(params.id ?? '');
    if (!id) return json({ error: 'Falta el id del mensaje' }, 400);

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const ip = reqIp(request);

    const [[msg]] = await withOrgTx(orgId, sql`
        select id, cotizacion_id, mensaje, estado
        from cobranza_conversaciones
        where id = ${id} and org_id = ${orgId}`);
    if (!msg) return json({ error: 'Mensaje no encontrado' }, 404);
    if (msg.estado !== 'borrador') {
        return json({ error: 'Este mensaje ya no es un borrador.' }, 409);
    }

    switch (body.action) {
        case 'editar': {
            const texto = String(body.mensaje ?? '').trim().slice(0, 8000);
            if (!texto) return json({ error: 'El correo no puede quedar vacío' }, 400);
            await withOrgTx(orgId, sql`
                update cobranza_conversaciones set mensaje = ${texto}, editado = true
                where id = ${id} and org_id = ${orgId} and estado = 'borrador'`);
            return json({ ok: true });
        }

        case 'descartar': {
            // El plan 'propuesto' que el agente hubiera dejado ligado a esta
            // cotización muere con el borrador: nunca se materializó, así que no
            // hay cobros que revertir.
            await withOrgTx(orgId,
                sql`update cobranza_conversaciones set estado = 'descartado'
                    where id = ${id} and org_id = ${orgId} and estado = 'borrador'`,
                sql`delete from planes_pago_negociados
                    where org_id = ${orgId} and cotizacion_id = ${msg.cotizacion_id} and estado = 'propuesto'`);
            await logAudit(orgId, { accion: 'cobranza_ia.descartado', entidad: 'cotizacion', entidad_id: msg.cotizacion_id, detalle: '', ip });
            return json({ ok: true });
        }

        case 'regenerar': {
            const rl = await rateLimit(`cobranza-ia-regen:${orgId}`, 20, 60);
            if (!rl.ok) return json({ error: 'Demasiadas regeneraciones seguidas. Espera un momento.' }, 429);

            const ctx = await loadContexto(orgId, msg.cotizacion_id);
            if (!ctx) return json({ error: 'La cotización ya no existe' }, 404);
            const cfg = await getCobranzaConfig(orgId);
            const instruccion = String(body.instruccion ?? '').trim().slice(0, 500);

            const [historial] = await withOrgTx(orgId, sql`
                select autor_tipo, mensaje from cobranza_conversaciones
                where cotizacion_id = ${msg.cotizacion_id} and estado in ('enviado', 'aprobado')
                order by created_at asc`);
            const mapped: { rol: 'user' | 'assistant'; contenido: string }[] = [];
            for (const h of historial as any[]) {
                const rol: 'user' | 'assistant' = h.autor_tipo === 'agente_ia' ? 'assistant' : 'user';
                const prev = mapped[mapped.length - 1];
                if (prev && prev.rol === rol) prev.contenido += `\n\n${h.mensaje}`;
                else mapped.push({ rol, contenido: h.mensaje });
            }
            if (instruccion) {
                const prev = mapped[mapped.length - 1];
                const nota = `[Indicación interna del equipo, no la cites textualmente]: ${instruccion}`;
                if (prev && prev.rol === 'user') prev.contenido += `\n\n${nota}`;
                else mapped.push({ rol: 'user', contenido: nota });
            }

            // Un plan 'propuesto' del intento anterior se descarta: el correo nuevo
            // puede proponer otro y `executeProposePlan` rechaza duplicados.
            await withOrgTx(orgId, sql`
                delete from planes_pago_negociados
                where org_id = ${orgId} and cotizacion_id = ${msg.cotizacion_id} and estado = 'propuesto'`);

            const [[planVigente]] = await withOrgTx(orgId, sql`
                select id from planes_pago_negociados
                where cotizacion_id = ${msg.cotizacion_id} and estado = 'activo' limit 1`);

            const res = await runARAgent({
                cotizacionId: msg.cotizacion_id, orgId,
                clienteNombre: ctx.q.empresa, clienteEmail: ctx.q.cliente_email,
                montoAdeudado: ctx.saldo, diasVencido: ctx.diasVencido,
                payUrl: ctx.payUrl,
                allowPlan: ctx.diasVencido >= cfg.planDias && !planVigente,
                dryRunPlan: true,
                tono: cfg.tono, idioma: cfg.idioma, firma: cfg.firma, maxCuotas: cfg.maxCuotas,
                historialConversacion: mapped,
            });
            if (!res.ok) return json({ error: res.error || 'El agente no pudo redactar el correo' }, 502);

            await withOrgTx(orgId, sql`
                update cobranza_conversaciones set mensaje = ${res.mensaje}, editado = false
                where id = ${id} and org_id = ${orgId} and estado = 'borrador'`);
            return json({ ok: true, mensaje: res.mensaje });
        }

        case 'aprobar': {
            const ctx = await loadContexto(orgId, msg.cotizacion_id);
            if (!ctx) return json({ error: 'La cotización ya no existe' }, 404);
            if (!ctx.q.cliente_email) return json({ error: 'Este cliente no tiene correo registrado.' }, 422);

            // El plan que el agente PROPUSO se vuelve real justo aquí — nunca
            // antes. Materializar primero y enviar después: si el correo falla, el
            // plan queda bien y se puede reenviar; al revés, el cliente recibiría
            // un plan que no existe.
            const [[plan]] = await withOrgTx(orgId, sql`
                select id, cuotas from planes_pago_negociados
                where org_id = ${orgId} and cotizacion_id = ${msg.cotizacion_id} and estado = 'propuesto'
                limit 1`);
            if (plan) {
                const { splitCuotas } = await import('../../../lib/cobros');
                const montos = splitCuotas(ctx.saldo, Number(plan.cuotas));
                await materializePlan(orgId, msg.cotizacion_id, montos);
                await withOrgTx(orgId,
                    sql`update planes_pago_negociados set estado = 'activo', monto_cuota = ${montos[0]}
                        where id = ${plan.id} and org_id = ${orgId} and estado = 'propuesto'`,
                    sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                        values (${orgId}, ${msg.cotizacion_id}, 'comment',
                                ${`Plan de ${plan.cuotas} cuotas mensuales de ~$${montos[0].toFixed(2)} aprobado y activado`})`);
            }

            const cfg = await getCobranzaConfig(orgId);
            const envio = await sendEmail({
                orgId, operation: 'collection_reminder', to: ctx.q.cliente_email,
                subject: cfg.idioma === 'en'
                    ? `Payment reminder — overdue balance (${ctx.diasVencido} days)`
                    : `Recordatorio de pago — saldo vencido (${ctx.diasVencido} días)`,
                html: renderCollectionEmail({
                    cuerpo: msg.mensaje, payUrl: ctx.payUrl, cobraOnline: ctx.cobraOnline,
                    montoBoton: ctx.montoBoton, idioma: cfg.idioma,
                }),
            });

            const uid = currentUserId();
            await withOrgTx(orgId, sql`
                update cobranza_conversaciones
                set estado = ${envio.sent ? 'enviado' : 'fallido'},
                    aprobado_por = ${uid ?? null}, aprobado_at = now(),
                    enviado_at = ${envio.sent ? new Date().toISOString() : null},
                    message_id = ${envio.messageId ?? null},
                    error = ${envio.sent ? null : (envio.error ?? envio.skipped ?? 'no enviado')}
                where id = ${id} and org_id = ${orgId}`);

            await logAudit(orgId, {
                accion: 'cobranza_ia.aprobado', entidad: 'cotizacion', entidad_id: msg.cotizacion_id,
                detalle: envio.sent ? 'correo enviado' : `no enviado: ${envio.error ?? envio.skipped ?? ''}`, ip,
            });

            if (!envio.sent) {
                return json({ error: envio.error ?? envio.skipped ?? 'No se pudo enviar el correo', planActivado: !!plan }, 502);
            }
            return json({ ok: true, planActivado: !!plan });
        }

        default:
            return json({ error: 'Acción no válida' }, 400);
    }
};
