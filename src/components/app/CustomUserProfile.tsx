import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $userStore, $sessionListStore, $isLoadedStore, $clerkStore } from '@clerk/astro/client';
import './CustomUserProfile.css';

export default function CustomUserProfile() {
  const userLoaded = useStore($isLoadedStore);
  const user = useStore($userStore);
  const sessions = useStore($sessionListStore);
  const clerk = useStore($clerkStore);

  // Profile Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [profileStatus, setProfileStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Security Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [securityStatus, setSecurityStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);

  // Load user data when available
  useEffect(() => {
    if (userLoaded && user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
    }
  }, [userLoaded, user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsSavingProfile(true);
    setProfileStatus(null);
    
    try {
      await user.update({
        firstName,
        lastName,
      });
      setProfileStatus({ type: 'success', message: 'Perfil actualizado exitosamente.' });
      
      // Auto-hide success message after 3s
      setTimeout(() => setProfileStatus(null), 3000);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setProfileStatus({ 
        type: 'error', 
        message: err.errors?.[0]?.longMessage || 'No se pudo actualizar el perfil.' 
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (newPassword.length < 8) {
      setSecurityStatus({ type: 'error', message: 'La nueva contraseña debe tener al menos 8 caracteres.' });
      return;
    }

    setIsSavingSecurity(true);
    setSecurityStatus(null);

    try {
      await user.updatePassword({
        currentPassword,
        newPassword,
      });
      setSecurityStatus({ type: 'success', message: 'Contraseña actualizada exitosamente.' });
      setCurrentPassword('');
      setNewPassword('');
      
      setTimeout(() => setSecurityStatus(null), 3000);
    } catch (err: any) {
      console.error('Error updating password:', err);
      setSecurityStatus({ 
        type: 'error', 
        message: err.errors?.[0]?.longMessage || 'La contraseña actual es incorrecta o hubo un error.' 
      });
    } finally {
      setIsSavingSecurity(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    const session = sessions?.find((s: any) => s.id === sessionId);
    if (!session) return;
    
    const cc = (window as any).cordConfirm;
    const ok = cc
      ? await cc({ title: 'Cerrar sesión', body: '¿Cerrar la sesión en este dispositivo?', danger: true, confirmText: 'Cerrar sesión' })
      : confirm('¿Estás seguro de que deseas cerrar sesión en este dispositivo?');
    if (!ok) return;
    
    try {
      await session.revoke();
      // Clerk will automatically refresh the session list via hooks
    } catch (err: any) {
      console.error('Error revoking session:', err);
      alert('Hubo un error al cerrar la sesión.');
    }
  };

  if (!userLoaded || user === undefined || sessions === undefined) {
    return (
      <div className="cup-wrapper" style={{ opacity: 0.5, pointerEvents: 'none' }}>
        <div className="cup-card"><div className="cup-card-body">Cargando perfil...</div></div>
      </div>
    );
  }

  if (user === null) {
    return <div>Debes iniciar sesión.</div>;
  }

  const primaryEmail = user.primaryEmailAddress?.emailAddress || '';

  return (
    <div className="cup-wrapper">
      
      {/* TARJETA DE PERFIL -> SECCIÓN DE PERFIL */}
      <div className="cup-section">
        <div className="cup-section-header">
          <h3 className="cup-section-title">Perfil</h3>
          <p className="cup-section-desc">Información básica y pública de tu cuenta.</p>
        </div>
        <div className="cup-section-body">
          <div className="cup-avatar-row">
            <img src={user.imageUrl} alt="Avatar" className="cup-avatar" />
            <div className="cup-avatar-info">
              <h4>{user.fullName || 'Usuario'}</h4>
              <p>{primaryEmail}</p>
            </div>
          </div>
          
          <form onSubmit={handleUpdateProfile} className="cup-form-container">
            <div className="cup-form-row">
              <div className="cup-group">
                <label htmlFor="firstName">Nombre</label>
                <input 
                  id="firstName"
                  className="cup-input"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Tu nombre"
                />
              </div>
              <div className="cup-group">
                <label htmlFor="lastName">Apellidos</label>
                <input 
                  id="lastName"
                  className="cup-input"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Tus apellidos"
                />
              </div>
            </div>
            
            <div className="cup-group" style={{ marginTop: '1.25rem' }}>
              <label>Correo electrónico principal</label>
              <input 
                className="cup-input"
                value={primaryEmail}
                disabled
              />
            </div>

            {profileStatus && (
              <div className={`cup-status ${profileStatus.type}`}>
                {profileStatus.message}
              </div>
            )}

            <div className="cup-actions">
              <button 
                type="submit" 
                className="cup-btn-primary" 
                disabled={isSavingProfile || (firstName === user.firstName && lastName === user.lastName)}
              >
                {isSavingProfile ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* SECCIÓN DE SEGURIDAD */}
      <div className="cup-section">
        <div className="cup-section-header">
          <h3 className="cup-section-title">Seguridad</h3>
          <p className="cup-section-desc">Actualiza tu contraseña de acceso para mantener tu cuenta protegida.</p>
        </div>
        <div className="cup-section-body">
          <form onSubmit={handleUpdatePassword} className="cup-form-container">
            <div className="cup-form-row">
              <div className="cup-group">
                <label htmlFor="currentPassword">Contraseña actual</label>
                <input 
                  id="currentPassword"
                  type="password"
                  className="cup-input"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="cup-group">
                <label htmlFor="newPassword">Nueva contraseña</label>
                <input 
                  id="newPassword"
                  type="password"
                  className="cup-input"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
                />
              </div>
            </div>

            {securityStatus && (
              <div className={`cup-status ${securityStatus.type}`}>
                {securityStatus.message}
              </div>
            )}

            <div className="cup-actions">
              <button 
                type="submit" 
                className="cup-btn-primary" 
                disabled={isSavingSecurity || !currentPassword || !newPassword}
              >
                {isSavingSecurity ? 'Actualizando...' : 'Actualizar contraseña'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* SECCIÓN DE SESIONES ACTIVAS */}
      <div className="cup-section">
        <div className="cup-section-header">
          <h3 className="cup-section-title">Sesiones Activas</h3>
          <p className="cup-section-desc">Dispositivos donde tienes una sesión abierta actualmente.</p>
        </div>
        <div className="cup-section-body">
          <div className="cup-session-list">
            {sessions?.map((session: any) => {
              const isCurrent = clerk?.session?.id === session.id;
              const browser = session.latestActivity?.deviceType || 'Dispositivo';
              const location = session.latestActivity?.city ? `${session.latestActivity.city}, ${session.latestActivity.country}` : 'Ubicación desconocida';
              const date = new Date(session.lastActiveAt).toLocaleDateString('es-MX', {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
              });

              return (
                <div key={session.id} className="cup-session-item">
                  <div className="cup-session-info">
                    <div className="cup-session-device">
                      {browser} en {location}
                      {isCurrent && <span className="cup-session-current">Sesión Actual</span>}
                    </div>
                    <div className="cup-session-meta">
                      Activo por última vez: {date}
                    </div>
                  </div>
                  {!isCurrent && (
                    <button 
                      type="button"
                      className="cup-btn-danger"
                      onClick={() => handleRevokeSession(session.id)}
                      title="Cerrar sesión en este dispositivo"
                    >
                      Revocar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}
