import React, { useState, useEffect, useRef } from 'react';

type Mode = 'checking' | 'sent' | 'success' | 'error';

export default function VerifyEmail() {
  const [mode, setMode] = useState<Mode>('sent');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const em = params.get('email');
    if (em) setEmail(em);
    const rawRedirect = params.get('redirect_url');
    const dest = rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/app';

    if (token && !attempted.current) {
      attempted.current = true;
      setMode('checking');
      fetch('/api/auth/verify-email/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            setMode('success');
            setTimeout(() => { window.location.href = dest; }, 1500);
          } else {
            setError(data.error === 'invalid_or_expired'
              ? 'El enlace ya no es válido o expiró. Pide uno nuevo abajo.'
              : 'No pudimos verificar tu correo.');
            setMode('error');
          }
        })
        .catch(() => {
          setError('Error de conexión al servidor.');
          setMode('error');
        });
    }
  }, []);

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    setResent(false);
    try {
      await fetch('/api/auth/verify-email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setResent(true);
    } catch {
      setError('No pudimos reenviar el correo. Intenta de nuevo.');
    } finally {
      setResending(false);
    }
  };

  if (mode === 'checking') {
    return (
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h1 className="auth-title">Verificando tu correo…</h1>
      </div>
    );
  }

  if (mode === 'success') {
    return (
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" style={{ margin: '0 auto 1.5rem auto' }}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <h1 className="auth-title">¡Correo verificado!</h1>
        <p className="auth-subtitle" style={{ marginTop: '0.5rem' }}>
          Entrando a tu cuenta…
        </p>
      </div>
    );
  }

  return (
    <div className="auth-card" style={{ textAlign: 'center' }}>
      <div className="auth-header" style={{ textAlign: 'center' }}>
        <h1 className="auth-title">Confirma tu correo</h1>
        <p className="auth-subtitle" style={{ marginTop: '0.5rem' }}>
          {email
            ? <>Te mandamos un enlace de confirmación a <strong>{email}</strong>. Ábrelo para activar tu cuenta.</>
            : 'Revisa tu bandeja de entrada y haz clic en el enlace de confirmación.'}
        </p>
      </div>

      {error && <div className="auth-error" style={{ textAlign: 'left', marginBottom: '1rem' }}>{error}</div>}
      {resent && !error && <div className="auth-notice" style={{ textAlign: 'left', marginBottom: '1rem' }}>Te reenviamos el correo — dale un par de minutos en llegar.</div>}

      <button type="button" disabled={resending || !email} className="btn-primary" onClick={handleResend}>
        {resending ? 'Reenviando…' : '¿No te llegó? Reenviar correo'}
      </button>

      <div className="auth-footer" style={{ marginTop: '1.5rem' }}>
        <a href="/sign-in">Volver a iniciar sesión</a>
      </div>
    </div>
  );
}
