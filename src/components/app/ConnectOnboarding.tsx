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

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  const htmlTheme = document.documentElement.getAttribute('data-theme');
  if (htmlTheme === 'dark' || htmlTheme === 'light') return htmlTheme;
  return localStorage.getItem('cord.theme') === 'dark' ? 'dark' : 'light';
}

function buildConnectAppearance(theme: 'light' | 'dark') {
  const isDark = theme === 'dark';
  return {
    overlays: 'dialog',
    variables: {
      colorPrimary: isDark ? '#8ec5ff' : '#0a192f', // Navy en claro, Azul claro en oscuro
      colorBackground: isDark ? '#111827' : '#ffffff', // Fondo principal
      colorText: isDark ? '#f3f4f6' : '#111827',
      colorSecondaryText: isDark ? '#9ca3af' : '#4b5563',
      colorBorder: isDark ? '#374151' : '#e5e7eb',
      colorDanger: '#ef4444',
      fontFamily: 'Inter, system-ui, sans-serif',
      borderRadius: '12px',
      spacingUnit: '4px',
      actionPrimaryColorText: isDark ? '#0a192f' : '#ffffff',
      formBackgroundColor: isDark ? '#1f2937' : '#f8fafc',
      formHighlightColorBorder: isDark ? '#8ec5ff' : '#0a192f',
    },
  };
}

export default function ConnectOnboarding({ chargesEnabled }: { chargesEnabled: boolean }) {
  const [stripeConnectInstance, setStripeConnectInstance] = useState<any>();
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme());

  useEffect(() => {
    // Escuchar cambios de tema (Observer en el <html> que cambia la app)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          const newTheme = document.documentElement.getAttribute('data-theme');
          if (newTheme === 'dark' || newTheme === 'light') {
            setTheme(newTheme);
          }
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Actualizar la apariencia si la instancia ya existe y el tema cambia
  useEffect(() => {
    if (stripeConnectInstance && stripeConnectInstance.update) {
      stripeConnectInstance.update({ appearance: buildConnectAppearance(theme) });
    }
  }, [theme, stripeConnectInstance]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!stripePublishableKey) {
        setError('Falta PUBLIC_STRIPE_PUBLISHABLE_KEY en el entorno (Vercel). Debe ser la llave pública del MISMO modo (live o test) que la secreta.');
        return;
      }

      // Pre-fetch de la sesión ANTES de inicializar
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
          appearance: buildConnectAppearance(getInitialTheme()),
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
