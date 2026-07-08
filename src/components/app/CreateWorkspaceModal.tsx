import React, { useState, useEffect } from 'react';

// Using inline styles/classes that map to standard Flouvia CSS variables
export default function CreateWorkspaceModal({ 
  isOpen, 
  onClose, 
  parentOrg, 
  onSubmit 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  parentOrg: { id: string, name: string } | null; 
  onSubmit: (type: 'nested' | 'separate', name: string) => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<'nested' | 'separate'>('nested');
  const [accountName, setAccountName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedType('nested');
      setAccountName('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNext = () => {
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!accountName.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(selectedType, accountName);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const parentName = parentOrg?.name || 'Tu Organización';

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-dialog" onClick={e => e.stopPropagation()}>
        <div className="cm-header">
          <h2 className="cm-title">{step === 1 ? 'Crea una cuenta nueva' : 'Asigna un nombre a tu cuenta'}</h2>
          <p className="cm-subtitle">
            {step === 1 
              ? 'Elige cómo quieres organizar tus cuentas.' 
              : 'Puedes cambiar esto más adelante en la configuración.'}
          </p>
          <button className="cm-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {step === 1 && (
          <div className="cm-body">
            <button 
              className={`cm-card ${selectedType === 'nested' ? 'selected' : ''}`}
              onClick={() => setSelectedType('nested')}
            >
              <div className="cm-card-graphic">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '220px' }}>
                  <div className="cg-box" style={{ width: '100%', zIndex: 2 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{parentName}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginLeft: '16px' }}>
                    <div style={{ width: '2px', background: 'var(--sb-divider)', position: 'relative' }}>
                       <div style={{ position: 'absolute', top: '19px', left: '0', width: '12px', height: '2px', background: 'var(--sb-divider)' }}></div>
                       <div style={{ position: 'absolute', top: '65px', left: '0', width: '12px', height: '2px', background: 'var(--sb-divider)' }}></div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                       <div className="cg-box child" style={{ width: '100%' }}>
                         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                         Nueva cuenta
                       </div>
                       <div className="cg-box muted" style={{ width: '100%', padding: '10px' }}>
                         ... + 2 más
                       </div>
                    </div>
                  </div>
                </div>
              </div>
              <h3 className="cm-card-title">Crea una cuenta en tu organización</h3>
              <p className="cm-card-desc">Abre una cuenta que comparta datos, miembros del equipo e informes con <strong>{parentName}</strong>.</p>
            </button>

            <button 
              className={`cm-card ${selectedType === 'separate' ? 'selected' : ''}`}
              onClick={() => setSelectedType('separate')}
            >
              <div className="cm-card-graphic" style={{ justifyContent: 'center' }}>
                <div className="cg-row">
                  <div className="cg-box" style={{ flex: 1, maxWidth: '140px', padding: '10px 8px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.75rem' }}>{parentName}</span>
                  </div>
                  <div className="cg-box child" style={{ flex: 1, maxWidth: '140px', justifyContent: 'center', padding: '10px 8px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    <span style={{ fontSize: '0.75rem' }}>Nueva cuenta</span>
                  </div>
                </div>
              </div>
              <h3 className="cm-card-title">Crear una cuenta separada</h3>
              <p className="cm-card-desc">Abre una cuenta que no comparta datos, miembros del equipo ni informes con <strong>{parentName}</strong>.</p>
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="cm-body" style={{ display: 'block' }}>
            <div className="cm-input-group">
              <label className="cm-label">Nombre de la cuenta</label>
              <input 
                autoFocus
                type="text" 
                className="cm-input" 
                placeholder="Ej. Flouvia México" 
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && accountName.trim() && !isSubmitting) {
                    handleSubmit();
                  }
                }}
              />
            </div>
          </div>
        )}

        <div className="cm-footer">
          {step === 1 ? (
            <>
              <span className="cm-footer-text">¿No tienes claro cuál es la adecuada para ti? <a href="#">Consulta la documentación</a></span>
              <button className="cm-btn" onClick={handleNext}>Siguiente</button>
            </>
          ) : (
            <>
              <button className="cm-btn cm-btn-secondary" onClick={() => setStep(1)} disabled={isSubmitting}>Atrás</button>
              <button className="cm-btn" onClick={handleSubmit} disabled={!accountName.trim() || isSubmitting}>
                {isSubmitting ? 'Creando...' : 'Crear cuenta'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
