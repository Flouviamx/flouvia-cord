import React, { useState, useEffect } from 'react';

const ERROR_ES: Record<string, string> = {
  invalid_email: 'Email inválido.',
  internal_error: 'Error de conexión al servidor.',
  default: 'Ocurrió un error. Intenta de nuevo.',
};

const ERROR_EN: Record<string, string> = {
  invalid_email: 'Invalid email.',
  internal_error: 'Server connection error.',
  default: 'An error occurred. Please try again.',
};

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isEn, setIsEn] = useState(false);

  useEffect(() => {
    setIsEn(!navigator.language.startsWith('es'));
  }, []);

  const getErrorMsg = (code: string) => {
    const dict = isEn ? ERROR_EN : ERROR_ES;
    return dict[code] || dict.default;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(getErrorMsg(data.error || 'default'));
      }
    } catch (err: any) {
      setError(getErrorMsg('internal_error'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2" style={{ margin: '0 auto 1.5rem auto' }}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <h1 className="auth-title">Revisa tu correo</h1>
        <p className="auth-subtitle" style={{ marginTop: '0.5rem' }}>
          Te hemos enviado un enlace para restablecer tu contraseña a <strong>{email}</strong>.
        </p>
        <div style={{ marginTop: '2rem' }}>
          <a href="/sign-in" className="btn-secondary" style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}>
            Volver al inicio de sesión
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <div className="auth-header">
        <h1 className="auth-title">Recuperar contraseña</h1>
        <p className="auth-subtitle">
          Ingresa el correo electrónico asociado a tu cuenta y te enviaremos un enlace para crear una nueva contraseña.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="email">Correo electrónico</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="form-input"
            placeholder="ejemplo@empresa.com"
          />
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: '1rem' }}>
          {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
        </button>
      </form>
      
      <div className="auth-footer">
        ¿Ya la recordaste? <a href="/sign-in">Inicia sesión</a>
      </div>
    </div>
  );
}
