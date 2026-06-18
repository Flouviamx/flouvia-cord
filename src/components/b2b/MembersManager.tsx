import React, { useState } from 'react';
import { useOrganization } from '@clerk/clerk-react';
import './B2B.css';

export default function MembersManager() {
  const { isLoaded, organization, membership } = useOrganization({
    memberships: {
      infinite: true,
      keepPreviousData: true,
    },
  });

  const [isLoadingAction, setIsLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!isLoaded || !organization) {
    return <div className="b2b-loading">Cargando equipo...</div>;
  }

  const isAdmin = membership?.role === 'org:admin';

  const handleUpdateRole = async (userId: string, newRole: string) => {
    setIsLoadingAction(userId);
    setError('');
    try {
      await organization.updateMember({ userId, role: newRole });
    } catch (err: any) {
      console.error('Error updating role:', err);
      setError('Error al actualizar el rol.');
    } finally {
      setIsLoadingAction(null);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('¿Seguro que deseas eliminar a este miembro del espacio?')) return;
    setIsLoadingAction(userId);
    setError('');
    try {
      await organization.removeMember(userId);
    } catch (err: any) {
      console.error('Error removing member:', err);
      setError('Error al eliminar al miembro.');
    } finally {
      setIsLoadingAction(null);
    }
  };

  return (
    <div className="b2b-manager">
      <div className="b2b-manager-head">
        <h2>Miembros del equipo</h2>
        <p>Administra quién tiene acceso a la agencia.</p>
        {error && <div className="b2b-error">{error}</div>}
      </div>

      <div className="b2b-table-container">
        <table className="b2b-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {organization.memberships?.data?.map((mem) => (
              <tr key={mem.id}>
                <td>
                  <div className="b2b-user-info">
                    <img src={mem.publicUserData.imageUrl} alt="Avatar" className="b2b-user-avatar" />
                    <div>
                      <span className="b2b-user-name">
                        {mem.publicUserData.firstName} {mem.publicUserData.lastName}
                      </span>
                      <span className="b2b-user-email">{mem.publicUserData.identifier}</span>
                    </div>
                  </div>
                </td>
                <td>
                  {isAdmin && mem.publicUserData.userId !== membership?.publicUserData.userId ? (
                    <select
                      className="b2b-select"
                      value={mem.role}
                      onChange={(e) => handleUpdateRole(mem.publicUserData.userId, e.target.value)}
                      disabled={isLoadingAction === mem.publicUserData.userId}
                    >
                      <option value="org:member">Miembro</option>
                      <option value="org:admin">Administrador</option>
                    </select>
                  ) : (
                    <span className="b2b-role-badge">
                      {mem.role === 'org:admin' ? 'Administrador' : 'Miembro'}
                    </span>
                  )}
                </td>
                <td>
                  {isAdmin && mem.publicUserData.userId !== membership?.publicUserData.userId && (
                    <button
                      className="b2b-danger-btn"
                      onClick={() => handleRemoveMember(mem.publicUserData.userId)}
                      disabled={isLoadingAction === mem.publicUserData.userId}
                    >
                      {isLoadingAction === mem.publicUserData.userId ? '...' : 'Eliminar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
