import React, { useState } from 'react';

// Campo de contraseña con botón de mostrar/ocultar — compartido por
// CustomSignIn, CustomSignUp y ResetPassword (antes cada uno hubiera
// necesitado su propia copia del toggle).
interface PasswordFieldProps {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  labelEs?: string;
  labelEn?: string;
  isEn?: boolean;
}

export default function PasswordField({
  id,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
  placeholder,
  labelEs = 'Mostrar contraseña',
  labelEn = 'Show password',
  isEn = false,
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  const label = isEn
    ? (show ? 'Hide password' : labelEn)
    : (show ? 'Ocultar contraseña' : labelEs);

  return (
    <div className="pw-wrap">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="form-input"
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={label}
        aria-pressed={show}
      >
        {show ? (
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M2 12s3.5-7 10-7c2.02 0 3.68.57 5.02 1.35M22 12s-1.06 2.14-3.02 3.85M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.12" />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.18" />
          </svg>
        )}
      </button>
    </div>
  );
}
