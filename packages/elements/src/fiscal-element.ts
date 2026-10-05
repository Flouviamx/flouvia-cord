// <cord-fiscal-form>: captura de datos fiscales del receptor en un Shadow DOM.
// Es un elemento asociado a formularios: dentro de tu <form> aporta su valor
// (JSON del receptor normalizado) bajo su atributo `name` y bloquea el envío
// mientras haya errores, igual que un <input required>. Valida con el mismo
// código que el servidor, así que lo que acepta aquí lo acepta Cord.
//
// Atributos: country (MX | ES | US | otro), lang (es | en), name.
// Eventos: 'fiscalchange' (estado completo), 'fiscalvalid' (receptor listo).
// Partes: ::part(field), ::part(label), ::part(input), ::part(error), ::part(warning).
import { createFiscalForm, type FiscalForm, type FiscalFormState } from './headless/fiscal-form.js';
import type { FiscalField, FiscalReceptorInput } from './fiscal/receptor.js';
import { fiscalText, type FiscalLocale } from './fiscal/messages.js';

const ElementBase: typeof HTMLElement =
    typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as unknown as typeof HTMLElement);

const CSS = `
:host{display:block;font-family:var(--cord-font-family,system-ui,-apple-system,sans-serif);color:var(--cord-color-text,#050505)}
:host([hidden]){display:none}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.field{display:flex;flex-direction:column;gap:6px}
label{font-size:13px;font-weight:600}
input,select{font:inherit;font-size:15px;padding:12px 14px;border:0;border-radius:var(--cord-border-radius,12px);background:var(--cord-color-input,#f5f5f7);color:inherit;outline:none;min-height:44px;box-sizing:border-box;width:100%}
input:focus-visible,select:focus-visible{box-shadow:0 0 0 2px var(--cord-color-primary,#0a192f)}
input[aria-invalid="true"],select[aria-invalid="true"]{box-shadow:0 0 0 2px var(--cord-color-danger,#c0392b)}
.error{font-size:12px;color:var(--cord-color-danger,#c0392b)}
.warning{font-size:12px;color:var(--cord-color-text-secondary,#6b7280)}
`;

const FIELD_INPUT: Record<FiscalField, keyof FiscalReceptorInput | null> = {
    country: null, tax_id: 'tax_id', legal_name: 'legal_name', regimen_fiscal: 'regimen_fiscal', uso_cfdi: 'uso_cfdi', cp_fiscal: 'cp_fiscal',
};

export class CordFiscalFormElement extends ElementBase {
    static formAssociated = true;
    static get observedAttributes() { return ['country', 'lang']; }

    private internals: ElementInternals | null = null;
    private form: FiscalForm | null = null;
    private unsubscribe: (() => void) | null = null;
    private root: ShadowRoot | null = null;
    private grid: HTMLDivElement | null = null;

    constructor() {
        super();
        if (typeof (this as any).attachInternals === 'function') this.internals = (this as any).attachInternals();
    }

    /** Estado completo del formulario (valores, errores, opciones). */
    get state(): FiscalFormState | null { return this.form?.get() ?? null; }
    /** Receptor normalizado si es válido; si no, null. */
    get value() { const s = this.form?.get(); return s?.validation.ok ? s.validation.value : null; }

    /** Valores iniciales (por ejemplo, de un cliente ya guardado). */
    setValues(values: FiscalReceptorInput) {
        for (const [k, v] of Object.entries(values)) this.form?.set(k as keyof FiscalReceptorInput, String(v ?? ''));
    }

    /** Muestra todos los errores y devuelve el receptor si es válido. */
    submit() { return this.form?.submit() ?? null; }

    connectedCallback() {
        if (!this.root) {
            this.root = this.attachShadow({ mode: 'open' });
            const style = document.createElement('style');
            style.textContent = CSS;
            this.grid = document.createElement('div');
            this.grid.className = 'grid';
            this.root.append(style, this.grid);
        }
        this.init();
    }

    disconnectedCallback() {
        this.unsubscribe?.();
        this.unsubscribe = null;
    }

    attributeChangedCallback(name: string) {
        if (!this.isConnected) return;
        if (name === 'country') this.init();
        else this.renderFields();
    }

    private get locale(): FiscalLocale {
        return (this.getAttribute('lang') || document.documentElement.lang || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
    }

    private init() {
        this.unsubscribe?.();
        const prev = this.form?.get().values;
        this.form = createFiscalForm({ ...(prev ?? {}), country: this.getAttribute('country') || prev?.country || 'MX' });
        this.unsubscribe = this.form.subscribe(() => this.sync());
        this.renderFields();
    }

    private renderFields() {
        if (!this.grid || !this.form) return;
        const s = this.form.get();
        const t = fiscalText(this.locale);
        this.grid.textContent = '';
        for (const field of s.fields) {
            const key = FIELD_INPUT[field];
            if (!key) continue;
            const id = `cord-fiscal-${field}`;
            const wrap = document.createElement('div');
            wrap.className = 'field';
            wrap.setAttribute('part', 'field');
            const label = document.createElement('label');
            label.htmlFor = id;
            label.setAttribute('part', 'label');
            label.textContent = t.label(field, s.values.country);
            const control = field === 'regimen_fiscal' || field === 'uso_cfdi'
                ? document.createElement('select')
                : document.createElement('input');
            control.id = id;
            control.name = field;
            control.setAttribute('part', 'input');
            if (control instanceof HTMLInputElement) {
                control.autocomplete = field === 'cp_fiscal' ? 'postal-code' : field === 'legal_name' ? 'organization' : 'off';
                control.spellcheck = false;
                if (field === 'cp_fiscal') control.inputMode = 'numeric';
                control.maxLength = field === 'legal_name' ? 300 : 20;
            }
            control.addEventListener('input', () => this.form?.set(key, (control as HTMLInputElement).value));
            control.addEventListener('change', () => this.form?.set(key, (control as HTMLInputElement).value));
            control.addEventListener('blur', () => this.form?.touch(field));
            const msg = document.createElement('div');
            msg.id = `${id}-msg`;
            msg.setAttribute('aria-live', 'polite');
            control.setAttribute('aria-describedby', msg.id);
            wrap.append(label, control, msg);
            this.grid.append(wrap);
        }
        this.sync();
    }

    private sync() {
        if (!this.grid || !this.form) return;
        const s = this.form.get();
        const t = fiscalText(this.locale);
        for (const field of s.fields) {
            const control = this.grid.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${field}"]`);
            const msg = this.grid.querySelector<HTMLDivElement>(`#cord-fiscal-${field}-msg`);
            if (!control || !msg) continue;
            const key = FIELD_INPUT[field] as keyof FiscalReceptorInput;
            if (control instanceof HTMLSelectElement) {
                const options = field === 'regimen_fiscal' ? s.regimenes : s.usosCfdi;
                const wanted = ['', ...options.map((o) => o.codigo)].join('|');
                if (control.dataset.options !== wanted) {
                    control.textContent = '';
                    control.append(new Option(t.choose, ''));
                    for (const o of options) control.append(new Option(o.nombre, o.codigo));
                    control.dataset.options = wanted;
                }
            }
            if (control.value !== s.values[key]) control.value = s.values[key];
            const error = s.visibleErrors.find((e) => e.field === field);
            const warning = s.validation.warnings.find((w) => w.field === field);
            control.setAttribute('aria-invalid', error ? 'true' : 'false');
            msg.className = error ? 'error' : warning ? 'warning' : '';
            msg.setAttribute('part', error ? 'error' : warning ? 'warning' : 'message');
            msg.textContent = error ? t.issue(error.code) : warning ? t.issue(warning.code) : '';
        }
        this.internals?.setFormValue(s.validation.ok ? JSON.stringify(s.validation.value) : null);
        const first = s.validation.errors[0];
        const anchor = first ? this.grid.querySelector<HTMLElement>(`[name="${first.field}"]`) ?? undefined : undefined;
        if (first) this.internals?.setValidity({ customError: true }, t.issue(first.code), anchor);
        else this.internals?.setValidity({});
        this.dispatchEvent(new CustomEvent('fiscalchange', { detail: s, bubbles: true, composed: true }));
        if (s.validation.ok) this.dispatchEvent(new CustomEvent('fiscalvalid', { detail: s.validation.value, bubbles: true, composed: true }));
    }

    formResetCallback() {
        this.form = null;
        this.init();
    }
}

export function defineFiscalElement() {
    if (typeof customElements === 'undefined') return;
    if (!customElements.get('cord-fiscal-form')) customElements.define('cord-fiscal-form', CordFiscalFormElement);
}

declare global {
    interface HTMLElementTagNameMap { 'cord-fiscal-form': CordFiscalFormElement }
}
