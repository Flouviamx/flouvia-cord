import { sql } from '../db';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '',
});

export interface CashFlowPrediction {
  date: string;
  expectedAmount: number;
  optimisticAmount: number;
  conservativeAmount: number;
  contributingQuotes: { id: string; folio: string; empresa: string; amount: number; probability: number }[];
}

export async function getCashFlowPrediction(orgId: string): Promise<{
  predictions: CashFlowPrediction[],
  aiSummary: string
}> {
  // 1. Obtener historial de pagos por cliente para calcular el delay promedio
  const paymentHistory = await sql`
    SELECT 
      c.cliente_id,
      AVG(EXTRACT(EPOCH FROM (c.paid_at - c.vigencia)) / 86400) as avg_delay_days
    FROM cotizaciones c
    WHERE c.org_id = ${orgId}
      AND c.status = 'paid'
      AND c.paid_at IS NOT NULL
      AND c.vigencia IS NOT NULL
    GROUP BY c.cliente_id
  `;

  const delayByClient: Record<string, number> = {};
  paymentHistory.forEach(row => {
    delayByClient[row.cliente_id] = parseFloat(row.avg_delay_days) || 0;
  });

  // 2. Obtener el pipeline actual (sent, viewed, approved, invoiced)
  const pipeline = await sql`
    SELECT 
      c.id, c.folio, c.cliente_id, c.status, c.total, c.vigencia, cl.empresa
    FROM cotizaciones c
    JOIN clientes cl ON c.cliente_id = cl.id
    WHERE c.org_id = ${orgId}
      AND c.status IN ('sent', 'viewed', 'approved', 'invoiced')
      AND c.paid_at IS NULL
  `;

  const predictionsMap: Record<string, CashFlowPrediction> = {};

  // Inicializar próximos 90 días
  const today = new Date();
  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    predictionsMap[dateStr] = {
      date: dateStr,
      expectedAmount: 0,
      optimisticAmount: 0,
      conservativeAmount: 0,
      contributingQuotes: []
    };
  }

  // 3. Proyectar cada cotización
  pipeline.forEach(quote => {
    const baseDate = quote.vigencia ? new Date(quote.vigencia) : new Date();
    const delay = delayByClient[quote.cliente_id] || 15; // Asumir 15 días si no hay historial
    
    const expectedPaymentDate = new Date(baseDate);
    expectedPaymentDate.setDate(expectedPaymentDate.getDate() + delay);
    
    // Si la fecha esperada ya pasó, la movemos a mañana
    if (expectedPaymentDate <= today) {
      expectedPaymentDate.setDate(today.getDate() + 1);
    }

    const dateStr = expectedPaymentDate.toISOString().split('T')[0];
    
    if (predictionsMap[dateStr]) {
      const amount = parseFloat(quote.total);
      
      // Calcular probabilidad según status
      let probability = 0.3; // sent
      if (quote.status === 'viewed') probability = 0.5;
      if (quote.status === 'approved') probability = 0.8;
      if (quote.status === 'invoiced') probability = 0.95;

      const expected = amount * probability;
      
      predictionsMap[dateStr].expectedAmount += expected;
      predictionsMap[dateStr].optimisticAmount += amount * Math.min(1, probability + 0.2);
      predictionsMap[dateStr].conservativeAmount += amount * Math.max(0, probability - 0.2);
      
      predictionsMap[dateStr].contributingQuotes.push({
        id: quote.id,
        folio: quote.folio,
        empresa: quote.empresa,
        amount,
        probability
      });
    }
  });

  const predictions = Object.values(predictionsMap).sort((a, b) => a.date.localeCompare(b.date));

  // 4. Generar resumen con IA
  let aiSummary = "No hay suficientes datos para generar un análisis predictivo.";
  
  if (pipeline.length > 0) {
    const promptData = predictions.filter(p => p.expectedAmount > 0).map(p => ({
      fecha: p.date,
      esperado: p.expectedAmount,
      facturas_clave: p.contributingQuotes.map(q => q.empresa)
    }));

    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 300,
        system: "Eres el CFO (Director Financiero) AI de la empresa. Analiza la proyección de flujo de caja y da 2-3 oraciones clave. Sé muy directo y profesional.",
        messages: [{
          role: 'user',
          content: `Proyección de cobros: ${JSON.stringify(promptData.slice(0, 30))}`
        }]
      });
      if (response.content[0].type === 'text') {
         aiSummary = response.content[0].text;
      }
    } catch (e) {
      console.error("AI Summary error", e);
    }
  }

  return { predictions, aiSummary };
}
