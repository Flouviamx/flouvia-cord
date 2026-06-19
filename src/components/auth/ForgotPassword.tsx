import React, { useState } from 'react';
import { useSignIn } from '@clerk/astro/react';

export default function ForgotPassword() {
  const { isLoaded, signIn, setActive } = useSignIn();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [successfulCreation, setSuccessfulCreation] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setError('');
    setLoading(true);

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });
      setSuccessfulCreation(true);
    } catch (err: any) {
      if (err.errors && err.errors.length > 0) {
        setError(err.errors[0].message);
      } else {
        setError('No pudimos enviar el código. Revisa tu correo.');
      }
    } finally {
      setLoading(false);
    }
  };

  const completeReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setError('');
    setLoading(true);

    try {
      await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
      });

      const result = await signIn.resetPassword({
        password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        window.location.href = '/app';
      }
    } catch (err: any) {
      if (err.errors && err.errors.length > 0) {
        setError(err.errors[0].message);
      } else {
        setError('Ocurrió un error al restablecer tu contraseña.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header" style={{ textAlign: 'center' }}>
        <h1 className="auth-title">Restablecer contraseña</h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          {!successfulCreation 
            ? 'Ingresa tu correo y te enviaremos un código.'
            : 'Revisa tu correo e ingresa el código y tu nueva contraseña.'}
        </p>
      </div>

      {!successfulCreation ? (
        <form onSubmit={requestReset} className="auth-form">
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
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: '0.5rem' }}>
            {loading ? 'Enviando...' : 'Enviar código de acceso'}
          </button>
        </form>
      ) : (
        <form onSubmit={completeReset} className="auth-form">
          <div className="form-group">
            <label htmlFor="code">Código de verificación</label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className="form-input"
              placeholder="Ej. 123456"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Nueva contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="form-input"
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: '0.5rem' }}>
            {loading ? 'Restableciendo...' : 'Restablecer contraseña'}
          </button>
        </form>
      )}

      <div className="auth-footer">
        <a href="/sign-in">Volver al inicio de sesión</a>
      </div>
    </div>
  );
}
