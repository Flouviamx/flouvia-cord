import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $clerkStore, $userStore, $organizationStore, $isLoadedStore } from '@clerk/astro/client';
import { $isTestMode, toggleTestMode } from '../../store/testMode';

export default function CustomOrgSwitcher({ orgLogoUrl = '' }: { orgLogoUrl?: string }) {
  const isLoaded = useStore($isLoadedStore);
  const user = useStore($userStore);
  const organization = useStore($organizationStore);
  const clerk = useStore($clerkStore);
  const isTestMode = useStore($isTestMode);
  
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isLoaded || !user) return <div className="org-switcher-skeleton" />;

  // Initial del Workspace activo
  const activeName = organization?.name || 'Personal Workspace';
  const initial = activeName.charAt(0).toUpperCase();

  const handleSwitch = async (organizationId: string) => {
    if (!clerk?.setActive) return;
    await clerk.setActive({ organization: organizationId });
    setIsOpen(false);
  };

  const handleCreate = () => {
    window.location.href = '/onboarding/workspace';
  };

  const handleLogout = async () => {
    if (!clerk?.signOut) return;
    await clerk.signOut();
    window.location.href = '/sign-in';
  };

  return (
    <div className="custom-org-switcher" ref={dropdownRef}>
      <button 
        className={`org-switcher-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="org-avatar" style={{ overflow: 'hidden' }}>
          {orgLogoUrl ? (
            <img src={orgLogoUrl} alt={activeName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            initial
          )}
        </div>
        <span className="org-name">{activeName}</span>
        <svg className="chevron-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {isOpen && (
        <div className="org-dropdown" style={{ backgroundColor: 'var(--sb-menu-solid-bg, #ffffff)', backdropFilter: 'none', WebkitBackdropFilter: 'none', backgroundImage: 'none' }}>
          <div className="dropdown-header">
            <span className="dropdown-title">Tus espacios</span>
          </div>

          <div className="org-list">
            {user?.organizationMemberships?.map((mem) => (
              <button 
                key={mem.id} 
                className={`org-list-item ${organization?.id === mem.organization.id ? 'selected' : ''}`}
                onClick={() => handleSwitch(mem.organization.id)}
              >
                <div className="org-avatar small" style={{ overflow: 'hidden' }}>
                  {orgLogoUrl && organization?.id === mem.organization.id ? (
                    <img src={orgLogoUrl} alt={mem.organization.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    mem.organization.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="org-details">
                  <span className="org-item-name">{mem.organization.name}</span>
                  <span className="org-item-role">{mem.role === 'org:admin' ? 'Admin' : 'Miembro'}</span>
                </div>
                {organization?.id === mem.organization.id && (
                  <svg className="check-icon" viewBox="0 0 24 24" width="16" height="16" stroke="#6366f1" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </button>
            ))}
          </div>

          <div className="dropdown-divider"></div>
          
          <button className={`dropdown-action-btn dev-mode-toggle ${isTestMode ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); toggleTestMode(!isTestMode); }}>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline>
              <polyline points="7.5 19.79 7.5 14.6 3 12"></polyline>
              <polyline points="21 12 16.5 14.6 16.5 19.79"></polyline>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
            <span className="flex-1">Entorno de prueba</span>
            <div className={`toggle-switch ${isTestMode ? 'on' : ''}`}>
              <div className="toggle-thumb"></div>
            </div>
          </button>

          <button className="dropdown-action-btn" onClick={handleCreate}>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Crear espacio de trabajo
          </button>
          
          <a href="/app/ajustes/equipo" className="dropdown-action-btn" style={{ textDecoration: 'none' }}>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            Configuración del equipo
          </a>

          <div className="dropdown-divider"></div>

          <div className="user-profile-section">
            <div className="user-avatar">{user?.firstName?.charAt(0) || user?.emailAddresses?.[0]?.emailAddress?.charAt(0)?.toUpperCase()}</div>
            <div className="org-details">
              <span className="org-item-name">{user?.fullName || 'Cuenta personal'}</span>
              <span className="org-item-role">{user?.emailAddresses?.[0]?.emailAddress}</span>
            </div>
          </div>

          <button className="dropdown-action-btn text-red" onClick={handleLogout}>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Cerrar sesión
          </button>

        </div>
      )}

      <style>{`
        .custom-org-switcher {
          position: relative;
          font-family: var(--font-sans, system-ui, sans-serif);
        }
        
        .org-switcher-skeleton {
          width: 100%;
          height: 48px;
          background: var(--sb-hover-bg);
          border-radius: 10px;
          animation: pulse 1.5s infinite ease-in-out;
        }

        .sb-collapsed .org-name,
        .sb-collapsed .chevron-icon {
          opacity: 0;
          width: 0;
          overflow: hidden;
          margin: 0;
          padding: 0;
        }

        /* Colapsado: el botón se vuelve un cuadro de 36px centrado, alineado
           exactamente con la columna de íconos del nav. */
        .sb-collapsed .custom-org-switcher {
          display: flex;
          justify-content: center;
        }
        .sb-collapsed .org-switcher-btn {
          justify-content: center;
          gap: 0;
          padding: 0;
          width: 36px;
          height: 36px;
          border-radius: 10px;
        }

        .org-switcher-btn {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          background: transparent;
          border: 1px solid transparent;
          padding: 0.5rem 0.6rem;
          border-radius: 11px;
          cursor: pointer;
          transition: background 0.2s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s, box-shadow 0.2s;
          color: var(--sb-text-strong);
          width: 100%;
          text-align: left;
        }

        .org-switcher-btn:hover, .org-switcher-btn.active {
          background: var(--sb-hover-bg);
          color: var(--sb-text-strong);
        }
        .org-switcher-btn.active {
          background: var(--sb-active-bg);
        }

        .org-avatar {
          width: 32px;
          height: 32px;
          border-radius: 9px;
          background: var(--sb-avatar-bg);
          color: var(--sb-avatar-text);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.85rem;
          flex-shrink: 0;
          box-shadow: inset 0 1px 1px rgba(255,255,255,0.22), 0 3px 8px -3px rgba(10,25,47,0.4);
        }

        .org-avatar.small {
          width: 24px;
          height: 24px;
          font-size: 0.75rem;
          border-radius: 6px;
        }

        .org-name {
          font-weight: 600;
          font-size: 0.85rem;
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chevron-icon {
          color: var(--sb-label);
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s;
        }

        .org-switcher-btn.active .chevron-icon {
          transform: rotate(180deg);
          color: var(--sb-text-strong);
        }

        .org-dropdown {
          position: absolute;
          top: calc(100% + 0.5rem);
          left: 0;
          width: 280px;
          /* SÓLIDO opaco absoluto. Al remover el backdrop-filter y el gradiente evitamos la mezcla visual. */
          background-color: #ffffff !important;
          background-image: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          border: 1px solid var(--sb-menu-border);
          border-radius: 16px;
          box-shadow: var(--sb-menu-shadow);
          padding: 0.5rem;
          z-index: 9999;
          transform-origin: top left;
          animation: dropdownFade 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sb-collapsed .org-dropdown { width: 250px; }
        
        html[data-theme="dark"] .org-dropdown,
        :global(html[data-theme="dark"]) .org-dropdown {
          background-color: #111823 !important;
        }

        @keyframes dropdownFade {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .dropdown-header {
          padding: 0.4rem 0.6rem 0.6rem;
        }

        .dropdown-title {
          font-size: 0.65rem;
          font-weight: 700;
          color: var(--sb-menu-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .org-list {
          display: flex;
          flex-direction: column;
          max-height: 200px;
          overflow-y: auto;
        }

        .org-list-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0.6rem;
          background: transparent;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s;
          text-align: left;
          width: 100%;
          color: var(--sb-menu-text);
        }

        .org-list-item:hover {
          background: var(--sb-menu-hover);
        }

        .org-list-item.selected {
          background: var(--sb-menu-hover);
        }

        .org-details {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0; /* CRITICAL FOR TRUNCATION */
        }

        .org-item-name {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--sb-menu-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .org-item-role {
          font-size: 0.7rem;
          color: var(--sb-menu-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .check-icon {
          stroke: var(--sb-text-active);
          opacity: 1;
          flex-shrink: 0;
        }

        .dropdown-divider {
          height: 1px;
          background: var(--sb-divider);
          margin: 0.5rem 0;
        }

        .dropdown-action-btn {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.6rem;
          width: 100%;
          background: transparent;
          border: none;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--sb-menu-text);
          cursor: pointer;
          transition: background 0.2s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s;
          text-align: left;
        }

        .dropdown-action-btn:hover {
          background: var(--sb-menu-hover);
        }

        .dropdown-action-btn svg {
          color: var(--sb-menu-muted);
          transition: color 0.2s;
          flex-shrink: 0;
        }

        .dropdown-action-btn:hover svg {
          color: var(--sb-text-strong);
        }

        .dropdown-action-btn.text-red {
          color: var(--color-danger);
        }

        .dropdown-action-btn.text-red:hover {
          background: rgba(239, 68, 68, 0.1);
          color: var(--color-danger);
        }

        .dropdown-action-btn.text-red svg {
          color: var(--color-danger);
        }
        
        .flex-1 {
          flex: 1;
        }

        .dev-mode-toggle {
          padding-right: 0.6rem;
        }

        .toggle-switch {
          width: 28px;
          height: 16px;
          background: var(--sb-badge-bg);
          border-radius: 8px;
          position: relative;
          transition: background 0.2s;
          flex-shrink: 0;
        }

        .toggle-thumb {
          width: 12px;
          height: 12px;
          background: var(--sb-menu-muted);
          border-radius: 50%;
          position: absolute;
          top: 2px;
          left: 2px;
          transition: transform 0.2s, background 0.2s;
        }

        /* Ámbar tipo Stripe: el color universal de "modo de prueba" */
        .toggle-switch.on {
          background: rgba(245, 158, 11, 0.35);
        }

        .toggle-switch.on .toggle-thumb {
          transform: translateX(12px);
          background: #f59e0b;
        }

        .dev-mode-toggle.active {
          color: #d97706;
        }
        .dev-mode-toggle.active svg {
          color: #d97706;
        }

        .dev-mode-toggle:hover .toggle-thumb {
          background: var(--sb-menu-text);
        }

        .user-profile-section {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0.6rem;
          margin-bottom: 0.25rem;
          min-width: 0; /* Fix overflow for long emails */
        }

        .user-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--sb-hover-bg);
          color: var(--sb-menu-text);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.75rem;
          flex-shrink: 0;
          border: 1px solid var(--sb-divider);
        }

        /* Custom Scrollbar for org-list */
        .org-list::-webkit-scrollbar {
          width: 4px;
        }
        .org-list::-webkit-scrollbar-track {
          background: transparent;
        }
        .org-list::-webkit-scrollbar-thumb {
          background: var(--sb-divider);
          border-radius: 4px;
        }
        .org-list::-webkit-scrollbar-thumb:hover {
          background: var(--sb-menu-muted);
        }
      `}</style>
    </div>
  );
}
