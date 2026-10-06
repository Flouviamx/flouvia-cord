import { iconInner } from '../../lib/icons';
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconInner('eye-off') }} />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: iconInner('eye') }} />
        )}
      </button>
    </div>
  );
}
