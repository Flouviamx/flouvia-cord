import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $clerkStore, $isLoadedStore } from '@clerk/astro/client';

export default function VerifyEmail() {
  const clerk = useStore($clerkStore);
  const isLoaded = useStore($isLoadedStore);
  const signUp = clerk?.client.signUp;
  const setActive = clerk?.setActive;
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus el primer input al cargar
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^[0-9]*$/.test(value)) return;
    
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value !== '' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && code[index] === '' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text/plain').replace(/[^0-9]/g, '').slice(0, 6);
    if (pastedData) {
      const newCode = [...code];
      for (let i = 0; i < pastedData.length; i++) {
        newCode[i] = pastedData[i];
      }
      setCode(newCode);
      const nextFocus = Math.min(pastedData.length, 5);
      inputRefs.current[nextFocus]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp || !setActive) return;
    const fullCode = code.join('');
    if (fullCode.length < 6) {
      setError('Por favor, ingresa el código completo de 6 dígitos.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: fullCode,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        window.location.href = '/onboarding/workspace';
      }
    } catch (err: any) {
      if (err.errors && err.errors.length > 0) {
        setError(err.errors[0].message);
      } else {
        setError('Código inválido. Por favor, intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card" style={{ maxWidth: '400px' }}>
      <div className="auth-header" style={{ textAlign: 'center' }}>
        <h1 className="auth-title">Verifica tu correo</h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          Te hemos enviado un código de 6 dígitos.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem' }}>
          {code.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => inputRefs.current[idx] = el}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={handlePaste}
              className="otp-input"
            />
          ))}
        </div>

        {error && <div className="auth-error" style={{ textAlign: 'center' }}>{error}</div>}

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Verificando...' : 'Verificar correo'}
        </button>
      </form>

      <div className="auth-footer" style={{ marginTop: '1.5rem' }}>
        ¿No recibiste el código? <button type="button" className="btn-link" onClick={() => signUp?.prepareEmailAddressVerification({ strategy: 'email_code' })}>Reenviar código</button>
      </div>
    </div>
  );
}
