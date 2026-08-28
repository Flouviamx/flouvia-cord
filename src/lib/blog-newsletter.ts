import { createHash, randomBytes } from 'node:crypto';

const RESEND_API = 'https://api.resend.com';

const SEND_KEY = import.meta.env.RESEND_MARKETING_SEND_API_KEY
    || process.env.RESEND_MARKETING_SEND_API_KEY;
const CONTACTS_KEY = import.meta.env.RESEND_MARKETING_CONTACTS_API_KEY
    || process.env.RESEND_MARKETING_CONTACTS_API_KEY;
const MARKETING_FROM = import.meta.env.RESEND_MARKETING_FROM
    || process.env.RESEND_MARKETING_FROM
    || 'Cord Blog <blog@updates.cordhq.app>';
const SEGMENT_ES = import.meta.env.RESEND_MARKETING_SEGMENT_ES
    || process.env.RESEND_MARKETING_SEGMENT_ES;
const SEGMENT_EN = import.meta.env.RESEND_MARKETING_SEGMENT_EN
    || process.env.RESEND_MARKETING_SEGMENT_EN;

export type BlogLocale = 'es' | 'en';

export interface MarketingConfig {
    sendKey: string;
    contactsKey: string;
    from: string;
    segmentEs: string;
    segmentEn: string;
}

export interface MarketingResult {
    ok: boolean;
    id?: string;
    error?: string;
    status?: number;
}

export function marketingConfig(): MarketingConfig | null {
    if (!SEND_KEY || !CONTACTS_KEY || !SEGMENT_ES || !SEGMENT_EN) return null;
    return {
        sendKey: SEND_KEY,
        contactsKey: CONTACTS_KEY,
        from: MARKETING_FROM,
        segmentEs: SEGMENT_ES,
        segmentEn: SEGMENT_EN,
    };
}

export function publicSiteOrigin(): string {
    return (import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || 'https://cordhq.app').replace(/\/$/, '');
}

export function normalizeBlogLocale(value: unknown): BlogLocale {
    return value === 'en' ? 'en' : 'es';
}

export function createConfirmationToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: hashConfirmationToken(token) };
}

export function hashConfirmationToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isConfirmationToken(value: string): boolean {
    return /^[A-Za-z0-9_-]{43}$/.test(value);
}

function htmlEscape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    })[character] || character);
}

function confirmationEmail(locale: BlogLocale, confirmUrl: string) {
    const safeUrl = htmlEscape(confirmUrl);
    const es = locale === 'es';
    const subject = es ? 'Confirma tu suscripción al Blog de Cord' : 'Confirm your Cord Blog subscription';
    const title = es ? 'Confirma tu correo.' : 'Confirm your email.';
    const body = es
        ? 'Confirma tu correo para recibir artículos sobre ventas, cobranza y facturación. Solo escribiremos cuando haya algo que valga la pena leer.'
        : 'Confirm your email to receive articles about sales, collections, and invoicing. We will only write when there is something worth reading.';
    const button = es ? 'Confirmar suscripción' : 'Confirm subscription';
    const expiry = es ? 'Este enlace vence en 24 horas.' : 'This link expires in 24 hours.';
    const ignore = es
        ? 'Si no solicitaste esta suscripción, puedes ignorar este correo.'
        : 'If you did not request this subscription, you can ignore this email.';

    return {
        subject,
        text: `${title}\n\n${body}\n\n${button}: ${confirmUrl}\n\n${expiry}\n${ignore}`,
        html: `<!doctype html>
<html lang="${locale}">
<body style="margin:0;background:#f5f5f7;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif;">
  <div style="padding:48px 20px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:28px;padding:44px;box-shadow:0 24px 70px rgba(10,25,47,.08);">
      <img src="https://cordhq.app/imgs/logo-cord-navy.png" width="86" alt="Cord" style="display:block;width:86px;height:auto;margin:0 0 48px;">
      <h1 style="margin:0 0 16px;font-size:32px;line-height:1.08;letter-spacing:-.04em;font-weight:700;">${title}</h1>
      <p style="margin:0;color:#6e6e73;font-size:16px;line-height:1.65;">${body}</p>
      <div style="margin:36px 0 32px;">
        <a href="${safeUrl}" style="display:inline-block;background:#0a192f;color:#ffffff;text-decoration:none;border-radius:999px;padding:14px 22px;font-size:15px;font-weight:650;">${button}</a>
      </div>
      <p style="margin:0 0 8px;color:#86868b;font-size:12px;line-height:1.55;">${expiry}</p>
      <p style="margin:0;color:#86868b;font-size:12px;line-height:1.55;">${ignore}</p>
    </div>
  </div>
</body>
</html>`,
    };
}

async function resendRequest(
    path: string,
    init: RequestInit,
    key: string,
): Promise<{ response: Response | null; data: any; error?: string }> {
    try {
        const response = await fetch(`${RESEND_API}${path}`, {
            ...init,
            signal: init.signal || AbortSignal.timeout(8_000),
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
                ...(init.headers || {}),
            },
        });
        let data: any = null;
        try { data = await response.json(); } catch { /* Resend can return an empty body. */ }
        return { response, data };
    } catch (error: any) {
        return { response: null, data: null, error: error?.message || 'network_error' };
    }
}

export async function sendBlogConfirmation(
    email: string,
    locale: BlogLocale,
    confirmUrl: string,
): Promise<MarketingResult> {
    const config = marketingConfig();
    if (!config) return { ok: false, error: 'marketing_not_configured' };
    const content = confirmationEmail(locale, confirmUrl);
    const idempotencyKey = `blog-confirm/${hashConfirmationToken(confirmUrl).slice(0, 40)}`;
    const { response, data, error } = await resendRequest('/emails', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
            from: config.from,
            to: email,
            subject: content.subject,
            html: content.html,
            text: content.text,
            tags: [{ name: 'email_type', value: 'blog_double_opt_in' }],
        }),
    }, config.sendKey);

    if (!response?.ok) {
        return { ok: false, error: error || data?.message || 'confirmation_send_failed', status: response?.status };
    }
    return { ok: true, id: data?.id };
}

async function addToSegment(email: string, segmentId: string, key: string): Promise<boolean> {
    const { response } = await resendRequest(
        `/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(segmentId)}`,
        { method: 'POST' },
        key,
    );
    return !!response?.ok;
}

async function removeFromSegment(email: string, segmentId: string, key: string): Promise<void> {
    const { response } = await resendRequest(
        `/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(segmentId)}`,
        { method: 'DELETE' },
        key,
    );
    if (response && !response.ok && response.status !== 404) {
        throw new Error(`segment_remove_${response.status}`);
    }
}

export async function confirmMarketingContact(
    email: string,
    locale: BlogLocale,
    retryAfterConflict = true,
): Promise<MarketingResult> {
    const config = marketingConfig();
    if (!config) return { ok: false, error: 'marketing_not_configured' };

    const selectedSegment = locale === 'en' ? config.segmentEn : config.segmentEs;
    const otherSegment = locale === 'en' ? config.segmentEs : config.segmentEn;
    const lookup = await resendRequest(
        `/contacts/${encodeURIComponent(email)}`,
        { method: 'GET' },
        config.contactsKey,
    );

    let contactId: string | undefined;
    if (lookup.response?.ok) {
        contactId = lookup.data?.id;
        const updated = await resendRequest(
            `/contacts/${encodeURIComponent(email)}`,
            { method: 'PATCH', body: JSON.stringify({ unsubscribed: false }) },
            config.contactsKey,
        );
        if (!updated.response?.ok) {
            return { ok: false, error: updated.data?.message || updated.error || 'contact_update_failed', status: updated.response?.status };
        }
        contactId = updated.data?.id || contactId;
        if (!await addToSegment(email, selectedSegment, config.contactsKey)) {
            return { ok: false, error: 'segment_add_failed' };
        }
        try { await removeFromSegment(email, otherSegment, config.contactsKey); } catch { /* Language sync is retried on the next confirmation. */ }
    } else if (lookup.response?.status === 404) {
        const created = await resendRequest('/contacts', {
            method: 'POST',
            body: JSON.stringify({
                email,
                unsubscribed: false,
                segments: [{ id: selectedSegment }],
            }),
        }, config.contactsKey);
        if (created.response?.status === 409 && retryAfterConflict) {
            return confirmMarketingContact(email, locale, false);
        }
        if (!created.response?.ok) {
            return { ok: false, error: created.data?.message || created.error || 'contact_create_failed', status: created.response?.status };
        }
        contactId = created.data?.id;
    } else {
        return { ok: false, error: lookup.data?.message || lookup.error || 'contact_lookup_failed', status: lookup.response?.status };
    }

    return { ok: true, id: contactId };
}
