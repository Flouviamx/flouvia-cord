import React, { useState, useEffect, useRef } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import './CustomUserProfile.css';

type Locale = 'es' | 'en';

interface Connection { provider: string; email: string | null; createdAt: string }
interface OrgMembership { organization: { id: string; nombre: string; logoUrl: string | null; parentOrgId: string | null }; rol: string }
interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  imageUrl: string;
  emailAddresses: { emailAddress: string }[];
  emailVerified: boolean;
  totpEnabled: boolean;
  hasPassword: boolean;
  passkeyCount: number;
  connections: Connection[];
  organizationMemberships: OrgMembership[];
}
interface SessionRow { id: string; userAgent: string | null; ip: string | null; createdAt: string; lastUsedAt: string; expiresAt: string; current: boolean }
interface PasskeyRow { id: string; name: string | null; deviceType: string; createdAt: string; lastUsedAt: string | null }

const toast = (msg: string, type: 'ok' | 'error' = 'ok') => (window as any).cordToast?.(msg, type);

function deviceLabel(ua: string | null): string {
  if (!ua) return 'Dispositivo desconocido';
  if (/iphone/i.test(ua)) return 'iPhone';
  if (/ipad/i.test(ua)) return 'iPad';
  if (/android/i.test(ua)) return 'Android';
  if (/macintosh|mac os/i.test(ua)) return 'Mac';
  if (/windows/i.test(ua)) return 'Windows';
  if (/linux/i.test(ua)) return 'Linux';
  return ua.slice(0, 40);
}

function fmtDate(d: string, locale: Locale): string {
  try {
    return new Date(d).toLocaleString(locale === 'en' ? 'en-US' : 'es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return d; }
}

export default function CustomUserProfile({ locale = 'es', user: initialUser }: { locale?: Locale; user?: UserProfile | null }) {
  const [user, setUser] = useState<UserProfile | null>(initialUser ?? null);
  if (!user) {
    return (
      <div className="cup-wrapper">
        <div className="cup-skeleton">
          <div className="skeleton-header" />
          <div className="skeleton-body" />
        </div>
      </div>
    );
  }

  // ── Perfil ──────────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState(user.firstName || '');
  const [lastName, setLastName] = useState(user.lastName || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(user.imageUrl || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1_000_000) { toast('La foto pesa más de 1 MB. Usa una imagen más ligera.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      setAvatarPreview(dataUrl);
      try {
        const res = await fetch('/api/account/profile', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatarUrl: dataUrl }),
        });
        if (!res.ok) throw new Error();
        toast('Foto actualizada');
      } catch { toast('No se pudo actualizar la foto', 'error'); }
    };
    reader.readAsDataURL(f);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName }),
      });
      if (!res.ok) throw new Error();
      setUser({ ...user, firstName, lastName, fullName: `${firstName} ${lastName}`.trim() });
      toast('Perfil actualizado');
    } catch { toast('No se pudo guardar', 'error'); }
    setSavingProfile(false);
  };

  // ── Contraseña ──────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { toast('La contraseña debe tener al menos 8 caracteres.', 'error'); return; }
    if (newPassword !== confirmPassword) { toast('Las contraseñas no coinciden.', 'error'); return; }
    setSavingPassword(true);
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error === 'wrong_password' ? 'La contraseña actual no es correcta.' : 'No se pudo cambiar la contraseña.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setUser({ ...user, hasPassword: true });
      toast('Contraseña actualizada. Cerramos tus otras sesiones por seguridad.');
    } catch (err: any) { toast(err.message || 'Error', 'error'); }
    setSavingPassword(false);
  };

  // ── 2FA ─────────────────────────────────────────────────────────────────
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [totpBusy, setTotpBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'disable' | 'regen' | null>(null);
  const [confirmValue, setConfirmValue] = useState('');

  const startTotpSetup = async () => {
    setTotpBusy(true);
    try {
      const res = await fetch('/api/account/2fa/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setTotpSetup({ secret: data.secret, qrSvg: data.qrSvg });
    } catch { toast('No se pudo iniciar la activación de 2FA', 'error'); }
    setTotpBusy(false);
  };

  const verifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpBusy(true);
    try {
      const res = await fetch('/api/account/2fa/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === 'invalid_code' ? 'Código incorrecto.' : 'No se pudo activar 2FA.');
      setBackupCodes(data.backupCodes);
      setTotpSetup(null);
      setTotpCode('');
      setUser({ ...user, totpEnabled: true });
      toast('2FA activada');
    } catch (err: any) { toast(err.message || 'Error', 'error'); }
    setTotpBusy(false);
  };

  const submitConfirmAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmAction) return;
    setTotpBusy(true);
    const payload = user.hasPassword ? { password: confirmValue } : { code: confirmValue };
    try {
      const endpoint = confirmAction === 'disable' ? '/api/account/2fa/disable' : '/api/account/2fa/backup-codes';
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === 'confirmation_required' ? 'No pudimos confirmar tu identidad.' : 'Error');
      if (confirmAction === 'disable') {
        setUser({ ...user, totpEnabled: false });
        toast('2FA desactivada');
      } else {
        setBackupCodes(data.backupCodes);
        toast('Códigos de respaldo regenerados');
      }
      setConfirmAction(null); setConfirmValue('');
    } catch (err: any) { toast(err.message || 'Error', 'error'); }
    setTotpBusy(false);
  };

  // ── Passkeys ────────────────────────────────────────────────────────────
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [passkeysLoaded, setPasskeysLoaded] = useState(false);
  const [addingPasskey, setAddingPasskey] = useState(false);

  useEffect(() => {
    fetch('/api/account/passkeys').then((r) => r.json()).then((d) => { setPasskeys(d.passkeys || []); setPasskeysLoaded(true); }).catch(() => setPasskeysLoaded(true));
  }, []);

  const createPasskey = async () => {
    setAddingPasskey(true);
    try {
      const optRes = await fetch('/api/auth/passkeys/register-options', { method: 'POST' });
      const options = await optRes.json();
      if (!optRes.ok) throw new Error(options.error || 'Error al iniciar');
      const attResp = await startRegistration(options);
      const verifyRes = await fetch('/api/auth/passkeys/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attResp),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || 'No se pudo registrar la clave');
      const listRes = await fetch('/api/account/passkeys');
      const listData = await listRes.json();
      setPasskeys(listData.passkeys || []);
      toast('Clave de acceso agregada');
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') toast(err.message || 'Error al agregar la clave', 'error');
    }
    setAddingPasskey(false);
  };

  const deletePasskey = async (id: string) => {
    const ok = await ((window as any).cordConfirm
      ? (window as any).cordConfirm({ title: 'Eliminar clave de acceso', body: '¿Seguro? Ya no podrás usar este dispositivo para entrar.', danger: true, confirmText: 'Eliminar' })
      : Promise.resolve(confirm('¿Eliminar esta clave de acceso?')));
    if (!ok) return;
    try {
      const res = await fetch(`/api/account/passkeys/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error === 'last_auth_method' ? 'Es tu único método de acceso — agrega otro antes de quitar este.' : 'Error');
      setPasskeys((prev) => prev.filter((p) => p.id !== id));
      toast('Clave de acceso eliminada');
    } catch (err: any) { toast(err.message || 'Error', 'error'); }
  };

  // ── Sesiones ────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/account/sessions').then((r) => r.json()).then((d) => { setSessions(d.sessions || []); setSessionsLoaded(true); }).catch(() => setSessionsLoaded(true));
  }, []);

  const revokeSession = async (id: string, isCurrent: boolean) => {
    if (isCurrent) {
      const ok = await ((window as any).cordConfirm
        ? (window as any).cordConfirm({ title: 'Cerrar esta sesión', body: 'Es la sesión que estás usando ahora mismo — se cerrará tu acceso.', danger: true, confirmText: 'Cerrar sesión' })
        : Promise.resolve(confirm('¿Cerrar tu sesión actual?')));
      if (!ok) return;
    }
    try {
      const res = await fetch('/api/account/sessions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error();
      if (isCurrent) { window.location.href = '/sign-in'; return; }
      setSessions((prev) => prev.filter((s) => s.id !== id));
      toast('Sesión cerrada');
    } catch { toast('No se pudo cerrar la sesión', 'error'); }
  };

  const revokeAllOtherSessions = async () => {
    const ok = await ((window as any).cordConfirm
      ? (window as any).cordConfirm({ title: 'Cerrar todas las demás sesiones', body: 'Cualquier otro dispositivo con tu sesión abierta tendrá que iniciar sesión de nuevo.', confirmText: 'Cerrar todas' })
      : Promise.resolve(confirm('¿Cerrar todas las demás sesiones?')));
    if (!ok) return;
    try {
      const res = await fetch('/api/account/sessions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (!res.ok) throw new Error();
      setSessions((prev) => prev.filter((s) => s.current));
      toast('Se cerraron las demás sesiones');
    } catch { toast('Error al cerrar sesiones', 'error'); }
  };

  // ── Cuentas conectadas ──────────────────────────────────────────────────
  const disconnectProvider = async (provider: string) => {
    const ok = await ((window as any).cordConfirm
      ? (window as any).cordConfirm({ title: `Desconectar ${provider === 'google' ? 'Google' : 'Apple'}`, body: 'Ya no podrás entrar con esta cuenta.', danger: true, confirmText: 'Desconectar' })
      : Promise.resolve(confirm('¿Desconectar esta cuenta?')));
    if (!ok) return;
    try {
      const res = await fetch(`/api/account/connections/${provider}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error === 'last_auth_method' ? 'Es tu único método de acceso — agrega una contraseña o clave de acceso antes de desconectar.' : 'Error');
      setUser({ ...user, connections: user.connections.filter((c) => c.provider !== provider) });
      toast('Cuenta desconectada');
    } catch (err: any) { toast(err.message || 'Error', 'error'); }
  };

  const googleConn = user.connections.find((c) => c.provider === 'google');
  const appleConn = user.connections.find((c) => c.provider === 'apple');
  const email = user.emailAddresses?.[0]?.emailAddress || '';

  // ── Zona de peligro: eliminar cuenta personal ──────────────────────────
  // Distinto de "eliminar organización" (Ajustes › Datos) — esto borra al
  // USUARIO. Mismo patrón hasPassword/código que ya usa el flujo de 2FA.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteCred, setDeleteCred] = useState('');
  const [deleteShowPass, setDeleteShowPass] = useState(false);
  const [deleteEmailConfirm, setDeleteEmailConfirm] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteBlockingOrgs, setDeleteBlockingOrgs] = useState<{ id: string; nombre: string }[] | null>(null);
  const [deleteErr, setDeleteErr] = useState('');

  const openDeleteAccount = () => {
    setDeleteCred(''); setDeleteEmailConfirm(''); setDeleteErr(''); setDeleteBlockingOrgs(null);
    setDeleteOpen(true);
  };

  const submitDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteBusy(true);
    setDeleteErr('');
    const payload: Record<string, string> = { confirmEmail: deleteEmailConfirm };
    if (user.hasPassword) payload.password = deleteCred; else payload.code = deleteCred;
    try {
      const res = await fetch('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { window.location.href = data.redirect || '/'; return; }
      if (data.error === 'blocking_orgs') setDeleteBlockingOrgs(data.orgs || []);
      else if (data.error === 'confirmation_required') setDeleteErr(locale === 'en' ? "We couldn't confirm your identity." : 'No pudimos confirmar tu identidad.');
      else if (data.error === 'email_mismatch') setDeleteErr(locale === 'en' ? "The email doesn't match." : 'El correo no coincide.');
      else setDeleteErr(locale === 'en' ? 'Something went wrong. Please try again.' : 'Algo salió mal. Intenta de nuevo.');
    } catch {
      setDeleteErr(locale === 'en' ? 'Something went wrong. Please try again.' : 'Algo salió mal. Intenta de nuevo.');
    }
    setDeleteBusy(false);
  };

  const deleteCredOk = deleteCred.trim().length > 0;
  const deleteEmailOk = deleteEmailConfirm.trim().toLowerCase() === email.toLowerCase();

  return (
    <div className="cup-wrapper">
      {/* ── Perfil ── */}
      <section className="cup-section">
        <div className="cup-section-header">
          <h3 className="cup-section-title">Perfil</h3>
          <p className="cup-section-desc">Tu nombre y foto, visibles para tu equipo.</p>
        </div>
        <div className="cup-section-body">
          <div className="cup-avatar-row">
            <div className="avatar-wrapper" onClick={() => fileInputRef.current?.click()}>
              {avatarPreview ? (
                <img src={avatarPreview} alt={user.fullName} className="cup-avatar" />
              ) : (
                <div className="cup-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                  {(user.firstName || email).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="avatar-overlay">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
            </div>
            <div className="cup-avatar-info">
              <h4>{user.fullName}</h4>
              <p>{email}{!user.emailVerified && ' · sin verificar'}</p>
            </div>
          </div>

          <form onSubmit={handleUpdateProfile} className="cup-form-container">
            <div className="cup-form-row">
              <div className="cup-group">
                <label className="s-field">Nombre</label>
                <input className="s-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="cup-group">
                <label className="s-field">Apellido</label>
                <input className="s-input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="cup-actions">
              <button type="submit" className="cup-btn-primary" disabled={savingProfile}>{savingProfile ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          </form>
        </div>
      </section>

      {/* ── Contraseña ── */}
      <section className="cup-section">
        <div className="cup-section-header">
          <h3 className="cup-section-title">Contraseña</h3>
          <p className="cup-section-desc">{user.hasPassword ? 'Cambia tu contraseña de acceso.' : 'Todavía no tienes contraseña — entras con Google/Apple. Puedes crear una.'}</p>
        </div>
        <div className="cup-section-body">
          <form onSubmit={handleUpdatePassword} className="cup-form-container">
            {user.hasPassword && (
              <div className="cup-group">
                <label className="s-field">Contraseña actual</label>
                <input className="s-input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
              </div>
            )}
            <div className="cup-form-row">
              <div className="cup-group">
                <label className="s-field">Nueva contraseña</label>
                <input className="s-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={8} />
              </div>
              <div className="cup-group">
                <label className="s-field">Confirmar</label>
                <input className="s-input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={8} />
              </div>
            </div>
            <div className="cup-actions">
              <button type="submit" className="cup-btn-primary" disabled={savingPassword}>{savingPassword ? 'Guardando…' : (user.hasPassword ? 'Actualizar contraseña' : 'Crear contraseña')}</button>
            </div>
          </form>
        </div>
      </section>

      {/* ── 2FA ── */}
      <section className="cup-section">
        <div className="cup-section-header">
          <h3 className="cup-section-title">Autenticación de dos pasos</h3>
          <p className="cup-section-desc">Un código adicional de tu teléfono al iniciar sesión.</p>
        </div>
        <div className="cup-section-body">
          <div className="cup-security-block">
            <div className="cup-security-block-header">
              <h4>App de autenticación (TOTP)</h4>
              <span className={`badge ${user.totpEnabled ? 'badge-success' : 'badge-inactive'}`}>{user.totpEnabled ? 'Activa' : 'Inactiva'}</span>
            </div>

            {!user.totpEnabled && !totpSetup && (
              <div className="cup-security-actions">
                <button className="cup-btn-secondary" onClick={startTotpSetup} disabled={totpBusy}>Activar 2FA</button>
              </div>
            )}

            {totpSetup && (
              <div className="totp-setup">
                <p>Escanea este código con Google Authenticator, 1Password o tu app preferida.</p>
                {totpSetup.qrSvg && <div style={{ width: 180, margin: '0 auto 1rem' }} dangerouslySetInnerHTML={{ __html: totpSetup.qrSvg }} />}
                <div className="totp-secret-box">
                  <span className="totp-secret-key">{totpSetup.secret}</span>
                  <button type="button" className="cup-btn-secondary small" onClick={() => { navigator.clipboard.writeText(totpSetup.secret); toast('Secreto copiado'); }}>Copiar</button>
                </div>
                <form onSubmit={verifyTotp} className="totp-verify-form">
                  <div className="cup-group" style={{ flex: 1 }}>
                    <label className="s-field">Código de 6 dígitos</label>
                    <input className="s-input" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} />
                  </div>
                  <button type="submit" className="cup-btn-primary" disabled={totpBusy || totpCode.length < 6}>Confirmar</button>
                </form>
              </div>
            )}

            {backupCodes && (
              <div className="totp-backup">
                <div className="totp-backup-head">
                  <strong>Tus códigos de respaldo</strong>
                  <button type="button" className="cup-btn-secondary small" onClick={() => { navigator.clipboard.writeText(backupCodes.join('\n')); toast('Códigos copiados'); }}>Copiar todos</button>
                </div>
                <p>Guárdalos en un lugar seguro — no se volverán a mostrar. Cada uno funciona una sola vez si pierdes tu teléfono.</p>
                <div className="totp-backup-grid">
                  {backupCodes.map((c) => <code key={c}>{c}</code>)}
                </div>
                <div className="cup-actions" style={{ marginTop: '1rem' }}>
                  <button className="cup-btn-primary" onClick={() => setBackupCodes(null)}>Ya los guardé</button>
                </div>
              </div>
            )}

            {user.totpEnabled && !backupCodes && (
              <div className="cup-security-actions" style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="cup-btn-secondary" onClick={() => { setConfirmAction('regen'); setConfirmValue(''); }}>Regenerar códigos de respaldo</button>
                <button className="cup-btn-danger" onClick={() => { setConfirmAction('disable'); setConfirmValue(''); }}>Desactivar 2FA</button>
              </div>
            )}

            {confirmAction && (
              <form onSubmit={submitConfirmAction} className="totp-setup" style={{ marginTop: '1rem' }}>
                <p>{user.hasPassword ? 'Confirma tu contraseña para continuar.' : 'Ingresa un código de tu app de autenticación para continuar.'}</p>
                <div className="totp-verify-form">
                  <div className="cup-group" style={{ flex: 1 }}>
                    <input className="s-input" type={user.hasPassword ? 'password' : 'text'} value={confirmValue} onChange={(e) => setConfirmValue(e.target.value)} placeholder={user.hasPassword ? 'Contraseña actual' : 'Código de 6 dígitos'} />
                  </div>
                  <button type="submit" className="cup-btn-primary" disabled={totpBusy || !confirmValue}>Confirmar</button>
                  <button type="button" className="cup-btn-secondary" onClick={() => setConfirmAction(null)}>Cancelar</button>
                </div>
              </form>
            )}
          </div>

          {/* Passkeys */}
          <div className="cup-security-block">
            <div className="cup-security-block-header">
              <h4>Claves de acceso (Passkeys)</h4>
              <button className="cup-btn-secondary small" onClick={createPasskey} disabled={addingPasskey}>{addingPasskey ? 'Agregando…' : '+ Agregar'}</button>
            </div>
            {passkeysLoaded && passkeys.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0.5rem 0 0' }}>No tienes claves de acceso registradas.</p>}
            {passkeys.length > 0 && (
              <ul className="cup-list">
                {passkeys.map((p) => (
                  <li key={p.id} className="cup-list-item">
                    <div className="cup-account-info">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><circle cx="12" cy="11" r="3" /></svg>
                      {p.name || deviceLabel(p.deviceType)} · agregada el {fmtDate(p.createdAt, locale)}
                    </div>
                    <button className="cup-btn-danger-text" onClick={() => deletePasskey(p.id)}>Eliminar</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ── Sesiones ── */}
      <section className="cup-section">
        <div className="cup-section-header">
          <h3 className="cup-section-title">Sesiones activas</h3>
          <p className="cup-section-desc">Dispositivos donde tu cuenta tiene una sesión abierta.</p>
        </div>
        <div className="cup-section-body">
          {sessionsLoaded && sessions.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No hay sesiones activas.</p>}
          {sessions.length > 0 && (
            <div className="cup-session-list">
              {sessions.map((s) => (
                <div key={s.id} className="cup-session-item">
                  <div className="cup-session-info">
                    <div className="cup-session-device">
                      {deviceLabel(s.userAgent)}
                      {s.current && <span className="cup-session-current">Esta sesión</span>}
                    </div>
                    <div className="cup-session-meta">{s.ip || 'IP desconocida'} · última actividad {fmtDate(s.lastUsedAt, locale)}</div>
                  </div>
                  <button className="cup-btn-danger-text" onClick={() => revokeSession(s.id, s.current)}>{s.current ? 'Cerrar sesión' : 'Revocar'}</button>
                </div>
              ))}
            </div>
          )}
          {sessions.filter((s) => !s.current).length > 0 && (
            <div className="cup-actions">
              <button className="cup-btn-secondary" onClick={revokeAllOtherSessions}>Cerrar todas las demás</button>
            </div>
          )}
        </div>
      </section>

      {/* ── Cuentas conectadas ── */}
      <section className="cup-section">
        <div className="cup-section-header">
          <h3 className="cup-section-title">Cuentas conectadas</h3>
          <p className="cup-section-desc">Inicia sesión con estas cuentas además de tu contraseña.</p>
        </div>
        <div className="cup-section-body">
          <ul className="cup-list">
            <li className="cup-list-item">
              <div className="cup-account-info">
                <svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                Google {googleConn ? `· ${googleConn.email || 'conectado'}` : '· no conectado'}
              </div>
              {googleConn ? <button className="cup-btn-danger-text" onClick={() => disconnectProvider('google')}>Desconectar</button> : <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Conecta desde /sign-in</span>}
            </li>
            <li className="cup-list-item">
              <div className="cup-account-info">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" /></svg>
                Apple {appleConn ? `· ${appleConn.email || 'conectado'}` : '· no conectado'}
              </div>
              {appleConn ? <button className="cup-btn-danger-text" onClick={() => disconnectProvider('apple')}>Desconectar</button> : <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Conecta desde /sign-in</span>}
            </li>
          </ul>
        </div>
      </section>

      {/* ── Zona de peligro: eliminar cuenta ── */}
      <section className="cup-section">
        <div className="cup-section-header">
          <h3 className="cup-section-title" style={{ color: 'var(--color-danger)' }}>{locale === 'en' ? 'Danger zone' : 'Zona de peligro'}</h3>
          <p className="cup-section-desc">{locale === 'en' ? 'Permanently delete your personal account.' : 'Elimina tu cuenta personal de forma permanente.'}</p>
        </div>
        <div className="cup-section-body">
          {!deleteOpen ? (
            <div className="cup-actions">
              <button className="cup-btn-danger" onClick={openDeleteAccount}>{locale === 'en' ? 'Delete my account' : 'Eliminar mi cuenta'}</button>
            </div>
          ) : deleteBlockingOrgs ? (
            <div className="cup-danger-block">
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text)', margin: '0 0 0.75rem' }}>
                {locale === 'en'
                  ? "You're the sole owner of these organizations, and they have other active members. Transfer ownership or delete them before deleting your account:"
                  : 'Eres el único dueño de estas organizaciones y tienen otros miembros activos. Transfiere la propiedad o elimínalas antes de borrar tu cuenta:'}
              </p>
              <ul className="cup-list">
                {deleteBlockingOrgs.map((o) => (
                  <li key={o.id} className="cup-list-item"><div className="cup-account-info">{o.nombre}</div></li>
                ))}
              </ul>
              <div className="cup-actions" style={{ justifyContent: 'flex-start', gap: '0.75rem', marginTop: '0.9rem' }}>
                <a href="/app/ajustes/equipo" className="cup-btn-secondary">{locale === 'en' ? 'Go to Team settings' : 'Ir a Ajustes › Equipo'}</a>
                <button type="button" className="cup-btn-secondary" onClick={() => setDeleteOpen(false)}>{locale === 'en' ? 'Cancel' : 'Cancelar'}</button>
              </div>
            </div>
          ) : (
            <form onSubmit={submitDeleteAccount} className="cup-danger-block">
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text)', margin: '0 0 1rem' }}>
                {locale === 'en'
                  ? 'This permanently deletes your account, sessions, passkeys, and connected accounts. Organizations you solely own are deleted too.'
                  : 'Esto borra tu cuenta, sesiones, claves de acceso y cuentas conectadas de forma permanente. Las organizaciones donde eres único dueño también se eliminan.'}
              </p>
              <div className="cup-group" style={{ marginBottom: '0.85rem' }}>
                <label>{user.hasPassword ? (locale === 'en' ? 'Your password' : 'Tu contraseña') : (locale === 'en' ? 'Authenticator code' : 'Código de tu app de autenticación')}</label>
                {user.hasPassword ? (
                  <div className="cup-pw-wrap">
                    <input className="s-input" type={deleteShowPass ? 'text' : 'password'} value={deleteCred} onChange={(e) => setDeleteCred(e.target.value)} autoComplete="current-password" />
                    <button
                      type="button"
                      className="cup-pw-toggle"
                      onClick={() => setDeleteShowPass((s) => !s)}
                      aria-label={deleteShowPass ? (locale === 'en' ? 'Hide password' : 'Ocultar contraseña') : (locale === 'en' ? 'Show password' : 'Mostrar contraseña')}
                      aria-pressed={deleteShowPass}
                    >
                      {deleteShowPass ? (
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
                ) : (
                  <input className="s-input" type="text" inputMode="numeric" maxLength={10} value={deleteCred} onChange={(e) => setDeleteCred(e.target.value)} autoComplete="one-time-code" />
                )}
              </div>
              <div className="cup-group" style={{ marginBottom: '0.85rem' }}>
                <label>{locale === 'en' ? `Type "${email}" to confirm` : `Escribe "${email}" para confirmar`}</label>
                <input className="s-input" type="text" value={deleteEmailConfirm} onChange={(e) => setDeleteEmailConfirm(e.target.value)} autoComplete="off" />
              </div>
              {deleteErr && <div className="cup-err" style={{ marginBottom: '0.85rem' }}>{deleteErr}</div>}
              <div className="cup-actions" style={{ justifyContent: 'flex-start', gap: '0.75rem' }}>
                <button type="button" className="cup-btn-secondary" onClick={() => setDeleteOpen(false)}>{locale === 'en' ? 'Cancel' : 'Cancelar'}</button>
                <button type="submit" className="cup-btn-danger-solid" disabled={deleteBusy || !deleteCredOk || !deleteEmailOk}>
                  {deleteBusy ? (locale === 'en' ? 'Deleting…' : 'Eliminando…') : (locale === 'en' ? 'Delete forever' : 'Eliminar para siempre')}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
