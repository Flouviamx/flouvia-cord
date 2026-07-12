import Anthropic from '@anthropic-ai/sdk';
import { sql } from '../db';
import { splitCuotas, isoDay } from '../cobros';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '',
});

export interface ARContext {
  cotizacionId: string;
  orgId: string;
  clienteNombre: string;
  clienteEmail: string;
  montoAdeudado: number;      // saldo REAL pendiente (total − cobros pagados)
  diasVencido: number;
  payUrl?: string;            // link de pago real (/q/[token]/pay) — el cron lo pasa
  allowPlan?: boolean;        // escalación: puede EJECUTAR un plan de cuotas real
  historialConversacion: { rol: 'user' | 'assistant', contenido: string }[];
}

// Ejecuta propose_payment_plan con VALIDACIÓN server-side (las reglas del prompt
// no bastan: el modelo puede alucinar montos). Si todo es válido, materializa
// cuotas REALES en cotizacion_cobros (cancelando el saldo/total pendiente para
// que la suma pagable siga siendo exactamente el adeudo) y registra el plan.
// Devuelve el texto del tool_result que se le regresa al modelo.
async function executeProposePlan(context: ARContext, input: any): Promise<string> {
  if (!context.allowPlan) {
    return 'ERROR: los planes de pago aún no están habilitados para esta cuenta — ofrece únicamente el pago del saldo completo.';
  }
  const cuotas = Math.round(Number(input?.cuotas));
  const montoCuota = Math.round(Number(input?.monto_cuota) * 100) / 100;
  if (!Number.isFinite(cuotas) || cuotas < 2 || cuotas > 3) {
    return 'ERROR: el plan debe ser de 2 o 3 cuotas mensuales.';
  }
  const saldo = Math.round(context.montoAdeudado * 100) / 100;
  // Tolerancia de 1% (o $1) para redondeos del modelo; los montos REALES los
  // calcula splitCuotas, no el modelo.
  if (!Number.isFinite(montoCuota) || Math.abs(montoCuota * cuotas - saldo) > Math.max(saldo * 0.01, 1)) {
    return `ERROR: ${cuotas} cuotas de $${montoCuota} no suman el saldo pendiente de $${saldo.toFixed(2)}. Las cuotas deben cubrir exactamente el adeudo (sin descuentos).`;
  }
  const dup = await sql`
    select id from planes_pago_negociados
    where cotizacion_id = ${context.cotizacionId} and estado in ('propuesto', 'activo')
    limit 1`;
  if (dup.length) {
    return 'ERROR: esta cotización ya tiene un plan de pago vigente — recuérdale al cliente las cuotas ya acordadas.';
  }

  const montos = splitCuotas(saldo, cuotas);
  // El saldo/total pendiente se reemplaza por las cuotas (nunca deben coexistir:
  // se duplicaría lo cobrable). Best-effort: cancelar también sus PaymentIntents
  // en Stripe — una pestaña de checkout abierta con el saldo viejo podría
  // cobrarse después del plan y sobre-cobrar al cliente.
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const pendientesPI = await sql`
    select co.stripe_payment_intent_id, o.stripe_account_id
    from cotizacion_cobros co
    join cotizaciones c on c.id = co.cotizacion_id
    join orgs o on o.id = c.org_id
    where co.cotizacion_id = ${context.cotizacionId} and co.status = 'pendiente'
      and co.stripe_payment_intent_id is not null`;
  if (stripeKey) {
    for (const p of pendientesPI) {
      try {
        await fetch(`https://api.stripe.com/v1/payment_intents/${p.stripe_payment_intent_id}/cancel`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${stripeKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(p.stripe_account_id ? { 'Stripe-Account': p.stripe_account_id as string } : {}),
          },
        });
      } catch { /* best-effort: el webhook concilia si aun así se paga */ }
    }
  }
  await sql`update cotizacion_cobros set status = 'cancelado'
            where cotizacion_id = ${context.cotizacionId} and status = 'pendiente'`;
  for (let i = 0; i < cuotas; i++) {
    const vence = new Date();
    vence.setMonth(vence.getMonth() + i);
    await sql`
      insert into cotizacion_cobros (org_id, cotizacion_id, tipo, numero_cuota, monto, vence)
      values (${context.orgId}, ${context.cotizacionId}, 'cuota', ${i + 1}, ${montos[i]}, ${isoDay(vence)})
      on conflict (cotizacion_id, tipo, numero_cuota) do nothing`;
  }
  await sql`
    INSERT INTO planes_pago_negociados (org_id, cotizacion_id, cuotas, monto_cuota, estado)
    VALUES (${context.orgId}, ${context.cotizacionId}, ${cuotas}, ${montos[0]}, 'activo')`;
  await sql`
    insert into eventos (org_id, cotizacion_id, tipo, detalle)
    values (${context.orgId}, ${context.cotizacionId}, 'comment',
            ${`Agente de cobranza acordó plan de ${cuotas} cuotas mensuales de ~$${montos[0].toFixed(2)}`})`;

  const linea = context.payUrl ? ` La primera cuota ya se puede pagar en: ${context.payUrl}` : '';
  return `OK: plan registrado — ${cuotas} cuotas mensuales (${montos.map((m) => '$' + m.toFixed(2)).join(', ')}), la primera vence hoy.${linea} Confirma el plan al cliente en tu correo e incluye el link de pago.`;
}

export async function runARAgent(context: ARContext): Promise<string> {
  const systemPrompt = `
Eres un especialista en Cuentas por Cobrar (Accounts Receivable) trabajando para una empresa B2B.
Tu objetivo es lograr que el cliente pague el saldo vencido, manteniendo una relación profesional y cordial.
El cliente es ${context.clienteNombre}.
Saldo pendiente: $${context.montoAdeudado.toFixed(2)}
Días de atraso: ${context.diasVencido}
${context.payUrl ? `Link de pago en línea (inclúyelo SIEMPRE en tu correo, tal cual): ${context.payUrl}` : ''}

Reglas:
1. Sé profesional y empático.
${context.allowPlan
    ? `2. Si el cliente tiene problemas de flujo de caja, puedes acordar un plan de pago de 2 o 3 cuotas mensuales que sumen exactamente el saldo. Usa la herramienta 'propose_payment_plan' SOLO cuando el cliente ya haya aceptado el plan en la conversación.`
    : `2. No ofrezcas planes de pago en cuotas; solicita el pago del saldo completo.`}
3. El cliente no puede recibir descuentos sobre el monto principal.
4. Redacta tu respuesta como el cuerpo de un correo electrónico (sin asunto).
  `;

  const messages: Anthropic.MessageParam[] = context.historialConversacion.map(msg => ({
    role: msg.rol,
    content: msg.contenido
  }));

  if (messages.length === 0) {
    messages.push({
      role: 'user',
      content: 'Genera el primer correo de recordatorio de cobro amigable.'
    });
  }

  const tools: Anthropic.Tool[] = context.allowPlan ? [
    {
      name: 'propose_payment_plan',
      description: 'Registra el plan de pago acordado con el cliente (cuotas mensuales que suman el saldo). Llamar SOLO cuando el cliente ya aceptó.',
      input_schema: {
        type: 'object',
        properties: {
          cuotas: { type: 'integer', description: 'Número de cuotas mensuales (2 o 3)' },
          monto_cuota: { type: 'number', description: 'Monto de cada cuota (saldo / cuotas)' }
        },
        required: ['cuotas', 'monto_cuota']
      }
    }
  ] : [];

  try {
    let response = await anthropic.messages.create({
      model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      ...(tools.length ? { tools } : {}),
    });

    // Mini-loop de 2 turnos: si el modelo usa la herramienta, se ejecuta con
    // validación real y se le regresa el tool_result para que redacte el correo
    // final CON conocimiento del resultado (antes se pegaba un "[Sistema: …]"
    // sintético y el modelo nunca se enteraba de si el plan quedó o no).
    if (response.stop_reason === 'tool_use' && tools.length) {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use' && block.name === 'propose_payment_plan') {
          const result = await executeProposePlan(context, block.input);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }
      if (toolResults.length) {
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });
        response = await anthropic.messages.create({
          model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: systemPrompt,
          messages,
          tools,
          tool_choice: { type: 'none' },
        });
      }
    }

    let finalMessage = '';
    for (const block of response.content) {
      if (block.type === 'text') finalMessage += block.text;
    }
    if (!finalMessage.trim()) {
      finalMessage = `Le escribimos para recordarle el saldo pendiente de $${context.montoAdeudado.toFixed(2)} (${context.diasVencido} días de atraso).${context.payUrl ? ` Puede pagar en línea aquí: ${context.payUrl}` : ''}`;
    }

    await sql`
      INSERT INTO cobranza_conversaciones (org_id, cotizacion_id, autor_tipo, mensaje)
      VALUES (${context.orgId}, ${context.cotizacionId}, 'agente_ia', ${finalMessage})
    `;

    return finalMessage;

  } catch (error) {
    console.error('Error running AR Agent:', error);
    return 'Hubo un error al generar la respuesta de cobranza.';
  }
}
