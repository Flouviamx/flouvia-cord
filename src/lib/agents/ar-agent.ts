import Anthropic from '@anthropic-ai/sdk';
import { sql } from '../db';
import { splitCuotas, isoDay } from '../cobros';
import { cancelUsage, flushUsageReservation, reserveUsage } from '../billing';
import { trackExternalUsage } from '../external-usage';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '',
});

const MODEL = () => process.env.AI_MODEL || 'claude-haiku-4-5-20251001';

export type Tono = 'cercano' | 'profesional' | 'firme';

export interface ARContext {
  cotizacionId: string;
  orgId: string;
  clienteNombre: string;
  clienteEmail: string;
  montoAdeudado: number;      // saldo REAL pendiente (total − cobros pagados)
  diasVencido: number;
  payUrl?: string;            // link de pago real (/q/[token]/pay)
  allowPlan?: boolean;        // escalación: puede acordar un plan de cuotas
  // Modo APROBACIÓN: el plan se calcula y se registra como 'propuesto', pero NO
  // se materializa (no cancela PaymentIntents ni reescribe cotizacion_cobros).
  // Sin esto, un correo que queda en borrador y nunca se aprueba ya habría
  // destruido los cobros pendientes del cliente.
  dryRunPlan?: boolean;
  tono?: Tono;
  idioma?: 'es' | 'en';
  firma?: string | null;
  maxCuotas?: number;
  historialConversacion: { rol: 'user' | 'assistant', contenido: string }[];
}

export interface PlanPropuesto {
  cuotas: number;
  montos: number[];
  materializado: boolean;     // false = quedó como 'propuesto', pendiente de aprobación
}

export interface ARResult {
  ok: boolean;
  mensaje: string;
  error?: string;
  plan?: PlanPropuesto;
}

/**
 * Ejecuta `propose_payment_plan` con VALIDACIÓN server-side: las reglas del
 * prompt no bastan, el modelo puede alucinar montos. Los importes REALES los
 * calcula `splitCuotas`, nunca el modelo.
 *
 * Con `dryRunPlan` valida exactamente igual pero solo REGISTRA el plan como
 * 'propuesto'; la materialización (cancelar PIs + reescribir cobros) ocurre al
 * aprobar el correo.
 */
async function executeProposePlan(
  context: ARContext,
  input: any,
  captura: { plan?: PlanPropuesto },
): Promise<string> {
  if (!context.allowPlan) {
    return 'ERROR: los planes de pago aún no están habilitados para esta cuenta — ofrece únicamente el pago del saldo completo.';
  }
  const maxCuotas = Math.min(6, Math.max(2, context.maxCuotas ?? 3));
  const cuotas = Math.round(Number(input?.cuotas));
  const montoCuota = Math.round(Number(input?.monto_cuota) * 100) / 100;
  if (!Number.isFinite(cuotas) || cuotas < 2 || cuotas > maxCuotas) {
    return `ERROR: el plan debe ser de 2 a ${maxCuotas} cuotas mensuales.`;
  }
  const saldo = Math.round(context.montoAdeudado * 100) / 100;
  // Tolerancia de 1% (o $1) para redondeos del modelo.
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
  captura.plan = { cuotas, montos, materializado: !context.dryRunPlan };

  if (context.dryRunPlan) {
    // Solo se registra la intención. `materializePlan()` hace el trabajo real
    // cuando un humano aprueba el correo.
    await sql`
      insert into planes_pago_negociados (org_id, cotizacion_id, cuotas, monto_cuota, estado)
      values (${context.orgId}, ${context.cotizacionId}, ${cuotas}, ${montos[0]}, 'propuesto')`;
    const linea = context.payUrl ? ` El link de pago es: ${context.payUrl}` : '';
    return `OK: plan de ${cuotas} cuotas mensuales (${montos.map((m) => '$' + m.toFixed(2)).join(', ')}) registrado y pendiente de confirmación interna. Confírmale el plan al cliente en tu correo.${linea}`;
  }

  await materializePlan(context.orgId, context.cotizacionId, montos);
  await sql`
    insert into planes_pago_negociados (org_id, cotizacion_id, cuotas, monto_cuota, estado)
    values (${context.orgId}, ${context.cotizacionId}, ${cuotas}, ${montos[0]}, 'activo')`;
  await sql`
    insert into eventos (org_id, cotizacion_id, tipo, detalle)
    values (${context.orgId}, ${context.cotizacionId}, 'comment',
            ${`Agente de cobranza acordó plan de ${cuotas} cuotas mensuales de ~$${montos[0].toFixed(2)}`})`;

  const linea = context.payUrl ? ` La primera cuota ya se puede pagar en: ${context.payUrl}` : '';
  return `OK: plan registrado — ${cuotas} cuotas mensuales (${montos.map((m) => '$' + m.toFixed(2)).join(', ')}), la primera vence hoy.${linea} Confirma el plan al cliente en tu correo e incluye el link de pago.`;
}

/**
 * Convierte un plan en cobros REALES pagables. El saldo/total pendiente se
 * reemplaza por las cuotas (nunca deben coexistir: se duplicaría lo cobrable), y
 * los PaymentIntents pendientes se cancelan en Stripe — una pestaña de checkout
 * abierta con el saldo viejo podría cobrarse después del plan y sobre-cobrar.
 *
 * Exportada porque el endpoint de aprobación la llama cuando un plan 'propuesto'
 * pasa a 'activo'.
 */
export async function materializePlan(orgId: string, cotizacionId: string, montos: number[]): Promise<void> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const pendientesPI = await sql`
    select co.stripe_payment_intent_id, o.stripe_account_id
    from cotizacion_cobros co
    join cotizaciones c on c.id = co.cotizacion_id
    join orgs o on o.id = c.org_id
    where co.cotizacion_id = ${cotizacionId} and co.status = 'pendiente'
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
            where cotizacion_id = ${cotizacionId} and status = 'pendiente'`;
  for (let i = 0; i < montos.length; i++) {
    const vence = new Date();
    vence.setMonth(vence.getMonth() + i);
    await sql`
      insert into cotizacion_cobros (org_id, cotizacion_id, tipo, numero_cuota, monto, vence)
      values (${orgId}, ${cotizacionId}, 'cuota', ${i + 1}, ${montos[i]}, ${isoDay(vence)})
      on conflict (cotizacion_id, tipo, numero_cuota) do nothing`;
  }
}

const TONO_INSTRUCCION: Record<Tono, { es: string; en: string }> = {
  cercano: {
    es: 'Escribe cercano y humano, en un tono de colaboración entre socios. Nada de lenguaje legal.',
    en: 'Write warm and human, like a partner following up. No legal language.',
  },
  profesional: {
    es: 'Escribe profesional y cordial, directo pero respetuoso.',
    en: 'Write professionally and cordially — direct but respectful.',
  },
  firme: {
    es: 'Escribe firme y directo: deja clara la urgencia del adeudo sin ser grosero ni amenazante.',
    en: 'Write firmly and directly: make the urgency clear without being rude or threatening.',
  },
};

function buildSystemPrompt(c: ARContext): string {
  const en = c.idioma === 'en';
  const tono = TONO_INSTRUCCION[c.tono ?? 'profesional'][en ? 'en' : 'es'];
  const maxCuotas = Math.min(6, Math.max(2, c.maxCuotas ?? 3));
  const firma = c.firma ? (en ? `\nSign off exactly like this:\n${c.firma}` : `\nDespídete exactamente así:\n${c.firma}`) : '';

  if (en) {
    return `You are an Accounts Receivable specialist working for a commercial company.
Your goal is to get the customer to pay the overdue balance while keeping the relationship healthy.
Customer: ${c.clienteNombre}
Outstanding balance: $${c.montoAdeudado.toFixed(2)}
Days overdue: ${c.diasVencido}
${c.payUrl ? `Online payment link (ALWAYS include it verbatim in your email): ${c.payUrl}` : ''}

Rules:
1. ${tono}
${c.allowPlan
      ? `2. If the customer has cash-flow trouble you may agree on a payment plan of 2 to ${maxCuotas} monthly instalments that add up to exactly the balance. Call 'propose_payment_plan' ONLY once the customer has already accepted the plan in the conversation.`
      : `2. Do not offer instalment plans; ask for the full balance.`}
3. The customer cannot get discounts on the principal.
4. Write your reply as the body of an email (no subject line).${firma}
5. Reply in English.`;
  }

  return `Eres un especialista en Cuentas por Cobrar trabajando para una empresa comercial.
Tu objetivo es lograr que el cliente pague el saldo vencido, manteniendo una relación sana.
El cliente es ${c.clienteNombre}.
Saldo pendiente: $${c.montoAdeudado.toFixed(2)}
Días de atraso: ${c.diasVencido}
${c.payUrl ? `Link de pago en línea (inclúyelo SIEMPRE en tu correo, tal cual): ${c.payUrl}` : ''}

Reglas:
1. ${tono}
${c.allowPlan
    ? `2. Si el cliente tiene problemas de flujo de caja, puedes acordar un plan de pago de 2 a ${maxCuotas} cuotas mensuales que sumen exactamente el saldo. Usa la herramienta 'propose_payment_plan' SOLO cuando el cliente ya haya aceptado el plan en la conversación.`
    : `2. No ofrezcas planes de pago en cuotas; solicita el pago del saldo completo.`}
3. El cliente no puede recibir descuentos sobre el monto principal.
4. Redacta tu respuesta como el cuerpo de un correo electrónico (sin asunto).${firma}
5. Responde en español.`;
}

export async function runARAgent(context: ARContext): Promise<ARResult> {
  const idioma = context.idioma ?? 'es';
  const fallback = idioma === 'en'
    ? `This is a reminder that you have an outstanding balance of $${context.montoAdeudado.toFixed(2)}.${context.payUrl ? ` You can review and pay here: ${context.payUrl}` : ''}`
    : `Le recordamos que tiene un saldo pendiente de $${context.montoAdeudado.toFixed(2)}.${context.payUrl ? ` Puede consultar y pagar aquí: ${context.payUrl}` : ''}`;

  // La reserva es el gate definitivo y atómico: evita que dos ejecuciones
  // concurrentes rebasen la cuota antes de llamar al proveedor.
  const usage = await reserveUsage(context.orgId, 'ia', 1);
  if (!usage.ok || !usage.id) {
    return { ok: false, mensaje: fallback, error: 'cuota de IA agotada' };
  }

  const systemPrompt = buildSystemPrompt(context);

  const messages: Anthropic.MessageParam[] = context.historialConversacion.map((msg) => ({
    role: msg.rol,
    content: msg.contenido,
  }));

  // Anthropic exige que el primer turno sea 'user'.
  if (messages.length === 0 || messages[0].role !== 'user') {
    messages.unshift({
      role: 'user',
      content: idioma === 'en'
        ? 'Draft the first friendly payment reminder email.'
        : 'Genera el primer correo de recordatorio de cobro amigable.',
    });
  }

  const maxCuotas = Math.min(6, Math.max(2, context.maxCuotas ?? 3));
  const tools: Anthropic.Tool[] = context.allowPlan ? [
    {
      name: 'propose_payment_plan',
      description: 'Registra el plan de pago acordado con el cliente (cuotas mensuales que suman el saldo). Llamar SOLO cuando el cliente ya aceptó.',
      input_schema: {
        type: 'object',
        properties: {
          cuotas: { type: 'integer', description: `Número de cuotas mensuales (2 a ${maxCuotas})` },
          monto_cuota: { type: 'number', description: 'Monto de cada cuota (saldo / cuotas)' },
        },
        required: ['cuotas', 'monto_cuota'],
      },
    },
  ] : [];

  const captura: { plan?: PlanPropuesto } = {};

  try {
    let response = await anthropic.messages.create({
      model: MODEL(), max_tokens: 1024, system: systemPrompt, messages,
      ...(tools.length ? { tools } : {}),
    });
    await trackExternalUsage({
      orgId: context.orgId, provider: 'anthropic', category: 'ai',
      operation: 'collection_agent_turn',
      inputTokens: Number(response.usage?.input_tokens || 0),
      outputTokens: Number(response.usage?.output_tokens || 0),
      metadata: { model: MODEL(), turn: 1 },
    });

    // Mini-loop de 2 turnos: si el modelo usa la herramienta, se ejecuta con
    // validación real y se le regresa el tool_result para que redacte el correo
    // final CON conocimiento del resultado.
    if (response.stop_reason === 'tool_use' && tools.length) {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use' && block.name === 'propose_payment_plan') {
          const result = await executeProposePlan(context, block.input, captura);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }
      if (toolResults.length) {
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });
        response = await anthropic.messages.create({
          model: MODEL(), max_tokens: 1024, system: systemPrompt, messages, tools,
          tool_choice: { type: 'none' },
        });
        await trackExternalUsage({
          orgId: context.orgId, provider: 'anthropic', category: 'ai',
          operation: 'collection_agent_turn',
          inputTokens: Number(response.usage?.input_tokens || 0),
          outputTokens: Number(response.usage?.output_tokens || 0),
          metadata: { model: MODEL(), turn: 2 },
        });
      }
    }

    let finalMessage = '';
    for (const block of response.content) {
      if (block.type === 'text') finalMessage += block.text;
    }
    if (!finalMessage.trim()) finalMessage = fallback;

    void flushUsageReservation(context.orgId, usage.id);

    // ⚠️ La persistencia del mensaje la hace el LLAMADOR (cobranza-run), porque
    // el `estado` depende del modo de la org (borrador vs. enviado) y del
    // resultado del envío. Antes se insertaba aquí a ciegas como 'enviado'.
    return { ok: true, mensaje: finalMessage, plan: captura.plan };

  } catch (error: any) {
    await cancelUsage(context.orgId, usage.id);
    await trackExternalUsage({
      orgId: context.orgId, provider: 'anthropic', category: 'ai',
      operation: 'collection_agent_turn', status: 'failure',
    });
    console.error('Error running AR Agent:', error);
    return { ok: false, mensaje: fallback, error: error?.message ?? 'fallo del modelo', plan: captura.plan };
  }
}
