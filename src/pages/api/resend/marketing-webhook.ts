export const prerender = false;

import type { APIRoute } from 'astro';
import { Webhook } from 'svix';
import { sql } from '../../../lib/db';
import { log } from '../../../lib/log';

const WEBHOOK_SECRET = import.meta.env.RESEND_MARKETING_WEBHOOK_SECRET
    || process.env.RESEND_MARKETING_WEBHOOK_SECRET;

interface ContactEvent {
    type: 'contact.created' | 'contact.updated' | 'contact.deleted';
    created_at: string;
    data: {
        id?: string;
        email?: string;
        unsubscribed?: boolean;
        updated_at?: string;
    };
}

export const POST: APIRoute = async ({ request }) => {
    if (!WEBHOOK_SECRET) {
        log.error('webhook de Resend Marketing sin secreto configurado', { route: 'resend/marketing-webhook' });
        return new Response('Unavailable', { status: 503 });
    }

    const id = request.headers.get('svix-id');
    const timestamp = request.headers.get('svix-timestamp');
    const signature = request.headers.get('svix-signature');
    if (!id || !timestamp || !signature) return new Response('Invalid webhook', { status: 400 });

    const payload = await request.text();
    let event: ContactEvent;
    try {
        event = new Webhook(WEBHOOK_SECRET).verify(payload, {
            'svix-id': id,
            'svix-timestamp': timestamp,
            'svix-signature': signature,
        }) as ContactEvent;
    } catch {
        return new Response('Invalid webhook', { status: 400 });
    }

    if (!['contact.created', 'contact.updated', 'contact.deleted'].includes(event.type)) {
        return new Response('OK', { status: 200 });
    }
    const email = String(event.data?.email || '').trim().toLowerCase();
    if (!email) return new Response('OK', { status: 200 });

    const providerUpdatedAt = event.data?.updated_at || event.created_at;
    const unsubscribed = event.type === 'contact.deleted' || event.data?.unsubscribed === true;
    await sql`
        update blog_subscribers
        set status = ${unsubscribed ? 'unsubscribed' : 'confirmed'},
            unsubscribed_at = ${unsubscribed ? new Date(providerUpdatedAt) : null},
            resend_contact_id = coalesce(${event.data?.id || null}, resend_contact_id),
            resend_synced_at = now(),
            resend_updated_at = ${new Date(providerUpdatedAt)},
            updated_at = now()
        where (resend_contact_id = ${event.data?.id || null} or email = ${email})
          and (resend_updated_at is null or resend_updated_at <= ${new Date(providerUpdatedAt)})`;

    return new Response('OK', { status: 200 });
};
