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
        const bodyHtml = `<div style="background-color:#F9FAFB;padding:40px 20px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
        <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);border:1px solid #E5E7EB;">
            <div style="padding:40px;">
                <div style="font-size:16px;line-height:1.6;color:#374151;white-space:pre-wrap;">${escapeHtml(agentResponse)}</div>
            </div>
            <div style="background-color:#F9FAFB;padding:24px 40px;border-top:1px solid #E5E7EB;text-align:center;">
                <p style="font-size:13px;color:#9CA3AF;margin:0;">Enviado vía Cord</p>
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
