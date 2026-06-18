import React, { useState } from 'react';
import { useSignUp } from '@clerk/clerk-react';
import './AuthForms.css';

export default function SignUpForm() {
  const { isLoaded, signUp } = useSignUp();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
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
      await signUp.create({
        firstName,
        lastName,
        emailAddress,
        password,
      });

      // Send verification email
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });

      // Redirect to verification page
      window.location.href = '/verify-email';
    } catch (err: any) {
      console.error('Error in sign up:', err);
      setError(err.errors?.[0]?.longMessage || 'Hubo un error al crear tu cuenta. Intenta de nuevo.');
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
          <h1>Crea tu cuenta</h1>
          <p>Únete a Cord y optimiza tus ventas</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}

          <div style={{ display: 'flex', gap: '1rem' }}>
            <div className="auth-field" style={{ flex: 1 }}>
              <label htmlFor="firstName">Nombre</label>
              <input
                id="firstName"
                type="text"
                className="auth-input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Juan"
                required
              />
            </div>
            <div className="auth-field" style={{ flex: 1 }}>
              <label htmlFor="lastName">Apellido</label>
              <input
                id="lastName"
                type="text"
                className="auth-input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Pérez"
                required
              />
            </div>
          </div>

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
              placeholder="Mínimo 8 caracteres"
              required
            />
          </div>

          <button type="submit" className="auth-btn" disabled={isLoading || !isLoaded}>
            {isLoading ? 'Creando cuenta...' : 'Continuar'}
          </button>
        </form>

        <div className="auth-footer">
          <p>¿Ya tienes una cuenta? <a href="/sign-in">Inicia sesión</a></p>
        </div>
      </div>
    </div>
  );
}
