import React, { useState } from 'react';
import { useSignIn } from '@clerk/clerk-react';
import './AuthForms.css';

export default function ForgotPasswordForm() {
  const { isLoaded, signIn } = useSignIn();
  const [emailAddress, setEmailAddress] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successfulCreation, setSuccessfulCreation] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  // Handle request for password reset
  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setIsLoading(true);
    setError('');

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: emailAddress,
      });
      setSuccessfulCreation(true);
    } catch (err: any) {
      console.error('Error in forgot password request:', err);
      setError(err.errors?.[0]?.longMessage || 'No se pudo procesar la solicitud.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle password reset
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setIsLoading(true);
    setError('');

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password,
      });

      if (result.status === 'complete') {
        window.location.href = '/sign-in';
      } else {
        console.log('Reset status:', result.status);
        setError('Ocurrió un error al restablecer la contraseña.');
      }
    } catch (err: any) {
      console.error('Error verifying reset code:', err);
      setError(err.errors?.[0]?.longMessage || 'Código incorrecto o expirado.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/imgs/logo-cord-dark.png" alt="Cord" />
        </div>
        
        {!successfulCreation ? (
          <>
            <div className="auth-header">
              <h1>Recuperar contraseña</h1>
              <p>Ingresa tu correo para recibir un código de recuperación</p>
            </div>

            <form className="auth-form" onSubmit={handleRequest}>
              {error && <div className="auth-error">{error}</div>}

              <div className="auth-field">
                <label htmlFor="email">Correo electrónico</label>
                <input
                  id="email"
                  type="email"
                  className="auth-input"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="tu@empresa.com"
                  required
                />
              </div>

              <button type="submit" className="auth-btn" disabled={isLoading || !isLoaded}>
                {isLoading ? 'Enviando...' : 'Enviar código'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="auth-header">
              <h1>Restablecer contraseña</h1>
              <p>Ingresa el código que recibiste y tu nueva contraseña</p>
            </div>

            <form className="auth-form" onSubmit={handleReset}>
              {error && <div className="auth-error">{error}</div>}

              <div className="auth-field">
                <label htmlFor="code">Código de recuperación</label>
                <input
                  id="code"
                  type="text"
                  className="auth-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="password">Nueva contraseña</label>
                <input
                  id="password"
                  type="password"
                  className="auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <button type="submit" className="auth-btn" disabled={isLoading || !isLoaded}>
                {isLoading ? 'Guardando...' : 'Cambiar contraseña'}
              </button>
            </form>
          </>
        )}

        <div className="auth-footer">
          <p><a href="/sign-in">Volver a inicio de sesión</a></p>
        </div>
      </div>
    </div>
  );
}
