import React, { useState, useRef, useEffect } from 'react';
import { useOrganizationList } from '@clerk/clerk-react';
import './B2B.css';

export default function WorkspaceSwitcher() {
  const { isLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: {
      infinite: true,
    },
  });

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isLoaded || !userMemberships.data) {
    return (
      <div className="b2b-switcher-skeleton">
        <div className="b2b-skeleton-avatar"></div>
        <div className="b2b-skeleton-text"></div>
      </div>
    );
  }

  // Find active organization or default to first if somehow out of sync
  const activeOrgId = userMemberships.data.find(m => m.organization.id === window.Clerk?.organization?.id)?.organization.id || 
                      userMemberships.data[0]?.organization.id;
                      
  const activeMembership = userMemberships.data.find(m => m.organization.id === activeOrgId);

  const handleSelect = async (orgId: string) => {
    setIsOpen(false);
    if (orgId === activeOrgId) return;
    
    await setActive({ organization: orgId });
    window.location.reload(); // Reload to refresh Astro locals and DB data
  };

  return (
    <div className="b2b-switcher" ref={dropdownRef}>
      <button 
        className="b2b-switcher-btn" 
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="b2b-switcher-avatar">
          {activeMembership?.organization.name.charAt(0).toUpperCase() || 'C'}
        </div>
        <span className="b2b-switcher-name">
          {activeMembership?.organization.name || 'Sin Espacio'}
        </span>
        <svg className="b2b-switcher-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className="b2b-dropdown">
          <div className="b2b-dropdown-label">Tus Agencias</div>
          <div className="b2b-dropdown-list">
            {userMemberships.data.map((mem) => (
              <button 
                key={mem.organization.id}
                className={`b2b-dropdown-item ${mem.organization.id === activeOrgId ? 'active' : ''}`}
                onClick={() => handleSelect(mem.organization.id)}
              >
                <div className="b2b-switcher-avatar small">
                  {mem.organization.name.charAt(0).toUpperCase()}
                </div>
                <span>{mem.organization.name}</span>
                {mem.organization.id === activeOrgId && (
                  <svg className="b2b-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          <div className="b2b-dropdown-divider"></div>
          <a href="/onboarding/workspace" className="b2b-dropdown-action">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Crear nueva agencia
          </a>
        </div>
      )}
    </div>
  );
}
