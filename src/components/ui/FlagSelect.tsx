import React, { useEffect, useId, useRef, useState, useCallback } from 'react';
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
  /** Integra el select espejo con formularios genéricos basados en data-field. */
  nativeDataField?: string;
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
  nativeDataField,
  className = '',
  disabled = false,
}: FlagSelectProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(value ?? defaultValue ?? options[0]?.code ?? '');
  const current = isControlled ? (value as string) : internalValue;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  const btnRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const nativeRef = useRef<HTMLSelectElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const listboxId = `fs-listbox-${reactId.replace(/[:]/g, '')}`;

  const getFlag = (code: string) => options.find((o) => o.code === code)?.flag || code;

  // Opciones filtradas por búsqueda
  const filtered = search.trim()
    ? options.filter((o) => {
        const q = search.toLowerCase();
        return o.code.toLowerCase().includes(q)
          || o.label.toLowerCase().includes(q)
          || (o.hint && o.hint.toLowerCase().includes(q));
      })
    : options;

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

  // Reset del activeIndex cuando cambia el filtro
  useEffect(() => {
    // Al filtrar, si el valor actual está en la lista filtrada, seleccionarlo;
    // si no, ir al primer item.
    const currentIdx = filtered.findIndex((o) => o.code === current);
    setActiveIndex(currentIdx >= 0 ? currentIdx : 0);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll automático para mantener visible el item activo
  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || popupRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Solo cerramos al hacer scroll FUERA del popup — el scroll DENTRO del
    // listbox (o del search) no debe cerrar el dropdown. Usamos capture para
    // interceptar scroll en cualquier ancestro.
    const onScrollOutside = (e: Event) => {
      // Si el scroll viene del popup o de alguno de sus hijos, ignorar.
      if (popupRef.current && popupRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('mousedown', onDocPointer);
    window.addEventListener('scroll', onScrollOutside, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      window.removeEventListener('scroll', onScrollOutside, true);
      window.removeEventListener('resize', onResize);
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
    setSearch('');
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // Calcular si el popup cabe abajo o necesita ir arriba
      const spaceBelow = window.innerHeight - r.bottom - 6;
      const maxH = 340; // max-height del popup (con search: un poco más que antes)
      const goUp = spaceBelow < maxH && r.top > spaceBelow;
      setPopupStyle({
        position: 'fixed',
        ...(goUp
          ? { bottom: window.innerHeight - r.top + 6 }
          : { top: r.bottom + 6 }),
        left: r.left,
        width: r.width,
        zIndex: FS_POPUP_Z,
      });
    }
    setOpen(true);
    // Focus el input de búsqueda después del render
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function closeList(refocus = true) {
    setOpen(false);
    setSearch('');
    if (refocus) btnRef.current?.focus();
  }

  function selectActive() {
    const opt = filtered[activeIndex];
    if (opt) commit(opt.code);
    closeList(true);
  }

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const n = filtered.length;
    if (!n) return;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActiveIndex((i) => (i + 1) % n); return;
      case 'ArrowUp': e.preventDefault(); setActiveIndex((i) => (i - 1 + n) % n); return;
      case 'Home': e.preventDefault(); setActiveIndex(0); return;
      case 'End': e.preventDefault(); setActiveIndex(n - 1); return;
      case 'Enter': e.preventDefault(); selectActive(); return;
      case 'Escape': e.preventDefault(); closeList(true); return;
      case 'Tab': closeList(false); return;
    }
  }, [filtered, activeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openList();
        return;
      }
      // Cualquier letra abre y empieza a buscar
      if (e.key.length === 1 && /[a-z0-9]/i.test(e.key)) {
        e.preventDefault();
        openList();
        // El search se establece después del render
        requestAnimationFrame(() => setSearch(e.key));
        return;
      }
      return;
    }
    onKeyDown(e);
  }

  const activeOpt = filtered[activeIndex];
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
          data-field={nativeDataField}
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
          className="fs-popup"
          style={popupStyle}
        >
          {/* Barra de búsqueda — solo se muestra si hay suficientes opciones */}
          {options.length > 8 && (
            <div className="fs-search-wrap">
              <svg className="fs-search-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                className="fs-search"
                placeholder="Buscar…"
                value={search}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={onKeyDown}
                aria-label="Buscar opciones"
              />
              {search && (
                <button
                  type="button"
                  className="fs-search-clear"
                  onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                  aria-label="Limpiar búsqueda"
                  tabIndex={-1}
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
            </div>
          )}

          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="fs-list"
            aria-label={ariaLabel}
          >
            {filtered.length === 0 && (
              <div className="fs-empty">Sin resultados</div>
            )}
            {filtered.map((opt, i) => (
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
          </div>
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

        /* ── Popup container (search + list) ── */
        .fs-popup {
          display: flex; flex-direction: column;
          background: var(--sb-menu-solid-bg, #fff);
          border: 1px solid var(--sb-menu-border, rgba(10,25,47,0.1));
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1), 0 20px 48px -16px rgba(10,25,47,0.28);
          animation: fsPop 0.16s cubic-bezier(0.16, 1, 0.3, 1);
          max-height: 340px;
          overflow: hidden;
        }
        html[data-theme="dark"] .fs-popup { box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 20px 48px -16px rgba(0,0,0,0.5); }

        /* ── Search bar ── */
        .fs-search-wrap {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px;
          border-bottom: 1px solid var(--sb-menu-border, rgba(10,25,47,0.08));
          flex-shrink: 0;
        }
        .fs-search-icon { flex-shrink: 0; color: var(--sb-menu-muted, #8a94a3); }
        .fs-search {
          flex: 1; min-width: 0;
          border: none; outline: none; background: transparent;
          font-family: inherit; font-size: 0.84rem;
          color: var(--sb-text-strong, #0a192f);
          padding: 4px 0;
        }
        .fs-search::placeholder { color: var(--sb-menu-muted, #8a94a3); }
        html[data-theme="dark"] .fs-search { color: #fff; }
        .fs-search-clear {
          flex-shrink: 0; width: 20px; height: 20px;
          display: flex; align-items: center; justify-content: center;
          background: var(--sb-hover-bg, rgba(10,25,47,0.06));
          border: none; border-radius: 50%; cursor: pointer;
          color: var(--sb-menu-muted, #8a94a3);
          transition: background 0.15s, color 0.15s;
        }
        .fs-search-clear:hover { background: rgba(10,25,47,0.1); color: var(--sb-text-strong, #0a192f); }
        html[data-theme="dark"] .fs-search-clear { background: rgba(255,255,255,0.08); }
        html[data-theme="dark"] .fs-search-clear:hover { background: rgba(255,255,255,0.14); color: #fff; }

        /* ── Scrollable list ── */
        .fs-list {
          overflow-y: auto; flex: 1; min-height: 0;
          padding: 6px;
          overscroll-behavior: contain;
        }

        .fs-empty {
          padding: 16px 10px; text-align: center;
          font-size: 0.82rem; color: var(--sb-menu-muted, #8a94a3);
        }

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
          .fs-popup { animation: none; }
          .fs-caret { transition: none; }
        }
      `}</style>
    </div>
  );
}
