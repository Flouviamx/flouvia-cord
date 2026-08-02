import React, { useState, useRef, useEffect } from 'react';

export default function Verify2fa() {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [backupCode, setBackupCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^[0-9]*$/.test(value)) return;
    const next = [...code];
    next[index] = value;
    setCode(next);
    if (value !== '' && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && code[index] === '' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text/plain').replace(/[^0-9]/g, '').slice(0, 6);
    if (!pasted) return;
    const next = [...code];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setCode(next);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const submit = async (payload: { code?: string; backupCode?: string }) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get('redirect_url');
        window.location.href = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/app';
        return;
      }
      if (data.error === 'challenge_expired' || data.error === 'no_challenge') {
        window.location.href = '/sign-in?sso_error=1';
        return;
      }
      setError(data.error === 'invalid_code' ? 'Código incorrecto. Intenta de nuevo.' : 'No pudimos verificar el código.');
    } catch {
      setError('Error de conexión al servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (useBackup) {
      if (!backupCode.trim()) return;
      submit({ backupCode: backupCode.trim() });
    } else {
      const full = code.join('');
      if (full.length < 6) {
        setError('Ingresa el código completo de 6 dígitos.');
        return;
      }
      submit({ code: full });
    }
  };

  return (
    <div className="auth-card" style={{ maxWidth: '400px' }}>
      <div className="auth-header" style={{ textAlign: 'center' }}>
        <h1 className="auth-title">Verificación en dos pasos</h1>
        <p className="auth-subtitle" style={{ marginTop: '0.5rem' }}>
          {useBackup
            ? 'Ingresa uno de tus códigos de respaldo.'
            : 'Abre tu app de autenticación e ingresa el código de 6 dígitos.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        {!useBackup ? (
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem' }}>
            {code.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => { inputRefs.current[idx] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                className="form-input"
                style={{ width: '2.6rem', textAlign: 'center', fontSize: '1.1rem', padding: '0.7rem 0' }}
              />
            ))}
          </div>
        ) : (
          <div className="form-group">
            <label htmlFor="backupCode">Código de respaldo</label>
            <input
              id="backupCode"
              type="text"
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value)}
              className="form-input"
              autoComplete="one-time-code"
              placeholder="xxxxxxxxxx"
            />
          </div>
        )}

        {error && <div className="auth-error" style={{ textAlign: 'center' }}>{error}</div>}

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Verificando...' : 'Verificar'}
        </button>
      </form>

      <div className="auth-footer" style={{ marginTop: '1.5rem' }}>
        <button
          type="button"
          onClick={() => { setUseBackup(!useBackup); setError(''); }}
          style={{ background: 'none', border: 'none', color: '#0a192f', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}
        >
          {useBackup ? 'Usar código de la app' : '¿Perdiste acceso? Usar código de respaldo'}
        </button>
      </div>
    </div>
  );
}
