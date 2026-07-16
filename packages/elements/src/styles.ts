// Hoja de estilos DEFAULT de los componentes nativos (CordBuilder + slots).
//
// Decisión de diseño (la que hace que Tailwind del host SIEMPRE gane, sin un
// solo `!important`): estos defaults van envueltos en `@layer cord` y el
// <style> se `prepend()`-ea al <head> (no se appendea). Dos mitades:
//   1. Tailwind v4 emite sus utilities dentro de `@layer utilities`. CSS SIN
//      capa le gana a CSS CON capa sin importar el orden de aparición — así
//      que meternos en una capa (`cord`) es obligatorio, o un `.cord-*`
//      cualquiera le ganaría a un `.px-4` del host.
//   2. `prepend()` hace que la capa `cord` sea la PRIMERA declarada. Entre
//      capas, la ÚLTIMA declarada gana los empates — así que Tailwind
//      (declarado después, cuando el host lo importa) siempre le gana a
//      nuestros defaults. Un host SIN capas (CSS normal, sin @layer) también
//      gana, porque CSS sin capa > CSS con capa, siempre.
// Resultado: cero `!important`, el host SIEMPRE puede sobreescribirnos con
// una regla CSS normal, y sin embargo un `npm install` sin ninguna config de
// estilos ya se ve terminado.
const STYLE_ID = 'cord-elements-base-style';

const BASE_CSS = `
@layer cord {
  .cord-builderRoot {
    font-family: var(--cord-font-family, system-ui, -apple-system, sans-serif);
    color: var(--cord-color-text, #0A2240);
    background-color: var(--cord-color-background, #ffffff);
    border-radius: var(--cord-border-radius, 16px);
    padding: 24px;
    border: 1px solid var(--cord-color-border, rgba(0, 0, 0, 0.08));
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.04);
    max-width: 100%;
    box-sizing: border-box;
    font-size: var(--cord-font-size, 14px);
  }
  .cord-builderRoot *, .cord-builderRoot *::before, .cord-builderRoot *::after {
    box-sizing: border-box;
  }
  .cord-sectionTitle { margin: 0 0 16px 0; font-size: 18px; font-weight: 600; }

  .cord-formField { margin-bottom: 24px; }
  .cord-formFieldGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
  .cord-formFieldLabel { display: block; font-size: 13px; font-weight: 600; color: inherit; opacity: 0.8; margin-bottom: 6px; }
  .cord-formFieldInput, .cord-formFieldSelect, .cord-formFieldTextarea {
    width: 100%; padding: 10px 14px; border-radius: 8px;
    border: 1px solid var(--cord-color-border, rgba(0, 0, 0, 0.15));
    font-family: inherit; font-size: 14px;
    background-color: var(--cord-color-background, #ffffff);
    color: inherit;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .cord-formFieldInput:focus, .cord-formFieldSelect:focus, .cord-formFieldTextarea:focus {
    outline: none;
    border-color: var(--cord-color-primary, #0A2240);
    box-shadow: 0 0 0 3px rgba(10, 34, 64, 0.12);
  }
  .cord-formFieldTextarea { min-height: 80px; resize: vertical; }

  .cord-itemsHeader { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
  .cord-itemsHeaderActions { display: flex; gap: 16px; align-items: center; }
  .cord-addItemButton { background: transparent; border: none; color: var(--cord-color-primary, #0A2240); font-weight: 600; cursor: pointer; font-size: 14px; font-family: inherit; padding: 0; }
  .cord-addItemButton:hover { text-decoration: underline; }

  .cord-ivaToggleLabel { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; opacity: 0.8; user-select: none; }
  .cord-ivaToggleTrack { position: relative; width: 36px; height: 20px; border-radius: 20px; background-color: var(--cord-color-border, #cbd5e1); transition: background-color 0.2s ease; flex-shrink: 0; }
  .cord-ivaToggleTrack[data-checked="true"] { background-color: var(--cord-color-primary, #0A2240); }
  .cord-ivaToggleThumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: #fff; border-radius: 50%; transition: left 0.2s ease; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); }
  .cord-ivaToggleTrack[data-checked="true"] .cord-ivaToggleThumb { left: 18px; }

  .cord-itemRow { display: flex; gap: 12px; align-items: flex-end; background: rgba(10, 25, 47, 0.03); padding: 16px; border-radius: 12px; flex-wrap: wrap; }
  .cord-itemDescriptionField { flex: 1 1 200px; position: relative; }
  .cord-itemDescriptionInput { width: 100%; border: none; border-bottom: 2px solid var(--cord-color-border, rgba(0, 0, 0, 0.1)); border-radius: 0; padding: 8px 4px; background: transparent; box-shadow: none; font-size: 15px; font-family: inherit; outline: none; transition: border-color 0.2s ease; }
  .cord-itemDescriptionInput:focus { border-bottom-color: var(--cord-color-primary, #0A2240); }
  .cord-itemQtyField { width: 80px; flex: 0 0 80px; }
  .cord-itemPriceField { width: 120px; flex: 0 0 120px; }
  .cord-itemRemoveButton { background: transparent; border: none; color: #64748b; cursor: pointer; padding: 10px; opacity: 0.8; display: flex; align-items: center; justify-content: center; transition: color 0.2s ease, opacity 0.2s ease; }
  .cord-itemRemoveButton:hover:not(:disabled) { color: var(--cord-color-danger, #dc2626); opacity: 1; }
  .cord-itemRemoveButton:disabled { cursor: not-allowed; opacity: 0.3; }

  .cord-productDropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; margin-top: 4px; background: var(--cord-color-background, #ffffff); border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.16); border: 1px solid var(--cord-color-border, rgba(0, 0, 0, 0.08)); max-height: 300px; overflow-y: auto; }
  .cord-productDropdownItem { padding: 12px 16px; color: var(--cord-color-text, #0A2240); font-size: 13px; cursor: pointer; border-bottom: 1px solid var(--cord-color-border, rgba(0, 0, 0, 0.05)); display: flex; justify-content: space-between; align-items: center; transition: background-color 0.1s ease; }
  .cord-productDropdownItem:hover { background-color: rgba(10, 25, 47, 0.06); }
  .cord-productDropdownEmpty { padding: 12px 16px; color: var(--cord-color-text-secondary, #94a3b8); font-size: 13px; font-style: italic; display: flex; align-items: center; gap: 8px; }

  .cord-summaryRoot { display: flex; justify-content: flex-end; margin-bottom: 24px; }
  .cord-summaryInner { width: 250px; font-size: 14px; }
  .cord-summaryRow { display: flex; justify-content: space-between; margin-bottom: 8px; opacity: 0.8; }
  .cord-summaryTotalRow { display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--cord-color-border, rgba(0, 0, 0, 0.1)); font-weight: bold; font-size: 16px; opacity: 1; }

  .cord-submitRow { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
  .cord-errorText { color: var(--cord-color-danger, #dc2626); font-size: 13px; background-color: rgba(220, 38, 38, 0.08); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(220, 38, 38, 0.2); font-weight: 500; }
  .cord-submitButton { background-color: var(--cord-color-primary, #0A2240); color: #ffffff; padding: 12px 24px; border-radius: var(--cord-border-radius, 12px); border: none; font-weight: 600; cursor: pointer; font-family: inherit; font-size: 15px; transition: opacity 0.15s ease, transform 0.1s ease; }
  .cord-submitButton:disabled { opacity: 0.7; cursor: not-allowed; }
  .cord-submitButton:active:not(:disabled) { transform: scale(0.98); }
}
`;

/**
 * Inyecta la hoja default (idempotente, `head.prepend()`). No hace nada si
 * `baseTheme: 'none'` fue pasado (headless real: las clases `.cord-*` se
 * siguen emitiendo en el markup, pero sin ningún CSS que las pinte).
 */
export function injectBaseStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = BASE_CSS;
    document.head.prepend(style);
}
