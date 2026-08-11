const OPS_SLACK_WEBHOOK_URL = import.meta.env.OPS_SLACK_WEBHOOK_URL || process.env.OPS_SLACK_WEBHOOK_URL;

/** Alerta de plataforma best-effort. Nunca incluye secretos ni datos de clientes. */
export async function sendOpsAlert(title: string, detail: string): Promise<boolean> {
    if (!OPS_SLACK_WEBHOOK_URL) return false;
    try {
        const response = await fetch(OPS_SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: `Cord Ops: ${title}\n${detail}` }),
            signal: AbortSignal.timeout(5_000),
        });
        return response.ok;
    } catch {
        return false;
    }
}
