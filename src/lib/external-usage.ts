import { sql, withOrgTx } from './db';

export interface ExternalUsageEvent {
  orgId?: string | null;
  provider: 'anthropic' | 'resend' | 'facturapi' | 'stripe' | 'webhook' | string;
  category: 'ai' | 'email' | 'fiscal' | 'payments' | 'egress' | string;
  operation: string;
  units?: number;
  inputTokens?: number;
  outputTokens?: number;
  status?: 'success' | 'failure' | 'skipped';
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Telemetría best-effort de costo. No acepta bodies, prompts, destinatarios,
 * llaves ni respuestas del proveedor para que Ops nunca se convierta en una
 * segunda base de secretos o PII.
 */
export async function trackExternalUsage(event: ExternalUsageEvent): Promise<void> {
  // Los eventos sin organización (por ejemplo, correos de autenticación) no se
  // mezclan con telemetría comercial. La tabla tiene RLS forzado y cada alta
  // debe ocurrir dentro del contexto exacto de su tenant.
  if (!event.orgId) return;
  try {
    await withOrgTx(event.orgId, sql`
      insert into external_usage_events (
        org_id, provider, category, operation, units, input_tokens,
        output_tokens, status, metadata
      ) values (
        ${event.orgId}, ${event.provider}, ${event.category}, ${event.operation},
        ${Math.max(0, Math.round(event.units ?? 1))},
        ${Math.max(0, Math.round(event.inputTokens ?? 0))},
        ${Math.max(0, Math.round(event.outputTokens ?? 0))},
        ${event.status ?? 'success'}, ${JSON.stringify(event.metadata ?? {})}::jsonb
      )
    `);
  } catch {
    // Medir jamás bloquea la operación externa que estamos observando.
  }
}
