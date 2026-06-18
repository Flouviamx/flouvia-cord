import React, { useState } from 'react';
import { useSignIn } from '@clerk/clerk-react';
import './AuthForms.css';

export default function SignInForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setIsLoading(true);
    setError('');

    try {
      const result = await signIn.create({
        identifier: emailAddress,
        password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        window.location.href = '/app';
      } else {
        // More steps required, e.g. MFA
        console.log('SignIn status:', result.status);
        setError('Paso adicional requerido para iniciar sesión.');
      }
    } catch (err: any) {
      console.error('Error in sign in:', err);
      setError(err.errors?.[0]?.longMessage || 'Credenciales inválidas. Por favor, intenta de nuevo.');
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
        
        <div className="auth-header">
          <h1>Inicia sesión</h1>
          <p>Bienvenido de vuelta a Cord</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
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

          <div className="auth-field">
            <label htmlFor="password">Contraseña</label>
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
            {isLoading ? 'Iniciando...' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="auth-footer">
          <p>¿Olvidaste tu contraseña? <a href="/forgot-password">Recupérala aquí</a></p>
          <p style={{ marginTop: '0.5rem' }}>¿No tienes cuenta? <a href="/sign-up">Regístrate</a></p>
        </div>
      </div>
    </div>
  );
}
