import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { runARAgent } from '../../../lib/agents/ar-agent';
import { sendEmail } from '../../../lib/email';

export const prerender = false;

const CRON_SECRET = import.meta.env.CRON_SECRET || process.env.CRON_SECRET;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Cron de cobranza autónoma (AI Accounts Receivable). Protegido con CRON_SECRET
// igual que /api/cron/intereses. NOTA: aún no está agendado en vercel.json a
// propósito — enviar correos de cobranza autónomos a clientes reales exige un
// opt-in por org antes de automatizarlo. Hoy se dispara manualmente/bajo demanda.
export const GET: APIRoute = async ({ request }) => {
  if (CRON_SECRET) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
    }
  }

  try {
    // Buscar cotizaciones facturadas y vencidas (sin paid_at) — SOLO de orgs que
    // activaron explícitamente la cobranza autónoma con IA (opt-in).
    const overdueQuotes = await sql`
      SELECT
        c.id as cotizacion_id,
        c.org_id,
        c.total as monto_adeudado,
        c.vigencia,
        cl.empresa as cliente_nombre,
        cl.email as cliente_email,
        DATE_PART('day', NOW() - c.vigencia) as dias_vencido
      FROM cotizaciones c
      JOIN clientes cl ON c.cliente_id = cl.id
      JOIN orgs o ON o.id = c.org_id
      WHERE c.status = 'invoiced'
        AND c.paid_at IS NULL
        AND c.vigencia < NOW()
        AND o.ai_cobranza_activa = true
        AND o.sandbox_of IS NULL
    `;

    const results = [];

    for (const quote of overdueQuotes) {
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

      // Llamar al agente
      const agentResponse = await runARAgent({
        cotizacionId: quote.cotizacion_id,
        orgId: quote.org_id,
        clienteNombre: quote.cliente_nombre,
        clienteEmail: quote.cliente_email,
        montoAdeudado: parseFloat(quote.monto_adeudado),
        diasVencido: Math.floor(quote.dias_vencido),
        historialConversacion: mappedHistory as any
      });

      // Envío real del correo de cobranza vía Resend. sendEmail es best-effort:
      // si falta RESEND_API_KEY devuelve { sent:false, skipped } sin lanzar.
      let emailResult: { sent: boolean; skipped?: string; error?: string } = { sent: false, skipped: 'sin email' };
      if (quote.cliente_email) {
        const bodyHtml = `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:540px;margin:0 auto;">
            <div style="margin-bottom:32px;">
                <img src="https://cord.flouvia.com/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord Logo" style="display:block;">
            </div>
            
            <p style="font-size:16px;line-height:1.6;color:#374151;margin-bottom:0;font-weight:400;margin-top:0;white-space:pre-wrap;">${escapeHtml(agentResponse)}</p>

            <div style="margin-top:48px;padding-top:24px;border-top:1px solid #E5E7EB;">
                <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5;">Agente de Cobranza Inteligente · Cord by Flouvia</p>
            </div>
        </div>
    </div>`;
        emailResult = await sendEmail({
          to: quote.cliente_email,
          subject: `Recordatorio de pago — factura vencida (${Math.floor(quote.dias_vencido)} días)`,
          html: bodyHtml,
        });
      }

      results.push({
        cotizacionId: quote.cotizacion_id,
        status: 'procesada',
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
