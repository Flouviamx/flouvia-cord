import React, { useState, useEffect } from 'react';
import { loadConnectAndInitialize } from '@stripe/connect-js';
import {
  ConnectComponentsProvider,
  ConnectNotificationBanner,
  ConnectAccountOnboarding,
  ConnectAccountManagement,
  ConnectPayouts
} from '@stripe/react-connect-js';

const stripePublishableKey = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;

export default function ConnectOnboarding({ chargesEnabled }: { chargesEnabled: boolean }) {
  const [stripeConnectInstance, setStripeConnectInstance] = useState<any>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!stripePublishableKey) {
        setError('Falta PUBLIC_STRIPE_PUBLISHABLE_KEY en el entorno (Vercel). Debe ser la llave pública del MISMO modo (live o test) que la secreta.');
        return;
      }

      // Pre-fetch de la sesión ANTES de inicializar, para poder mostrar el error
      // REAL del servidor (migración no corrida, componentes embebidos no
      // habilitados en Stripe, plataforma no activada para Connect en live, etc.)
      // en vez de dejar la isla en blanco.
      let firstSecret: string;
      try {
        const res = await fetch('/api/billing/connect/account-session', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `El servidor respondió ${res.status}`);
        if (!data?.client_secret) throw new Error('El servidor no devolvió client_secret.');
        firstSecret = data.client_secret;
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'No se pudo iniciar la sesión de Stripe Connect.');
        return;
      }

      let used = false;
      const fetchClientSecret = async () => {
        // Reusa el secreto ya obtenido en la primera llamada; refresca en las siguientes.
        if (!used) { used = true; return firstSecret; }
        const res = await fetch('/api/billing/connect/account-session', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Error al refrescar la sesión de Connect');
        return data.client_secret;
      };

      try {
        const instance = loadConnectAndInitialize({
          publishableKey: stripePublishableKey,
          fetchClientSecret,
          appearance: {
            overlays: 'dialog',
            variables: {
              colorPrimary: '#0a192f',
              fontFamily: 'Inter, system-ui, sans-serif',
              borderRadius: '12px',
            },
          },
        });
        if (!cancelled) setStripeConnectInstance(instance);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'No se pudo inicializar Stripe Connect.');
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="s-hint" style={{ color: 'var(--color-danger)', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '12px 14px', lineHeight: 1.5 }}>
        No se pudo cargar el onboarding de pagos: {error}
      </div>
    );
  }

  if (!stripeConnectInstance) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="skeleton" style={{ height: '100px', width: '100%', borderRadius: '12px' }}></div>
        <div className="skeleton" style={{ height: '300px', width: '100%', borderRadius: '12px' }}></div>
      </div>
    );
  }

  const onLoadError = (e: any) => setError(e?.error?.message || e?.message || 'Error al cargar el componente de Stripe. Verifica que PUBLIC_STRIPE_PUBLISHABLE_KEY sea del mismo modo (live/test) que la llave secreta.');

  return (
    <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <ConnectNotificationBanner />

        {!chargesEnabled ? (
          <ConnectAccountOnboarding onExit={() => window.location.reload()} onLoadError={onLoadError} />
        ) : (
          <>
            <ConnectAccountManagement onLoadError={onLoadError} />
            <ConnectPayouts onLoadError={onLoadError} />
          </>
        )}
      </div>
    </ConnectComponentsProvider>
  );
}
