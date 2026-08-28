export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { confirmMarketingContact, hashConfirmationToken, isConfirmationToken } from '../../../lib/blog-newsletter';
import { rateLimit } from '../../../lib/ratelimit';
import { trustedIp } from '../../../lib/ip';
import { log } from '../../../lib/log';

function resultPath(locale: string, status: string): string {
    const page = locale === 'en' ? '/en/blog/subscription' : '/blog/suscripcion';
    return `${page}?status=${encodeURIComponent(status)}`;
}

export const GET: APIRoute = async ({ request, redirect, url }) => {
    const rl = await rateLimit(`blog-confirm:${trustedIp(request)}`, 20, 60);
    if (!rl.ok) return redirect(resultPath('es', 'rate-limited'), 302);

    const token = url.searchParams.get('token') || '';
    if (!isConfirmationToken(token)) return redirect(resultPath('es', 'invalid'), 302);
    const tokenHash = hashConfirmationToken(token);

    const rows = await sql`
        select email, locale, status, confirmation_expires_at
        from blog_subscribers
        where confirmation_token_hash = ${tokenHash}
        limit 1`;
    const subscriber = rows[0] as any;
    if (!subscriber) return redirect(resultPath('es', 'invalid'), 302);
    if (subscriber.status === 'confirmed') return redirect(resultPath(subscriber.locale, 'already-confirmed'), 302);
    if (subscriber.confirmation_expires_at && new Date(subscriber.confirmation_expires_at).getTime() <= Date.now()) {
        return redirect(resultPath(subscriber.locale, 'expired'), 302);
    }

    const synced = await confirmMarketingContact(subscriber.email, subscriber.locale === 'en' ? 'en' : 'es');
    if (!synced.ok) {
        log.error('no se pudo confirmar el contacto en Resend Marketing', {
            route: 'blog/confirm', status: synced.status, providerError: synced.error,
        });
        return redirect(resultPath(subscriber.locale, 'unavailable'), 302);
    }

    try {
        await sql`
            update blog_subscribers
            set status = 'confirmed',
                confirmed_at = coalesce(confirmed_at, now()),
                unsubscribed_at = null,
                resend_contact_id = coalesce(${synced.id || null}, resend_contact_id),
                resend_synced_at = now(),
                updated_at = now()
            where confirmation_token_hash = ${tokenHash}`;
    } catch (error: any) {
        // Resend ya quedó confirmado. El mismo enlace es idempotente y puede
        // reintentarse para completar el espejo local cuando Neon se recupere.
        log.error('contacto confirmado en Resend pero no en Neon', {
            route: 'blog/confirm', err: error,
        });
        return redirect(resultPath(subscriber.locale, 'unavailable'), 302);
    }

    return redirect(resultPath(subscriber.locale, 'confirmed'), 302);
};
