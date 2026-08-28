// POST /api/blog/subscribe
// Inicia un doble opt-in para Resend Marketing. Un correo no entra al segmento
// hasta abrir el enlace de confirmación; Neon conserva el registro de consentimiento.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import {
    createConfirmationToken,
    marketingConfig,
    normalizeBlogLocale,
    publicSiteOrigin,
    sendBlogConfirmation,
} from '../../../lib/blog-newsletter';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { trustedIp } from '../../../lib/ip';
import { log } from '../../../lib/log';

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const CONFIRMATION_TTL_HOURS = 24;
const RESEND_COOLDOWN_MINUTES = 2;

export const POST: APIRoute = async ({ request }) => {
    const rl = await rateLimit(`blog-sub:${trustedIp(request)}`, 5, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'invalid_request' }, 400);
    }

    const email = String(body.email ?? '').trim().toLowerCase().slice(0, 160);
    const locale = normalizeBlogLocale(body.locale);
    if (!isEmail(email)) return json({ error: 'invalid_email' }, 400);
    if (body.website) return json({ ok: true, state: 'pending' });

    if (!marketingConfig()) {
        log.error('Resend Marketing no está configurado', { route: 'blog/subscribe' });
        return json({ error: 'service_unavailable' }, 503);
    }

    try {
        const existing = await sql`
            select status, confirmation_sent_at
            from blog_subscribers
            where email = ${email}
            limit 1`;
        const subscriber = existing[0] as any;

        // La respuesta no revela si una dirección forma parte de la lista.
        if (subscriber?.status === 'confirmed') return json({ ok: true, state: 'pending' });
        if (subscriber?.confirmation_sent_at) {
            const sentAt = new Date(subscriber.confirmation_sent_at).getTime();
            if (Date.now() - sentAt < RESEND_COOLDOWN_MINUTES * 60_000) {
                return json({ ok: true, state: 'pending' });
            }
        }

        const { token, hash } = createConfirmationToken();
        const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_HOURS * 60 * 60 * 1000);
        await sql`
            insert into blog_subscribers (
                email, locale, status, confirmation_token_hash,
                confirmation_expires_at, updated_at
            ) values (
                ${email}, ${locale}, 'pending', ${hash}, ${expiresAt}, now()
            )
            on conflict (email) do update set
                locale = excluded.locale,
                status = 'pending',
                confirmation_token_hash = excluded.confirmation_token_hash,
                confirmation_expires_at = excluded.confirmation_expires_at,
                confirmation_sent_at = null,
                updated_at = now()`;

        const origin = import.meta.env.PROD ? publicSiteOrigin() : new URL(request.url).origin;
        const confirmUrl = new URL('/api/blog/confirm', origin);
        confirmUrl.searchParams.set('token', token);
        const sent = await sendBlogConfirmation(email, locale, confirmUrl.toString());
        if (!sent.ok) {
            log.error('no se pudo enviar el doble opt-in del blog', {
                route: 'blog/subscribe', status: sent.status, providerError: sent.error,
            });
            return json({ error: 'delivery_failed' }, 502);
        }

        try {
            await sql`
                update blog_subscribers
                set confirmation_sent_at = now(), updated_at = now()
                where email = ${email} and confirmation_token_hash = ${hash}`;
        } catch (error: any) {
            // El correo ya salió y el token ya quedó persistido. No le pedimos
            // al visitante reintentar, porque eso podría mandar un duplicado.
            log.warn('confirmación enviada pero no se pudo guardar sent_at', {
                route: 'blog/subscribe', err: error,
            });
        }

        return json({ ok: true, state: 'pending' });
    } catch (error: any) {
        log.error('no se pudo iniciar la suscripción al blog', { route: 'blog/subscribe', err: error });
        return json({ error: 'service_unavailable' }, 503);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        },
    });
}
