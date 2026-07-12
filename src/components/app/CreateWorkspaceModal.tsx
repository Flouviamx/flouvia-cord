import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

// Países soportados. México es el único con facturación (CFDI 4.0) 100% activa hoy;
// el resto se captura para la expansión / facturación internacional que viene.
// Las banderas son la excepción de emoji aprobada (selector de país/divisa).
export const COUNTRIES = [
  { code: 'MX', flag: '\u{1F1F2}\u{1F1FD}', name: 'México', tag: 'CFDI 4.0' },
  { code: 'US', flag: '\u{1F1FA}\u{1F1F8}', name: 'Estados Unidos', tag: '' },
  { code: 'CO', flag: '\u{1F1E8}\u{1F1F4}', name: 'Colombia', tag: '' },
  { code: 'AR', flag: '\u{1F1E6}\u{1F1F7}', name: 'Argentina', tag: '' },
  { code: 'CL', flag: '\u{1F1E8}\u{1F1F1}', name: 'Chile', tag: '' },
  { code: 'PE', flag: '\u{1F1F5}\u{1F1EA}', name: 'Perú', tag: '' },
  { code: 'ES', flag: '\u{1F1EA}\u{1F1F8}', name: 'España', tag: '' },
] as const;

type Country = (typeof COUNTRIES)[number]['code'];

export interface CreateWorkspaceSubmit {
  type: 'nested' | 'separate';
  name: string;
  country: Country;
}

export default function CreateWorkspaceModal({
  isOpen,
  onClose,
  parentOrg,
  siblings = [],
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  parentOrg: { id: string; name: string } | null;
  siblings?: string[];
  onSubmit: (opts: CreateWorkspaceSubmit) => Promise<void>;
}) {
  // Sin org padre (workspace personal) no tiene sentido "anidar" → saltamos el
  // paso 1 y creamos una cuenta independiente directamente.
  const canNest = !!parentOrg;

  const [step, setStep] = useState<1 | 2>(canNest ? 1 : 2);
  const [selectedType, setSelectedType] = useState<'nested' | 'separate'>(canNest ? 'nested' : 'separate');
  const [accountName, setAccountName] = useState('');
  const [country, setCountry] = useState<Country>('MX');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (isOpen) {
      setStep(canNest ? 1 : 2);
      setSelectedType(canNest ? 'nested' : 'separate');
      setAccountName('');
      setCountry('MX');
      setIsSubmitting(false);
    }
  }, [isOpen, canNest]);

  const parentName = parentOrg?.name || 'Tu organización';

  const handleSubmit = async () => {
    if (!accountName.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ type: canNest ? selectedType : 'separate', name: accountName.trim(), country });
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Árbol de preview (derecha del paso 2) — refleja dónde caerá la cuenta nueva.
  const previewName = accountName.trim() || 'Cuenta nueva';
  const showNested = canNest && selectedType === 'nested';

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="cm-overlay" onClick={onClose}>
      <div
        className={`cm-dialog ${step === 2 ? 'cm-dialog--wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button className="cm-close" onClick={onClose} aria-label="Cerrar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <div className="cm-header">
          {canNest && (
            <div className="cm-steps" aria-hidden="true">
              <span className={`cm-step ${step >= 1 ? 'on' : ''}`} />
              <span className={`cm-step ${step >= 2 ? 'on' : ''}`} />
            </div>
          )}
          <h2 className="cm-title">
            {step === 1 ? 'Crea una cuenta nueva' : 'Dale un nombre a tu cuenta'}
          </h2>
          <p className="cm-subtitle">
            {step === 1
              ? 'Elige cómo quieres organizar tus cuentas. Puedes tener varias marcas o entidades bajo un mismo inicio de sesión.'
              : 'El nombre y el país los puedes cambiar después en Ajustes.'}
          </p>
        </div>

        {/* ─────────────── PASO 1 · Tipo de cuenta ─────────────── */}
        {step === 1 && (
          <div className="cm-body cm-choices">
            <button
              type="button"
              className={`cm-choice ${selectedType === 'nested' ? 'selected' : ''}`}
              onClick={() => setSelectedType('nested')}
            >
              <span className="cm-choice-check" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </span>
              <span className="cm-graphic">
                <span className="cg-node cg-parent">
                  <HomeIcon />
                  <span className="cg-node-txt">{parentName}</span>
                </span>
                <span className="cg-branch">
                  <span className="cg-line" />
                  <span className="cg-kids">
                    <span className="cg-node cg-new">
                      <PlusIcon />
                      <span className="cg-node-txt">Cuenta nueva</span>
                    </span>
                    <span className="cg-node cg-ghost">
                      <span className="cg-node-txt">… otras cuentas</span>
                    </span>
                  </span>
                </span>
              </span>
              <span className="cm-choice-title">Agrupar bajo {parentName}</span>
              <span className="cm-choice-desc">
                Aparece anidada bajo <strong>{parentName}</strong> en tu selector de cuentas para tenerlo todo organizado. Cada cuenta conserva sus propios datos, equipo y reportes.
              </span>
            </button>

            <button
              type="button"
              className={`cm-choice ${selectedType === 'separate' ? 'selected' : ''}`}
              onClick={() => setSelectedType('separate')}
            >
              <span className="cm-choice-check" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </span>
              <span className="cm-graphic cm-graphic--row">
                <span className="cg-node">
                  <HomeIcon />
                  <span className="cg-node-txt">{parentName}</span>
                </span>
                <span className="cg-node cg-new">
                  <PlusIcon />
                  <span className="cg-node-txt">Cuenta nueva</span>
                </span>
              </span>
              <span className="cm-choice-title">Cuenta independiente</span>
              <span className="cm-choice-desc">
                Una cuenta completamente aparte, sin agrupar bajo <strong>{parentName}</strong> en tu selector.
              </span>
            </button>
          </div>
        )}

        {/* ─────────────── PASO 2 · Nombre + país + preview ─────────────── */}
        {step === 2 && (
          <div className="cm-body cm-form">
            <div className="cm-form-fields">
              <div className="cm-field">
                <label className="cm-label" htmlFor="cm-name">Nombre de la cuenta</label>
                <input
                  id="cm-name"
                  autoFocus
                  type="text"
                  className="cm-input"
                  placeholder="Ej. Distribuidora El Zarco"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                />
              </div>

              <div className="cm-field">
                <label className="cm-label" htmlFor="cm-country">País donde operas</label>
                <div className="cm-select-wrap">
                  <select
                    id="cm-country"
                    className="cm-select"
                    value={country}
                    onChange={(e) => setCountry(e.target.value as Country)}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag}  {c.name}
                      </option>
                    ))}
                  </select>
                  <svg className="cm-select-caret" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
                <p className="cm-hint">
                  Define tu moneda y tus documentos fiscales.{' '}
                  {country === 'MX'
                    ? 'Emitimos CFDI 4.0 ante el SAT.'
                    : 'La facturación local para este país está en camino — mientras tanto operas con cotizaciones y cobros normales.'}
                </p>
              </div>
            </div>

            <aside className="cm-preview" aria-label="Vista previa de la estructura">
              <span className="cm-preview-label">Así quedará</span>
              <div className="cm-tree">
                {showNested ? (
                  <>
                    <div className="cm-tree-node cm-tree-root">
                      <HomeIcon />
                      <span className="cm-tree-txt">{parentName}</span>
                    </div>
                    <div className="cm-tree-children">
                      <div className="cm-tree-node cm-tree-hl">
                        <span className="cm-tree-flag">{COUNTRIES.find((c) => c.code === country)?.flag}</span>
                        <span className="cm-tree-txt">{previewName}</span>
                        <span className="cm-tree-badge">Nueva</span>
                      </div>
                      {siblings.slice(0, 3).map((s, i) => (
                        <div key={i} className="cm-tree-node cm-tree-dim">
                          <span className="cm-tree-txt">{s}</span>
                        </div>
                      ))}
                      {siblings.length > 3 && (
                        <div className="cm-tree-node cm-tree-dim cm-tree-more">+ {siblings.length - 3} más</div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="cm-tree-node cm-tree-root cm-tree-hl">
                    <span className="cm-tree-flag">{COUNTRIES.find((c) => c.code === country)?.flag}</span>
                    <span className="cm-tree-txt">{previewName}</span>
                    <span className="cm-tree-badge">Nueva</span>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        <div className="cm-footer">
          {step === 1 ? (
            <button className="cm-btn cm-btn-primary" onClick={() => setStep(2)}>Continuar</button>
          ) : (
            <>
              {canNest && (
                <button className="cm-btn cm-btn-ghost" onClick={() => setStep(1)} disabled={isSubmitting}>Atrás</button>
              )}
              <button
                className="cm-btn cm-btn-primary"
                onClick={handleSubmit}
                disabled={!accountName.trim() || isSubmitting}
              >
                {isSubmitting ? 'Creando…' : 'Crear cuenta'}
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        .cm-overlay {
          position: fixed; inset: 0; z-index: 100000;
          background: rgba(10, 25, 47, 0.38);
          backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
          animation: cmFade 0.22s ease-out;
          font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif);
        }

        .cm-dialog {
          position: relative;
          background: var(--sb-menu-solid-bg, #fff);
          border: 1px solid var(--sb-menu-border, rgba(10,25,47,0.08));
          border-radius: 24px;
          width: 100%; max-width: 620px;
          box-shadow:
            0 2px 6px rgba(10,25,47,0.05),
            0 40px 80px -24px rgba(10,25,47,0.32),
            inset 0 1px 0 rgba(255,255,255,0.6);
          display: flex; flex-direction: column;
          animation: cmZoom 0.28s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }
        .cm-dialog--wide { max-width: 720px; }
        html[data-theme="dark"] .cm-dialog { box-shadow: 0 40px 80px -24px rgba(0,0,0,0.6); }

        .cm-close {
          position: absolute; top: 18px; right: 18px; z-index: 2;
          width: 30px; height: 30px;
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: none; cursor: pointer;
          color: var(--sb-menu-muted); border-radius: 9px;
          transition: background 0.18s, color 0.18s;
        }
        .cm-close:hover { background: var(--sb-hover-bg); color: var(--sb-text-strong); }

        .cm-header { padding: 30px 32px 0; }
        .cm-steps { display: flex; gap: 6px; margin-bottom: 18px; }
        .cm-step {
          width: 26px; height: 4px; border-radius: 99px;
          background: var(--sb-divider);
          transition: background 0.3s var(--ease-ios, cubic-bezier(0.25,1,0.5,1));
        }
        .cm-step.on { background: var(--color-blue-deep, #0a192f); }

        .cm-title {
          font-size: 1.45rem; font-weight: 600; line-height: 1.15;
          letter-spacing: -0.02em; color: var(--sb-text-strong);
          margin: 0 0 8px;
        }
        .cm-subtitle {
          font-size: 0.9rem; line-height: 1.5; color: var(--sb-menu-muted);
          margin: 0; max-width: 90%;
        }

        .cm-body { padding: 24px 32px 28px; }

        /* ── Paso 1: tarjetas de elección ── */
        .cm-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .cm-choice {
          position: relative;
          border: 1.5px solid var(--sb-divider);
          border-radius: 18px;
          padding: 18px;
          cursor: pointer; text-align: left;
          background: transparent;
          display: flex; flex-direction: column;
          transition: border-color 0.2s, background 0.2s, transform 0.2s;
        }
        .cm-choice:hover { border-color: rgba(10,25,47,0.22); }
        html[data-theme="dark"] .cm-choice:hover { border-color: rgba(255,255,255,0.24); }
        .cm-choice.selected {
          border-color: var(--color-blue-deep, #0a192f);
          background: var(--sb-hover-bg);
        }
        .cm-choice-check {
          position: absolute; top: 14px; right: 14px;
          width: 20px; height: 20px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: var(--color-blue-deep, #0a192f); color: #fff;
          opacity: 0; transform: scale(0.6);
          transition: opacity 0.2s, transform 0.2s var(--ease-spring, cubic-bezier(0.22,1,0.36,1));
        }
        .cm-choice.selected .cm-choice-check { opacity: 1; transform: scale(1); }

        .cm-graphic {
          background: var(--app-canvas, #f5f5f7);
          border-radius: 12px;
          padding: 20px 16px; margin-bottom: 16px;
          min-height: 132px;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
        }
        html[data-theme="dark"] .cm-graphic { background: rgba(0,0,0,0.22); }
        .cm-graphic--row { flex-direction: row; gap: 10px; }

        .cg-node {
          display: flex; align-items: center; gap: 7px;
          background: var(--sb-menu-solid-bg, #fff);
          border: 1px solid var(--sb-divider);
          border-radius: 9px; padding: 8px 11px;
          font-size: 0.72rem; font-weight: 600; color: var(--sb-text-strong);
          box-shadow: 0 2px 6px rgba(10,25,47,0.06);
          max-width: 150px; min-width: 0;
        }
        html[data-theme="dark"] .cg-node { background: #1c2430; }
        .cg-node svg { flex-shrink: 0; color: var(--sb-menu-muted); }
        .cg-node-txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cg-parent { align-self: stretch; }
        .cg-branch { display: flex; gap: 10px; align-self: stretch; padding-left: 12px; }
        .cg-line { width: 1.5px; background: var(--sb-divider); border-radius: 2px; flex-shrink: 0; }
        .cg-kids { display: flex; flex-direction: column; gap: 7px; flex: 1; min-width: 0; }
        .cg-new { border-style: dashed; border-color: var(--color-blue-deep, #0a192f); color: var(--color-blue-deep, #0a192f); box-shadow: none; background: transparent; }
        .cg-new svg { color: var(--color-blue-deep, #0a192f); }
        .cg-ghost { opacity: 0.5; box-shadow: none; border-style: dashed; background: transparent; }

        .cm-choice-title {
          font-size: 0.95rem; font-weight: 600; color: var(--sb-text-strong);
          margin-bottom: 5px; letter-spacing: -0.01em;
        }
        .cm-choice-desc { font-size: 0.8rem; line-height: 1.45; color: var(--sb-menu-muted); }

        /* ── Paso 2: formulario + preview ── */
        .cm-form { display: grid; grid-template-columns: 1fr 0.82fr; gap: 24px; align-items: start; }
        .cm-form-fields { display: flex; flex-direction: column; gap: 20px; }
        .cm-field { display: flex; flex-direction: column; }
        .cm-label { font-size: 0.82rem; font-weight: 600; color: var(--sb-text-strong); margin-bottom: 8px; }
        .cm-input, .cm-select {
          width: 100%; box-sizing: border-box;
          padding: 12px 14px; border-radius: 12px;
          border: 1.5px solid transparent;
          background: var(--app-canvas, #f5f5f7);
          color: var(--sb-text-strong); font-size: 0.92rem;
          font-family: inherit;
          transition: border-color 0.18s, background 0.18s, box-shadow 0.18s;
        }
        html[data-theme="dark"] .cm-input, html[data-theme="dark"] .cm-select { background: rgba(255,255,255,0.05); }
        .cm-input::placeholder { color: var(--sb-menu-muted); }
        .cm-input:focus, .cm-select:focus {
          outline: none;
          background: var(--sb-menu-solid-bg, #fff);
          border-color: var(--color-blue-deep, #0a192f);
          box-shadow: 0 0 0 4px rgba(10,25,47,0.08);
        }
        html[data-theme="dark"] .cm-input:focus, html[data-theme="dark"] .cm-select:focus { box-shadow: 0 0 0 4px rgba(107,155,242,0.18); }
        .cm-select-wrap { position: relative; }
        .cm-select { appearance: none; -webkit-appearance: none; padding-right: 40px; cursor: pointer; }
        .cm-select-caret { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--sb-menu-muted); }
        .cm-hint { font-size: 0.76rem; line-height: 1.45; color: var(--sb-menu-muted); margin: 8px 0 0; }

        .cm-preview {
          background: var(--app-canvas, #f5f5f7);
          border-radius: 16px; padding: 16px 16px 18px;
          align-self: stretch;
        }
        html[data-theme="dark"] .cm-preview { background: rgba(255,255,255,0.03); }
        .cm-preview-label {
          display: block; font-size: 0.66rem; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.05em; color: var(--sb-menu-muted); margin-bottom: 12px;
        }
        .cm-tree { display: flex; flex-direction: column; gap: 6px; }
        .cm-tree-node {
          display: flex; align-items: center; gap: 8px;
          background: var(--sb-menu-solid-bg, #fff);
          border: 1px solid var(--sb-divider);
          border-radius: 10px; padding: 9px 11px;
          font-size: 0.78rem; font-weight: 500; color: var(--sb-text-strong);
          min-width: 0;
        }
        html[data-theme="dark"] .cm-tree-node { background: #1c2430; }
        .cm-tree-node svg { flex-shrink: 0; color: var(--sb-menu-muted); }
        .cm-tree-txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
        .cm-tree-flag { font-size: 0.9rem; flex-shrink: 0; line-height: 1; }
        .cm-tree-children {
          display: flex; flex-direction: column; gap: 6px;
          margin: 6px 0 0 12px; padding-left: 12px;
          border-left: 1.5px solid var(--sb-divider);
        }
        .cm-tree-hl {
          border-color: var(--color-blue-deep, #0a192f);
          box-shadow: 0 0 0 1px var(--color-blue-deep, #0a192f), 0 6px 16px -8px rgba(10,25,47,0.3);
        }
        .cm-tree-badge {
          flex-shrink: 0; font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
          padding: 2px 7px; border-radius: 99px;
          background: var(--color-blue-deep, #0a192f); color: #fff;
        }
        html[data-theme="dark"] .cm-tree-badge { color: #0b1018; }
        .cm-tree-dim { opacity: 0.55; }
        .cm-tree-more { justify-content: center; font-size: 0.72rem; border-style: dashed; background: transparent; }
        html[data-theme="dark"] .cm-tree-more { background: transparent; }

        /* ── Footer ── */
        .cm-footer {
          padding: 16px 32px 24px;
          display: flex; justify-content: flex-end; align-items: center; gap: 10px;
        }
        .cm-btn {
          font-family: inherit; font-size: 0.9rem; font-weight: 600;
          border-radius: 999px; padding: 11px 26px; cursor: pointer;
          border: 1px solid transparent;
          transition: transform 0.14s, background 0.18s, opacity 0.18s;
        }
        .cm-btn:active { transform: scale(0.97); }
        .cm-btn-primary { background: var(--color-blue-deep, #0a192f); color: #fff; }
        html[data-theme="dark"] .cm-btn-primary { color: #0b1018; }
        .cm-btn-primary:hover { opacity: 0.9; }
        .cm-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
        .cm-btn-primary:disabled:active { transform: none; }
        .cm-btn-ghost { background: transparent; color: var(--sb-text-strong); border-color: var(--sb-divider); }
        .cm-btn-ghost:hover { background: var(--sb-hover-bg); }
        .cm-btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }

        @keyframes cmFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cmZoom { from { opacity: 0; transform: scale(0.96) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }

        @media (max-width: 640px) {
          .cm-choices { grid-template-columns: 1fr; }
          .cm-form { grid-template-columns: 1fr; }
          .cm-preview { order: -1; }
          .cm-header { padding: 26px 22px 0; }
          .cm-body { padding: 20px 22px 24px; }
          .cm-footer { padding: 14px 22px 22px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .cm-overlay, .cm-dialog { animation: none; }
          .cm-btn:active { transform: none; }
        }
      `}</style>
    </div>,
    document.body
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
  );
}
