import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $clerkStore, $isLoadedStore } from '@clerk/astro/client';

// Errores de Clerk → mensajes en español, accionables.
const ERROR_ES: Record<string, string> = {
  form_password_length_too_short: 'La contraseña es muy corta — usa al menos 8 caracteres.',
  form_password_pwned: 'Esa contraseña apareció en una filtración de datos. Elige otra más segura.',
  form_password_not_strong_enough: 'Esa contraseña es muy débil. Combina letras, números y símbolos.',
  form_identifier_invalid: 'Ese correo no parece válido — revísalo.',
  too_many_requests: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  captcha_invalid: 'No pudimos verificar que eres humano. Recarga la página e inténtalo de nuevo.',
};

export default function CustomSignUp() {
  const clerk = useStore($clerkStore);
  const isLoaded = useStore($isLoadedStore);
  const signUp = clerk?.client.signUp;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  // Prefill desde ?email= — p. ej. cuando el sign-in detectó que la cuenta no
  // existe y rebotó aquí (?desde=login) para que solo falte elegir contraseña.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const em = params.get('email');
    if (em) setEmail(em);
    if (params.get('desde') === 'login') {
      setNotice('No encontramos una cuenta con ese correo. Créala aquí en menos de un minuto.');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setError('');
    setLoading(true);

    try {
      await signUp.create({
        emailAddress: email,
        password,
        firstName,
        lastName
      });

      await signUp.prepareVerification({ strategy: 'email_code' });

      // Redirect to the OTP page as requested
      window.location.href = '/verify-email';
    } catch (err: any) {
      const first = err?.errors?.[0];
      const code = first?.code as string | undefined;

      // La cuenta YA existe → llevar directo al login con el correo precargado.
      if (code === 'form_identifier_exists') {
        window.location.href = `/sign-in?email=${encodeURIComponent(email)}&desde=registro`;
        return;
      }
      if (code && ERROR_ES[code]) {
        setError(ERROR_ES[code]);
      } else if (first?.longMessage || first?.message) {
        setError(first.longMessage || first.message);
      } else {
        setError('Ocurrió un error inesperado al registrarte.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSSO = async () => {
    if (!isLoaded || !signUp) return;
    try {
      await signUp.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/onboarding/workspace',
      });
    } catch (err: any) {
      setError('Error al iniciar con Google.');
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h1 className="auth-title">Crea tu cuenta</h1>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="firstName">Nombre</label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="form-input"
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="lastName">Apellido</label>
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="form-input"
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="email">Correo electrónico de trabajo</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Contraseña segura</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="form-input"
          />
        </div>

        {notice && !error && <div className="auth-notice">{notice}</div>}
        {error && <div className="auth-error">{error}</div>}

        <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: '1rem' }}>
          {loading ? 'Creando cuenta...' : 'Crear cuenta'}
        </button>
      </form>

      <div className="auth-divider">
        <span>O regístrate con</span>
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
      </div>

      <div className="auth-footer">
        ¿Ya tienes cuenta? <a href="/sign-in">Inicia sesión</a>
      </div>
    </div>
  );
}
