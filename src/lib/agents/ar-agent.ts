import Anthropic from '@anthropic-ai/sdk';
import { sql } from '../db';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '',
});

export interface ARContext {
  cotizacionId: string;
  orgId: string;
  clienteNombre: string;
  clienteEmail: string;
  montoAdeudado: number;
  diasVencido: number;
  historialConversacion: { rol: 'user' | 'assistant', contenido: string }[];
}

export async function runARAgent(context: ARContext): Promise<string> {
  const systemPrompt = `
Eres un especialista en Cuentas por Cobrar (Accounts Receivable) trabajando para una empresa B2B.
Tu objetivo es lograr que el cliente pague la factura vencida, manteniendo una relación profesional y cordial.
El cliente es ${context.clienteNombre}.
Monto adeudado: $${context.montoAdeudado.toFixed(2)}
Días de atraso: ${context.diasVencido}

Reglas:
1. Sé profesional y empático.
2. Si el cliente tiene problemas de flujo de caja, puedes ofrecerle un plan de pago de hasta 3 cuotas mensuales. Usa la herramienta 'propose_payment_plan' si acuerdan un plan.
3. El cliente no puede recibir descuentos sobre el monto principal.
4. Redacta tu respuesta como el cuerpo de un correo electrónico.
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

  try {
    const response = await anthropic.messages.create({
      model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages,
      tools: [
        {
          name: 'propose_payment_plan',
          description: 'Propone un plan de pago al cliente en la base de datos.',
          input_schema: {
            type: 'object',
            properties: {
              cuotas: { type: 'integer', description: 'Número de cuotas mensuales (máx 3)' },
              monto_cuota: { type: 'number', description: 'Monto de cada cuota' }
            },
            required: ['cuotas', 'monto_cuota']
          }
        }
      ]
    });

    let finalMessage = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        finalMessage += block.text;
      } else if (block.type === 'tool_use') {
        if (block.name === 'propose_payment_plan') {
          const { cuotas, monto_cuota } = block.input as { cuotas: number, monto_cuota: number };
          
          await sql`
            INSERT INTO planes_pago_negociados (org_id, cotizacion_id, cuotas, monto_cuota, estado)
            VALUES (${context.orgId}, ${context.cotizacionId}, ${cuotas}, ${monto_cuota}, 'propuesto')
          `;
          
          finalMessage += `\n\n[Sistema: El agente ha propuesto formalmente un plan de pago de ${cuotas} cuotas de $${monto_cuota.toFixed(2)}]`;
        }
      }
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
