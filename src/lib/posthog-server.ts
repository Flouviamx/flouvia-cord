import { PostHog } from 'posthog-node';
import { isInternalAnalyticsEmail, isInternalAnalyticsOrg } from './analytics-internal';
import { ANALYTICS_EVENTS, ANALYTICS_VERSION } from './analytics-events';
import type { EventProps, OrgEvent, ServerEvent, UserEvent } from './analytics-events';

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

// El tráfico del equipo interno de Cord ya NO se descarta: se ETIQUETA
// (`is_internal: true` en el evento + `$internal_or_test_user` en el grupo
// `company`) y PostHog lo esconde de los dashboards con "filter test accounts".
// Descartarlo dejó el carril de Ops invisible para depurar y "no llegó el
// evento" era indistinguible de "el evento no se emite".
const groupTagged = new Set<string>();

function markCompanyInternal(orgId: string): void {
    if (!posthogServer || !orgId || groupTagged.has(orgId)) return;
    groupTagged.add(orgId);
    posthogServer.groupIdentify({
        groupType: 'company',
        groupKey: orgId,
        properties: { $internal_or_test_user: true },
    });
}

// ── Ingreso confirmado ─────────────────────────────────────────────────────
// `metadata.payment_id` es OBLIGATORIO a nivel de tipo: de él sale el
// `$insert_id` estable, y sin él un reintento de webhook de Stripe cuenta el
// ingreso dos veces.
export async function trackPaymentReceived(
    orgId: string,
    amount: number,
    currency: string,
    paymentMethod: string,
    isRecurring: boolean,
    quoteId?: string,
    isSandbox = false,
    isDemo = false,
    metadata: { payment_id: string } & Partial<EventProps<'payment_received'>> = { payment_id: '' },
): Promise<void> {
    if (!posthogServer) return;
    const internal = await isInternalAnalyticsOrg(orgId);
    if (internal) markCompanyInternal(orgId);
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
            is_internal: internal,
            analytics_version: ANALYTICS_VERSION,
            $process_person_profile: false,
        },
    });
    await posthogServer.flush();
}

// ── Eventos a nivel ORGANIZACIÓN ───────────────────────────────────────────
// Activación / adopción / expansión — nunca dinero real, para eso está
// `trackPaymentReceived`. `distinctId` sintético `organization:<id>`, grupo
// `company`, tagging obligatorio de is_sandbox/is_demo/is_internal.
export async function trackServer<E extends ServerEvent & OrgEvent>(
    event: E,
    orgId: string,
    properties: EventProps<E>,
    isSandbox = false,
    isDemo = false,
): Promise<void> {
    if (!posthogServer) return;
    const internal = await isInternalAnalyticsOrg(orgId);
    if (internal) markCompanyInternal(orgId);
    const props = properties as Record<string, unknown>;
    // El `$insert_id` sale de la propiedad que el catálogo declara como clave de
    // idempotencia (`event_id` para casi todos; `payout_id`/`refund_id`/… para
    // los eventos de Stripe cuyo id natural no es un UUID de Cord).
    const idProp = ANALYTICS_EVENTS[event]?.insertIdFrom ?? 'event_id';
    const insertId = typeof props[idProp] === 'string' ? String(props[idProp]).trim() : '';
    posthogServer.capture({
        distinctId: `organization:${orgId}`,
        event,
        groups: { company: orgId },
        properties: {
            ...props,
            ...(insertId ? { $insert_id: `${event}:${insertId}` } : {}),
            is_sandbox: isSandbox,
            is_demo: isDemo,
            is_internal: internal,
            analytics_version: ANALYTICS_VERSION,
            $process_person_profile: false,
        },
    });
    await posthogServer.flush();
}

// ── Eventos a nivel PERSONA ────────────────────────────────────────────────
// Solo el registro (`sign_up_completed`). Conserva el perfil de persona: sin él
// PostHog no puede atribuir la adquisición (`$initial_utm_*` capturados en el
// primer pageview anónimo y fijados en el `identify()`). En el callback de OAuth
// la organización aún no existe, así que lo interno se resuelve por correo.
export async function trackUser<E extends UserEvent>(
    event: E,
    userId: string,
    properties: EventProps<E>,
    ctx: { email?: string | null; orgId?: string; isSandbox?: boolean; isDemo?: boolean } = {},
): Promise<void> {
    if (!posthogServer || !userId) return;
    const internal = ctx.orgId
        ? await isInternalAnalyticsOrg(ctx.orgId)
        : isInternalAnalyticsEmail(ctx.email);
    if (internal && ctx.orgId) markCompanyInternal(ctx.orgId);
    posthogServer.capture({
        distinctId: userId,
        event,
        ...(ctx.orgId ? { groups: { company: ctx.orgId } } : {}),
        properties: {
            ...(properties as Record<string, unknown>),
            is_sandbox: !!ctx.isSandbox,
            is_demo: !!ctx.isDemo,
            is_internal: internal,
            analytics_version: ANALYTICS_VERSION,
            ...(internal ? { $set: { $internal_or_test_user: true } } : {}),
        },
    });
    await posthogServer.flush();
}
