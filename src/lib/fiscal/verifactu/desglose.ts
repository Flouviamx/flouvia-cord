// Construye el bloque `Desglose` (por tasa) y `Destinatario` de un registro de
// alta Verifactu a partir del `FiscalDocumentRequest` canónico de Cord.
// Verificado contra SuministroInformacion.xsd (DesgloseType/DetalleType,
// CalificacionOperacionType, OperacionExentaType, PersonaFisicaJuridicaIDTypeType)
// y el ejemplo oficial §9.1.1.1 de "Descripción de los servicios web" (AEAT v1.0.3).

// Extensión .ts explícita a propósito (permitida por allowImportingTsExtensions
// en el tsconfig base de Astro): así este módulo también se puede importar
// desde scripts/verifactu-check.mjs bajo Node plano, sin loader adicional.
import { isEuCountry } from '../../countries.ts';
import type { FiscalLineItem, FiscalParty } from '../index';

export interface DesgloseLinea {
    claveRegimen: string;
    /** Exactamente uno de los dos — el esquema los modela como <choice>. */
    calificacionOperacion?: string; // S1 | S2 | N1 | N2
    operacionExenta?: string; // E1..E8
    tipoImpositivo?: string; // "21", "4" — sin signo de porcentaje; ausente si exenta
    baseImponibleOimporteNoSujeto: string;
    cuotaRepercutida?: string;
}

export interface DestinatarioXml {
    nombreRazon: string;
    nif?: string;
    idOtro?: { codigoPais?: string; idType: string; id: string };
}

/**
 * Agrupa las líneas por tasa (y por exención) en máximo 12 renglones — el
 * límite de `DetalleDesglose` en el esquema. Cord ya captura `taxRate` y
 * `exemptionReason` por línea (regla 23 de estándares); aquí solo se traduce
 * al vocabulario de la AEAT, no se reinterpreta el dato.
 */
export function buildDesglose(lines: FiscalLineItem[]): DesgloseLinea[] {
    const buckets = new Map<string, { rate: number; exemption?: string; base: number; cuota: number }>();
    for (const line of lines) {
        const rate = Number(line.taxRate) || 0;
        const exemption = rate === 0 ? (line.exemptionReason || undefined) : undefined;
        const key = `${Math.round(rate * 1e9)}:${exemption ?? ''}`;
        const bucket = buckets.get(key) ?? { rate, exemption, base: 0, cuota: 0 };
        bucket.base += Number(line.subtotal) || 0;
        bucket.cuota += Number(line.taxAmount) || 0;
        buckets.set(key, bucket);
    }
    if (!buckets.size) {
        // Un documento sin líneas (no debería ocurrir, pero el esquema exige al
        // menos un DetalleDesglose) — se declara el importe total como base no
        // sujeta antes que omitir un bloque obligatorio.
        return [{
            claveRegimen: '01', calificacionOperacion: 'N1',
            baseImponibleOimporteNoSujeto: '0.00',
        }];
    }
    return [...buckets.values()].slice(0, 12).map((b) => {
        const money = (v: number) => v.toFixed(2);
        if (b.exemption) {
            return {
                claveRegimen: '01',
                operacionExenta: b.exemption,
                baseImponibleOimporteNoSujeto: money(b.base),
            };
        }
        if (b.rate === 0) {
            // 0% sin causa de exención declarada: no es sujeta a un tipo — se
            // declara exención genérica (E1) en vez de omitir el campo
            // obligatorio <CalificacionOperacion>/<OperacionExenta>.
            return {
                claveRegimen: '01',
                operacionExenta: 'E1',
                baseImponibleOimporteNoSujeto: money(b.base),
            };
        }
        return {
            claveRegimen: '01',
            calificacionOperacion: 'S1',
            tipoImpositivo: (b.rate * 100).toFixed(2).replace(/\.?0+$/, '') || '0',
            baseImponibleOimporteNoSujeto: money(b.base),
            cuotaRepercutida: money(b.cuota),
        };
    });
}

/**
 * `Destinatarios` es opcional en el esquema (minOccurs="0") — un receptor sin
 * identificador fiscal capturado se OMITE, no se rellena con un placeholder.
 */
export function buildDestinatario(recipient: FiscalParty): DestinatarioXml | null {
    const nombreRazon = String(recipient.legalName || '').trim().slice(0, 120);
    const taxId = String(recipient.taxId || '').trim();
    if (!nombreRazon || !taxId) return null;
    const country = String(recipient.address?.countryCode || '').toUpperCase();
    if (country === 'ES') {
        return { nombreRazon, nif: taxId.toUpperCase() };
    }
    // 02 = NIF-IVA (contraparte de la UE con VAT number) — habilita el
    // tratamiento de operación intracomunitaria en la propia AEAT.
    // 04 = identificación en el país de residencia — el resto del mundo.
    const idType = isEuCountry(country) ? '02' : '04';
    return { nombreRazon, idOtro: { codigoPais: country || undefined, idType, id: taxId.slice(0, 20) } };
}
