import React, { useEffect, useState } from 'react';
import { useClerk } from '@clerk/clerk-react';
import '../auth/AuthForms.css';

export default function AcceptInvitationFlow() {
  const { handleInvitationLink, isLoaded } = useClerk();
  const [status, setStatus] = useState('Procesando invitación...');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoaded) return;

    // We let Clerk handle the invitation link from the URL params.
    // If the user is signed out, Clerk will redirect them to sign up.
    // If the user is signed in, Clerk will accept the invitation.
    const url = new URL(window.location.href);
    const token = url.searchParams.get('__clerk_ticket');
    
    if (!token) {
      setError('Enlace de invitación inválido o caducado.');
      setStatus('');
      return;
    }

    // Attempt to handle the link
    handleInvitationLink({
      ticket: token,
    }).catch((err) => {
      console.error('Error handling invitation:', err);
      // If error occurs, maybe user is not logged in, but handleInvitationLink usually redirects
      setError('Hubo un problema al procesar la invitación. Asegúrate de iniciar sesión con el correo invitado.');
      setStatus('');
    });

  }, [isLoaded, handleInvitationLink]);

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/imgs/logo-cord-dark.png" alt="Cord" />
        </div>
        
        <div className="auth-header">
          <h1>Invitación a Cord</h1>
          <p>{status}</p>
        </div>

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}

        {!error && !status && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.9rem', color: '#5b6472', marginBottom: '1rem' }}>
              Puedes iniciar sesión o registrarte para aceptar la invitación.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <a href="/sign-in" className="auth-btn">Iniciar sesión</a>
              <a href="/sign-up" className="auth-btn" style={{ background: '#fff', color: '#0a192f', border: '1px solid #0a192f' }}>Registrarse</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
