// Validación PREVIA al encadenamiento de un registro Verifactu.
//
// Por qué existe: la cadena es append-only (regla 29). Un registro que la AEAT
// rechaza por estructura no se puede editar, solo anular o subsanar con OTRO
// registro — y un registro que rompe el esquema hacía que el envío completo de
// la organización fallara con un SoapFault, bloqueando su cola para siempre. La
// única defensa real es no encadenar lo que no va a pasar: cada regla de aquí
// sale de SuministroInformacion.xsd o de "Validaciones y errores" (AEAT
// v1.2.2), no de memoria. Puro y sin red ni base de datos para que
// `security:verifactu` y vitest lo ejerzan tal cual.
//
// Los mensajes de `VerifactuDatosError` los lee el dueño del negocio (el
// proveedor los propaga como error de emisión): dicen QUÉ dato corregir, nunca
// el nombre de una variable o de un proveedor (regla 14).

// Extensión .ts explícita: verifactu-check.mjs carga este módulo con Node plano.
import { validSpainTaxId } from '../../../../packages/elements/src/fiscal/tax-id.ts';

/** Dato del documento que impide generar un registro válido. Mensaje apto para el usuario. */
export class VerifactuDatosError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'VerifactuDatosError';
    }
}

// ── Texto ───────────────────────────────────────────────────────────────────

// XML 1.0 solo admite #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] |
// [#x10000-#x10FFFF]. Un carácter de control pegado desde otro sistema (un
// \u0000, un \u001B) hace que la AEAT rechace el MENSAJE COMPLETO con 4103,
// no solo el registro.
const XML_INVALID = /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

/**
 * Texto apto para un campo `TextMaxN` del esquema: sin caracteres inválidos en
 * XML 1.0, sin saltos de línea ni tabuladores (un nombre o una descripción no
 * los necesita y algunos validadores los cuentan distinto), espacios colapsados
 * y recortado a `max` caracteres REALES — el XSD cuenta puntos de código, no
 * unidades UTF-16, así que un emoji no puede partirse a la mitad.
 */
export function textoAEAT(value: unknown, max: number): string {
    const clean = String(value ?? '')
        .replace(XML_INVALID, '')
        .replace(/[\t\r\n]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    const chars = Array.from(clean);
    return chars.length > max ? chars.slice(0, max).join('').trim() : clean;
}

/**
 * NumSerieFactura: ASCII imprimible (32–126) sin " ' < > = (Validaciones
 * §3.1.3.1, errores 1130/1287) y de 1 a 60 caracteres (TextoIDFacturaType).
 * Es parte de la huella y del QR: no se "limpia", se valida — reescribirlo
 * cambiaría el número de factura que ya ve el cliente.
 */
export function validarNumSerie(numSerie: string): string {
    const value = String(numSerie ?? '');
    if (!value || Array.from(value).length > 60) {
        throw new VerifactuDatosError('El número de factura debe tener entre 1 y 60 caracteres para registrarse en la AEAT.');
    }
    if (!/^[\x20-\x7E]+$/.test(value) || /["'<>=]/.test(value)) {
        throw new VerifactuDatosError(
            'El número de factura contiene caracteres que la AEAT no admite (acentos, comillas, <, > o =). Cambia el prefijo de la serie en Ajustes.',
        );
    }
    return value;
}

// ── Identificadores fiscales ────────────────────────────────────────────────

/**
 * NIF español tal como lo exige `NIFType` (exactamente 9 caracteres): sin
 * espacios, puntos ni guiones, en mayúsculas y SIN el prefijo de país "ES"
 * que se usa en el NIF-IVA intracomunitario. "ESB12345674" es como muchos
 * negocios escriben su NIF, y con 11 caracteres rompía el esquema entero.
 */
export function normalizarNifEs(value: unknown): string {
    let clean = String(value ?? '').toUpperCase().replace(/[\s.\-_/]/g, '');
    if (clean.length === 11 && clean.startsWith('ES')) clean = clean.slice(2);
    return clean;
}

// NIF de personas físicas con letra inicial K (menores de 14 años), L
// (españoles residentes en el extranjero) y M (extranjeros sin NIE): siete
// dígitos y letra de control calculada como la del DNI. validCif los trataba
// como CIF y los rechazaba; se aceptan aquí mientras el validador compartido
// no los cubra.
const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
function validNifKlm(clean: string): boolean {
    const m = /^[KLM](\d{7})([A-Z])$/.exec(clean);
    return !!m && NIF_LETTERS[Number(m[1]) % 23] === m[2];
}

/** NIF/NIE/CIF español ya normalizado y con dígito de control correcto. */
export function nifEsValido(value: unknown): boolean {
    const clean = normalizarNifEs(value);
    if (clean.length !== 9) return false;
    return validSpainTaxId(clean) || validNifKlm(clean);
}

/** Normaliza y valida, o lanza con un mensaje que dice qué NIF corregir. */
export function exigirNifEs(value: unknown, quien: string): string {
    const clean = normalizarNifEs(value);
    if (!nifEsValido(clean)) {
        throw new VerifactuDatosError(
            `El NIF ${quien} no es un NIF, NIE o CIF español válido. Revísalo antes de emitir: la AEAT rechaza el registro con un NIF incorrecto.`,
        );
    }
    return clean;
}

// Prefijo del NIF-IVA por país: coincide con el ISO salvo Grecia, que usa EL.
const VAT_PREFIX: Record<string, string> = { GR: 'EL' };

// Estructura del NIF-IVA de cada Estado miembro — Nota (1) de "Validaciones y
// errores" (AEAT v1.2.2), que remite a las directrices de VIES. La AEAT valida
// que un IDOtro con IDType 02 tenga EXACTAMENTE esta forma; con otra, rechaza.
const VAT_STRUCTURE: Record<string, RegExp> = {
    DE: /^\d{9}$/,
    AT: /^[A-Z0-9]{9}$/,
    BE: /^\d{10}$/,
    CY: /^[A-Z0-9]{9}$/,
    CZ: /^\d{8,10}$/,
    HR: /^\d{11}$/,
    DK: /^\d{8}$/,
    SK: /^\d{10}$/,
    SI: /^\d{8}$/,
    EE: /^\d{9}$/,
    FI: /^\d{8}$/,
    FR: /^[A-Z0-9]{11}$/,
    EL: /^\d{9}$/,
    NL: /^[A-Z0-9]{12}$/,
    HU: /^\d{8}$/,
    IT: /^\d{11}$/,
    IE: /^[A-Z0-9]{8,9}$/,
    LV: /^\d{11}$/,
    LT: /^(\d{9}|\d{12})$/,
    LU: /^\d{8}$/,
    MT: /^\d{8}$/,
    PL: /^\d{10}$/,
    PT: /^\d{9}$/,
    SE: /^\d{12}$/,
    BG: /^\d{9,10}$/,
    RO: /^[1-9]\d{1,9}$/,
};

/** Estados miembro (ISO) cuyo NIF-IVA se puede declarar con IDType 02. */
export const EU_VAT_COUNTRIES: ReadonlySet<string> = new Set([
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
    'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
    'SI', 'SE',
]);

/**
 * NIF-IVA intracomunitario con prefijo, listo para `IDOtro/ID` con IDType 02,
 * o `null` si el identificador no tiene la estructura del país. Acepta el valor
 * con o sin prefijo ("12345678901" o "FR12345678901") porque así lo capturan
 * los negocios; el registro siempre lo lleva prefijado.
 */
export function nifIvaUE(countryCode: string, taxId: unknown): string | null {
    const iso = String(countryCode || '').toUpperCase();
    if (!EU_VAT_COUNTRIES.has(iso)) return null;
    const prefix = VAT_PREFIX[iso] ?? iso;
    let clean = String(taxId ?? '').toUpperCase().replace(/[\s.\-_/]/g, '');
    if (clean.startsWith(prefix)) clean = clean.slice(prefix.length);
    else if (clean.startsWith(iso)) clean = clean.slice(iso.length);
    const shape = VAT_STRUCTURE[prefix];
    if (!shape || !shape.test(clean)) return null;
    const full = `${prefix}${clean}`;
    return full.length <= 20 ? full : null;
}

// CountryType2 de SuministroInformacion.xsd, copiado literal del esquema: el
// ISO 3166 completo NO es lo mismo (faltan p. ej. GF, GP, MQ, AX, BL, EH, MF,
// SJ, y sobran códigos propios como XG, QU, XB, XU, XN). Un CodigoPais fuera
// de esta lista rompe el esquema y rechaza el envío completo.
const XSD_COUNTRIES = new Set((
    'AF AL DE AD AO AI AQ AG SA DZ AR AM AW AU AT AZ BS BH BD BB BE BZ BJ BM BY BO BA BW BV BR BN BG '
    + 'BF BI BT CV KY KH CM CA CF CC CO KM CG CD CK KP KR CI CR HR CU TD CZ CL CN CY CW DK DM DO EC EG '
    + 'AE ER SK SI ES US EE ET FO PH FI FJ FR GA GM GE GS GH GI GD GR GL GU GT GG GN GQ GW GY HT HM HN '
    + 'HK HU IN ID IR IQ IE IM IS IL IT JM JP JE JO KZ KE KG KI KW LA LS LV LB LR LY LI LT LU XG MO MK '
    + 'MG MY MW MV ML MT FK MP MA MH MU MR YT UM MX FM MD MC MN ME MS MZ MM NA NR CX NP NI NE NG NU NF '
    + 'NO NC NZ IO OM NL BQ PK PW PA PG PY PE PN PF PL PT PR QA GB RW RO RU RE SB SV WS AS KN SM SX PM '
    + 'VC SH LC ST SN RS SC SL SG SY SO LK SZ ZA SD SS SE CH SR TH TW TZ TJ PS TF TL TG TK TO TT TN TC '
    + 'TM TR TV UA UG UY UZ VU VA VE VN VG VI WF YE DJ ZM ZW QU XB XU XN'
).split(' '));

export function paisAEATValido(code: unknown): boolean {
    return XSD_COUNTRIES.has(String(code ?? '').toUpperCase());
}

/**
 * Identificación de una persona o entidad SIN NIF español (`IDOtroType`),
 * validada contra las reglas de negocio que comparten Destinatarios y
 * SistemaInformatico (Validaciones §3.1.3.13 y §3.1.5):
 *   - CodigoPais obligatorio salvo IDType 02 (error 1111);
 *   - IDType 02 → NIF-IVA de un Estado miembro con su estructura;
 *   - CodigoPais "ES" solo con IDType 03 (pasaporte) — 07 no se usa: Cord no
 *     emite a "no censados" y el productor del SIF nunca puede serlo;
 *   - ID de 1 a 20 caracteres (TextMax20Type).
 */
export interface IdOtro {
    codigoPais?: string;
    idType: '02' | '03' | '04' | '05' | '06';
    id: string;
}

export function validarIdOtro(input: { codigoPais?: unknown; idType?: unknown; id?: unknown }, quien: string): IdOtro {
    const idType = String(input.idType ?? '').trim() as IdOtro['idType'];
    const codigoPais = String(input.codigoPais ?? '').trim().toUpperCase() || undefined;
    const rawId = textoAEAT(input.id, 40).toUpperCase().replace(/\s+/g, '');
    if (!['02', '03', '04', '05', '06'].includes(idType)) {
        throw new VerifactuDatosError(`El tipo de identificación ${quien} no es válido para la AEAT.`);
    }
    if (idType === '02') {
        const pais = codigoPais || rawId.slice(0, 2);
        const iso = pais === 'EL' ? 'GR' : pais;
        const vat = nifIvaUE(iso, rawId);
        if (!vat) {
            throw new VerifactuDatosError(`El NIF-IVA ${quien} no tiene la estructura de un número de IVA de la UE. Escríbelo con el prefijo del país (por ejemplo FR12345678901).`);
        }
        return { idType, id: vat };
    }
    if (!codigoPais || !paisAEATValido(codigoPais)) {
        throw new VerifactuDatosError(`Falta el país ${quien} o la AEAT no lo reconoce.`);
    }
    if (codigoPais === 'ES' && idType !== '03') {
        throw new VerifactuDatosError(`Una identificación española ${quien} debe ser un NIF válido.`);
    }
    if (!rawId || Array.from(rawId).length > 20) {
        throw new VerifactuDatosError(`El identificador fiscal ${quien} debe tener entre 1 y 20 caracteres.`);
    }
    return { codigoPais, idType, id: rawId };
}

// ── Importes ────────────────────────────────────────────────────────────────

/** Redondeo a céntimos sin el sesgo binario de toFixed (1.005 → 1.01). */
export function centimos(value: number): number {
    return Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
}

/**
 * Importe con el formato de `ImporteSgn12.2Type`: punto decimal, dos
 * decimales, signo solo si es negativo y como máximo 12 dígitos enteros. El
 * mismo string entra en la huella, así que se genera UNA vez aquí y se
 * reutiliza tal cual en el XML, la huella y el QR.
 */
export function importeAEAT(value: number): string {
    if (!Number.isFinite(value)) throw new VerifactuDatosError('Un importe de la factura no es un número válido.');
    const rounded = centimos(value);
    if (Math.abs(rounded) >= 1e12) {
        throw new VerifactuDatosError('Un importe de la factura supera el máximo que admite el registro de la AEAT.');
    }
    return (rounded === 0 ? 0 : rounded).toFixed(2);
}

/** Porcentaje de `Tipo2.2Type` ("21", "7.5"): sin signo ni ceros de relleno. */
export function porcentajeAEAT(fraction: number): string {
    const pct = Math.round(fraction * 100 * 100) / 100;
    return String(pct);
}

// ── Tipos impositivos de IVA admitidos con S1 ───────────────────────────────

function fechaANumero(fecha: string): number {
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(fecha);
    return m ? Number(`${m[3]}${m[2]}${m[1]}`) : 0;
}

/**
 * Tipos de IVA que la AEAT admite con CalificacionOperacion S1 en la fecha de
 * expedición (Validaciones §3.1.3.15.1, error 1124): 0, 4, 10 y 21 siempre;
 * 5 solo del 01-07-2022 al 30-09-2024; 2 y 7,5 solo del 01-10-2024 al
 * 31-12-2024. Un tipo fuera de la lista —el 7 % del IGIC canario, el 4 % del
 * IPSI o un 16 % mexicano mal configurado— se rechaza ANTES de encadenar.
 */
export function tipoS1Admitido(pct: number, fechaExpedicion: string): boolean {
    const f = fechaANumero(fechaExpedicion);
    if ([0, 4, 10, 21].includes(pct)) return true;
    if (pct === 5) return f >= 20220701 && f <= 20240930;
    if (pct === 2 || pct === 7.5) return f >= 20241001 && f <= 20241231;
    return false;
}
