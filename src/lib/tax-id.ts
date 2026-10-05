// Validación del identificador fiscal por país. La implementación vive en el
// paquete de Elements para que el Fiscal Element del navegador y el servidor
// validen con el mismo código; aquí solo se reexporta.
export {
    validRfc, rfcPersona, normalizeRfc, validNif, validNie, validCif, validSpainTaxId, validEin, RFC_GENERICOS,
} from '../../packages/elements/src/fiscal/tax-id.ts';
export type { RfcPersona } from '../../packages/elements/src/fiscal/tax-id.ts';
