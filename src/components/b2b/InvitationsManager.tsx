import React, { useState } from 'react';
import { useOrganization } from '@clerk/clerk-react';
import './B2B.css';

export default function InvitationsManager() {
  const { isLoaded, organization, membership } = useOrganization({
    invitations: {
      infinite: true,
      keepPreviousData: true,
    },
  });

  const [emailAddress, setEmailAddress] = useState('');
  const [role, setRole] = useState('org:member');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAction, setIsLoadingAction] = useState<string | null>(null);

  if (!isLoaded || !organization) {
    return <div className="b2b-loading">Cargando invitaciones...</div>;
  }

  const isAdmin = membership?.role === 'org:admin';

  if (!isAdmin) {
    return (
      <div className="b2b-error-box">
        Solo los administradores pueden invitar a nuevos miembros.
      </div>
    );
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      await organization.inviteMember({ emailAddress, role });
      setSuccess(`Invitación enviada a ${emailAddress}`);
      setEmailAddress('');
    } catch (err: any) {
      console.error('Error inviting member:', err);
      setError(err.errors?.[0]?.longMessage || 'Error al enviar invitación.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async (invitationId: string) => {
    setIsLoadingAction(invitationId);
    try {
      const invite = organization.invitations?.data?.find((i) => i.id === invitationId);
      if (invite) {
        await invite.revoke();
      }
    } catch (err) {
      console.error('Error revoking invitation:', err);
    } finally {
      setIsLoadingAction(null);
    }
  };

  return (
    <div className="b2b-manager">
      <div className="b2b-manager-head">
        <h2>Invitar Vendedores</h2>
        <p>Añade nuevos miembros a tu espacio de trabajo.</p>
        {error && <div className="b2b-error">{error}</div>}
        {success && <div className="b2b-success">{success}</div>}
      </div>

      <form className="b2b-invite-form" onSubmit={handleInvite}>
        <input
          type="email"
          className="b2b-input"
          placeholder="correo@ejemplo.com"
          value={emailAddress}
          onChange={(e) => setEmailAddress(e.target.value)}
          required
        />
        <select className="b2b-select" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="org:member">Miembro</option>
          <option value="org:admin">Administrador</option>
        </select>
        <button type="submit" className="b2b-primary-btn" disabled={isLoading}>
          {isLoading ? 'Enviando...' : 'Invitar'}
        </button>
      </form>

      <div className="b2b-table-container" style={{ marginTop: '2rem' }}>
        <h3>Invitaciones pendientes</h3>
        {organization.invitations?.data?.length === 0 ? (
          <p className="b2b-empty">No hay invitaciones pendientes.</p>
        ) : (
          <table className="b2b-table">
            <thead>
              <tr>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {organization.invitations?.data?.map((invite) => (
                <tr key={invite.id}>
                  <td>{invite.emailAddress}</td>
                  <td>{invite.role === 'org:admin' ? 'Admin' : 'Miembro'}</td>
                  <td><span className="b2b-status-badge pending">Pendiente</span></td>
                  <td>
                    <button
                      className="b2b-danger-btn"
                      onClick={() => handleRevoke(invite.id)}
                      disabled={isLoadingAction === invite.id}
                    >
                      {isLoadingAction === invite.id ? '...' : 'Revocar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
