import type { APIRoute } from 'astro';
import { sql, withOrgTx } from '../../../lib/db';
import { runARAgent } from '../../../lib/agents/ar-agent';
import { getCobranzaConfig, renderCollectionEmail } from '../../../lib/agents/cobranza-run';
import { sendEmail, siteOrigin } from '../../../lib/email';
import { log } from '../../../lib/log';

export const prerender = false;

const INBOUND_SECRET = import.meta.env.INBOUND_EMAIL_SECRET || process.env.INBOUND_EMAIL_SECRET;

// ════════════════════════════════════════════════════════════════════════════
// Respuestas del cliente por correo → conversación bidireccional del agente.
//
// ⚠️ HOY ESTE ENDPOINT ES INALCANZABLE, A PROPÓSITO. No está en
// `PUBLIC_API_PREFIXES` de src/middleware.ts, así que el middleware exige una
// sesión de usuario que un proveedor de correo nunca va a tener. La lógica está
// corregida y lista; encenderlo son exactamente DOS pasos:
//
//   1. Agregar '/api/webhooks/inbound-email' a PUBLIC_API_PREFIXES en
//      src/middleware.ts (el endpoint ya se autentica solo, con el Bearer de
//      INBOUND_EMAIL_SECRET y fail-closed si la variable no está).
//   2. Configurar Inbound Emails en Resend: dominio de recepción + webhook
//      apuntando aquí con ese mismo Bearer.
//
// Mientras tanto los correos SALIENTES ya guardan `cobranza_conversaciones.
// message_id` (el id que devuelve Resend), así que el día que se encienda, el
// threading tiene con qué emparejar la respuesta contra su hilo sin migrar nada.
//
// Lo que estaba mal antes y quedó corregido: identificaba la cotización con un
// "mock" (la más reciente del remitente en status='invoiced', ignorando
// 'approved'), usaba `quote.total` crudo en vez del saldo real, calculaba los
// días de atraso con `c.vigencia` (la validez de la COTIZACIÓN, no la fecha de
// pago — el bug canónico ya corregido en el resto del sistema), y el envío de la
// respuesta estaba COMENTADO: el agente redactaba y nadie mandaba nada.
// ════════════════════════════════════════════════════════════════════════════
export const POST: APIRoute = async ({ request }) => {
  const authz = request.headers.get('authorization') || '';
  const token = /^Bearer\s+(.+)$/i.exec(authz.trim())?.[1];
  if (!INBOUND_SECRET || token !== INBOUND_SECRET) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  }
  try {
    const payload = await request.json();
    const emailFrom = String(payload.from ?? '').trim().toLowerCase();
    const emailBody = String(payload.text || payload.html || '').slice(0, 8000);
    // Resend/SendGrid mandan las cabeceras de threading; `in_reply_to` es el
    // message_id del correo al que responden.
    const inReplyTo = String(payload.in_reply_to || payload.inReplyTo || payload.references || '').trim();
    if (!emailFrom || !emailBody) {
      return new Response(JSON.stringify({ error: 'Correo sin remitente o sin cuerpo' }), { status: 400 });
    }

    // 1º por threading REAL (message_id del correo que enviamos). Solo si no hay
    // forma de emparejar se cae al último recurso: la cotización con saldo más
    // vencida de ese remitente. Antes esto era el único camino y encima ignoraba
    // las cotizaciones 'approved'.
    let quote: any = null;
    if (inReplyTo) {
      const [porHilo] = await sql`
        select c.id as cotizacion_id, c.org_id
        from cobranza_conversaciones cc
        join cotizaciones c on c.id = cc.cotizacion_id
        where cc.message_id is not null and ${inReplyTo} like '%' || cc.message_id || '%'
        order by cc.created_at desc limit 1`;
      quote = porHilo ?? null;
    }
    if (!quote) {
      const [porRemitente] = await sql`
        select c.id as cotizacion_id, c.org_id
        from cotizaciones c
        join clientes cl on c.cliente_id = cl.id
        where cl.email = ${emailFrom}
          and c.status in ('approved', 'invoiced')
          and c.paid_at is null
          and c.es_recurrente is not true
        order by coalesce(c.approved_at, c.created_at) asc limit 1`;
      quote = porRemitente ?? null;
    }
    if (!quote) {
      return new Response(JSON.stringify({ error: 'Cotización no encontrada para este remitente' }), { status: 404 });
    }

    const orgId = quote.org_id as string;
    const cotizacionId = quote.cotizacion_id as string;

    // Contexto real: saldo pendiente y vencimiento CANÓNICO.
    const [[ctx]] = await withOrgTx(orgId, sql`
      select c.total, c.public_token, cl.empresa, cl.email as cliente_email,
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
    if (!ctx) {
      return new Response(JSON.stringify({ error: 'Cotización no encontrada' }), { status: 404 });
    }

    const saldo = Math.max(0, Number(ctx.total) - Number(ctx.pagado ?? 0));
    const diasVencido = Math.max(0, Number(ctx.dias_vencido) || 0);
    const cobraOnline = !!ctx.cobra_online;
    const origin = siteOrigin();
    const payUrl = cobraOnline ? `${origin}/q/${ctx.public_token}/pay` : `${origin}/q/${ctx.public_token}`;

    await withOrgTx(orgId, sql`
      insert into cobranza_conversaciones (org_id, cotizacion_id, autor_tipo, mensaje, estado, enviado_at)
      values (${orgId}, ${cotizacionId}, 'cliente', ${emailBody}, 'enviado', now())`);

    const cfg = await getCobranzaConfig(orgId);
    if (!cfg.activa) {
      // La respuesta queda registrada para que el vendedor la vea en el hilo,
      // pero con el agente apagado no se le contesta automáticamente.
      return new Response(JSON.stringify({ success: true, replied: false, reason: 'agente inactivo' }), { status: 200 });
    }

    const [historial] = await withOrgTx(orgId, sql`
      select autor_tipo, mensaje from cobranza_conversaciones
      where cotizacion_id = ${cotizacionId} and estado in ('enviado', 'aprobado')
      order by created_at asc`);
    const mapped: { rol: 'user' | 'assistant'; contenido: string }[] = [];
    for (const h of historial as any[]) {
      const rol: 'user' | 'assistant' = h.autor_tipo === 'agente_ia' ? 'assistant' : 'user';
      const prev = mapped[mapped.length - 1];
      if (prev && prev.rol === rol) prev.contenido += `\n\n${h.mensaje}`;
      else mapped.push({ rol, contenido: h.mensaje });
    }

    const [[planVigente]] = await withOrgTx(orgId, sql`
      select id from planes_pago_negociados
      where cotizacion_id = ${cotizacionId} and estado in ('propuesto', 'activo') limit 1`);

    const res = await runARAgent({
      cotizacionId, orgId,
      clienteNombre: ctx.empresa, clienteEmail: emailFrom,
      montoAdeudado: saldo, diasVencido, payUrl,
      allowPlan: diasVencido >= cfg.planDias && !planVigente,
      dryRunPlan: cfg.modo === 'aprobacion',
      tono: cfg.tono, idioma: cfg.idioma, firma: cfg.firma, maxCuotas: cfg.maxCuotas,
      historialConversacion: mapped,
    });

    if (!res.ok) {
      await withOrgTx(orgId, sql`
        insert into cobranza_conversaciones (org_id, cotizacion_id, autor_tipo, mensaje, estado, error)
        values (${orgId}, ${cotizacionId}, 'agente_ia', ${res.mensaje}, 'fallido', ${res.error ?? 'error'})`);
      return new Response(JSON.stringify({ success: true, replied: false, reason: res.error }), { status: 200 });
    }

    // En modo aprobación la respuesta NO sale sola: queda de borrador en la
    // bandeja, igual que cualquier otro correo del agente.
    if (cfg.modo === 'aprobacion') {
      await withOrgTx(orgId, sql`
        insert into cobranza_conversaciones (org_id, cotizacion_id, autor_tipo, mensaje, estado)
        values (${orgId}, ${cotizacionId}, 'agente_ia', ${res.mensaje}, 'borrador')`);
      return new Response(JSON.stringify({ success: true, replied: false, reason: 'pendiente de aprobación' }), { status: 200 });
    }

    // El envío de la respuesta estaba COMENTADO: el agente redactaba y el correo
    // nunca salía.
    const envio = await sendEmail({
      orgId, operation: 'collection_reply', to: emailFrom,
      subject: cfg.idioma === 'en' ? 'Re: your outstanding balance' : 'Re: tu saldo pendiente',
      html: renderCollectionEmail({
        cuerpo: res.mensaje, payUrl, cobraOnline, montoBoton: saldo, idioma: cfg.idioma,
      }),
    });
    await withOrgTx(orgId, sql`
      insert into cobranza_conversaciones
        (org_id, cotizacion_id, autor_tipo, mensaje, estado, enviado_at, message_id, error)
      values (${orgId}, ${cotizacionId}, 'agente_ia', ${res.mensaje},
              ${envio.sent ? 'enviado' : 'fallido'},
              ${envio.sent ? new Date().toISOString() : null},
              ${envio.messageId ?? null},
              ${envio.sent ? null : (envio.error ?? envio.skipped ?? 'no enviado')})`);

    return new Response(JSON.stringify({ success: true, replied: envio.sent }), { status: 200 });

  } catch (error) {
    log.error('Error procesando inbound email', { err: error });
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};
