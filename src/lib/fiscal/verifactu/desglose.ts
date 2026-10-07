// Construye el bloque `Desglose` (por tipo y causa) y el `Destinatario` de un
// registro de alta Verifactu a partir del `FiscalDocumentRequest` canónico.
// Verificado contra SuministroInformacion.xsd (DesgloseType/DetalleType,
// CalificacionOperacionType, OperacionExentaType, IDOtroType) y las
// validaciones de negocio §3.1.3.13 y §3.1.3.15 de "Validaciones y errores"
// (AEAT v1.2.2).
//
// Lo que hace distinto a este módulo de una traducción mecánica: una línea al
// 0 % NO es automáticamente "exenta". Antes toda línea al 0 % se declaraba E1
// (exenta por el art. 20 LIVA: sanidad, educación, seguros…), así que un
// servicio a una empresa de Francia o de Estados Unidos —que no está sujeto al
// IVA español por las reglas de localización— quedaba registrado ante la AEAT
// como una exención que no es. La calificación se deriva de lo que el
// documento SÍ sabe (país e identificación del cliente) y, cuando no alcanza,
// se usa la causa genérica más honesta; una causa explícita en la línea
// (`exemptionReason`) siempre manda.

// Extensión .ts explícita a propósito (permitida por allowImportingTsExtensions
// en el tsconfig base de Astro): así este módulo también se puede importar
// desde scripts/verifactu-check.mjs bajo Node plano, sin loader adicional.
import type { FiscalLineItem, FiscalParty } from '../index';
import {
    EU_VAT_COUNTRIES, VerifactuDatosError, exigirNifEs, importeAEAT, nifIvaUE,
    porcentajeAEAT, textoAEAT, tipoS1Admitido, validarIdOtro,
} from './validacion.ts';

export interface DesgloseLinea {
    claveRegimen: string;
    /** Exactamente uno de los dos — el esquema los modela como <choice>. */
    calificacionOperacion?: string; // S1 | S2 | N1 | N2
    operacionExenta?: string; // E1..E6
    tipoImpositivo?: string; // "21", "7.5" — sin signo de porcentaje; ausente si exenta o no sujeta
    baseImponibleOimporteNoSujeto: string;
    cuotaRepercutida?: string;
}

export interface DestinatarioXml {
    nombreRazon: string;
    nif?: string;
    idOtro?: { codigoPais?: string; idType: string; id: string };
}

/**
 * Cómo quedó identificado el cliente — decide F1/F2 y la calificación de las
 * líneas al 0 %:
 *   nif_es      NIF español válido (bloque NIF);
 *   nif_iva_ue  NIF-IVA de otro Estado miembro con su estructura (IDType 02);
 *   extranjero  identificación de su país de residencia (IDType 04);
 *   ninguno     sin identificador fiscal → F2 con FacturaSinIdentifDestinatarioArt61d.
 */
export type DestinatarioClase = 'nif_es' | 'nif_iva_ue' | 'extranjero' | 'ninguno';

export interface DestinatarioResuelto {
    xml: DestinatarioXml | null;
    clase: DestinatarioClase;
    /** ISO del cliente; si el documento no lo trae, el del emisor (ES). */
    pais: string;
}

/**
 * Identifica al cliente en el vocabulario de la AEAT, o falla con un mensaje
 * que dice qué corregir. Sin identificador fiscal no se inventa uno: el
 * registro va como F2 sin destinatario (art. 6.1.d RD 1619/2012) — antes iba
 * como F1 sin `Destinatarios` y la AEAT lo rechazaba siempre (error 1189).
 */
export function resolverDestinatario(recipient: FiscalParty, emisorNif: string): DestinatarioResuelto {
    const pais = String(recipient?.address?.countryCode || 'ES').trim().toUpperCase();
    const taxId = String(recipient?.taxId || '').trim();
    if (!taxId) return { xml: null, clase: 'ninguno', pais };

    const nombreRazon = textoAEAT(recipient.legalName, 120);
    if (!nombreRazon) {
        throw new VerifactuDatosError('El cliente no tiene nombre o razón social: la AEAT lo exige junto a su identificador fiscal.');
    }
    if (pais === 'ES') {
        const nif = exigirNifEs(taxId, 'del cliente');
        if (nif === emisorNif) {
            // Error 1193: el destinatario no puede ser el propio emisor.
            throw new VerifactuDatosError('El NIF del cliente es el mismo que el de tu negocio. Corrige los datos del cliente.');
        }
        return { xml: { nombreRazon, nif }, clase: 'nif_es', pais };
    }
    if (EU_VAT_COUNTRIES.has(pais)) {
        const vat = nifIvaUE(pais, taxId);
        // IDType 02 sin CodigoPais: no es exigible y, para Grecia, "GR"
        // contradiría el prefijo "EL" del propio NIF-IVA (error 1122).
        if (vat) return { xml: { nombreRazon, idOtro: { idType: '02', id: vat } }, clase: 'nif_iva_ue', pais };
    }
    const idOtro = validarIdOtro({ codigoPais: pais, idType: '04', id: taxId }, 'del cliente');
    return { xml: { nombreRazon, idOtro }, clase: 'extranjero', pais };
}

/** Mismo contrato que antes para quien solo necesita el bloque XML. */
export function buildDestinatario(recipient: FiscalParty, emisorNif = ''): DestinatarioXml | null {
    return resolverDestinatario(recipient, emisorNif).xml;
}

export interface DesgloseContexto {
    destinatario: DestinatarioResuelto;
    /** dd-mm-aaaa: los tipos de IVA admitidos dependen de la fecha. */
    fechaExpedicion: string;
    /** -1 en una rectificativa por diferencias que reduce la factura original. */
    signo: 1 | -1;
    /** Factor a euros (1 si el documento ya está en EUR). */
    aEur: number;
}

export interface DesgloseResultado {
    desglose: DesgloseLinea[];
    /** Σ CuotaRepercutida, en euros, con su signo. */
    cuotaTotal: number;
    /** Σ (BaseImponibleOimporteNoSujeto + CuotaRepercutida): el "Importe total" del Reglamento. */
    importeTotal: number;
}

type Clave = '01' | '02';
interface Calificada {
    clave: Clave;
    calificacion?: 'S1' | 'S2' | 'N1' | 'N2';
    exenta?: 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6';
    pct?: number;
}

const CAUSAS = new Set(['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'N1', 'N2', 'S2']);

/**
 * Calificación de UNA línea. Orden de decisión:
 *
 * 1. Causa explícita (`exemptionReason`): E1–E6, N1, N2 o S2. E2/E3
 *    (exportaciones, arts. 21–22 LIVA) van con ClaveRegimen 02 porque la AEAT
 *    no las admite con la 01 (error 1199). E5 (entrega intracomunitaria) exige
 *    un NIF-IVA de la UE; S2 (inversión del sujeto pasivo) exige destinatario
 *    identificado. E7/E8 son del IGIC y no aplican al IVA.
 * 2. Tipo > 0 → S1, solo con los tipos de IVA que la AEAT admite en esa fecha
 *    (error 1124). IGIC, IPSI o un tipo mal configurado fallan aquí, antes de
 *    encadenar.
 * 3. Tipo 0 sin causa explícita:
 *    - cliente de otro Estado miembro con NIF-IVA → N2 (no sujeta por reglas
 *      de localización, art. 69 LIVA: servicio B2B intracomunitario, la misma
 *      base legal que imprime la mención de inversión del sujeto pasivo);
 *    - cliente fuera de la UE → N2. Cord no distingue bienes de servicios y
 *      factura sobre todo servicios; una exportación de BIENES debe marcarse
 *      explícitamente E2 en la línea;
 *    - cliente en España, o particular de la UE sin NIF-IVA → E6 ("exenta
 *      según la Ley 37/1992"). Es la causa genérica de exención: el catálogo
 *      del negocio dice "Exento" sin artículo, y E6 declara exactamente eso.
 *      E1 (art. 20) solo se usa si la línea lo dice.
 */
function calificar(line: FiscalLineItem, ctx: DesgloseContexto): Calificada {
    const rate = Number(line.taxRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
        throw new VerifactuDatosError('Una línea de la factura tiene un tipo de impuesto inválido.');
    }
    const pct = Math.round(rate * 100 * 100) / 100;
    const causa = String(line.exemptionReason || '').trim().toUpperCase();
    const { clase } = ctx.destinatario;

    if (causa) {
        if (!CAUSAS.has(causa)) {
            throw new VerifactuDatosError(`La causa de exención "${causa}" de una línea no es válida para el IVA (usa E1–E6, N1, N2 o S2).`);
        }
        if (pct !== 0) {
            throw new VerifactuDatosError('Una línea marcada como exenta, no sujeta o con inversión del sujeto pasivo no puede llevar IVA repercutido.');
        }
        if (causa === 'E5' && clase !== 'nif_iva_ue') {
            throw new VerifactuDatosError('Una entrega intracomunitaria exenta (E5) exige el NIF-IVA del cliente de otro país de la UE.');
        }
        if (causa === 'S2' && clase === 'ninguno') {
            throw new VerifactuDatosError('Con inversión del sujeto pasivo el NIF del cliente es obligatorio: complétalo antes de emitir.');
        }
        if (causa === 'S2' || causa === 'N1' || causa === 'N2') {
            return { clave: '01', calificacion: causa };
        }
        return { clave: causa === 'E2' || causa === 'E3' ? '02' : '01', exenta: causa as Calificada['exenta'] };
    }

    if (pct > 0) {
        if (!tipoS1Admitido(pct, ctx.fechaExpedicion)) {
            throw new VerifactuDatosError(
                `El tipo del ${porcentajeAEAT(rate)} % no es un tipo de IVA que la AEAT admita en esta fecha. ` +
                'Si operas con IGIC o IPSI, Cord todavía no puede registrar esas facturas en Verifactu.',
            );
        }
        return { clave: '01', calificacion: 'S1', pct };
    }

    if (clase === 'nif_iva_ue') return { clave: '01', calificacion: 'N2' };
    const pais = ctx.destinatario.pais;
    if (pais !== 'ES' && !EU_VAT_COUNTRIES.has(pais)) return { clave: '01', calificacion: 'N2' };
    return { clave: '01', exenta: 'E6' };
}

/**
 * Agrupa las líneas por (régimen, calificación o exención, tipo) en máximo 12
 * renglones — el límite de `DetalleDesglose` del esquema. Con más
 * combinaciones FALLA en vez de recortar: el recorte silencioso anterior
 * (`slice(0, 12)`) dejaba fuera bases y cuotas, y el registro declaraba un
 * total que su propio desglose no sumaba.
 *
 * Importes en euros, línea a línea (cada base y cuota se convierte y se
 * redondea por separado y los totales son la suma de lo redondeado: así el
 * registro cuadra consigo mismo), y con `signo` aplicado.
 */
export function buildDesglose(lines: FiscalLineItem[], ctx: DesgloseContexto): DesgloseResultado {
    if (!Array.isArray(lines) || !lines.length) {
        throw new VerifactuDatosError('La factura no tiene conceptos: no hay desglose que registrar.');
    }
    const cents = (value: number) => Math.round((value + Math.sign(value) * Number.EPSILON) * 100);
    const buckets = new Map<string, { cal: Calificada; base: number; cuota: number }>();
    for (const line of lines) {
        const cal = calificar(line, ctx);
        const subtotal = Number(line.subtotal);
        const tax = Number(line.taxAmount) || 0;
        if (!Number.isFinite(subtotal)) throw new VerifactuDatosError('Una línea de la factura tiene un importe inválido.');
        if (cal.calificacion !== 'S1' && Math.abs(tax) >= 0.005) {
            throw new VerifactuDatosError('Una línea exenta o no sujeta tiene impuesto calculado: revisa el tipo de esa línea.');
        }
        const key = `${cal.clave}|${cal.calificacion ?? ''}|${cal.exenta ?? ''}|${cal.pct ?? ''}`;
        const bucket = buckets.get(key) ?? { cal, base: 0, cuota: 0 };
        bucket.base += ctx.signo * cents(subtotal * ctx.aEur);
        if (cal.calificacion === 'S1') bucket.cuota += ctx.signo * cents(tax * ctx.aEur);
        buckets.set(key, bucket);
    }
    if (buckets.size > 12) {
        throw new VerifactuDatosError(
            'La factura combina más de 12 tipos o causas de impuesto distintos; la AEAT admite como máximo 12. Divide la factura.',
        );
    }

    let cuotaTotal = 0;
    let importeTotal = 0;
    const desglose = [...buckets.values()].map(({ cal, base, cuota }) => {
        cuotaTotal += cuota;
        importeTotal += base + cuota;
        const baseStr = importeAEAT(base / 100);
        if (cal.calificacion === 'S1') {
            return {
                claveRegimen: cal.clave,
                calificacionOperacion: 'S1',
                tipoImpositivo: String(cal.pct),
                baseImponibleOimporteNoSujeto: baseStr,
                cuotaRepercutida: importeAEAT(cuota / 100),
            };
        }
        if (cal.calificacion === 'S2') {
            // Error 1198: con S2, TipoImpositivo y CuotaRepercutida van a 0 y
            // no pueden faltar.
            return {
                claveRegimen: cal.clave,
                calificacionOperacion: 'S2',
                tipoImpositivo: '0',
                baseImponibleOimporteNoSujeto: baseStr,
                cuotaRepercutida: '0.00',
            };
        }
        if (cal.calificacion) {
            // N1/N2 con IVA: ni tipo ni cuota (error 1237).
            return { claveRegimen: cal.clave, calificacionOperacion: cal.calificacion, baseImponibleOimporteNoSujeto: baseStr };
        }
        // Exenta: ni tipo ni cuota (error 1238).
        return { claveRegimen: cal.clave, operacionExenta: cal.exenta, baseImponibleOimporteNoSujeto: baseStr };
    });
    return { desglose, cuotaTotal: cuotaTotal / 100, importeTotal: importeTotal / 100 };
}
