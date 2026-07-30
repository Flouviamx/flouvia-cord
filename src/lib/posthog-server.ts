import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

/**
 * Returns the singleton server-side PostHog client.
 * Returns null when POSTHOG_PROJECT_TOKEN is not configured.
 */
export function getPostHogServer(): PostHog | null {
    const token = import.meta.env.POSTHOG_PROJECT_TOKEN || process.env.POSTHOG_PROJECT_TOKEN;
    const host = import.meta.env.POSTHOG_HOST || process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

    if (!token) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(
                'POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, ' +
                'this causes events to be silently missed. ' +
                'This error stops appearing once POSTHOG_PROJECT_TOKEN is configured'
            );
        }
        return null;
    }

    if (!posthogClient) {
        posthogClient = new PostHog(token, {
            host,
            // Flush immediately — SSR endpoints are short-lived; an unflushed
            // batched event is silently dropped when the invocation ends.
            flushAt: 1,
            flushInterval: 0,
        });
    }
    return posthogClient;
}
