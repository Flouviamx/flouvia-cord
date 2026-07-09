import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $clerkStore, $isLoadedStore } from '@clerk/astro/client';

// Aterrizaje del OAuth de Google (redirectUrl de authenticateWithRedirect).
// handleRedirectCallback completa el flujo y — clave — hace el "transfer"
// automático: si alguien SIN cuenta llegó por "Iniciar sesión", Clerk convierte
// el intento en un registro (y viceversa), en vez de morir con un error.
export default function SsoCallback() {
    const clerk = useStore($clerkStore);
    const isLoaded = useStore($isLoadedStore);
    const [error, setError] = useState<string | null>(null);
    const ran = useRef(false);

    useEffect(() => {
        if (!isLoaded || !clerk || ran.current) return;
        ran.current = true;
        clerk.handleRedirectCallback({
            signInFallbackRedirectUrl: '/app',
            signUpFallbackRedirectUrl: '/onboarding/workspace',
            continueSignUpUrl: '/sign-up',
            firstFactorUrl: '/sign-in',
            secondFactorUrl: '/sign-in',
            resetPasswordUrl: '/forgot-password',
            transferable: true,
        }).catch((err: any) => {
            console.error('SSO callback error', err);
            setError(err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || null);
            // Ante cualquier fallo, regresar al sign-in con contexto en vez de
            // dejar al usuario varado en una página en blanco.
            setTimeout(() => { window.location.href = '/sign-in?sso_error=1'; }, 2500);
        });
    }, [isLoaded, clerk]);

    return (
        <div className="sso-cb" role="status">
            {error ? (
                <>
                    <p className="sso-cb-error">{error}</p>
                    <p className="sso-cb-sub">Te llevamos de regreso para intentarlo de nuevo…</p>
                </>
            ) : (
                <>
                    <span className="sso-cb-spinner" aria-hidden="true"></span>
                    <p className="sso-cb-sub">Conectando tu cuenta de forma segura…</p>
                </>
            )}
        </div>
    );
}
