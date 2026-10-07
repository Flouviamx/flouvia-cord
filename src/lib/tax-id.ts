// Validación del identificador fiscal por país. La implementación vive en el
// paquete de Elements para que el Fiscal Element del navegador y el servidor
// validen con el mismo código; aquí solo se reexporta.
//
// validateTaxId es la entrada para todo lo que guarda o manda un identificador
// fiscal (organización, clientes, importación, API, alta de cobros): devuelve
// el valor normalizado o un motivo listo para mostrarle al negocio.
export {
    validRfc, rfcPersona, normalizeRfc, validNif, validNie, validCif, validSpainTaxId, validEin, RFC_GENERICOS,
    validateTaxId, TAX_ID_COUNTRIES,
} from '../../packages/elements/src/fiscal/tax-id.ts';
export type { RfcPersona, TaxIdLocale, TaxIdOptions, TaxIdResult } from '../../packages/elements/src/fiscal/tax-id.ts';
