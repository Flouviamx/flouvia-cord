import React, { useState } from 'react';
import { useOrganizationList, useUser } from '@clerk/clerk-react';

export default function CreateWorkspace() {
  const { createOrganization, isLoaded } = useOrganizationList();
  const { user } = useUser();
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !createOrganization) return;
    setError('');
    setLoading(true);

    try {
      const org = await createOrganization({ name: orgName });
      
      // La organización se ha creado y Clerk automáticamente debería
      // setearla como activa o se puede hacer manualmente, pero 
      // si redirigimos a la app Clerk ya sabrá que el usuario es admin.
      window.location.href = '/app';
    } catch (err: any) {
      if (err.errors && err.errors.length > 0) {
        setError(err.errors[0].message);
      } else {
        setError('Ocurrió un error al crear la empresa.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-header" style={{ textAlign: 'center' }}>
        <h1 className="auth-title">Crea tu espacio de trabajo</h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          Bienvenido, {user?.firstName || 'emprendedor'}. Empecemos por darle un nombre a tu agencia o empresa.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="orgName">Nombre de la empresa</label>
          <input
            id="orgName"
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
            className="form-input"
            placeholder="Ej. Flouvia Agency"
          />
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button type="submit" disabled={loading || !orgName.trim()} className="btn-primary" style={{ marginTop: '0.5rem' }}>
          {loading ? 'Creando espacio...' : 'Continuar'}
        </button>
      </form>
    </div>
  );
}
