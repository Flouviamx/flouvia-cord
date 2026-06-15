// src/lib/slack.ts
// Notificaciones SALIENTES a Slack vía Incoming Webhook. Cuando algo le pasa a una
// cotización (enviada, vista, aprobada, pagada…) posteamos un mensaje al canal que
// la org conectó en Ajustes › Integraciones (orgs.slack_webhook_url).
//
// REGLA DE ORO (igual que webhooks): nunca lanza. Un fallo de Slack jamás rompe la
// operación de negocio.

const money = (n: number) => '$' + new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(n ?? 0));

// Texto + emoji por evento de cotización.
const EVENT_MSG: Record<string, { emoji: string; verbo: string }> = {
    'quote.sent':      { emoji: '📤', verbo: 'enviada' },
    'quote.viewed':    { emoji: '👀', verbo: 'vista por el cliente' },
    'quote.approved':  { emoji: '✅', verbo: 'APROBADA' },
    'quote.rejected':  { emoji: '❌', verbo: 'rechazada' },
    'quote.paid':      { emoji: '💰', verbo: 'PAGADA' },
    'invoice.stamped': { emoji: '🧾', verbo: 'facturada (CFDI)' },
    'ping':            { emoji: '🔔', verbo: 'de prueba' },
};

export interface SlackPayload {
    folio: string;
    cliente: string | null;
    total: number;
    link?: string | null;
}

/** Construye y envía el mensaje. Devuelve ok/status sin lanzar. */
export async function postToSlack(webhookUrl: string, evento: string, data: SlackPayload): Promise<{ ok: boolean; status: number }> {
    const meta = EVENT_MSG[evento] || { emoji: '🔔', verbo: evento };
    const lineas = [
        `${meta.emoji} Cotización *${data.folio}* ${meta.verbo}`,
        `Cliente: ${data.cliente || '—'} · Total: *${money(data.total)}*`,
    ];
    if (data.link) lineas.push(`<${data.link}|Ver cotización>`);
    const body = JSON.stringify({ text: lineas.join('\n') });

    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(webhookUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal,
        });
        clearTimeout(t);
        return { ok: res.ok, status: res.status };
    } catch {
        return { ok: false, status: 0 };
    }
}
