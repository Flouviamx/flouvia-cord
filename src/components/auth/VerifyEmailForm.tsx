import React, { useState, useRef, KeyboardEvent, ClipboardEvent } from 'react';
import { useSignUp } from '@clerk/clerk-react';
import './AuthForms.css';

export default function VerifyEmailForm() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null)
  ];

  const handleInput = (index: number, value: string) => {
    if (!/^[0-9]*$/.test(value)) return;
    
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 5) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6).replace(/[^0-9]/g, '');
    if (!pastedData) return;

    const newCode = [...code];
    for (let i = 0; i < pastedData.length; i++) {
      if (i < 6) newCode[i] = pastedData[i];
    }
    setCode(newCode);

    const focusIndex = Math.min(pastedData.length, 5);
    inputRefs[focusIndex].current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    const verificationCode = code.join('');
    if (verificationCode.length < 6) {
      setError('Por favor, ingresa el código completo de 6 dígitos.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        // Redirect to onboarding workspace
        window.location.href = '/onboarding/workspace';
      } else {
        console.log('Verification status:', result.status);
        setError('No se pudo verificar el correo. Status: ' + result.status);
      }
    } catch (err: any) {
      console.error('Error verifying email:', err);
      setError(err.errors?.[0]?.longMessage || 'Código incorrecto. Intenta de nuevo.');
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
          <h1>Revisa tu correo</h1>
          <p>Hemos enviado un código de 6 dígitos a tu correo electrónico</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}

          <div className="otp-inputs">
            {code.map((digit, i) => (
              <input
                key={i}
                ref={inputRefs[i]}
                type="text"
                inputMode="numeric"
                maxLength={1}
                className="otp-input"
                value={digit}
                onChange={(e) => handleInput(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                required
              />
            ))}
          </div>

          <button type="submit" className="auth-btn" disabled={isLoading || !isLoaded}>
            {isLoading ? 'Verificando...' : 'Verificar código'}
          </button>
        </form>

        <div className="auth-footer">
          <p>¿No recibiste el código? <button className="auth-link-btn" onClick={() => signUp?.prepareEmailAddressVerification({ strategy: 'email_code' })}>Reenviar</button></p>
        </div>
      </div>
    </div>
  );
}
