// Fiscal Form headless: captura de los datos fiscales del receptor con la misma
// validación que aplica el servidor. Filtra regímenes y usos de CFDI según el
// tipo de RFC, y solo muestra errores de campos que la persona ya tocó.
import { validateFiscalReceptor, type FiscalField, type FiscalIssue, type FiscalReceptorInput, type FiscalValidation } from '../fiscal/receptor.js';
import { regimenesPara, usosCfdiPara, type SatClave } from '../fiscal/sat.js';
import { createStore, type ReadableStore } from './store.js';

export interface FiscalFormState {
    values: Required<FiscalReceptorInput>;
    touched: Partial<Record<FiscalField, boolean>>;
    validation: FiscalValidation;
    /** Errores visibles: solo de campos tocados (o todos tras submit). */
    visibleErrors: FiscalIssue[];
    regimenes: SatClave[];
    usosCfdi: SatClave[];
    /** Campos que aplican al país elegido. */
    fields: FiscalField[];
    submitted: boolean;
}

export interface FiscalForm extends ReadableStore<FiscalFormState> {
    set(field: keyof FiscalReceptorInput, value: string): void;
    touch(field: FiscalField): void;
    /** Marca todo como tocado y devuelve el resultado listo para enviar, o null. */
    submit(): FiscalValidation['value'] | null;
}

const FIELDS_BY_COUNTRY: Record<string, FiscalField[]> = {
    MX: ['tax_id', 'legal_name', 'regimen_fiscal', 'uso_cfdi', 'cp_fiscal'],
    ES: ['tax_id', 'legal_name', 'cp_fiscal'],
    US: ['tax_id', 'legal_name', 'cp_fiscal'],
};

export function createFiscalForm(initial: FiscalReceptorInput = {}): FiscalForm {
    const values: Required<FiscalReceptorInput> = {
        country: (initial.country || 'MX').toUpperCase(),
        tax_id: initial.tax_id ?? '',
        legal_name: initial.legal_name ?? '',
        regimen_fiscal: initial.regimen_fiscal ?? '',
        uso_cfdi: initial.uso_cfdi ?? '',
        cp_fiscal: initial.cp_fiscal ?? '',
    };
    const store = createStore<FiscalFormState>(derive(values, {}, false));

    return {
        get: store.get,
        subscribe: store.subscribe,
        set(field, value) {
            const s = store.get();
            const next = { ...s.values, [field]: String(value ?? '') };
            if (field === 'tax_id' && next.country === 'MX') {
                const v = validateFiscalReceptor({ ...next });
                if (v.persona === 'generico') { next.regimen_fiscal = '616'; next.uso_cfdi = 'S01'; }
            }
            store.set(derive(next, s.touched, s.submitted));
        },
        touch(field) {
            const s = store.get();
            store.set(derive(s.values, { ...s.touched, [field]: true }, s.submitted));
        },
        submit() {
            const s = store.get();
            const next = derive(s.values, s.touched, true);
            store.set(next);
            return next.validation.ok ? next.validation.value : null;
        },
    };
}

function derive(values: Required<FiscalReceptorInput>, touched: FiscalFormState['touched'], submitted: boolean): FiscalFormState {
    const validation = validateFiscalReceptor(values);
    const persona = validation.persona === 'fisica' || validation.persona === 'moral' ? validation.persona : null;
    const generico = validation.persona === 'generico';
    return {
        values,
        touched,
        validation,
        visibleErrors: validation.errors.filter((e) => submitted || touched[e.field]),
        regimenes: generico ? regimenesPara('fisica').filter((r) => r.codigo === '616') : regimenesPara(persona),
        usosCfdi: generico ? usosCfdiPara('fisica').filter((u) => u.codigo === 'S01') : usosCfdiPara(persona),
        fields: FIELDS_BY_COUNTRY[values.country] ?? ['tax_id', 'legal_name'],
        submitted,
    };
}
