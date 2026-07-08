import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $clerkStore, $userStore, $organizationStore, $isLoadedStore } from '@clerk/astro/client';
import { $isTestMode, toggleTestMode } from '../../store/testMode';
import CreateWorkspaceModal from './CreateWorkspaceModal';

export default function CustomOrgSwitcher({ orgLogoUrl = '' }: { orgLogoUrl?: string }) {
  const isLoaded = useStore($isLoadedStore);
  const user = useStore($userStore);
  const organization = useStore($organizationStore);
  const clerk = useStore($clerkStore);
  const isTestMode = useStore($isTestMode);

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Create Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createModalParentOrg, setCreateModalParentOrg] = useState<{ id: string, name: string } | null>(null);

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
    
    const path = window.location.pathname;
    const hasEntityId = /\/[0-9a-f]{8}-[0-9a-f]{4}-.../i.test(path);
    window.location.assign(hasEntityId || !path.startsWith('/app') ? '/app' : path);
  };

  const handleCreateSubaccount = (parentOrgId: string, parentOrgName: string) => {
    setCreateModalParentOrg({ id: parentOrgId, name: parentOrgName });
    setCreateModalOpen(true);
    setIsOpen(false);
  };

  const handleModalSubmit = async (type: 'nested' | 'separate', name: string) => {
    try {
      const newOrg = await clerk?.createOrganization({ name });
      if (!newOrg) return;

      if (type === 'nested' && createModalParentOrg) {
        const res = await fetch('/api/orgs/subaccount', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ childOrgId: newOrg.id, parentOrgId: createModalParentOrg.id })
        });

        if (!res.ok) {
          const cc = (window as any).cordToast;
          const msg = 'La cuenta se creó pero no se pudo anidar bajo la principal.';
          if (cc) cc(msg, 'error'); else alert(msg);
        }
      }

      await handleSwitch(newOrg.id);
      setCreateModalOpen(false);
    } catch (e) {
      console.error(e);
      const cc = (window as any).cordToast;
      if (cc) cc('Error al crear la cuenta', 'error');
      else alert('Error al crear la cuenta');
    }
  };

  const membershipsByParent: Record<string, any[]> = {};
  const rootMemberships: any[] = [];

  memberships.forEach((mem: any) => {
    const parentId = mem.organization.publicMetadata?.parentOrgId;
    if (parentId) {
      if (!membershipsByParent[parentId]) membershipsByParent[parentId] = [];
      membershipsByParent[parentId].push(mem);
    } else {
      rootMemberships.push(mem);
    }
  });

  // Fallback anti-desaparición: si una sub-cuenta apunta a un padre del que el
  // usuario NO es miembro, su padre nunca se renderiza como raíz → quedaría oculta.
  // La promovemos a raíz para que siga siendo accesible en el switcher.
  const rootOrgIds = new Set(rootMemberships.map((m: any) => m.organization.id));
  Object.keys(membershipsByParent).forEach((pid) => {
    if (!rootOrgIds.has(pid)) {
      rootMemberships.push(...membershipsByParent[pid]);
      delete membershipsByParent[pid];
    }
  });

  const handleOpenMainCreateModal = () => {
    if (organization) {
      setCreateModalParentOrg({ id: organization.id, name: organization.name });
    } else {
      setCreateModalParentOrg(null);
    }
    setCreateModalOpen(true);
    setIsOpen(false);
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
            {rootMemberships.map((mem: any) => {
              const selected = organization?.id === mem.organization.id;
              const hasChildren = membershipsByParent[mem.organization.id] && membershipsByParent[mem.organization.id].length > 0;
              const isCurrentParent = organization?.id === mem.organization.id || organization?.publicMetadata?.parentOrgId === mem.organization.id;
              
              return (
                <React.Fragment key={mem.id}>
                  <button
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
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </span>
                    )}
                  </button>
                  
                  {/* Render children sub-accounts */}
                  {(hasChildren || isCurrentParent) && (
                    <div className="org-children-container" style={{ paddingLeft: '8px', borderLeft: '1px solid var(--sb-divider)', marginLeft: '16px', marginTop: '2px', marginBottom: '4px' }}>
                      {membershipsByParent[mem.organization.id]?.map((childMem: any) => {
                        const childSelected = organization?.id === childMem.organization.id;
                        return (
                          <button
                            key={childMem.id}
                            className={`org-list-item ${childSelected ? 'selected' : ''}`}
                            onClick={() => handleSwitch(childMem.organization.id)}
                            role="menuitemradio"
                            aria-checked={childSelected}
                          >
                            <div className="org-avatar small" style={{ overflow: 'hidden', width: '20px', height: '20px', fontSize: '0.6rem', borderRadius: '4px' }}>
                              {childMem.organization.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="org-details">
                              <span className="org-item-name" title={childMem.organization.name} style={{ fontSize: '0.75rem' }}>{childMem.organization.name}</span>
                            </div>
                            {childSelected && (
                              <span className="orgd-check" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              </span>
                            )}
                          </button>
                        );
                      })}
                      
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div className="orgd-group">
            <button className="dropdown-action-btn" onClick={handleOpenMainCreateModal}>
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

        /* Create Modal CSS */
        .cm-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          animation: cmFadeIn 0.2s ease-out;
        }

        .cm-dialog {
          background: var(--sb-menu-solid-bg, #fff);
          border-radius: 16px;
          width: 100%; max-width: 680px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.2);
          display: flex; flex-direction: column;
          animation: cmZoomIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          border: 1px solid var(--sb-menu-border);
        }
        html[data-theme="dark"] .cm-dialog { background: #1c1c1e; }

        .cm-header {
          position: relative;
          padding: 24px 32px 16px;
        }
        .cm-close {
          position: absolute; top: 20px; right: 24px;
          background: transparent; border: none; cursor: pointer;
          color: var(--sb-menu-muted); padding: 4px; border-radius: 8px;
        }
        .cm-close:hover { background: var(--sb-hover-bg); }
        .cm-title {
          font-size: 1.4rem; font-weight: 600; color: var(--sb-text-strong);
          margin: 0 0 8px 0;
        }
        .cm-subtitle {
          font-size: 0.95rem; color: var(--sb-menu-muted); margin: 0;
        }

        .cm-body {
          padding: 16px 32px 32px;
          display: flex; gap: 24px;
        }

        .cm-card {
          flex: 1;
          border: 2px solid var(--sb-divider);
          border-radius: 12px;
          padding: 24px;
          cursor: pointer;
          transition: all 0.2s;
          background: transparent;
          display: flex; flex-direction: column; text-align: left;
        }
        .cm-card:hover {
          border-color: rgba(99, 102, 241, 0.4); 
        }
        .cm-card.selected {
          border-color: var(--color-blue-deep, #6366f1);
          background: rgba(99, 102, 241, 0.02);
        }

        .cm-card-graphic {
          background: #f8f9fa;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 24px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          min-height: 160px;
          border: 1px solid var(--sb-divider);
        }
        html[data-theme="dark"] .cm-card-graphic { background: rgba(0,0,0,0.2); }

        .cm-card-title {
          font-size: 1.05rem; font-weight: 600; color: var(--sb-text-strong); margin: 0 0 8px 0;
        }
        .cm-card.selected .cm-card-title {
          color: var(--color-blue-deep, #6366f1);
        }
        .cm-card-desc {
          font-size: 0.85rem; color: var(--sb-menu-muted); margin: 0; line-height: 1.5;
        }

        .cm-footer {
          padding: 16px 32px;
          border-top: 1px solid var(--sb-divider);
          display: flex; justify-content: space-between; align-items: center;
          background: rgba(0,0,0,0.015);
          border-radius: 0 0 16px 16px;
        }
        .cm-footer-text {
          font-size: 0.85rem; color: var(--sb-menu-muted);
        }
        .cm-footer-text a { color: var(--color-blue-deep, #6366f1); text-decoration: none; font-weight: 500;}
        .cm-btn {
          background: var(--color-blue-deep, #6366f1);
          color: #fff; border: none; padding: 10px 20px; border-radius: 8px;
          font-weight: 500; font-size: 0.95rem; cursor: pointer; transition: opacity 0.2s;
        }
        .cm-btn:hover { opacity: 0.9; }
        .cm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .cm-btn-secondary {
          background: transparent; color: var(--sb-text-strong);
          border: 1px solid var(--sb-divider);
        }
        .cm-btn-secondary:hover { background: var(--sb-hover-bg); opacity: 1; }

        .cm-input-group { margin-top: 16px; }
        .cm-label { display: block; font-size: 0.9rem; font-weight: 500; margin-bottom: 8px; color: var(--sb-text-strong); }
        .cm-input {
          width: 100%; padding: 12px 16px; border-radius: 8px;
          border: 1px solid var(--sb-divider); background: transparent;
          color: var(--sb-text-strong); font-size: 1rem;
        }
        .cm-input:focus { outline: none; border-color: var(--color-blue-deep, #6366f1); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15); }

        .cg-box {
          background: var(--sb-menu-solid-bg, #fff);
          border: 1px solid var(--sb-divider);
          border-radius: 8px; padding: 10px 14px;
          display: flex; align-items: center; gap: 8px;
          font-size: 0.85rem; font-weight: 500; color: var(--sb-text-strong);
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        html[data-theme="dark"] .cg-box { background: #2c2c2e; }
        .cg-box.child { background: transparent; border-style: dashed; box-shadow: none; }
        .cg-box.muted { opacity: 0.6; box-shadow: none; border-color: transparent; background: transparent; justify-content: center; }

        .cg-row { display: flex; gap: 16px; width: 100%; justify-content: center; align-items: center; }

        @keyframes cmFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cmZoomIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
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
          width: 280px;
          overflow: hidden;
          background: var(--sb-menu-solid-bg, #ffffff);
          border: 1px solid var(--sb-menu-border);
          border-radius: 12px;
          padding: 6px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0,0,0,0.1);
          transform-origin: top left;
          animation: dropdownFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sb-collapsed .org-dropdown { width: 272px; }

        html[data-theme="dark"] .org-dropdown { 
          border-color: var(--sb-menu-border);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2), 0 0 1px rgba(0,0,0,0.4);
        }

        .orgd-sheen {
          position: absolute; inset: 0; z-index: 0; pointer-events: none;
          border-radius: inherit;
          background: linear-gradient(180deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 25%);
        }
        html[data-theme="dark"] .orgd-sheen {
          background: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 25%);
        }

        @keyframes dropdownFade {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .orgd-section-label {
          position: relative; z-index: 1;
          font-size: 0.65rem;
          font-weight: 500;
          color: var(--sb-menu-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 0.4rem 0.6rem 0.2rem;
        }

        .orgd-group {
          position: relative; z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        
        .orgd-group:not(:last-child) {
          padding-bottom: 6px;
          margin-bottom: 6px;
          border-bottom: 1px solid var(--sb-divider);
        }

        .org-list {
          max-height: 208px;
          overflow-y: auto;
        }

        .orgd-empty {
          margin: 0;
          padding: 0.5rem 0.6rem;
          font-size: 0.75rem;
          line-height: 1.4;
          color: var(--sb-menu-muted);
        }

        .org-list-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.4rem 0.5rem;
          margin: 0 2px;
          border-radius: 6px;
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
          color: var(--sb-menu-text);
          transition: background 0.15s;
        }

        .org-list-item:hover {
          background: rgba(10,25,47,0.04);
        }
        html[data-theme="dark"] .org-list-item:hover { background: rgba(255,255,255,0.06); }

        .org-list-item.selected {
          background: rgba(10,25,47,0.03);
        }
        html[data-theme="dark"] .org-list-item.selected { background: rgba(255,255,255,0.04); }
        
        /* Remove the heavy border on selected small avatar */
        .org-list-item.selected .org-avatar.small {
          box-shadow: inset 0 1px 1px rgba(255,255,255,0.1);
        }

        .org-details {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }

        .org-item-name {
          font-size: 0.8rem;
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

        /* Clean checkmark without blue background circle */
        .orgd-check {
          flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          color: var(--color-blue-deep);
        }
        html[data-theme="dark"] .orgd-check {
          color: #fff;
        }

        .dropdown-action-btn {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.4rem 0.5rem;
          margin: 0 2px;
          border-radius: 6px;
          background: transparent;
          border: none;
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--sb-menu-text);
          cursor: pointer;
          text-align: left;
          text-decoration: none;
          transition: background 0.15s;
        }

        .dropdown-action-btn:hover {
          background: rgba(10,25,47,0.04);
        }
        html[data-theme="dark"] .dropdown-action-btn:hover { background: rgba(255,255,255,0.06); }

        .orgd-label { flex: 1; min-width: 0; }

        .orgd-icon {
          flex-shrink: 0;
          width: 20px; height: 20px;
          display: flex; align-items: center; justify-content: center;
        }
        
        .orgd-icon-neutral { color: var(--sb-menu-muted); }
        .dropdown-action-btn:hover .orgd-icon-neutral { color: var(--sb-menu-text); }

        .orgd-icon-amber { color: #d97706; }
        html[data-theme="dark"] .orgd-icon-amber { color: #fbbf24; }

        .orgd-icon-red { color: var(--color-danger); }

        .orgd-chevron {
          flex-shrink: 0;
          color: var(--sb-label);
          opacity: 0.5;
        }

        .flex-1 {
          flex: 1;
        }

        .dev-mode-toggle.active .orgd-label {
          color: #d97706;
          font-weight: 500;
        }
        html[data-theme="dark"] .dev-mode-toggle.active .orgd-label { color: #fbbf24; }

        .toggle-switch {
          width: 32px;
          height: 18px;
          border-radius: 100px;
          background: rgba(10,25,47,0.13);
          position: relative;
          transition: background 0.3s var(--ease-ios, cubic-bezier(0.25,1,0.5,1));
          flex-shrink: 0;
        }
        html[data-theme="dark"] .toggle-switch { background: rgba(255,255,255,0.16); }

        .toggle-thumb {
          width: 14px;
          height: 14px;
          background: #ffffff;
          border-radius: 50%;
          position: absolute;
          top: 2px;
          left: 2px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3), 0 1px 1px rgba(0,0,0,0.16);
          transition: transform 0.3s var(--ease-spring, cubic-bezier(0.22,1,0.36,1));
        }

        .toggle-switch.on {
          background: #f59e0b;
        }

        .toggle-switch.on .toggle-thumb {
          transform: translateX(14px);
        }

        .dropdown-action-btn.text-red {
          color: var(--color-danger);
        }

        .dropdown-action-btn.text-red:hover {
          background: rgba(239, 68, 68, 0.08);
        }
        
        .dropdown-action-btn.text-red .orgd-icon-red {
          color: var(--color-danger);
        }

        .user-profile-section {
          position: relative;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.4rem 0.5rem;
          margin: 0 2px;
          min-width: 0;
        }

        .user-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--sb-hover-bg);
          color: var(--sb-menu-text);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.7rem;
          flex-shrink: 0;
          border: 1px solid var(--sb-divider);
        }

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
      
      <CreateWorkspaceModal 
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        parentOrg={createModalParentOrg}
        onSubmit={handleModalSubmit}
      />
    </div>
  );
}
