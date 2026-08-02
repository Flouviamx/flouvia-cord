import React, { useState, useEffect } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';

// Mensajes en español para los errores de inicio de sesión
const ERROR_ES: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  account_locked: 'Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.',
  missing_fields: 'Ingresa tu correo y contraseña.',
  rate_limited: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  internal_error: 'Ocurrió un error en el servidor. Intenta de nuevo más tarde.',
  default: 'Ocurrió un error al iniciar sesión.',
};

// Mensajes en inglés para los errores de inicio de sesión
const ERROR_EN: Record<string, string> = {
  invalid_credentials: 'Incorrect email or password.',
  account_locked: 'Too many failed attempts. Try again in 15 minutes.',
  missing_fields: 'Enter your email and password.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  internal_error: 'A server error occurred. Please try again later.',
  default: 'An error occurred while signing in.',
};

// Solo permite redirigir a un path RELATIVO propio del sitio — un
// `?redirect_url=https://evil.com` o `//evil.com` (protocol-relative) nunca
// se honra. Único consumidor: el flujo de invitación (/unirse/[token]) manda
// de vuelta aquí tras el login.
function safeRedirect(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

export default function CustomSignIn() {

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [isEn, setIsEn] = useState(false);

  const getErrorMsg = (code: string) => {
    const dict = isEn ? ERROR_EN : ERROR_ES;
    return dict[code] || dict.default;
  };

  // Prefill desde ?email= (p. ej. al rebotar desde sign-up) y aviso si el
  // callback de Google/Apple falló (?sso_error=1).
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const em = params.get('email');
      if (em) setIdentifier(em);
      if (params.get('sso_error')) setNotice(isEn ? "We couldn't complete sign-in. Try again." : 'No pudimos completar el acceso. Inténtalo de nuevo.');
      if (params.get('desde') === 'registro') setNotice(isEn ? 'An account with that email already exists — sign in here.' : 'Ya existe una cuenta con ese correo — inicia sesión aquí.');
    }
  }, [isEn]);

  useEffect(() => {
    try {
      if (typeof navigator !== 'undefined' && navigator.language) {
        setIsEn(!navigator.language.startsWith('es'));
      }
    } catch (e) {}
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json().catch(() => ({}));

      const params = new URLSearchParams(window.location.search);
      const dest = safeRedirect(params.get('redirect_url')) || '/app';

      if (res.ok && data.mfaRequired) {
        // El destino sobrevive el paso de 2FA vía query param del propio /verify-2fa.
        window.location.href = `/verify-2fa?redirect_url=${encodeURIComponent(dest)}`;
        return;
      }
      if (res.ok) {
        window.location.href = dest;
        return;
      }
      if (res.status === 403 && data.error === 'email_not_verified') {
        window.location.href = `/verify-email?email=${encodeURIComponent(identifier)}`;
        return;
      }
      setError(getErrorMsg(data.error || 'default'));
    } catch (err: any) {
      setError(getErrorMsg('internal_error'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setError('');
    setNotice('');
    setLoading(true);

    try {
      // 1. Obtener opciones de autenticación
      const optRes = await fetch('/api/auth/passkeys/auth-options', { method: 'POST' });
      const options = await optRes.json();

      if (!optRes.ok) throw new Error(options.error || 'Error al iniciar WebAuthn');

      // 2. Llamar al API del navegador
      const authResp = await startAuthentication(options);

      // 3. Verificar con el servidor
      const verifyRes = await fetch('/api/auth/passkeys/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authResp),
      });

      const verifyData = await verifyRes.json();

      if (verifyRes.ok) {
        const params = new URLSearchParams(window.location.search);
        window.location.href = safeRedirect(params.get('redirect_url')) || '/app';
      } else {
        throw new Error(verifyData.error || 'Error verificando la credencial');
      }
    } catch (err: any) {
      console.error(err);
      if (err.name === 'NotAllowedError') {
        setError('Operación cancelada o dispositivo no permitido.');
      } else {
        setError(err.message || 'Error al usar la clave de acceso.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  const handleAppleSSO = () => {
    window.location.href = '/api/auth/apple';
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h1 className="auth-title">Inicia sesión en tu cuenta</h1>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="identifier">Correo electrónico</label>
          <input
            id="identifier"
            type="email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoComplete="email"
            className="form-input"
          />
        </div>

        <div className="form-group">
          <div className="label-row">
            <label htmlFor="password">Contraseña</label>
            <a href="/forgot-password" className="forgot-link">¿No recuerdas la contraseña?</a>
          </div>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="form-input"
          />
        </div>

        {notice && !error && <div className="auth-notice">{notice}</div>}
        {error && <div className="auth-error">{error}</div>}

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Iniciando...' : 'Iniciar sesión'}
        </button>
      </form>
      <div className="auth-divider">
        <span>O iniciar sesión con</span>
      </div>

      <div className="auth-social">
        <button
          type="button"
          className="btn-social"
          onClick={handlePasskeyLogin}
          disabled={loading}
          style={{ width: '100%', marginBottom: '0.5rem' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <circle cx="12" cy="11" r="3"/>
          </svg>
          Clave de acceso
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <button type="button" className="btn-social" onClick={handleGoogleLogin}>
            <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '8px' }}>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>
          <button type="button" className="btn-social" onClick={handleAppleSSO}>
            <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" fill="currentColor" style={{ marginRight: '8px' }}>
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Apple
          </button>
        </div>
      </div>
      <div className="auth-footer">
        ¿Eres nuevo en Cord? <a href="/sign-up">Crea una cuenta</a>
      </div>
    </div>
  );
}
