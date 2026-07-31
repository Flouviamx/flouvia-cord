import React, { useState } from 'react';

export default function ResetPassword({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setSuccess(true);
        // Esperamos 2 segundos y lo mandamos a login
        setTimeout(() => {
          window.location.href = '/sign-in';
        }, 2000);
      } else {
        setError(data.error || 'El enlace es inválido o ha expirado.');
      }
    } catch (err: any) {
      setError('Error de conexión al servidor.');
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
        <h1 className="auth-title">¡Contraseña actualizada!</h1>
        <p className="auth-subtitle" style={{ marginTop: '0.5rem' }}>
          Ya puedes iniciar sesión con tu nueva contraseña. Redirigiendo...
        </p>
      </div>
    );
  }

  return (
    <div className="auth-card" style={{ background: 'transparent', border: 'none', boxShadow: 'none', textAlign: 'center' }}>
      <div className="auth-header" style={{ textAlign: 'center' }}>
        <h1 className="auth-title" style={{ fontWeight: 600 }}>Crea una nueva contraseña</h1>
        <p className="auth-subtitle" style={{ textAlign: 'center' }}>
          Ingresa una contraseña segura de al menos 8 caracteres.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form" style={{ textAlign: 'left' }}>
        <div className="form-group">
          <label htmlFor="password">Nueva contraseña</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="form-input"
            placeholder="••••••••"
          />
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: '1rem' }}>
          {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
        </button>
      </form>
    </div>
  );
}
