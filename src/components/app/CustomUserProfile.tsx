import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { $userStore, $sessionListStore, $isLoadedStore, $clerkStore } from '@clerk/astro/client';
import './CustomUserProfile.css';

export default function CustomUserProfile() {
  const userLoaded = useStore($isLoadedStore);
  const user = useStore($userStore);
  const sessions = useStore($sessionListStore);
  const clerk = useStore($clerkStore);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // 2FA State
  const [totpSecret, setTotpSecret] = useState<{ secret: string; uri: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [isEnablingTotp, setIsEnablingTotp] = useState(false);
  const [totpStatus, setTotpStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Load user data when available
  useEffect(() => {
    if (userLoaded && user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
    }
  }, [userLoaded, user]);

  const showToast = (msg: string, type: 'success' | 'error') => {
    const toast = (window as any).cordToast;
    if (toast) toast(msg, type);
    else alert(msg);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copiado', 'success');
    } catch {
      showToast('No se pudo copiar', 'error');
    }
  };

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

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    try {
      await user.setProfileImage({ file });
      showToast('Foto de perfil actualizada', 'success');
    } catch (err: any) {
      console.error('Error updating avatar:', err);
      showToast(err.errors?.[0]?.longMessage || 'Error al actualizar la foto', 'error');
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
      showToast('Sesión cerrada correctamente', 'success');
    } catch (err: any) {
      console.error('Error revoking session:', err);
      showToast('Hubo un error al cerrar la sesión.', 'error');
    }
  };

  const startTotpSetup = async () => {
    if (!user) return;
    try {
      const totp = await user.createTOTP();
      setTotpSecret({ secret: totp.secret, uri: totp.uri });
    } catch (err: any) {
      showToast(err.errors?.[0]?.longMessage || 'Error al iniciar configuración 2FA', 'error');
    }
  };

  const verifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsEnablingTotp(true);
    try {
      await user.verifyTOTP({ code: totpCode });
      // Generar códigos de respaldo y MOSTRARLOS una sola vez (única oportunidad
      // de que el usuario los guarde — Clerk no los vuelve a revelar).
      let codes: string[] | null = null;
      try {
        const bc = await user.createBackupCode();
        codes = bc?.codes ?? null;
      } catch { /* algunos flujos ya traen backup codes; no bloquear el 2FA por esto */ }
      setBackupCodes(codes);
      setTotpSecret(null);
      setTotpCode('');
      setTotpStatus({ type: 'success', message: 'Autenticación de 2 pasos habilitada.' });
    } catch (err: any) {
      showToast(err.errors?.[0]?.longMessage || 'Código incorrecto', 'error');
    } finally {
      setIsEnablingTotp(false);
    }
  };

  const disableTotp = async () => {
    if (!user) return;
    const cc = (window as any).cordConfirm;
    const ok = cc
      ? await cc({ title: 'Desactivar 2FA', body: '¿Seguro que deseas desactivar la autenticación de 2 pasos?', danger: true, confirmText: 'Desactivar' })
      : confirm('¿Seguro que deseas desactivar la autenticación de 2 pasos?');
    if (!ok) return;

    try {
      await user.disableTOTP();
      setBackupCodes(null);
      showToast('Autenticación de 2 pasos desactivada', 'success');
    } catch (err: any) {
      showToast(err.errors?.[0]?.longMessage || 'Error al desactivar 2FA', 'error');
    }
  };

  const createPasskey = async () => {
    if (!user) return;
    try {
      await user.createPasskey();
      showToast('Passkey agregado exitosamente', 'success');
    } catch (err: any) {
      showToast(err.errors?.[0]?.longMessage || 'Error al crear passkey', 'error');
    }
  };

  const deletePasskey = async (passkey: any) => {
    const cc = (window as any).cordConfirm;
    const ok = cc
      ? await cc({ title: 'Eliminar Passkey', body: '¿Seguro que deseas eliminar este passkey?', danger: true, confirmText: 'Eliminar' })
      : confirm('¿Seguro que deseas eliminar este passkey?');
    if (!ok) return;

    try {
      await passkey.delete();
      showToast('Passkey eliminado', 'success');
    } catch (err: any) {
      showToast(err.errors?.[0]?.longMessage || 'Error al eliminar passkey', 'error');
    }
  };

  const connectAccount = async (strategy: string) => {
    if (!user) return;
    try {
      const ext = await user.createExternalAccount({ strategy: strategy as any, redirectUrl: window.location.href });
      // Clerk devuelve la URL de OAuth del proveedor — hay que NAVEGAR a ella para
      // iniciar el flujo; sin este redirect el botón "Conectar" no hace nada.
      const url = ext.verification?.externalVerificationRedirectURL;
      if (url) {
        window.location.href = url.toString();
      } else {
        showToast('No se pudo iniciar la conexión con el proveedor', 'error');
      }
    } catch (err: any) {
      showToast(err.errors?.[0]?.longMessage || 'Error al conectar cuenta', 'error');
    }
  };

  const disconnectAccount = async (account: any) => {
    const cc = (window as any).cordConfirm;
    const ok = cc
      ? await cc({ title: 'Desconectar cuenta', body: '¿Seguro que deseas desconectar esta cuenta?', danger: true, confirmText: 'Desconectar' })
      : confirm('¿Seguro que deseas desconectar esta cuenta?');
    if (!ok) return;

    try {
      await account.destroy();
      showToast('Cuenta desconectada', 'success');
    } catch (err: any) {
      showToast(err.errors?.[0]?.longMessage || 'Error al desconectar cuenta', 'error');
    }
  };

  if (!userLoaded || user === undefined || sessions === undefined) {
    return (
      <div className="cup-wrapper" style={{ pointerEvents: 'none' }}>
        <div className="cup-skeleton">
          <div className="skeleton-header"></div>
          <div className="skeleton-body"></div>
        </div>
      </div>
    );
  }

  if (user === null) {
    return <div>Debes iniciar sesión.</div>;
  }

  const primaryEmail = user.primaryEmailAddress?.emailAddress || '';
  const isGoogleConnected = user.externalAccounts.some(acc => acc.verification?.status === 'verified' && acc.provider === 'google');
  const googleAccount = user.externalAccounts.find(acc => acc.provider === 'google');

  return (
    <div className="cup-wrapper">
      
      {/* SECCIÓN DE PERFIL */}
      <div className="cup-section">
        <div className="cup-section-header">
          <h3 className="cup-section-title">Perfil</h3>
          <p className="cup-section-desc">Información básica y pública de tu cuenta.</p>
        </div>
        <div className="cup-section-body">
          <div className="cup-avatar-row">
            <div className="avatar-wrapper" onClick={() => fileInputRef.current?.click()}>
              <img src={user.imageUrl} alt="Avatar" className="cup-avatar" />
              <div className="avatar-overlay">
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </div>
            </div>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleAvatarChange} />
            <div className="cup-avatar-info">
              <h4>{user.fullName || 'Usuario'}</h4>
              <p>{primaryEmail}</p>
            </div>
          </div>
          
          <form onSubmit={handleUpdateProfile} className="cup-form-container">
            <div className="cup-form-row">
              <div className="cup-group">
                <label className="s-field" htmlFor="firstName">Nombre</label>
                <input 
                  id="firstName"
                  className="s-input"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Tu nombre"
                />
              </div>
              <div className="cup-group">
                <label className="s-field" htmlFor="lastName">Apellidos</label>
                <input 
                  id="lastName"
                  className="s-input"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Tus apellidos"
                />
              </div>
            </div>
            
            <div className="cup-group" style={{ marginTop: '1.25rem' }}>
              <label className="s-field">Correo electrónico principal</label>
              <input 
                className="s-input"
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
          <h3 className="cup-section-title">Contraseña</h3>
          <p className="cup-section-desc">Actualiza tu contraseña de acceso.</p>
        </div>
        <div className="cup-section-body">
          <form onSubmit={handleUpdatePassword} className="cup-form-container">
            <div className="cup-form-row">
              <div className="cup-group">
                <label className="s-field" htmlFor="currentPassword">Contraseña actual</label>
                <input 
                  id="currentPassword"
                  type="password"
                  className="s-input"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <div className="cup-group">
                <label className="s-field" htmlFor="newPassword">Nueva contraseña</label>
                <input 
                  id="newPassword"
                  type="password"
                  className="s-input"
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

      {/* 2FA y Passkeys */}
      <div className="cup-section">
        <div className="cup-section-header">
          <h3 className="cup-section-title">Autenticación de Dos Pasos y Passkeys</h3>
          <p className="cup-section-desc">Mejora la seguridad de tu cuenta con factores adicionales de autenticación.</p>
        </div>
        <div className="cup-section-body">
          <div className="cup-security-block">
            <div className="cup-security-block-header">
              <h4>Autenticación de 2 pasos (TOTP)</h4>
              {user.totpEnabled ? (
                <span className="badge badge-success">Habilitado</span>
              ) : (
                <span className="badge badge-inactive">Inactivo</span>
              )}
            </div>
            
            {user.totpEnabled ? (
              <div className="cup-security-actions">
                <button type="button" className="cup-btn-danger" onClick={disableTotp}>Desactivar 2FA</button>
              </div>
            ) : totpSecret ? (
              <div className="totp-setup">
                <p>Ingresa esta clave secreta en tu app de autenticación (Google Authenticator, Authy, 1Password, etc.) y luego escribe el código de 6 dígitos que genere.</p>
                <div className="totp-secret-box">
                   <span className="totp-secret-key">{totpSecret.secret}</span>
                   <button type="button" className="cup-btn-secondary small" onClick={() => copyText(totpSecret.secret)}>Copiar</button>
                </div>
                <form onSubmit={verifyTotp} className="totp-verify-form">
                  <div className="cup-group">
                    <label className="s-field">Código de verificación</label>
                    <input type="text" className="s-input" value={totpCode} onChange={e => setTotpCode(e.target.value)} placeholder="000000" maxLength={6} required />
                  </div>
                  <button type="submit" className="cup-btn-primary" disabled={isEnablingTotp}>Verificar y Habilitar</button>
                </form>
              </div>
            ) : (
              <div className="cup-security-actions">
                <button type="button" className="cup-btn-secondary" onClick={startTotpSetup}>Configurar 2FA</button>
              </div>
            )}

            {backupCodes && backupCodes.length > 0 && (
              <div className="totp-backup">
                <div className="totp-backup-head">
                  <strong>Guarda tus códigos de respaldo</strong>
                  <button type="button" className="cup-btn-secondary small" onClick={() => copyText(backupCodes.join('\n'))}>Copiar todos</button>
                </div>
                <p>Úsalos para entrar si pierdes acceso a tu app de autenticación. No los volveremos a mostrar.</p>
                <div className="totp-backup-grid">
                  {backupCodes.map((c) => <code key={c}>{c}</code>)}
                </div>
                <button type="button" className="cup-btn-secondary small" style={{ marginTop: '0.75rem' }} onClick={() => setBackupCodes(null)}>Ya los guardé</button>
              </div>
            )}

            {totpStatus && (
              <div className={`cup-status ${totpStatus.type}`}>
                {totpStatus.message}
              </div>
            )}
          </div>

          <div className="cup-security-block">
            <div className="cup-security-block-header">
              <h4>Passkeys</h4>
              <button type="button" className="cup-btn-secondary small" onClick={createPasskey}>+ Agregar Passkey</button>
            </div>
            <p className="cup-section-desc">Inicia sesión con tu huella dactilar, Face ID o el PIN de tu dispositivo.</p>
            
            {user.passkeys && user.passkeys.length > 0 && (
              <ul className="cup-list">
                {user.passkeys.map(pk => (
                  <li key={pk.id} className="cup-list-item">
                    <span>Passkey creado el {new Date(pk.createdAt).toLocaleDateString()}</span>
                    <button type="button" className="cup-btn-danger-text" onClick={() => deletePasskey(pk)}>Eliminar</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Cuentas conectadas */}
      <div className="cup-section">
        <div className="cup-section-header">
          <h3 className="cup-section-title">Cuentas conectadas</h3>
          <p className="cup-section-desc">Inicia sesión rápidamente conectando tus cuentas de otros servicios.</p>
        </div>
        <div className="cup-section-body">
           <ul className="cup-list">
              <li className="cup-list-item">
                <div className="cup-account-info">
                  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="google-icon">
                    <path d="M22 12c0-.85-.08-1.68-.21-2.48H12v4.86h5.73a5.53 5.53 0 0 1-2.4 3.63v3.01h3.87C21.46 19.03 22 15.82 22 12z"></path>
                    <path d="M12 22c2.81 0 5.17-.93 6.9-2.52l-3.87-3.01c-.93.63-2.12 1.01-3.03 1.01-2.33 0-4.31-1.57-5.01-3.69H2.98v3.13C4.75 20.37 8.08 22 12 22z"></path>
                    <path d="M6.99 13.79c-.18-.54-.28-1.12-.28-1.72s.1-1.18.28-1.72V7.22H2.98C2.36 8.46 2 9.87 2 11.39s.36 2.93.98 4.17l4.01-3.13z"></path>
                    <path d="M12 5.38c1.53 0 2.9.53 3.99 1.57l2.99-2.99C17.17 2.1 14.81 1.15 12 1.15 8.08 1.15 4.75 2.78 2.98 6.03L6.99 9.16C7.69 7.04 9.67 5.38 12 5.38z"></path>
                  </svg>
                  <span>Google</span>
                </div>
                {isGoogleConnected ? (
                  <button type="button" className="cup-btn-danger-text" onClick={() => disconnectAccount(googleAccount)}>Desconectar</button>
                ) : (
                  <button type="button" className="cup-btn-secondary small" onClick={() => connectAccount('oauth_google')}>Conectar</button>
                )}
              </li>
           </ul>
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
