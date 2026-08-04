import React from 'react';

// Cálculo local simple: longitud + variedad de clases de carácter. Solo es
// una señal visual — la validación real (min 8) la sigue haciendo el servidor
// (passwordSchema en src/lib/validation.ts).
function scorePassword(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  let variety = 0;
  if (/[a-z]/.test(pw)) variety++;
  if (/[A-Z]/.test(pw)) variety++;
  if (/[0-9]/.test(pw)) variety++;
  if (/[^a-zA-Z0-9]/.test(pw)) variety++;

  if (pw.length < 8) return 1;
  if (pw.length >= 12 && variety >= 3) return 3;
  if (pw.length >= 8 && variety >= 2) return 2;
  return 1;
}

const LABELS_ES = ['', 'Débil', 'Aceptable', 'Fuerte'];
const LABELS_EN = ['', 'Weak', 'Okay', 'Strong'];
const CLASSES = ['', 'weak', 'ok', 'strong'];

export default function PasswordStrength({ password, isEn = false }: { password: string; isEn?: boolean }) {
  if (!password) return null;
  const score = scorePassword(password);
  const cls = CLASSES[score];
  const label = (isEn ? LABELS_EN : LABELS_ES)[score];

  return (
    <div className="pw-strength">
      <div className="pw-strength-bars">
        {[1, 2, 3].map((bar) => (
          <div key={bar} className={`pw-strength-bar ${bar <= score ? `on-${cls}` : ''}`} />
        ))}
      </div>
      <span className={`pw-strength-label ${cls ? `is-${cls}` : ''}`}>{label}</span>
    </div>
  );
}
