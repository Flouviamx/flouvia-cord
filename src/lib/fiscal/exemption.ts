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

// ── Resto de la UE: clasificación de la factura electrónica (EN 16931) ──────
//
// Fuera de España no hay registro que pida la causa código a código, pero la
// factura electrónica europea sí: cada concepto al 0 % lleva una categoría de
// IVA (UNTDID 5305) y, salvo el tipo cero, el motivo en la lista VATEX de la
// Comisión. Cord no puede saber si un 0 % es una exportación de bienes, un
// servicio fuera del ámbito del IVA o una entrega intracomunitaria: lo elige el
// negocio en su perfil exento, igual que la causa española, y viaja por el
// mismo camino (`impuestos.exemption_reason` → concepto → snapshot).
//
// Códigos verificados contra la lista BR-CL-22 del schematron oficial de
// EN 16931 (CEN/TC 434, v1.3.16) y las reglas PEPPOL-EN16931-P0104..P0107,
// que atan VATEX-EU-G, -O, -IC y -AE a sus categorías G, O, K y AE. 'Z' no es
// un código VATEX: es la categoría "tipo cero", que no lleva motivo.

/** Estados miembro de la UE salvo España (que usa su propia lista, arriba). */
const EU_SIN_ES = new Set([
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
    'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
    'SI', 'SE',
]);

export const EU_EXEMPTION_CODES = [
    'VATEX-EU-AE', 'VATEX-EU-IC', 'VATEX-EU-G', 'VATEX-EU-O', 'Z',
    'VATEX-EU-132', 'VATEX-EU-135-1', 'VATEX-EU-79-C', 'VATEX-EU-148', 'VATEX-EU-151', 'VATEX-EU-309',
    'VATEX-FR-FRANCHISE',
] as const;
export type EuExemptionCode = (typeof EU_EXEMPTION_CODES)[number];

/** Categoría de IVA de EN 16931 (UNTDID 5305) para una línea al 0 %. */
export type ZeroVatCategory = 'Z' | 'E' | 'AE' | 'K' | 'G' | 'O';

interface EuExemptionInfo {
    es: string;
    en: string;
    category: ZeroVatCategory;
    /** Texto del motivo (BT-120), en inglés como la lista VATEX. */
    text: string;
    /** Solo se ofrece a emisores de estos países. */
    countries?: readonly string[];
}

export const EU_EXEMPTION_INFO: Record<EuExemptionCode, EuExemptionInfo> = {
    'VATEX-EU-AE': { es: 'Inversión del sujeto pasivo', en: 'Reverse charge', category: 'AE', text: 'Reverse charge' },
    'VATEX-EU-IC': { es: 'Entrega intracomunitaria de bienes', en: 'Intra-community supply of goods', category: 'K', text: 'Intra-community supply' },
    'VATEX-EU-G': { es: 'Exportación fuera de la UE', en: 'Export outside the EU', category: 'G', text: 'Export outside the EU' },
    'VATEX-EU-O': { es: 'No sujeta al IVA', en: 'Not subject to VAT', category: 'O', text: 'Not subject to VAT' },
    Z: { es: 'Tipo cero', en: 'Zero rated', category: 'Z', text: '' },
    'VATEX-EU-132': { es: 'Exenta por interés general (art. 132 de la Directiva)', en: 'Exempt: activities in the public interest (art. 132)', category: 'E', text: 'Exempt based on article 132 of Council Directive 2006/112/EC' },
    'VATEX-EU-135-1': { es: 'Exenta: seguros y servicios financieros (art. 135)', en: 'Exempt: insurance and financial services (art. 135)', category: 'E', text: 'Exempt based on article 135(1) of Council Directive 2006/112/EC' },
    'VATEX-EU-79-C': { es: 'Suplidos (art. 79.c de la Directiva)', en: 'Disbursements (art. 79(c))', category: 'E', text: 'Exempt based on article 79, point c of Council Directive 2006/112/EC' },
    'VATEX-EU-148': { es: 'Exenta: transporte marítimo y aéreo internacional (art. 148)', en: 'Exempt: international sea and air transport (art. 148)', category: 'E', text: 'Exempt based on article 148 of Council Directive 2006/112/EC' },
    'VATEX-EU-151': { es: 'Exenta: diplomáticos y organismos internacionales (art. 151)', en: 'Exempt: diplomatic and international bodies (art. 151)', category: 'E', text: 'Exempt based on article 151 of Council Directive 2006/112/EC' },
    'VATEX-EU-309': { es: 'Régimen especial de agencias de viajes (art. 309)', en: 'Travel agents scheme (art. 309)', category: 'E', text: 'Travel agents VAT scheme' },
    'VATEX-FR-FRANCHISE': { es: 'Franquicia en base (art. 293 B del CGI)', en: 'VAT franchise (art. 293 B CGI)', category: 'E', text: 'TVA non applicable, art. 293 B du CGI', countries: ['FR'] },
};

export function isEuExemptionCode(value: unknown): value is EuExemptionCode {
    return typeof value === 'string' && (EU_EXEMPTION_CODES as readonly string[]).includes(value);
}

/** Las causas que el catálogo ofrece al negocio de `country`, con su etiqueta. */
export function exemptionChoicesFor(country: string, lang: 'es' | 'en'): { code: string; label: string }[] {
    const cc = String(country || '').toUpperCase();
    if (cc === 'ES') return EXEMPTION_REASONS.map((code) => ({ code, label: `${code} · ${EXEMPTION_INFO[code][lang]}` }));
    if (!EU_SIN_ES.has(cc)) return [];
    return EU_EXEMPTION_CODES
        .filter((code) => !EU_EXEMPTION_INFO[code].countries || EU_EXEMPTION_INFO[code].countries!.includes(cc))
        .map((code) => ({ code, label: `${EU_EXEMPTION_INFO[code][lang]} · ${code === 'Z' ? (lang === 'en' ? 'category Z' : 'categoría Z') : code}` }));
}

/**
 * La causa que se CONSERVA para un concepto, solo en una línea sin impuesto —
 * con tasa > 0 la operación está sujeta y no exenta, y `desglose.ts` la
 * rechazaría. España conserva su lista de Verifactu (E1–E6, N1, N2, S2); el
 * resto de la UE, la clasificación de la factura electrónica. Cualquier otra
 * cosa (otro país, otro código) se descarta en vez de guardarse.
 */
export function exemptionReasonFor(country: string, value: unknown, taxRate: number | null | undefined): ExemptionReason | EuExemptionCode | null {
    const cc = String(country || '').toUpperCase();
    const code = String(value ?? '').trim().toUpperCase();
    if (Number(taxRate) !== 0) return null;
    if (cc === 'ES') return isExemptionReason(code) ? code : null;
    if (!EU_SIN_ES.has(cc) || !isEuExemptionCode(code)) return null;
    const only = EU_EXEMPTION_INFO[code].countries;
    return !only || only.includes(cc) ? code : null;
}
