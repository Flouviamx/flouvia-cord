import React, { useState } from 'react';
import { useSignIn } from '@clerk/astro/react';

export default function CustomSignIn() {
  const { signIn, isLoaded, setActive } = useSignIn();
  
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setError('');
    setLoading(true);

    try {
      const result = await signIn.create({ identifier, password });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        window.location.href = '/app';
      } else if (result.status === 'needs_first_factor') {
        window.location.href = '/verify-email';
      }
    } catch (err: any) {
      if (err.errors && err.errors.length > 0) {
        setError(err.errors[0].message);
      } else {
        setError('Ocurrió un error inesperado al iniciar sesión.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSSO = async () => {
    if (!isLoaded) return;
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/app',
      });
    } catch (err: any) {
      setError('Error al iniciar con Google.');
    }
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

        <div className="form-group checkbox-row">
          <input type="checkbox" id="remember" className="form-checkbox" />
          <label htmlFor="remember">Recuérdame en este dispositivo</label>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Iniciando...' : 'Iniciar sesión'}
        </button>
      </form>

      <div className="auth-divider">
        <span>O iniciar sesión con</span>
      </div>

      <div className="auth-social">
        <button type="button" onClick={handleGoogleSSO} className="btn-social">
          <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google
        </button>
        <button type="button" className="btn-social" disabled>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          Clave de acceso
        </button>
      </div>

      <div className="auth-footer">
        ¿Eres nuevo en Cord? <a href="/sign-up">Crea una cuenta</a>
      </div>
    </div>
  );
}
