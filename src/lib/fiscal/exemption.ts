// Causa de exención o de no sujeción de un concepto (España).
//
// Una línea al 0 % puede ser cosas muy distintas para la AEAT: una exportación
// (art. 21 LIVA), una entrega intracomunitaria (art. 25), una exención por la
// naturaleza del servicio (art. 20: sanidad, educación…), una operación no
// sujeta por las reglas de localización o una inversión del sujeto pasivo.
// Verifactu declara cuál (OperacionExenta E1–E6, CalificacionOperacion N1/N2/S2)
// y la factura debe citar el precepto (RD 1619/2012, art. 6.1.j).
//
// Sin una causa explícita, `desglose.ts` deriva la más honesta con lo que el
// documento sabe (N2 para un cliente extranjero, E6 dentro de España). Esta
// lista es la que el negocio puede ELEGIR por concepto, desde su catálogo de
// impuestos; los códigos son exactamente los que `desglose.ts` acepta.
//
// Sin imports: lo cargan los editores en el navegador y los checks con Node.

export const EXEMPTION_REASONS = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'N1', 'N2', 'S2'] as const;
export type ExemptionReason = (typeof EXEMPTION_REASONS)[number];

interface ExemptionInfo {
    /** Etiqueta corta para selectores. */
    es: string;
    en: string;
    /** Referencia legal que imprime la factura (RD 1619/2012, art. 6.1.j). */
    mencion: string;
}

// Textos de la lista L10 / CalificacionOperacionType de la AEAT, con el
// precepto de la Ley 37/1992 que corresponde a cada código.
export const EXEMPTION_INFO: Record<ExemptionReason, ExemptionInfo> = {
    E1: { es: 'Exenta por el art. 20 (sanidad, educación, seguros…)', en: 'Exempt under art. 20 (health, education, insurance…)', mencion: 'Operación exenta de IVA (art. 20 Ley 37/1992).' },
    E2: { es: 'Exportación (art. 21)', en: 'Export (art. 21)', mencion: 'Exportación exenta de IVA (art. 21 Ley 37/1992).' },
    E3: { es: 'Asimilada a exportación (art. 22)', en: 'Treated as an export (art. 22)', mencion: 'Operación asimilada a la exportación, exenta de IVA (art. 22 Ley 37/1992).' },
    E4: { es: 'Zonas y depósitos francos (arts. 23 y 24)', en: 'Free zones and warehouses (arts. 23–24)', mencion: 'Operación exenta de IVA (arts. 23 y 24 Ley 37/1992).' },
    E5: { es: 'Entrega intracomunitaria (art. 25)', en: 'Intra-EU supply of goods (art. 25)', mencion: 'Entrega intracomunitaria exenta de IVA (art. 25 Ley 37/1992).' },
    E6: { es: 'Exenta por otra causa', en: 'Exempt for another reason', mencion: 'Operación exenta de IVA (Ley 37/1992).' },
    N1: { es: 'No sujeta (arts. 7 y 14)', en: 'Not subject to VAT (arts. 7 and 14)', mencion: 'Operación no sujeta a IVA (arts. 7 y 14 Ley 37/1992).' },
    N2: { es: 'No sujeta por reglas de localización', en: 'Not subject: place-of-supply rules', mencion: 'Operación no sujeta a IVA por las reglas de localización (arts. 68 a 70 Ley 37/1992).' },
    S2: { es: 'Inversión del sujeto pasivo', en: 'Reverse charge', mencion: 'Inversión del sujeto pasivo (art. 84.Uno.2.º Ley 37/1992).' },
};

export function isExemptionReason(value: unknown): value is ExemptionReason {
    return typeof value === 'string' && (EXEMPTION_REASONS as readonly string[]).includes(value);
}

/**
 * La causa que se CONSERVA para un concepto: solo en España (es la única
 * autoridad que la pide código a código) y solo en una línea sin impuesto —
 * con tasa > 0 la operación está sujeta y no exenta, y `desglose.ts` la
 * rechazaría. Cualquier otra cosa se descarta en vez de guardarse.
 */
export function exemptionReasonFor(country: string, value: unknown, taxRate: number | null | undefined): ExemptionReason | null {
    if (String(country || '').toUpperCase() !== 'ES') return null;
    const code = String(value ?? '').trim().toUpperCase();
    if (!isExemptionReason(code)) return null;
    if (Number(taxRate) !== 0) return null;
    return code;
}
