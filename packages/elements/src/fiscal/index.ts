export {
    validRfc, rfcPersona, normalizeRfc, validNif, validNie, validCif, validSpainTaxId, validEin, RFC_GENERICOS,
    validateTaxId, TAX_ID_COUNTRIES,
} from './tax-id.js';
export type { RfcPersona, TaxIdLocale, TaxIdOptions, TaxIdResult } from './tax-id.js';
export { REGIMENES_FISCALES, USOS_CFDI, regimenesPara, usosCfdiPara } from './sat.js';
export type { PersonaFiscal, SatClave } from './sat.js';
export { validateFiscalReceptor, FISCAL_COUNTRIES } from './receptor.js';
export type {
    FiscalField, FiscalIssue, FiscalIssueCode, FiscalReceptor, FiscalReceptorInput, FiscalValidation,
} from './receptor.js';
