import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $clerkStore, $userStore, $organizationStore, $isLoadedStore } from '@clerk/astro/client';

export default function CustomOrgSwitcher() {
  const isLoaded = useStore($isLoadedStore);
  const user = useStore($userStore);
  const organization = useStore($organizationStore);
  const clerk = useStore($clerkStore);
  
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
        <div className="org-avatar">{initial}</div>
        <span className="org-name">{activeName}</span>
        <svg className="chevron-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {isOpen && (
        <div className="org-dropdown">
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
                <div className="org-avatar small">{mem.organization.name.charAt(0).toUpperCase()}</div>
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
            Gestionar miembros
          </a>

          <div className="dropdown-divider"></div>

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
          width: 180px;
          height: 40px;
          background: #e2e8f0;
          border-radius: 8px;
          animation: pulse 1.5s infinite ease-in-out;
        }

        .org-switcher-btn {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: transparent;
          border: 1px solid transparent;
          padding: 0.5rem;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          color: #0f172a;
          width: 100%;
          text-align: left;
        }
        
        .org-switcher-btn:hover, .org-switcher-btn.active {
          background: #f1f5f9;
        }

        .org-avatar {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.85rem;
          flex-shrink: 0;
        }

        .org-avatar.small {
          width: 24px;
          height: 24px;
          font-size: 0.75rem;
        }

        .org-name {
          font-weight: 600;
          font-size: 0.9rem;
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chevron-icon {
          color: #64748b;
          transition: transform 0.2s;
        }
        
        .org-switcher-btn.active .chevron-icon {
          transform: rotate(180deg);
        }

        .org-dropdown {
          position: absolute;
          top: calc(100% + 0.5rem);
          left: 0;
          width: 260px;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          padding: 0.5rem;
          z-index: 50;
          animation: dropdownFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes dropdownFade {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .dropdown-header {
          padding: 0.5rem 0.75rem;
        }

        .dropdown-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
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
          padding: 0.5rem 0.75rem;
          background: transparent;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s;
          text-align: left;
          width: 100%;
        }

        .org-list-item:hover {
          background: #f8fafc;
        }

        .org-list-item.selected {
          background: #eff6ff;
        }

        .org-details {
          display: flex;
          flex-direction: column;
          flex: 1;
        }

        .org-item-name {
          font-size: 0.85rem;
          font-weight: 500;
          color: #0f172a;
        }

        .org-item-role {
          font-size: 0.7rem;
          color: #64748b;
        }

        .dropdown-divider {
          height: 1px;
          background: #e2e8f0;
          margin: 0.5rem 0;
        }

        .dropdown-action-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.65rem 0.75rem;
          width: 100%;
          background: transparent;
          border: none;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 500;
          color: #334155;
          cursor: pointer;
          transition: background 0.2s;
        }

        .dropdown-action-btn:hover {
          background: #f8fafc;
        }

        .dropdown-action-btn svg {
          color: #64748b;
        }

        .dropdown-action-btn.text-red {
          color: #ef4444;
        }
        
        .dropdown-action-btn.text-red:hover {
          background: #fef2f2;
        }

        .dropdown-action-btn.text-red svg {
          color: #ef4444;
        }
      `}</style>
    </div>
  );
}
