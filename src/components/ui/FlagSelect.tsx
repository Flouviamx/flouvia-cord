import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { flagSrc } from '../../lib/flags';

export interface FlagOption {
  code: string;
  label: string;
  hint?: string;
  /**
   * ISO del país cuya bandera se muestra para esta opción — solo si difiere
   * de `code` (ej. moneda 'USD' → bandera 'US'). Si se omite, se usa `code`.
   * ⚠️ A propósito NO se acepta una función mapeadora (`flagFor`) como prop:
   * cuando este componente se monta como island `client:load`/`client:only`
   * desde un .astro, Astro serializa las props a JSON para la hidratación —
   * una función no sobrevive ese cruce (llega `undefined` en el cliente sin
   * ningún error visible). Los datos planos sí.
   */
  flag?: string;
}

export interface FlagSelectProps {
  options: FlagOption[];
  /** Modo controlado — si se pasa, el padre es dueño del valor. */
  value?: string;
  /** Modo no controlado (uso como island en .astro) — valor inicial. */
  defaultValue?: string;
  onChange?: (code: string) => void;
  ariaLabel?: string;
  /** id del botón visible — para asociar un <label htmlFor>. */
  id?: string;
  /**
   * Si se pasa, se renderiza un <select hidden> con este id/name que se
   * mantiene sincronizado y dispara un evento `change` real al cambiar —
   * permite meter este componente en una página con JS vanilla ya escrito
   * (document.getElementById(nativeId).value / .addEventListener('change')
   * / new FormData(form)) sin tocar ese script.
   */
  nativeId?: string;
  nativeName?: string;
  className?: string;
  disabled?: boolean;
}

// Por encima del overlay del modal de cuentas (z-index 100000) — el popup se
// portea a document.body para no quedar recortado por un ancestro con
// overflow:hidden (ej. .cm-dialog).
const FS_POPUP_Z = 100050;

export default function FlagSelect({
  options,
  value,
  defaultValue,
  onChange,
  ariaLabel,
  id,
  nativeId,
  nativeName,
  className = '',
  disabled = false,
}: FlagSelectProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(value ?? defaultValue ?? options[0]?.code ?? '');
  const current = isControlled ? (value as string) : internalValue;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((o) => o.code === current)));
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  const btnRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const nativeRef = useRef<HTMLSelectElement>(null);
  const reactId = useId();
  const listboxId = `fs-listbox-${reactId.replace(/[:]/g, '')}`;

  const getFlag = (code: string) => options.find((o) => o.code === code)?.flag || code;

  useEffect(() => {
    if (isControlled && value !== internalValue) setInternalValue(value as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // El <select> oculto SIEMPRE refleja `current`, sin importar si el cambio
  // vino de aquí o de que el padre reasignó `value` por su cuenta.
  useEffect(() => {
    if (nativeRef.current && nativeRef.current.value !== current) {
      nativeRef.current.value = current;
    }
  }, [current]);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || popupRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScrollOrResize = () => setOpen(false);
    document.addEventListener('mousedown', onDocPointer);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  function commit(code: string) {
    if (!isControlled) setInternalValue(code);
    onChange?.(code);
    if (nativeRef.current) {
      nativeRef.current.value = code;
      nativeRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function openList() {
    if (disabled || !options.length) return;
    const idx = Math.max(0, options.findIndex((o) => o.code === current));
    setActiveIndex(idx);
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPopupStyle({ position: 'fixed', top: r.bottom + 6, left: r.left, width: r.width, zIndex: FS_POPUP_Z });
    }
    setOpen(true);
  }

  function closeList(refocus = true) {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }

  function selectActive() {
    const opt = options[activeIndex];
    if (opt) commit(opt.code);
    closeList(true);
  }

  // Typeahead — igual que un <select> nativo: acumula letras en una ventana
  // de 500ms y salta a la primera opción cuyo label empiece por ese buffer.
  const typeaheadRef = useRef({ buffer: '', timer: 0 as unknown as ReturnType<typeof setTimeout> });
  function nextTypeaheadIndex(key: string, fromIndex: number): number | null {
    const ta = typeaheadRef.current;
    clearTimeout(ta.timer);
    ta.buffer += key.toLowerCase();
    ta.timer = setTimeout(() => { ta.buffer = ''; }, 500);
    const n = options.length;
    for (let step = 1; step <= n; step++) {
      const idx = (fromIndex + step) % n;
      if (options[idx].label.toLowerCase().startsWith(ta.buffer)) return idx;
    }
    for (let step = 0; step < n; step++) {
      const idx = (fromIndex + step) % n;
      if (options[idx].label.toLowerCase().startsWith(key.toLowerCase())) return idx;
    }
    return null;
  }

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const n = options.length;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openList();
        return;
      }
      if (e.key.length === 1 && /[a-z0-9]/i.test(e.key)) {
        e.preventDefault();
        const curIdx = Math.max(0, options.findIndex((o) => o.code === current));
        const idx = nextTypeaheadIndex(e.key, curIdx);
        if (idx !== null) commit(options[idx].code);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActiveIndex((i) => (i + 1) % n); return;
      case 'ArrowUp': e.preventDefault(); setActiveIndex((i) => (i - 1 + n) % n); return;
      case 'Home': e.preventDefault(); setActiveIndex(0); return;
      case 'End': e.preventDefault(); setActiveIndex(n - 1); return;
      case 'Enter':
      case ' ': e.preventDefault(); selectActive(); return;
      case 'Escape': e.preventDefault(); closeList(true); return;
      case 'Tab': closeList(false); return;
      default:
        if (e.key.length === 1 && /[a-z0-9]/i.test(e.key)) {
          e.preventDefault();
          const idx = nextTypeaheadIndex(e.key, activeIndex);
          if (idx !== null) setActiveIndex(idx);
        }
    }
  }

  const activeOpt = options[activeIndex];
  const activeId = open && activeOpt ? `${listboxId}-opt-${activeOpt.code}` : undefined;

  return (
    <div className={`fs-root ${className}`} ref={rootRef}>
      <button
        ref={btnRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-activedescendant={activeId}
        aria-label={ariaLabel}
        className={`fs-btn ${open ? 'is-open' : ''}`}
        disabled={disabled}
        onClick={() => (open ? closeList(true) : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="fs-flag" aria-hidden="true">
          {current ? <img src={flagSrc(getFlag(current))} alt="" width={20} height={20} /> : null}
        </span>
        <span className="fs-label">
          {options.find((o) => o.code === current)?.label || ''}
        </span>
        <svg className="fs-caret" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {nativeId && (
        <select
          ref={nativeRef}
          id={nativeId}
          name={nativeName}
          defaultValue={current}
          hidden
          aria-hidden="true"
          tabIndex={-1}
          onChange={() => { /* la fuente de verdad es el botón; este select solo espeja el valor para JS externo */ }}
        >
          {options.map((o) => (
            <option key={o.code} value={o.code}>{o.label}</option>
          ))}
        </select>
      )}

      {open && createPortal(
        <div
          ref={popupRef}
          id={listboxId}
          role="listbox"
          className="fs-list"
          style={popupStyle}
          aria-label={ariaLabel}
        >
          {options.map((opt, i) => (
            <div
              key={opt.code}
              id={`${listboxId}-opt-${opt.code}`}
              role="option"
              aria-selected={opt.code === current}
              className={`fs-opt ${i === activeIndex ? 'is-active' : ''} ${opt.code === current ? 'is-selected' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => { commit(opt.code); closeList(true); }}
            >
              <span className="fs-opt-flag" aria-hidden="true">
                <img src={flagSrc(getFlag(opt.code))} alt="" width={20} height={20} />
              </span>
              <span className="fs-opt-text">
                <span className="fs-opt-label">{opt.label}</span>
                {opt.hint ? <span className="fs-opt-hint">{opt.hint}</span> : null}
              </span>
              {opt.code === current && (
                <svg className="fs-opt-check" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}

      <style>{`
        .fs-root { position: relative; width: 100%; font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif); }

        .fs-btn {
          width: 100%; box-sizing: border-box;
          display: flex; align-items: center; gap: 10px;
          padding: 12px 14px; border-radius: 12px;
          border: 1.5px solid transparent;
          background: var(--app-canvas, #f5f5f7);
          color: var(--sb-text-strong, #0a192f);
          font-size: 0.92rem; font-family: inherit; text-align: left;
          cursor: pointer;
          transition: border-color 0.18s, background 0.18s, box-shadow 0.18s;
        }
        html[data-theme="dark"] .fs-btn { background: rgba(255,255,255,0.05); }
        .fs-btn:hover { background: var(--sb-hover-bg, rgba(10,25,47,0.04)); }
        .fs-btn:focus-visible, .fs-btn.is-open {
          outline: none;
          background: var(--sb-menu-solid-bg, #fff);
          border-color: var(--color-blue-deep, #0a192f);
          box-shadow: 0 0 0 4px rgba(10,25,47,0.08);
        }
        html[data-theme="dark"] .fs-btn:focus-visible, html[data-theme="dark"] .fs-btn.is-open {
          box-shadow: 0 0 0 4px rgba(107,155,242,0.18);
        }
        .fs-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .fs-flag {
          flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%;
          overflow: hidden; display: flex; line-height: 0;
          box-shadow: 0 0 0 1px rgba(10,25,47,0.08);
        }
        .fs-flag img { width: 100%; height: 100%; display: block; object-fit: cover; }

        .fs-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
        .fs-caret { flex-shrink: 0; color: var(--sb-menu-muted, #8a94a3); transition: transform 0.2s var(--ease-ios, cubic-bezier(0.25,1,0.5,1)); }
        .fs-btn.is-open .fs-caret { transform: rotate(180deg); }

        .fs-list {
          overflow-y: auto; max-height: 280px;
          background: var(--sb-menu-solid-bg, #fff);
          border: 1px solid var(--sb-menu-border, rgba(10,25,47,0.1));
          border-radius: 12px; padding: 6px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1), 0 20px 48px -16px rgba(10,25,47,0.28);
          animation: fsPop 0.16s cubic-bezier(0.16, 1, 0.3, 1);
        }
        html[data-theme="dark"] .fs-list { box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 20px 48px -16px rgba(0,0,0,0.5); }
        @keyframes fsPop { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

        .fs-opt {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 8px; cursor: pointer;
          color: var(--sb-menu-text, var(--sb-text-strong, #0a192f));
        }
        .fs-opt.is-active, .fs-opt:hover { background: var(--sb-hover-bg, rgba(10,25,47,0.05)); }
        html[data-theme="dark"] .fs-opt.is-active, html[data-theme="dark"] .fs-opt:hover { background: rgba(255,255,255,0.07); }

        .fs-opt-flag { flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; overflow: hidden; display: flex; line-height: 0; box-shadow: 0 0 0 1px rgba(10,25,47,0.08); }
        .fs-opt-flag img { width: 100%; height: 100%; display: block; object-fit: cover; }

        .fs-opt-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .fs-opt-label { font-size: 0.86rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fs-opt-hint { font-size: 0.72rem; color: var(--sb-menu-muted, #8a94a3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .fs-opt-check { flex-shrink: 0; color: var(--color-blue-deep, #0a192f); }
        html[data-theme="dark"] .fs-opt-check { color: #fff; }

        @media (prefers-reduced-motion: reduce) {
          .fs-list { animation: none; }
          .fs-caret { transition: none; }
        }
      `}</style>
    </div>
  );
}
