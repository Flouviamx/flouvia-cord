// Datos fiscales del receptor (el cliente al que se le factura). Lo usan el
// Fiscal Element mientras se escribe y el servidor antes de guardar: la misma
// función, así que lo que el navegador acepta es exactamente lo que el servidor
// acepta. Solo los países con riel fiscal real tienen reglas propias.
import { checkTaxId, normalizeRfc, rfcPersona, RFC_GENERICOS, TAX_ID_COUNTRIES } from './tax-id.js';
import { regimenesPara, usosCfdiPara } from './sat.js';

export type FiscalField = 'tax_id' | 'legal_name' | 'regimen_fiscal' | 'uso_cfdi' | 'cp_fiscal' | 'country';

export type FiscalIssueCode =
    | 'required'
    | 'too_long'
    | 'invalid_tax_id'
    | 'invalid_postal_code'
    | 'regimen_not_for_persona'
    | 'uso_not_for_persona'
    | 'generic_requires_616_s01'
    | 'legal_name_has_regime_suffix'
    | 'unsupported_country';

export interface FiscalIssue { field: FiscalField; code: FiscalIssueCode }

export interface FiscalReceptorInput {
    country?: string;
    tax_id?: string;
    legal_name?: string;
    regimen_fiscal?: string;
    uso_cfdi?: string;
    cp_fiscal?: string;
}

export interface FiscalReceptor {
    country: string;
    tax_id: string;
    legal_name: string;
    regimen_fiscal: string | null;
    uso_cfdi: string | null;
    cp_fiscal: string | null;
}

export interface FiscalValidation {
    ok: boolean;
    value: FiscalReceptor;
    /** Bloquean: el documento sería rechazado. */
    errors: FiscalIssue[];
    /** Avisan: probable rechazo, pero el dato puede ser correcto. */
    warnings: FiscalIssue[];
    persona: 'fisica' | 'moral' | 'generico' | null;
}

/**
 * Países con reglas fiscales completas en este validador (código postal,
 * régimen y uso de CFDI donde aplican). El identificador fiscal se valida
 * además en todos los de TAX_ID_COUNTRIES.
 */
export const FISCAL_COUNTRIES = ['MX', 'ES', 'US'] as const;

const MAX = { tax_id: 20, legal_name: 300 };
// CFDI 4.0: el nombre va como en la Constancia de Situación Fiscal, SIN el
// régimen societario. Es la causa más común de rechazo del receptor.
const REGIME_SUFFIX = /[,\s]+(S\.?\s?A\.?\s?P?\.?\s?I?\.?\s?(DE\s+C\.?\s?V\.?)?|S\.?\s?DE\s+R\.?\s?L\.?(\s?DE\s+C\.?\s?V\.?)?|S\.?\s?C\.?|A\.?\s?C\.?|S\.?\s?A\.?\s?S\.?)\s*$/i;

const clean = (v: unknown, max: number) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max + 1);

export function validateFiscalReceptor(input: FiscalReceptorInput): FiscalValidation {
    const errors: FiscalIssue[] = [];
    const warnings: FiscalIssue[] = [];
    const country = String(input.country || '').trim().toUpperCase();
    const legalName = clean(input.legal_name, MAX.legal_name);
    let taxId = clean(input.tax_id, MAX.tax_id).toUpperCase();
    let regimen: string | null = String(input.regimen_fiscal || '').trim() || null;
    let uso: string | null = String(input.uso_cfdi || '').trim().toUpperCase() || null;
    let cp: string | null = String(input.cp_fiscal || '').trim() || null;
    let persona: FiscalValidation['persona'] = null;

    if (!country) errors.push({ field: 'country', code: 'required' });
    if (!legalName) errors.push({ field: 'legal_name', code: 'required' });
    if (legalName.length > MAX.legal_name) errors.push({ field: 'legal_name', code: 'too_long' });
    if (!taxId) errors.push({ field: 'tax_id', code: 'required' });
    if (taxId.length > MAX.tax_id) errors.push({ field: 'tax_id', code: 'too_long' });

    if (country === 'MX') {
        taxId = normalizeRfc(taxId);
        persona = taxId ? rfcPersona(taxId) : null;
        if (taxId && !persona) errors.push({ field: 'tax_id', code: 'invalid_tax_id' });
        if (!cp) errors.push({ field: 'cp_fiscal', code: 'required' });
        else if (!/^\d{5}$/.test(cp)) errors.push({ field: 'cp_fiscal', code: 'invalid_postal_code' });
        if (!regimen) errors.push({ field: 'regimen_fiscal', code: 'required' });
        if (!uso) errors.push({ field: 'uso_cfdi', code: 'required' });

        if (persona === 'generico') {
            if ((regimen && regimen !== '616') || (uso && uso !== 'S01')) {
                errors.push({ field: 'regimen_fiscal', code: 'generic_requires_616_s01' });
            }
        } else if (persona) {
            if (regimen && !regimenesPara(persona).some((r) => r.codigo === regimen)) {
                errors.push({ field: 'regimen_fiscal', code: 'regimen_not_for_persona' });
            }
            if (uso && !usosCfdiPara(persona).some((u) => u.codigo === uso)) {
                errors.push({ field: 'uso_cfdi', code: 'uso_not_for_persona' });
            }
            if (persona === 'moral' && REGIME_SUFFIX.test(legalName)) {
                warnings.push({ field: 'legal_name', code: 'legal_name_has_regime_suffix' });
            }
        }
    } else if (country) {
        // Fuera de México el identificador sale del validador por país: el
        // mismo que usan la organización, sus clientes y el alta de cobros.
        // Se guarda normalizado (sin "ES" en un NIF, con "DE" en una USt-IdNr).
        regimen = uso = null;
        if (taxId) {
            const r = checkTaxId(country, taxId);
            if (r.ok) taxId = r.normalized;
            else errors.push({ field: 'tax_id', code: 'invalid_tax_id' });
        }
        if (country === 'ES' && cp && !/^\d{5}$/.test(cp)) errors.push({ field: 'cp_fiscal', code: 'invalid_postal_code' });
        if (country === 'US' && cp && !/^\d{5}(-\d{4})?$/.test(cp)) errors.push({ field: 'cp_fiscal', code: 'invalid_postal_code' });
        if (!TAX_ID_COUNTRIES.includes(country)) warnings.push({ field: 'country', code: 'unsupported_country' });
    }

    return {
        ok: errors.length === 0,
        value: { country, tax_id: taxId, legal_name: legalName, regimen_fiscal: regimen, uso_cfdi: uso, cp_fiscal: cp },
        errors,
        warnings,
        persona,
    };
}

export { RFC_GENERICOS };
