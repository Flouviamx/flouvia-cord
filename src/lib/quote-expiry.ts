// Lo que pasa cuando una cotización vence: evento, bitácora, webhook y
// analítica. Lo usan el cron y el simulador del modo prueba, así que un
// vencimiento simulado recorre exactamente el mismo camino que uno real.
import { sql, logAudit, withOrgTx } from './db';
import { dispatchQuoteEvent } from './webhooks';
import { trackServer } from './posthog-server';

export interface QuoteExpiredRow {
    id: string;
    org_id: string;
    folio: string;
    total: unknown;
    base_currency: string | null;
    sent_at: string | null;
}

export async function registrarVencimiento(row: QuoteExpiredRow, flags: { isSandbox: boolean; isDemo: boolean }): Promise<void> {
    const orgId = row.org_id;
    const id = row.id;
    await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
              values (${orgId}, ${id}, 'expired', 'Cotización vencida — pasó su fecha de vigencia sin decisión del cliente')`);
    await logAudit(orgId, { accion: 'cotizacion.vencida', entidad: 'cotizacion', entidad_id: id, detalle: row.folio });
    await dispatchQuoteEvent(orgId, id, 'quote.expired');
    await trackServer('quote_expired', orgId, {
        event_id: id,
        quote_id: id,
        total: Number(row.total ?? 0),
        currency: row.base_currency || 'MXN',
        days_since_sent: row.sent_at
            ? Math.max(0, Math.round((Date.now() - new Date(row.sent_at).getTime()) / 86400000))
            : undefined,
    }, flags.isSandbox, flags.isDemo);
}
