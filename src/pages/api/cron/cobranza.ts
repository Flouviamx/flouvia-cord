import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { runARAgent } from '../../../lib/agents/ar-agent';
import { sendEmail } from '../../../lib/email';

export const prerender = false;

const CRON_SECRET = import.meta.env.CRON_SECRET || process.env.CRON_SECRET;

// Días de gracia después del vencimiento antes de que el agente escriba —
// cobrar al día siguiente exacto se siente agresivo en B2B.
const GRACE_DAYS = 3;
// Escalación: a partir de estos días de atraso el agente puede acordar un plan
// de pago en cuotas REAL (materializa cobros pagables).
const PLAN_THRESHOLD_DAYS = 15;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Convierte los links de pago del texto del agente en anclas clickeables
// (el resto del texto ya viene escapado).
const linkify = (escaped: string, url: string) => {
  const escUrl = escapeHtml(url);
  return escaped.split(escUrl).join(`<a href="${escUrl}" style="color:#0a192f;font-weight:600;">${escUrl}</a>`);
};

// Cron de cobranza autónoma (AI Accounts Receivable). Protegido con CRON_SECRET
// igual que /api/cron/intereses. NOTA: aún no está agendado en vercel.json a
// propósito — enviar correos de cobranza autónomos a clientes reales exige un
// opt-in por org antes de automatizarlo. Hoy se dispara manualmente/bajo demanda.
//
// Vencimiento CANÓNICO (jul 2026): coalesce(approved_at, created_at) + días del
// término (contado 0 · net30 30 · net60 60) — igual que getCobranza()/intereses/
// recordatorios. Antes usaba c.vigencia (la validez de la COTIZACIÓN, no la
// fecha de pago), lo que disparaba cobranza en fechas equivocadas.
export const GET: APIRoute = async ({ request }) => {
  if (CRON_SECRET) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
    }
  }

  const origin = new URL(request.url).origin;

  try {
    // Cotizaciones aprobadas o facturadas, sin pagar, con el término de crédito
    // vencido (+ días de gracia) — SOLO de orgs que activaron explícitamente la
    // cobranza autónoma con IA (opt-in), nunca sandboxes ni la org demo.
    const overdueQuotes = await sql`
      SELECT
        c.id as cotizacion_id,
        c.org_id,
        c.total,
        c.public_token,
        cl.empresa as cliente_nombre,
        cl.email as cliente_email,
        (o.stripe_charges_enabled and o.stripe_account_id is not null
         and (o.acepta_tarjeta or o.cobro_spei_auto)) as cobra_online,
        floor(DATE_PART('day', NOW() - (
          coalesce(c.approved_at, c.created_at)
          + make_interval(days => case coalesce(c.terminos, cl.terminos_default, 'contado')
              when 'net30' then 30 when 'net60' then 60 else 0 end)
        )))::int as dias_vencido
      FROM cotizaciones c
      JOIN clientes cl ON c.cliente_id = cl.id
      JOIN orgs o ON o.id = c.org_id
      WHERE c.status in ('approved', 'invoiced')
        AND c.paid_at IS NULL
        AND coalesce(c.approved_at, c.created_at)
            + make_interval(days => case coalesce(c.terminos, cl.terminos_default, 'contado')
                when 'net30' then 30 when 'net60' then 60 else 0 end)
            < NOW() - make_interval(days => ${GRACE_DAYS})
        AND o.ai_cobranza_activa = true
        AND o.sandbox_of IS NULL
        AND coalesce(o.clerk_user_id, '') <> 'demo-user'
    `;

    const results = [];

    for (const quote of overdueQuotes) {
      // Saldo REAL pendiente: total menos los cobros parciales ya pagados
      // (anticipo/cuotas). Si ya hay cuotas materializadas, el adeudo exigible
      // hoy son las cuotas vencidas — pero el agente negocia sobre el saldo.
      const [pagadoRow] = await sql`
        select coalesce(sum(monto), 0) as pagado
        from cotizacion_cobros
        where cotizacion_id = ${quote.cotizacion_id} and status = 'pagado'`;
      const saldo = Math.max(0, Number(quote.total) - Number(pagadoRow?.pagado ?? 0));
      if (saldo <= 0) continue; // saldado por cobros parciales; el flip del webhook va en camino

      // ¿Ya hay un plan de cuotas vigente? Entonces no se re-negocia otro.
      const planVigente = await sql`
        select id from planes_pago_negociados
        where cotizacion_id = ${quote.cotizacion_id} and estado in ('propuesto', 'activo')
        limit 1`;

      // Lo COBRABLE hoy en un clic: el siguiente cobro pendiente ya vencido
      // (con plan de cuotas, es la cuota exigible — no el saldo completo).
      const [proxCobro] = await sql`
        select monto from cotizacion_cobros
        where cotizacion_id = ${quote.cotizacion_id} and status = 'pendiente'
          and (vence is null or vence <= current_date)
        order by vence asc nulls first, created_at asc
        limit 1`;
      const montoBoton = proxCobro ? Number(proxCobro.monto) : saldo;

      // Cliente AL CORRIENTE de su plan de cuotas (ninguna cuota vencida hoy):
      // no se le cobra — el plan sustituye a los términos originales.
      if (planVigente.length && !proxCobro) continue;

      const diasVencido = Math.max(0, Number(quote.dias_vencido) || 0);
      // Con cobro en línea activo, el link va directo al checkout; si no, al
      // link público (ahí están los datos de transferencia y el contacto).
      const cobraOnline = !!quote.cobra_online;
      const payUrl = cobraOnline
        ? `${origin}/q/${quote.public_token}/pay`
        : `${origin}/q/${quote.public_token}`;

      // Obtener el historial de la conversación para esta cotización
      const historial = await sql`
        SELECT autor_tipo, mensaje
        FROM cobranza_conversaciones
        WHERE cotizacion_id = ${quote.cotizacion_id}
        ORDER BY created_at ASC
      `;

      const mappedHistory = historial.map((h: any) => ({
        rol: h.autor_tipo === 'agente_ia' ? 'assistant' : 'user',
        contenido: h.mensaje
      }));

      // Llamar al agente. El plan de cuotas solo se habilita en la escalación
      // (15+ días de atraso) y si no existe ya un plan vigente.
      const agentResponse = await runARAgent({
        cotizacionId: quote.cotizacion_id,
        orgId: quote.org_id,
        clienteNombre: quote.cliente_nombre,
        clienteEmail: quote.cliente_email,
        montoAdeudado: saldo,
        diasVencido,
        payUrl,
        allowPlan: diasVencido >= PLAN_THRESHOLD_DAYS && !planVigente.length,
        historialConversacion: mappedHistory as any
      });

      // Envío real del correo de cobranza vía Resend. sendEmail es best-effort:
      // si falta RESEND_API_KEY devuelve { sent:false, skipped } sin lanzar.
      let emailResult: { sent: boolean; skipped?: string; error?: string } = { sent: false, skipped: 'sin email' };
      if (quote.cliente_email) {
        const cuerpo = linkify(escapeHtml(agentResponse), payUrl);
        const saldoFmt = '$' + new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(montoBoton);
        const bodyHtml = `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:540px;margin:0 auto;">
            <div style="margin-bottom:32px;">
                <img src="https://cord.flouvia.com/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord Logo" style="display:block;">
            </div>

            <p style="font-size:16px;line-height:1.6;color:#374151;margin-bottom:0;font-weight:400;margin-top:0;white-space:pre-wrap;">${cuerpo}</p>

            <div style="margin:32px 0 0;">
                <a href="${escapeHtml(payUrl)}" style="display:inline-block;background:#0a192f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 28px;border-radius:999px;">${cobraOnline ? `Pagar ${saldoFmt} en línea` : 'Ver cotización y opciones de pago'}</a>
                ${cobraOnline ? '<p style="font-size:12px;color:#9CA3AF;margin:10px 0 0;">Pago seguro procesado por Stripe.</p>' : ''}
            </div>

            <div style="margin-top:48px;padding-top:24px;border-top:1px solid #E5E7EB;">
                <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5;">Agente de Cobranza Inteligente · Cord by Flouvia</p>
            </div>
        </div>
    </div>`;
        emailResult = await sendEmail({
          to: quote.cliente_email,
          subject: `Recordatorio de pago — saldo vencido (${diasVencido} días)`,
          html: bodyHtml,
        });
      }

      results.push({
        cotizacionId: quote.cotizacion_id,
        status: 'procesada',
        saldo,
        diasVencido,
        emailSent: emailResult.sent,
        emailSkipped: emailResult.skipped,
      });
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en cron de cobranza:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};
