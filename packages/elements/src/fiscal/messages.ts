// Textos del Fiscal Element en español e inglés. Las etiquetas salen del país:
// RFC en México, NIF/CIF en España, EIN en Estados Unidos (regla 24).
import type { FiscalField, FiscalIssueCode } from './receptor.js';

export type FiscalLocale = 'es' | 'en';

const TAX_ID: Record<string, Record<FiscalLocale, string>> = {
    MX: { es: 'RFC', en: 'RFC (Mexican tax ID)' },
    ES: { es: 'NIF / CIF', en: 'NIF / CIF' },
    US: { es: 'EIN', en: 'EIN / Tax ID' },
};

const LABELS: Record<FiscalLocale, Record<Exclude<FiscalField, 'tax_id' | 'country'>, string>> = {
    es: { legal_name: 'Nombre o razón social', regimen_fiscal: 'Régimen fiscal', uso_cfdi: 'Uso del CFDI', cp_fiscal: 'Código postal fiscal' },
    en: { legal_name: 'Legal name', regimen_fiscal: 'Tax regime', uso_cfdi: 'CFDI use', cp_fiscal: 'Tax postal code' },
};

const ISSUES: Record<FiscalLocale, Record<FiscalIssueCode, string>> = {
    es: {
        required: 'Este dato es obligatorio.',
        too_long: 'Es demasiado largo.',
        invalid_tax_id: 'Revisa el identificador fiscal: no es válido.',
        invalid_postal_code: 'El código postal no tiene el formato correcto.',
        regimen_not_for_persona: 'Ese régimen no corresponde a este tipo de RFC.',
        uso_not_for_persona: 'Ese uso de CFDI no corresponde a este tipo de RFC.',
        generic_requires_616_s01: 'Para público en general el régimen es 616 y el uso S01.',
        legal_name_has_regime_suffix: 'Escríbelo como en la Constancia de Situación Fiscal, sin "S.A. de C.V." ni similares.',
        unsupported_country: 'Para este país solo se valida que el dato exista.',
    },
    en: {
        required: 'This field is required.',
        too_long: 'It is too long.',
        invalid_tax_id: 'Check the tax ID: it is not valid.',
        invalid_postal_code: 'The postal code format is not correct.',
        regimen_not_for_persona: 'That tax regime does not match this type of RFC.',
        uso_not_for_persona: 'That CFDI use does not match this type of RFC.',
        generic_requires_616_s01: 'For the general public, the regime is 616 and the use is S01.',
        legal_name_has_regime_suffix: 'Write it as on the tax certificate, without "S.A. de C.V." or similar.',
        unsupported_country: 'For this country only presence is checked.',
    },
};

export function fiscalText(locale: FiscalLocale) {
    return {
        choose: locale === 'en' ? 'Choose…' : 'Elige…',
        label(field: FiscalField, country: string): string {
            if (field === 'tax_id') return (TAX_ID[country] ?? { es: 'Identificador fiscal', en: 'Tax ID' })[locale];
            if (field === 'country') return locale === 'en' ? 'Country' : 'País';
            return LABELS[locale][field];
        },
        issue(code: FiscalIssueCode | string): string {
            return (ISSUES[locale] as Record<string, string>)[code] ?? code;
        },
    };
}
