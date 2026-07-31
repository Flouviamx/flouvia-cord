import { PostHog } from 'posthog-node';

const key = import.meta.env.PUBLIC_POSTHOG_KEY || process.env.PUBLIC_POSTHOG_KEY || '';
const host = import.meta.env.PUBLIC_POSTHOG_HOST || process.env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

// Instantiate PostHog only if key is present
export const posthogServer = key ? new PostHog(key, { host }) : null;

// Strongly typed tracking for the backend
export function trackPaymentReceived(
    orgId: string,
    amount: number,
    currency: string,
    paymentMethod: string,
    isRecurring: boolean,
    quoteId?: string,
    quoteFolio?: string
): void {
    if (!posthogServer) return;
    
    posthogServer.capture({
        distinctId: `org_${orgId}`, // On the backend without a user session, we attribute to the org
        event: 'payment_received',
        properties: {
            company: orgId, // Group analytics
            amount,
            currency,
            payment_method: paymentMethod,
            is_recurring: isRecurring,
            source: 'backend_webhook',
            quote_id: quoteId,
            quote_folio: quoteFolio
        }
    });
}
