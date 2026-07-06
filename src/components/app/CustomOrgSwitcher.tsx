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

  // Cerrar con Escape (patrón de menú de sistema)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isLoaded || !user) return <div className="org-switcher-skeleton" />;

  // Initial del Workspace activo
  const activeName = organization?.name || 'Personal Workspace';
  const initial = activeName.charAt(0).toUpperCase();
  const memberships = user?.organizationMemberships ?? [];

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
        className={`org-switcher-btn ${isOpen ? 'active' : ''} ${isTestMode ? 'is-test-mode' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <div className="org-avatar" style={{ overflow: 'hidden' }}>
          {orgLogoUrl ? (
            <img src={orgLogoUrl} alt={activeName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            initial
          )}
        </div>
        <div className="org-text">
          <span className={`org-eyebrow ${isTestMode ? 'is-test' : ''}`}>{isTestMode ? 'Entorno de prueba' : 'Espacio de trabajo'}</span>
          <span className="org-name" title={activeName}>{activeName}</span>
        </div>
        <svg className="chevron-icon" viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {isOpen && (
        <div className="org-dropdown" role="menu" style={{ backgroundColor: 'var(--sb-menu-solid-bg, #ffffff)', backdropFilter: 'none', WebkitBackdropFilter: 'none', backgroundImage: 'none' }}>
          <span className="orgd-sheen" aria-hidden="true"></span>

          <span className="orgd-section-label">Espacios de trabajo</span>
          <div className="orgd-group org-list">
            {memberships.length === 0 && (
              <p className="orgd-empty">Aún no tienes otros espacios de equipo — estás en tu workspace personal.</p>
            )}
            {memberships.map((mem: any) => {
              const selected = organization?.id === mem.organization.id;
              return (
                <button
                  key={mem.id}
                  className={`org-list-item ${selected ? 'selected' : ''}`}
                  onClick={() => handleSwitch(mem.organization.id)}
                  role="menuitemradio"
                  aria-checked={selected}
                >
                  <div className="org-avatar small" style={{ overflow: 'hidden' }}>
                    {orgLogoUrl && selected ? (
                      <img src={orgLogoUrl} alt={mem.organization.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      mem.organization.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="org-details">
                    <span className="org-item-name" title={mem.organization.name}>{mem.organization.name}</span>
                    <span className="org-item-role">{mem.role === 'org:admin' ? 'Admin' : 'Miembro'}</span>
                  </div>
                  {selected && (
                    <span className="orgd-check" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="orgd-group">
            <button className="dropdown-action-btn" onClick={handleCreate}>
              <span className="orgd-icon orgd-icon-neutral" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </span>
              <span className="orgd-label">Crear espacio de trabajo</span>
            </button>

            <a href="/app/ajustes/equipo" className="dropdown-action-btn">
              <span className="orgd-icon orgd-icon-neutral" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
              </span>
              <span className="orgd-label">Configuración del equipo</span>
              <svg className="orgd-chevron" viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </a>

            <button className={`dropdown-action-btn dev-mode-toggle ${isTestMode ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); toggleTestMode(!isTestMode); }}>
              <span className="orgd-icon orgd-icon-amber" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"></path>
                  <path d="M6.5 15h11"></path>
                  <path d="M8.5 2h7"></path>
                </svg>
              </span>
              <span className="orgd-label flex-1">Entorno de prueba</span>
              <div className={`toggle-switch ${isTestMode ? 'on' : ''}`}>
                <div className="toggle-thumb"></div>
              </div>
            </button>
          </div>

          <div className="orgd-group">
            <div className="user-profile-section">
              <div className="user-avatar">{user?.firstName?.charAt(0) || user?.emailAddresses?.[0]?.emailAddress?.charAt(0)?.toUpperCase()}</div>
              <div className="org-details">
                <span className="org-item-name">{user?.fullName || 'Cuenta personal'}</span>
                <span className="org-item-role">{user?.emailAddresses?.[0]?.emailAddress}</span>
              </div>
            </div>
            <button className="dropdown-action-btn text-red" onClick={handleLogout}>
              <span className="orgd-icon orgd-icon-red" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </span>
              <span className="orgd-label">Cerrar sesión</span>
            </button>
          </div>
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

        .sb-collapsed .org-text,
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
          gap: 0.65rem;
          background: transparent;
          border: 1px solid transparent;
          padding: 0.42rem 0.55rem;
          border-radius: 12px;
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
          border-radius: 10px;
          background: var(--sb-avatar-bg);
          color: var(--sb-avatar-text);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.85rem;
          flex-shrink: 0;
          box-shadow: inset 0 1px 1px rgba(255,255,255,0.25), inset 0 0 0 0.5px rgba(255,255,255,0.12), 0 3px 8px -3px rgba(10,25,47,0.4);
        }

        .org-avatar.small {
          width: 26px;
          height: 26px;
          font-size: 0.72rem;
          border-radius: 8px;
        }

        /* Texto de dos líneas del trigger — patrón "Apple ID switcher" */
        .org-text {
          display: flex;
          flex-direction: column;
          gap: 1px;
          flex: 1;
          min-width: 0;
        }

        .org-eyebrow {
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--sb-label);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color 0.2s;
        }
        /* Entorno de prueba: el eyebrow cambia de texto/color (no roba espacio
           horizontal como un badge — evita truncar el nombre de la org). */
        .org-eyebrow.is-test { color: #d97706; }
        html[data-theme="dark"] .org-eyebrow.is-test { color: #fbbf24; }

        .org-name {
          font-weight: 600;
          font-size: 0.85rem;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Señal persistente y compacta de entorno de prueba: anillo ámbar en el
           avatar (visible incluso colapsado, sin costo de layout). */
        .org-switcher-btn.is-test-mode .org-avatar {
          box-shadow: inset 0 1px 1px rgba(255,255,255,0.25), inset 0 0 0 0.5px rgba(255,255,255,0.12), 0 3px 8px -3px rgba(10,25,47,0.4), 0 0 0 2px rgba(245,158,11,0.95);
        }

        .chevron-icon {
          color: var(--sb-label);
          flex-shrink: 0;
          transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), color 0.2s;
        }

        .org-switcher-btn.active .chevron-icon {
          transform: rotate(180deg);
          color: var(--sb-text-strong);
        }

        .org-dropdown {
          position: absolute;
          top: calc(100% + 0.5rem);
          left: 0;
          width: 300px;
          overflow: hidden;
          /* background/box-shadow/z-index sólidos: forzados en AppLayout.astro
             (bypass anti-translucidez). No pisar esas propiedades aquí. */
          border: 1px solid var(--sb-menu-border);
          border-radius: 20px;
          padding: 0.6rem;
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
          transform-origin: top left;
          animation: dropdownFade 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sb-collapsed .org-dropdown { width: 272px; }

        html[data-theme="dark"] .org-dropdown { border-color: var(--sb-menu-border); }

        /* Rim light falso (sheen) — da el efecto "vidrio" sin transparencia real,
           que fue la causa del bug de translucidez ya documentado. */
        .orgd-sheen {
          position: absolute; inset: 0; z-index: 0; pointer-events: none;
          border-radius: inherit;
          background: linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 38%);
        }
        html[data-theme="dark"] .orgd-sheen {
          background: linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 38%);
        }

        @keyframes dropdownFade {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .orgd-section-label {
          position: relative; z-index: 1;
          font-size: 0.63rem;
          font-weight: 800;
          color: var(--sb-menu-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 0.15rem 0.4rem 0;
        }

        /* Tarjeta "inset grouped list" — mismo patrón que el drawer de Ayuda */
        .orgd-group {
          position: relative; z-index: 1;
          background: #f5f5f7;
          border-radius: 14px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        html[data-theme="dark"] .orgd-group { background: rgba(255,255,255,0.05); }

        .org-list {
          max-height: 208px;
          overflow-y: auto;
        }

        .orgd-empty {
          margin: 0;
          padding: 0.75rem 0.7rem;
          font-size: 0.78rem;
          line-height: 1.45;
          color: var(--sb-menu-muted);
        }

        .org-list-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.55rem 0.65rem;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
          width: 100%;
          color: var(--sb-menu-text);
        }
        .org-list-item::after {
          content: '';
          position: absolute; bottom: 0; left: 46px; right: 0; height: 1px;
          background: var(--sb-divider);
        }
        .org-list-item:last-child::after { display: none; }

        .org-list-item:hover {
          background: rgba(10,25,47,0.045);
        }
        html[data-theme="dark"] .org-list-item:hover { background: rgba(255,255,255,0.06); }

        .org-list-item.selected {
          background: rgba(10,25,47,0.05);
        }
        html[data-theme="dark"] .org-list-item.selected { background: rgba(255,255,255,0.07); }
        .org-list-item.selected .org-avatar.small {
          box-shadow: inset 0 1px 1px rgba(255,255,255,0.25), 0 0 0 2px var(--sb-menu-solid-bg), 0 0 0 3.5px var(--color-blue-deep);
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

        .orgd-check {
          flex-shrink: 0;
          width: 16px; height: 16px;
          border-radius: 50%;
          background: var(--color-blue-deep);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 1px 3px rgba(10,25,47,0.4);
        }

        .dropdown-action-btn {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.55rem 0.65rem;
          width: 100%;
          background: transparent;
          border: none;
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--sb-menu-text);
          cursor: pointer;
          text-align: left;
          text-decoration: none;
        }
        .dropdown-action-btn::after {
          content: '';
          position: absolute; bottom: 0; left: 46px; right: 0; height: 1px;
          background: var(--sb-divider);
        }
        .dropdown-action-btn:last-child::after { display: none; }

        .dropdown-action-btn:hover {
          background: rgba(10,25,47,0.045);
        }
        html[data-theme="dark"] .dropdown-action-btn:hover { background: rgba(255,255,255,0.06); }

        .orgd-label { flex: 1; min-width: 0; }

        .orgd-icon {
          flex-shrink: 0;
          width: 26px; height: 26px;
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
        }
        .orgd-icon-neutral { background: rgba(10,25,47,0.06); color: var(--color-blue-deep); }
        html[data-theme="dark"] .orgd-icon-neutral { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.85); }

        .orgd-icon-amber { background: rgba(245,158,11,0.13); color: #d97706; }
        html[data-theme="dark"] .orgd-icon-amber { background: rgba(245,158,11,0.16); color: #fbbf24; }

        .orgd-icon-red { background: rgba(239,68,68,0.1); color: var(--color-danger); }
        html[data-theme="dark"] .orgd-icon-red { background: rgba(239,68,68,0.15); }

        .orgd-chevron {
          flex-shrink: 0;
          color: var(--sb-label);
        }

        .flex-1 {
          flex: 1;
        }

        .dev-mode-toggle.active .orgd-label {
          color: #d97706;
          font-weight: 600;
        }
        html[data-theme="dark"] .dev-mode-toggle.active .orgd-label { color: #fbbf24; }

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

        .dropdown-action-btn:hover .toggle-thumb {
          background: var(--sb-menu-text);
        }

        .dropdown-action-btn.text-red {
          color: var(--color-danger);
        }

        .dropdown-action-btn.text-red:hover {
          background: rgba(239, 68, 68, 0.08);
        }

        .user-profile-section {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.55rem 0.65rem;
          min-width: 0; /* Fix overflow for long emails */
        }
        .user-profile-section::after {
          content: '';
          position: absolute; bottom: 0; left: 46px; right: 0; height: 1px;
          background: var(--sb-divider);
        }

        .user-avatar {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: var(--sb-hover-bg);
          color: var(--sb-menu-text);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.72rem;
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
