// POST /api/auth/apple/callback — Apple siempre usa form_post (POST, no GET).
//
// Reescrito de punta a punta (ago 2026): la versión anterior decodificaba el
// id_token con un base64 decode plano SIN verificar la firma — cualquiera
// podía forjar un JWT `{"sub":"x","email":"victima@x.com"}` y entrar como
// esa cuenta con solo conocer su correo. Ahora: (1) el `code` se intercambia
// de verdad con el endpoint de token de Apple, (2) el id_token que devuelve
// ESE endpoint (no el del form_post inicial) se verifica contra las JWKS
// públicas de Apple, y (3) se valida iss/aud/exp/nonce antes de confiar en
// nada del payload.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { createSession, sessionCookieOptions, SESSION_COOKIE, createTwoFactorChallenge } from '../../../../lib/auth';
import { exchangeAppleCode, verifyAppleIdToken, AppleTokenVerificationError } from '../../../../lib/auth-apple';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { trustedIp } from '../../../../lib/ip';
import { posthogServer } from '../../../../lib/posthog-server';
import { safeRelativeRedirect } from '../../../../lib/safe-redirect';

export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
    const ip = trustedIp(request);
    const rl = await rateLimit(`apple-callback:${ip}`, 20, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return redirect('/sign-in?sso_error=1');
    }

    const code = formData.get('code') as string;
    const state = formData.get('state') as string;
    // Apple solo envía el nombre en el PRIMER login (JSON dentro del form).
    const userJson = formData.get('user') as string | null;

    const savedState = cookies.get('cord_apple_state')?.value;
    const savedNonce = cookies.get('cord_apple_nonce')?.value;
    cookies.delete('cord_apple_state', { path: '/' });
    cookies.delete('cord_apple_nonce', { path: '/' });
    const dest = safeRelativeRedirect(cookies.get('cord_apple_redirect')?.value) || '/app';
    cookies.delete('cord_apple_redirect', { path: '/' });

    if (!state || !savedState || state !== savedState || !code || !savedNonce) {
        return redirect('/sign-in?sso_error=1');
    }

    let claims;
    try {
        const idToken = await exchangeAppleCode(code, `${url.origin}/api/auth/apple/callback`);
        claims = await verifyAppleIdToken(idToken, savedNonce);
    } catch (err) {
        console.error('[apple/callback] verificación falló:', err instanceof AppleTokenVerificationError ? err.message : err);
        return redirect('/sign-in?sso_error=1');
    }

    if (!claims.sub || !claims.email) {
        return redirect('/sign-in?sso_error=1');
    }
    // Apple SOLO emite email_verified=true para correos que ya verificó (incluidos
    // los "relay" de Ocultar mi correo) — si viniera false, enlazar por email a una
    // cuenta existente sería la misma ruta de takeover que originó esta reescritura.
    if (claims.email_verified !== true && claims.email_verified !== 'true') {
        return redirect('/sign-in?sso_error=1');
    }

    const providerUserId = claims.sub;
    const email = claims.email.toLowerCase();

    let firstName: string | undefined;
    let lastName: string | undefined;
    if (userJson) {
        try {
            const userData = JSON.parse(userJson);
            firstName = userData?.name?.firstName;
            lastName = userData?.name?.lastName;
        } catch { /* no-op */ }
    }

    try {
        let userId: string | null = null;

        const oauthRows = await sql`
            select user_id from oauth_accounts
            where provider = 'apple' and provider_user_id = ${providerUserId}
            limit 1
        `;

        let isNewUser = false;
        if (oauthRows.length > 0) {
            userId = oauthRows[0].user_id as string;
        } else {
            const userRows = await sql`select id from users where email = ${email} limit 1`;
            if (userRows.length > 0) {
                userId = userRows[0].id as string;
            } else {
                const [newUser] = await sql`
                    insert into users (email, first_name, last_name, email_verified_at)
                    values (${email}, ${firstName || null}, ${lastName || null}, now())
                    returning id
                `;
                userId = newUser.id as string;
                isNewUser = true;
            }
            await sql`
                insert into oauth_accounts (user_id, provider, provider_user_id, email)
                values (${userId}, 'apple', ${providerUserId}, ${email})
                on conflict (provider, provider_user_id) do nothing
            `;
            // Un correo verificado por Apple certifica el correo del usuario en Cord también.
            await sql`update users set email_verified_at = coalesce(email_verified_at, now()) where id = ${userId}`;
        }

        // Solo cuenta nueva de verdad — nunca en un login/link de una cuenta ya existente.
        if (isNewUser && posthogServer) {
            posthogServer.capture({
                distinctId: userId!,
                event: 'sign_up_completed',
                properties: { sign_up_method: 'apple' },
            });
            await posthogServer.flush();
        }

        // Si la cuenta tiene 2FA activo, ni el SSO se lo salta.
        const totpRow = await sql`select totp_enabled from users where id = ${userId} limit 1`;
        if (totpRow.length && totpRow[0].totp_enabled) {
            const challenge = await createTwoFactorChallenge(userId!);
            cookies.set('cord_2fa_challenge', challenge, {
                path: '/', httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax', maxAge: 300,
            });
            return redirect(`/verify-2fa?redirect_url=${encodeURIComponent(dest)}`);
        }

        const sessionToken = await createSession(userId!, 'Apple Sign In', ip);
        cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
        return redirect(dest);
    } catch (err) {
        console.error('[apple/callback] Error:', err);
        return redirect('/sign-in?sso_error=1');
    }
};
