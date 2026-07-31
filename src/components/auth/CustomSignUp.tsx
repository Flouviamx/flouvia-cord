import React, { useState, useEffect } from 'react';
// Mensajes en español para los errores de registro
const ERROR_ES: Record<string, string> = {
  missing_fields: 'Ingresa tu correo y contraseña.',
  email_exists: 'Este correo ya está registrado. Inicia sesión en su lugar.',
  internal_error: 'Ocurrió un error en el servidor. Intenta de nuevo más tarde.',
  too_many_requests: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  default: 'Ocurrió un error al crear la cuenta.',
};

// Mensajes en inglés para los errores de registro
const ERROR_EN: Record<string, string> = {
  missing_fields: 'Enter your email and password.',
  email_exists: 'This email is already registered. Please sign in instead.',
  internal_error: 'A server error occurred. Please try again later.',
  too_many_requests: 'Too many attempts. Please wait a moment and try again.',
  default: 'An error occurred while creating your account.',
};

export default function CustomSignUp() {

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [isEn, setIsEn] = useState(false);

  const getErrorMsg = (code: string) => {
    const dict = isEn ? ERROR_EN : ERROR_ES;
    return dict[code] || dict.default;
  };

  // Prefill desde ?email= — p. ej. cuando el sign-in detectó que la cuenta no
  // existe y rebotó aquí (?desde=login) para que solo falte elegir contraseña.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const em = params.get('email');
      if (em) setEmail(em);
      if (params.get('desde') === 'login') {
        setNotice(isEn ? 'We couldn\'t find an account with that email. Create one here in under a minute.' : 'No encontramos una cuenta con ese correo. Créala aquí en menos de un minuto.');
      }
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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, firstName, lastName }),
      });
      
      if (res.ok) {
        window.location.href = '/app';
      } else {
        const data = await res.json();
        setError(getErrorMsg(data.error || 'default'));
      }
    } catch (err: any) {
      setError(getErrorMsg('internal_error'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSSO = async () => {
    // Pendiente de implementación OAuth nativo
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <button type="button" onClick={handleGoogleSSO} className="btn-social">
            <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '8px' }}>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>
          
          <button 
            type="button" 
            onClick={() => {}} 
            className="btn-social"
            disabled
            style={{ opacity: 0.5, cursor: 'not-allowed' }}
            title="Próximamente"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg" fill="currentColor" style={{ marginRight: '8px' }}>
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Apple <span style={{ fontSize: '0.7em', marginLeft: '4px', opacity: 0.7 }}>(Soon)</span>
          </button>
        </div>
      </div>
      <div className="auth-footer">
        ¿Ya tienes cuenta? <a href="/sign-in">Inicia sesión</a>
      </div>
    </div>
  );
}
