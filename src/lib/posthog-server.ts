// src/lib/posthog-server.ts — cliente PostHog server-side (singleton).
// Usado en API routes para capturar eventos desde el servidor sin crear
// múltiples instancias. flushAt:1 + flushInterval:0 garantizan que los
// eventos se envíen antes de que el request finalice (pattern SSR/serverless).
import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

export function getPostHogServer(): PostHog {
    const token = import.meta.env.POSTHOG_PROJECT_TOKEN || process.env.POSTHOG_PROJECT_TOKEN || '';
    const host = import.meta.env.POSTHOG_HOST || process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

    if (!token && (import.meta.env.DEV || import.meta.env.MODE === 'development')) {
        console.warn(
            'POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, ' +
            'this causes events to be silently missed. This error stops appearing once POSTHOG_PROJECT_TOKEN is configured'
        );
    }

    if (!posthogClient) {
        posthogClient = new PostHog(token, {
            host,
            flushAt: 1,
            flushInterval: 0,
        });
    }
    return posthogClient;
}
