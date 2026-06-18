import React, { useState } from 'react';
import { useOrganizationList } from '@clerk/clerk-react';
import '../auth/AuthForms.css'; // Reusing auth forms css

export default function CreateWorkspaceForm() {
  const { isLoaded, createOrganization, setActive } = useOrganizationList();
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setIsLoading(true);
    setError('');

    try {
      const organization = await createOrganization({ name: organizationName });
      
      // Set the newly created organization as active
      await setActive({ organization: organization.id });
      
      // Redirect to main app dashboard
      window.location.href = '/app';
    } catch (err: any) {
      console.error('Error creating workspace:', err);
      setError(err.errors?.[0]?.longMessage || 'No se pudo crear el espacio de trabajo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-logo">
          <img src="/imgs/logo-cord-dark.png" alt="Cord" />
        </div>
        
        <div className="auth-header">
          <h1>Crea tu Espacio de Trabajo</h1>
          <p>Nombra el espacio para tu agencia o equipo</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}

          <div className="auth-field">
            <label htmlFor="orgName">Nombre de la agencia</label>
            <input
              id="orgName"
              type="text"
              className="auth-input"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="Flouvia Agency"
              required
            />
          </div>

          <button type="submit" className="auth-btn" disabled={isLoading || !isLoaded}>
            {isLoading ? 'Creando...' : 'Crear espacio'}
          </button>
        </form>
      </div>
    </div>
  );
}
