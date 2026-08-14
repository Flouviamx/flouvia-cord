import { PostHog } from 'posthog-node';
import { isInternalAnalyticsOrg } from './analytics-internal';

const key = import.meta.env.PUBLIC_POSTHOG_KEY || process.env.PUBLIC_POSTHOG_KEY || '';
const host = import.meta.env.PUBLIC_POSTHOG_HOST || process.env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
const captureDisabled = import.meta.env.DEV
    || String(import.meta.env.POSTHOG_DISABLE_CAPTURE || process.env.POSTHOG_DISABLE_CAPTURE || '').toLowerCase() === 'true';

// Instantiate once per runtime. Serverless handlers flush before returning so
// important business events are not lost when Vercel tears down the invocation.
export const posthogServer = key && !captureDisabled ? new PostHog(key, {
    host,
    enableExceptionAutocapture: true,
    flushAt: 1,
    flushInterval: 0,
}) : null;

// Strongly typed tracking for the backend
export async function trackPaymentReceived(
    orgId: string,
    amount: number,
    currency: string,
    paymentMethod: string,
    isRecurring: boolean,
    quoteId?: string,
    isSandbox = false,
    isDemo = false,
    metadata: Record<string, unknown> = {},
): Promise<void> {
    if (!posthogServer || await isInternalAnalyticsOrg(orgId)) return;
    const paymentId = typeof metadata.payment_id === 'string' ? metadata.payment_id.trim() : '';
    posthogServer.capture({
        // This is a server-side business event, not a person event. It remains
        // attributable to the organization without creating a synthetic person.
        distinctId: `organization:${orgId}`,
        event: 'payment_received',
        groups: { company: orgId },
        properties: {
            ...metadata,
            ...(paymentId ? { $insert_id: `payment_received:${paymentId}` } : {}),
            amount,
            currency,
            payment_method: paymentMethod,
            is_recurring: isRecurring,
            source: 'stripe_webhook',
            quote_id: quoteId,
            // Nunca dejar que actividad del "Entorno de prueba" (org sandbox espejo)
            // ni de la org demo permanente se cuele como ingreso real en dashboards.
            is_sandbox: isSandbox,
            is_demo: isDemo,
            analytics_version: 2,
            $process_person_profile: false,
        }
    });
    await posthogServer.flush();
}

// Tracker genérico server-side para eventos a nivel ORG (activación/adopción/
// expansión — nunca dinero real, para eso usar trackPaymentReceived). Mismo
// contrato de identidad (persona sintética `organization:<id>`, grupo `company`)
// y mismo tagging obligatorio de is_sandbox/is_demo que trackPaymentReceived.
export async function trackServer(
    event: string,
    orgId: string,
    properties?: Record<string, unknown>,
    isSandbox = false,
    isDemo = false,
): Promise<void> {
    if (!posthogServer || await isInternalAnalyticsOrg(orgId)) return;
    const eventId = typeof properties?.event_id === 'string' ? properties.event_id.trim() : '';
    posthogServer.capture({
        distinctId: `organization:${orgId}`,
        event,
        groups: { company: orgId },
        properties: {
            ...properties,
            ...(eventId ? { $insert_id: `${event}:${eventId}` } : {}),
            is_sandbox: isSandbox,
            is_demo: isDemo,
            analytics_version: 2,
            $process_person_profile: false,
        },
    });
    await posthogServer.flush();
}
