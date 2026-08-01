import { PostHog } from 'posthog-node';

const key = import.meta.env.PUBLIC_POSTHOG_KEY || process.env.PUBLIC_POSTHOG_KEY || '';
const host = import.meta.env.PUBLIC_POSTHOG_HOST || process.env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

// Instantiate once per runtime. Serverless handlers flush before returning so
// important business events are not lost when Vercel tears down the invocation.
export const posthogServer = key ? new PostHog(key, {
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
): Promise<void> {
    if (!posthogServer) return;
    posthogServer.capture({
        // This is a server-side business event, not a person event. It remains
        // attributable to the organization without creating a synthetic person.
        distinctId: `organization:${orgId}`,
        event: 'payment_received',
        groups: { company: orgId },
        properties: {
            amount,
            currency,
            payment_method: paymentMethod,
            is_recurring: isRecurring,
            source: 'stripe_webhook',
            quote_id: quoteId,
            $process_person_profile: false,
        }
    });
    await posthogServer.flush();
}
