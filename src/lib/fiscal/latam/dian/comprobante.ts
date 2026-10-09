// Armado de la factura electrónica de venta y sus notas ante la DIAN
// (Anexo Técnico 1.9): de los datos de Cord a una SolicitudDian validada,
// con importes, tributos y totales cuadrados contra el documento de Cord.
//
// Todo lo que la DIAN rechazaría por un dato que Cord no tiene se rechaza
// AQUÍ, antes de numerar ni firmar, con un mensaje para el dueño del negocio
// (RailDatosError). Nunca se inventa un dato fiscal: lo que no se puede
// derivar sin ambigüedad se pide.
//
// Decisiones (ver docs/estado/cobros-facturacion.md, sección DIAN):
//   - Importes en la divisa del documento, a dos decimales. Fuera de COP se
//     informa PaymentExchangeRate con la tasa congelada del documento (regla
//     22): sin una tasa a COP, falla cerrado.
//   - IVA por línea con las tarifas de la tabla 13.3.11 (19, 5, 16 y 0). Una
//     línea al 0 % es EXENTA (se informa IVA 0.00) o EXCLUIDA (no lleva
//     TaxTotal): lo decide el negocio en Ajustes; sin esa decisión no se envía.
//     Cualquier otra tarifa no es IVA (INC, ICUI…) y Cord todavía no la informa.
//   - El descuento de documento de Cord llega repartido por línea (`discount`)
//     y se informa como AllowanceCharge de la línea: afecta la base gravable
//     [AT FBE01]. PriceAmount es el precio BRUTO por unidad, BaseQuantity la
//     cantidad, y PriceAmount × BaseQuantity − descuento = LineExtensionAmount
//     [AT FAV06].
//   - Retenciones del catálogo: ReteIVA (base = el IVA) como tributo 05 y
//     ReteFuente como 06 "ReteRenta", en WithholdingTaxTotal. No entran en
//     LegalMonetaryTotal [AT 11.9.1]: el PayableAmount de la DIAN es bruto +
//     IVA, y el total de Cord es ese importe menos las retenciones.
//
// Puro: lo cargan el proveedor, los scripts de contrato y las pruebas.

import { RailDatosError } from '../errores.ts';
import type { EntornoRail } from '../rieles.ts';
import type { FiscalLineItem, FiscalRetencion, FiscalTotals } from '../../index.ts';
import {
    ALGORITMO, CONCEPTOS_NOTA_CREDITO, CONCEPTOS_NOTA_DEBITO, CONSUMIDOR_FINAL, DOC_CEDULA, DOC_NIT, DOC_NIT_EXTRANJERO,
    FORMA_PAGO, HOLGURA, OFFSET_COLOMBIA, RESPONSABILIDADES, TARIFAS_IVA, TIPO_AMBIENTE, TIPO_PERSONA, TIPOS_DOCUMENTO,
    TRIBUTO, TRIBUTOS_PARTE, type TipoPersona,
} from './constantes.ts';
import { DEPARTAMENTOS, MUNICIPIOS } from './municipios.ts';
import { codigoSeguridadSoftware, cufe, urlQr, type DatosCufe } from './cufe.ts';

export type ClaseDian = 'factura' | 'nota_credito' | 'nota_debito';
export type TratamientoSinIva = 'exento' | 'excluido';

// ── NIT ──────────────────────────────────────────────────────────────────────

const PESOS_DV = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Dígito de verificación del NIT (algoritmo de la DIAN, módulo 11 con los pesos primos del RUT). */
export function dvNit(nit: string): string {
    const d = String(nit).replace(/\D/g, '');
    if (!d || d.length > PESOS_DV.length) throw new RailDatosError('El NIT no es válido.');
    let suma = 0;
    for (let i = 0; i < d.length; i++) suma += Number(d[d.length - 1 - i]) * PESOS_DV[i];
    const r = suma % 11;
    return String(r > 1 ? 11 - r : r);
}

/**
 * NIT normalizado (sin puntos, guiones ni DV) a partir de lo que el negocio
 * capturó: "900.123.456-8", "9001234568" con DV pegado no se adivina. Si trae
 * DV separado con guion se verifica. Null si no es un NIT legible.
 */
export function nitValido(valor: unknown): { nit: string; dv: string } | null {
    const s = String(valor ?? '').trim().replace(/[\s.,]/g, '').replace(/[‐-―]/g, '-');
    const m = /^(\d{5,15})(?:-(\d))?$/.exec(s);
    if (!m) return null;
    const nit = m[1].replace(/^0+/, '') || '0';
    const dv = dvNit(nit);
    if (m[2] !== undefined && m[2] !== dv) return null;
    return { nit, dv };
}

// ── Fechas: hora legal de Colombia (UTC-05:00, sin horario de verano) ────────

export interface MomentoDian {
    /** cbc:IssueDate. */
    fecha: string;
    /** cbc:IssueTime: hh:mm:ss-05:00 [AT FAD10]. */
    hora: string;
    /** xsd:dateTime con offset, para xades:SigningTime (misma fecha que IssueDate, regla FAD09e). */
    iso: string;
}

export function momentoColombia(d: Date): MomentoDian {
    const local = new Date(d.getTime() - 5 * 3600_000).toISOString();
    const fecha = local.slice(0, 10);
    const hms = local.slice(11, 19);
    return { fecha, hora: `${hms}${OFFSET_COLOMBIA}`, iso: `${fecha}T${hms}${OFFSET_COLOMBIA}` };
}

// ── Importes en centavos (enteros: sin errores de coma flotante al sumar) ────

const aCentavos = (v: unknown): number => Math.round((Number(v) || 0) * 100);
export const importe = (centavos: number): string => {
    const signo = centavos < 0 ? '-' : '';
    const a = Math.abs(Math.round(centavos));
    return `${signo}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
};
/** Porcentaje con dos decimales (hasta tres si los tiene) [AT FAS14 "0..5 p (0..3)"]. */
export function porcentaje(fraccionOPorcentaje: number, esFraccion = true): string {
    const p = esFraccion ? fraccionOPorcentaje * 100 : fraccionOPorcentaje;
    const tres = Math.round(p * 1000) / 1000;
    const s = tres.toFixed(3);
    return s.endsWith('0') ? s.slice(0, -1) : s;
}
/** Cantidad sin ceros a la derecha (hasta 6 decimales) [AT FAV04 "1-6"]. */
export function cantidad(v: number): string {
    return String(Math.round(v * 1e6) / 1e6);
}
/** Precio unitario con hasta 6 decimales, sin notación exponencial. */
function precio(v: number): string {
    const s = (Math.round(v * 1e6) / 1e6).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    return s.includes('.') && s.split('.')[1].length < 2 ? s.padEnd(s.indexOf('.') + 3, '0') : s.includes('.') ? s : `${s}.00`;
}

// ── Partes ───────────────────────────────────────────────────────────────────

export interface DireccionDian {
    /** Código de municipio de 5 dígitos (tabla 13.4.3). */
    municipio: string;
    /** Dirección sin ciudad ni departamento [AT FAJ14]. */
    linea: string;
    postal?: string | null;
}

export interface EmisorDian {
    nit: string;
    dv: string;
    /** Razón social o nombre como figura en el RUT [AT FAJ20, FAJ43b]. */
    razonSocial: string;
    nombreComercial?: string | null;
    tipoPersona: TipoPersona;
    /** cbc:TaxLevelCode, al menos uno [AT FAJ26]. */
    responsabilidades: string[];
    /** PartyTaxScheme/TaxScheme/ID [CAJA 13.2.6.2]. */
    tributo: string;
    direccion: DireccionDian;
    matriculaMercantil?: string | null;
    /** Correo de recepción registrado ante la DIAN [AT FAJ71]; si no se configuró, no se informa. */
    correo?: string | null;
}

export interface AdquirienteDian {
    consumidorFinal: boolean;
    tipoPersona: TipoPersona;
    /** @schemeName [CAJA 13.2.1]. */
    tipoDocumento: string;
    /** Número sin DV, sin puntos ni guiones (NIT de otro país: alfanumérico). */
    numero: string;
    /** DV, solo para NIT (31). */
    dv: string | null;
    nombre: string;
    responsabilidades: string[];
    tributo: { id: string; nombre: string };
    correo: string | null;
}

export interface FichaClienteDian {
    tipoDocumento?: string | null;
    tipoPersona?: string | null;
    tributo?: string | null;
    responsabilidades?: string[] | null;
}

const DOCUMENTOS_VALIDOS = new Set(TIPOS_DOCUMENTO.map((t) => t.id));
const RESPONSABILIDADES_VALIDAS = new Set(RESPONSABILIDADES.map((r) => r.id));
const TRIBUTOS_VALIDOS = new Map(TRIBUTOS_PARTE.map((t) => [t.id, t.nombre]));

/**
 * El adquiriente a partir del cliente de Cord. Solo se infiere lo que la ley
 * hace inequívoco:
 *   - sin identificación (cliente nacional) → consumidor final [AT FAK02–FAK41];
 *   - "123-4" con DV correcto → NIT;
 *   - quien no tiene NIT no es responsable de IVA (para serlo hay que estar en
 *     el RUT) → tributo ZZ "No aplica";
 *   - un documento de persona (cédula, pasaporte…) → persona natural.
 * Lo demás (si un NIT es de persona natural o jurídica, si es responsable de
 * IVA) se pide en la ficha del cliente.
 */
export function resolverAdquiriente(c: {
    nombre: string;
    identificacion: string | null | undefined;
    pais: string | null | undefined;
    correo: string | null | undefined;
    ficha: FichaClienteDian | null | undefined;
}): AdquirienteDian {
    const pais = String(c.pais || 'CO').toUpperCase();
    const ficha = c.ficha ?? {};
    const ident = String(c.identificacion ?? '').trim();
    const correo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.correo ?? '').trim()) ? String(c.correo).trim() : null;
    const nombre = String(c.nombre ?? '').trim().slice(0, 450);

    if (!ident) {
        if (pais !== 'CO') {
            throw new RailDatosError('Este cliente es del exterior y no tiene documento de identificación. Indica su identificación fiscal en su ficha para facturarle ante la DIAN.');
        }
        return {
            consumidorFinal: true,
            tipoPersona: TIPO_PERSONA.natural,
            tipoDocumento: CONSUMIDOR_FINAL.schemeName,
            numero: CONSUMIDOR_FINAL.id,
            dv: null,
            nombre: CONSUMIDOR_FINAL.nombre,
            responsabilidades: [CONSUMIDOR_FINAL.responsabilidad],
            tributo: { ...CONSUMIDOR_FINAL.tributo },
            correo,
        };
    }
    if (!nombre) throw new RailDatosError('El cliente no tiene nombre o razón social.');

    const conDv = /^\s*[\d.\s]+-\d\s*$/.test(ident);
    let tipoDocumento = DOCUMENTOS_VALIDOS.has(String(ficha.tipoDocumento ?? '')) ? String(ficha.tipoDocumento) : '';
    if (!tipoDocumento) {
        if (conDv) tipoDocumento = DOC_NIT;
        else if (pais !== 'CO') tipoDocumento = DOC_NIT_EXTRANJERO;
        else throw new RailDatosError(`Indica el tipo de documento de ${nombre} (cédula, NIT…) en su ficha: la DIAN lo exige.`);
    }

    let numero: string;
    let dv: string | null = null;
    if (tipoDocumento === DOC_NIT) {
        const n = nitValido(ident);
        if (!n) throw new RailDatosError(`El NIT de ${nombre} no es válido (revisa el dígito de verificación).`);
        numero = n.nit;
        dv = n.dv;
    } else if (tipoDocumento === DOC_NIT_EXTRANJERO || tipoDocumento === '41' || tipoDocumento === '42') {
        // Identificaciones del exterior: letras y números, sin separadores [AT FAK21].
        numero = ident.toUpperCase().replace(/[^0-9A-Z]/g, '');
        if (numero.length < 3) throw new RailDatosError(`La identificación de ${nombre} no es válida.`);
    } else {
        numero = ident.replace(/\D/g, '').replace(/^0+/, '');
        if (numero.length < 3) throw new RailDatosError(`El número de documento de ${nombre} no es válido.`);
    }
    if (numero.length > 30) throw new RailDatosError(`La identificación de ${nombre} es demasiado larga.`);

    let tipoPersona = ficha.tipoPersona === TIPO_PERSONA.juridica || ficha.tipoPersona === TIPO_PERSONA.natural ? ficha.tipoPersona as TipoPersona : null;
    if (!tipoPersona) {
        if (tipoDocumento !== DOC_NIT && tipoDocumento !== DOC_NIT_EXTRANJERO) tipoPersona = TIPO_PERSONA.natural;
        else throw new RailDatosError(`Indica en la ficha de ${nombre} si es persona natural o jurídica: la DIAN lo exige.`);
    }

    let tributo = TRIBUTOS_VALIDOS.has(String(ficha.tributo ?? '')) ? String(ficha.tributo) : '';
    if (!tributo) {
        if (tipoDocumento !== DOC_NIT) tributo = 'ZZ';
        else throw new RailDatosError(`Indica en la ficha de ${nombre} si es responsable de IVA: la DIAN lo exige para un cliente con NIT.`);
    }
    const responsabilidades = (ficha.responsabilidades ?? []).filter((r) => RESPONSABILIDADES_VALIDAS.has(r));

    return {
        consumidorFinal: false,
        tipoPersona,
        tipoDocumento,
        numero,
        dv,
        nombre,
        responsabilidades,
        tributo: { id: tributo, nombre: TRIBUTOS_VALIDOS.get(tributo) ?? 'No aplica' },
        correo,
    };
}

/** Lo que le falta al emisor para facturar, como código (la pantalla lo traduce). */
export type FaltanteEmisor = 'nit' | 'razon_social' | 'tipo_persona' | 'responsabilidades' | 'tributo' | 'municipio' | 'direccion';

export function faltantesEmisor(e: Partial<EmisorDian>): FaltanteEmisor[] {
    const f: FaltanteEmisor[] = [];
    if (!e.nit || !e.dv) f.push('nit');
    if (!String(e.razonSocial ?? '').trim()) f.push('razon_social');
    if (e.tipoPersona !== TIPO_PERSONA.juridica && e.tipoPersona !== TIPO_PERSONA.natural) f.push('tipo_persona');
    if (!e.responsabilidades?.length || e.responsabilidades.some((r) => !RESPONSABILIDADES_VALIDAS.has(r))) f.push('responsabilidades');
    if (!TRIBUTOS_VALIDOS.has(String(e.tributo ?? ''))) f.push('tributo');
    if (!e.direccion || !MUNICIPIOS[e.direccion.municipio]) f.push('municipio');
    if (!String(e.direccion?.linea ?? '').trim()) f.push('direccion');
    return f;
}

// ── Numeración ───────────────────────────────────────────────────────────────

/** Resolución de facturación (o el rango de pruebas de habilitación). La clave técnica viaja aparte (secreta). */
export interface ResolucionDian {
    /** sts:InvoiceAuthorization. */
    numero: string;
    /** sts:Prefix (vacío si la resolución no tiene prefijo), 1 a 4 letras o números [AT FAJ50]. */
    prefijo: string;
    desde: number;
    hasta: number;
    /** aaaa-mm-dd. */
    vigenteDesde: string;
    vigenteHasta: string;
}

export type FaltanteResolucion = 'resolucion_numero' | 'resolucion_prefijo' | 'resolucion_rango' | 'resolucion_vigencia';

export function faltantesResolucion(r: Partial<ResolucionDian> | null | undefined): FaltanteResolucion[] {
    const f: FaltanteResolucion[] = [];
    if (!r || !/^\d{1,20}$/.test(String(r.numero ?? ''))) f.push('resolucion_numero');
    if (r && !/^[0-9A-Z]{0,4}$/.test(String(r.prefijo ?? ''))) f.push('resolucion_prefijo');
    if (!r || !Number.isSafeInteger(r.desde) || !Number.isSafeInteger(r.hasta) || (r.desde as number) < 0 || (r.hasta as number) < (r.desde as number)) f.push('resolucion_rango');
    const fecha = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? '')) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
    if (!r || !fecha(r.vigenteDesde) || !fecha(r.vigenteHasta) || String(r.vigenteHasta) < String(r.vigenteDesde)) f.push('resolucion_vigencia');
    return f;
}

/** El número legal: prefijo + consecutivo, solo letras y números [AT FAD05a]. */
export const numeroLegal = (prefijo: string, numero: number) => `${prefijo}${numero}`;

/** Prefijo de las notas crédito: numeración propia del facturador [AT 12.1], 1 a 4 letras o números. */
export const prefijoNotaValido = (p: unknown) => /^[0-9A-Z]{1,4}$/.test(String(p ?? ''));

export interface AvisoNumeracion {
    /** Números que quedan en el rango después del último usado. */
    quedan: number;
    /** Días de vigencia que quedan (hora de Colombia). */
    dias: number;
    /** Cerca del final del rango (menos de 50 números o del 5 %) o de la vigencia (menos de 30 días). */
    proximoAlFin: boolean;
    agotada: boolean;
    vencida: boolean;
}

export function avisoNumeracion(r: ResolucionDian, ultimoUsado: number | null, ahora = new Date()): AvisoNumeracion {
    const siguiente = Math.max((ultimoUsado ?? r.desde - 1) + 1, r.desde);
    const quedan = Math.max(0, r.hasta - siguiente + 1);
    const hoy = momentoColombia(ahora).fecha;
    const dias = Math.floor((Date.parse(`${r.vigenteHasta}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000);
    const umbral = Math.max(50, Math.ceil((r.hasta - r.desde + 1) * 0.05));
    const agotada = quedan === 0;
    const vencida = hoy > r.vigenteHasta;
    return { quedan, dias, proximoAlFin: agotada || vencida || quedan <= umbral || dias < 30, agotada, vencida };
}

// ── Solicitud ────────────────────────────────────────────────────────────────

export interface LineaDian {
    numero: number;
    descripcion: string;
    cantidad: string;
    /** Precio BRUTO por unidad (antes del descuento). */
    precio: string;
    /** BaseAmount del descuento: cantidad × precio bruto. */
    bruto: string;
    descuento: string | null;
    /** MultiplierFactorNumeric. */
    descuentoPct: string | null;
    /** LineExtensionAmount: bruto − descuento. */
    neto: string;
    /** null = excluido de IVA (sin TaxTotal). */
    iva: { tarifa: string; base: string; valor: string } | null;
}

export interface SubtotalDian { tarifa: string; base: string; valor: string }

export interface RetencionDian {
    tributo: { id: string; nombre: string };
    subtotales: SubtotalDian[];
    total: string;
}

export interface ReferenciaDian {
    /** Número de la factura (cbc:ID). */
    id: string;
    cufe: string;
    fecha: string;
    concepto: string;
    descripcion: string;
}

/** Todo menos la numeración, la fecha y los códigos que dependen de ellas. */
export interface BaseDian {
    version: 1;
    clase: ClaseDian;
    entorno: EntornoRail;
    moneda: string;
    /** Tasa a COP (PaymentExchangeRate) cuando la moneda no es COP. */
    tasaCambio: { tasa: string; fecha: string } | null;
    formaPago: string;
    vencimiento: string | null;
    periodo: { desde: string; hasta: string } | null;
    emisor: EmisorDian;
    adquiriente: AdquirienteDian;
    resolucion: ResolucionDian | null;
    /** Serie de la numeración: el prefijo de la resolución o el de las notas. */
    prefijo: string;
    referencia: ReferenciaDian | null;
    lineas: LineaDian[];
    iva: SubtotalDian[];
    retenciones: RetencionDian[];
    totales: {
        /** LineExtensionAmount. */
        bruto: string;
        /** TaxExclusiveAmount: bases de las líneas con IVA (incluidas las exentas). */
        baseGravable: string;
        iva: string;
        /** TaxInclusiveAmount. */
        conImpuestos: string;
        /** PayableAmount. */
        pagar: string;
        /** Retenciones informadas (no restan en la DIAN; sí en Cord). */
        retenciones: string;
        descuentos: string;
    };
    softwareId: string;
    /** Retenciones del documento de Cord que la DIAN no recibe por su tipo (solo informativo). */
    retencionesNoInformadas: string[];
}

export interface SolicitudDian extends BaseDian {
    numero: number;
    /** cbc:ID. */
    id: string;
    fecha: string;
    hora: string;
    /** xades:SigningTime. */
    firmadoAt: string;
    tipoAmbiente: '1' | '2';
    algoritmo: string;
    /** CUFE (factura) o CUDE (notas). */
    cufe: string;
    codigoSeguridad: string;
    qrUrl: string;
}

export interface EntradaDian {
    clase: ClaseDian;
    entorno: EntornoRail;
    emisor: EmisorDian;
    adquiriente: AdquirienteDian;
    lineas: FiscalLineItem[];
    totales: FiscalTotals;
    tratamientoSinIva: TratamientoSinIva | null;
    vencimiento?: string | null;
    /** Fecha en que Cord congeló la tasa del documento (aaaa-mm-dd), si la moneda no es COP. */
    fechaTasa?: string | null;
    periodo?: { desde?: string | null; hasta?: string | null } | null;
    resolucion?: ResolucionDian | null;
    prefijoNotas?: string | null;
    referencia?: Omit<ReferenciaDian, 'concepto' | 'descripcion'> & { concepto: string } | null;
    softwareId: string;
}

const iso = (s: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s ?? '').slice(0, 10)) ? String(s).slice(0, 10) : null);

/** Tarifa de IVA normalizada a dos decimales, o null si no es una tarifa de IVA. */
function tarifaIva(fraccion: number): number | null {
    const p = Math.round(fraccion * 10000) / 100;
    return TARIFAS_IVA.includes(p) ? p : null;
}

/**
 * Clasificación de una retención del catálogo de Cord en un tributo de la
 * DIAN. Solo lo inequívoco: la que se calcula sobre el IVA es ReteIVA; la de
 * tipo ISR es la retención en la fuente (ReteRenta). Una retención creada a
 * mano sobre el subtotal podría ser ReteICA o ReteFuente y no se adivina.
 */
export function tributoDeRetencion(r: Pick<FiscalRetencion, 'tipo' | 'baseTipo'>): { id: string; nombre: string } | null {
    if (r.baseTipo === 'impuesto') return { ...TRIBUTO.reteIva };
    if (r.tipo === 'ret_isr') return { ...TRIBUTO.reteRenta };
    return null;
}

export function armarBase(e: EntradaDian): BaseDian {
    const moneda = String(e.totales.currency || 'COP').toUpperCase();
    let tasaCambio: BaseDian['tasaCambio'] = null;
    if (moneda !== 'COP') {
        const tasa = Number(e.totales.exchangeRate);
        if (String(e.totales.ledgerCurrency || '').toUpperCase() !== 'COP' || !(tasa > 0)) {
            throw new RailDatosError(`Para facturar en ${moneda} ante la DIAN, la factura necesita su tipo de cambio a pesos colombianos y tu moneda contable debe ser COP. Cámbiala en Ajustes o emite la factura en COP.`);
        }
        const fecha = iso(e.fechaTasa);
        if (!fecha) throw new RailDatosError('No se encontró la fecha del tipo de cambio de la factura.');
        tasaCambio = { tasa: precio(tasa), fecha };
    }

    const emisorFalta = faltantesEmisor(e.emisor);
    if (emisorFalta.length) throw new RailDatosError('Completa los datos de facturación electrónica de tu negocio en Ajustes › Datos fiscales.');

    let prefijo: string;
    let resolucion: ResolucionDian | null = null;
    if (e.clase === 'factura') {
        if (!e.resolucion || faltantesResolucion(e.resolucion).length) {
            throw new RailDatosError('Completa la resolución de facturación de la DIAN en Ajustes › Datos fiscales.');
        }
        resolucion = { ...e.resolucion, prefijo: e.resolucion.prefijo ?? '' };
        prefijo = resolucion.prefijo;
    } else {
        if (!prefijoNotaValido(e.prefijoNotas)) throw new RailDatosError('Indica el prefijo de las notas crédito en Ajustes › Datos fiscales (1 a 4 letras o números).');
        prefijo = String(e.prefijoNotas);
        if (!e.referencia) throw new RailDatosError('La nota no indica qué factura ajusta.');
    }

    if (!/^[0-9a-f-]{8,64}$/i.test(String(e.softwareId ?? ''))) {
        throw new RailDatosError('Falta el identificador del software registrado ante la DIAN en Ajustes › Datos fiscales.');
    }

    // ── Líneas ──
    const fuente = e.lineas ?? [];
    if (!fuente.length) throw new RailDatosError('La factura no tiene conceptos.');
    let sumaNeto = 0;
    let sumaIva = 0;
    let sumaDescuento = 0;
    let baseGravable = 0;
    const porTarifa = new Map<number, { base: number; valor: number }>();
    const lineas: LineaDian[] = fuente.map((l, i) => {
        const cant = Number(l.quantity);
        if (!(cant > 0)) throw new RailDatosError(`El concepto ${i + 1} no tiene una cantidad válida.`);
        const descripcion = String(l.description ?? '').trim().slice(0, 300);
        if (!descripcion) throw new RailDatosError(`El concepto ${i + 1} no tiene descripción.`);
        const neto = aCentavos(l.subtotal);
        const desc = Number(l.discount) > 0 ? aCentavos(l.discount) : 0;
        if (neto < 0 || desc < 0) throw new RailDatosError(`El concepto ${i + 1} tiene importes negativos.`);
        const bruto = neto + desc;
        const tasa = Number(l.taxRate) || 0;
        const valorIva = aCentavos(l.taxAmount);
        let iva: LineaDian['iva'] = null;
        const tarifa = tarifaIva(tasa);
        if (tarifa === null) {
            throw new RailDatosError(`El concepto «${descripcion.slice(0, 60)}» tiene una tasa de ${porcentaje(tasa)} %, que no es una tarifa de IVA en Colombia (19, 5 o 0 %). Cord todavía no informa a la DIAN otros impuestos como el INC.`);
        }
        if (tarifa === 0) {
            if (valorIva !== 0) throw new RailDatosError(`El concepto ${i + 1} no cuadra: tasa 0 % con impuesto.`);
            if (!e.tratamientoSinIva) {
                throw new RailDatosError('La factura tiene conceptos sin IVA. Indica en Ajustes › Datos fiscales si tus conceptos sin IVA son exentos o excluidos: la DIAN los informa distinto.');
            }
            if (e.tratamientoSinIva === 'exento') iva = { tarifa: '0.00', base: importe(neto), valor: importe(0) };
        } else {
            // [AT FAX07] TaxAmount = TaxableAmount × Percent / 100, con la holgura del 5.2.1.1.
            if (Math.abs(neto * tarifa / 100 - valorIva) > HOLGURA * 100) {
                throw new RailDatosError(`El IVA del concepto ${i + 1} no cuadra con su base y su tarifa.`);
            }
            iva = { tarifa: porcentaje(tarifa, false), base: importe(neto), valor: importe(valorIva) };
        }
        if (iva) {
            baseGravable += neto;
            const acc = porTarifa.get(tarifa) ?? { base: 0, valor: 0 };
            acc.base += neto;
            acc.valor += valorIva;
            porTarifa.set(tarifa, acc);
        }
        sumaNeto += neto;
        sumaIva += valorIva;
        sumaDescuento += desc;
        return {
            numero: i + 1,
            descripcion,
            cantidad: cantidad(cant),
            precio: precio(bruto / 100 / cant),
            bruto: importe(bruto),
            descuento: desc > 0 ? importe(desc) : null,
            descuentoPct: desc > 0 ? porcentaje(desc / bruto) : null,
            neto: importe(neto),
            iva,
        };
    });

    const iva: SubtotalDian[] = [...porTarifa.entries()].sort(([a], [b]) => b - a).map(([tarifa, v]) => {
        // [AT FAS07] a nivel de documento, con la holgura de los redondeos de cada línea.
        if (Math.abs(v.base * tarifa / 100 - v.valor) > HOLGURA * 100) {
            throw new RailDatosError(`El IVA al ${tarifa} % de la factura no cuadra con su base.`);
        }
        return { tarifa: porcentaje(tarifa, false), base: importe(v.base), valor: importe(v.valor) };
    });

    // ── Retenciones (solo factura: CreditNote no tiene WithholdingTaxTotal en UBL 2.1) ──
    const retenciones: RetencionDian[] = [];
    const retencionesNoInformadas: string[] = [];
    let sumaRetInformada = 0;
    if (e.clase === 'factura') {
        const grupos = new Map<string, { tributo: { id: string; nombre: string }; subtotales: SubtotalDian[]; total: number }>();
        for (const r of e.totales.retenciones ?? []) {
            const monto = aCentavos(r.monto);
            if (!(monto > 0)) continue;
            const tributo = tributoDeRetencion(r);
            if (!tributo) { retencionesNoInformadas.push(String(r.nombre ?? '')); continue; }
            const base = aCentavos(r.base);
            const pct = Number(r.tasa) * 100;
            if (Math.abs(base * pct / 100 - monto) > HOLGURA * 100) {
                throw new RailDatosError(`La retención «${String(r.nombre ?? '').slice(0, 40)}» no cuadra con su base.`);
            }
            const g = grupos.get(tributo.id) ?? { tributo, subtotales: [], total: 0 };
            g.subtotales.push({ tarifa: porcentaje(Number(r.tasa)), base: importe(base), valor: importe(monto) });
            g.total += monto;
            grupos.set(tributo.id, g);
            sumaRetInformada += monto;
        }
        for (const g of grupos.values()) retenciones.push({ tributo: g.tributo, subtotales: g.subtotales, total: importe(g.total) });
    }

    // ── Cuadre contra el documento de Cord ──
    const t = e.totales;
    const pagar = sumaNeto + sumaIva;
    const retCord = aCentavos(t.retencionTotal ?? 0);
    const cuadres: [string, number, number][] = [
        ['subtotal', sumaNeto, aCentavos(t.subtotal)],
        ['impuestos', sumaIva, aCentavos(t.taxes)],
        ['total', pagar - retCord, aCentavos(t.total)],
        ['descuento', sumaDescuento, aCentavos(t.discountTotal ?? 0)],
    ];
    for (const [qué, nuestro, cord] of cuadres) {
        if (Math.abs(nuestro - cord) > 1) {
            throw new RailDatosError(`Los importes de la factura no cuadran (${qué}). Escríbenos a soporte@flouvia.com.`);
        }
    }

    // ── Forma de pago y período ──
    const vencimiento = iso(e.vencimiento);
    const desde = iso(e.periodo?.desde);
    const hasta = iso(e.periodo?.hasta) ?? desde;

    let referencia: ReferenciaDian | null = null;
    if (e.referencia) {
        const conceptos = e.clase === 'nota_debito' ? CONCEPTOS_NOTA_DEBITO : CONCEPTOS_NOTA_CREDITO;
        const descripcion = conceptos[e.referencia.concepto];
        if (!descripcion) throw new RailDatosError('El concepto de la nota no es válido.');
        if (!/^[0-9a-f]{96}$/.test(e.referencia.cufe)) throw new RailDatosError('La factura que ajusta la nota no tiene un CUFE válido.');
        referencia = { ...e.referencia, descripcion };
    }

    return {
        version: 1,
        clase: e.clase,
        entorno: e.entorno,
        moneda,
        tasaCambio,
        formaPago: FORMA_PAGO.contado,
        vencimiento,
        periodo: desde && hasta && hasta >= desde ? { desde, hasta } : null,
        emisor: e.emisor,
        adquiriente: e.adquiriente,
        resolucion,
        prefijo,
        referencia,
        lineas,
        iva,
        retenciones,
        totales: {
            bruto: importe(sumaNeto),
            baseGravable: importe(baseGravable),
            iva: importe(sumaIva),
            conImpuestos: importe(pagar),
            pagar: importe(pagar),
            retenciones: importe(sumaRetInformada),
            descuentos: importe(sumaDescuento),
        },
        softwareId: e.softwareId,
        retencionesNoInformadas,
    };
}

export interface ClavesDian {
    /** Clave técnica del rango (solo factura). */
    claveTecnica?: string | null;
    /** PIN del software (CUDE de las notas y código de seguridad). */
    pin: string;
}

/**
 * Numera, fecha y calcula los códigos de control. Valida el número y la
 * fecha contra la resolución [AT FAD05b–d, FAD09a–b]: fuera de rango o de
 * vigencia no se envía.
 */
export function conNumero(base: BaseDian, numero: number, emitidoAt: Date, claves: ClavesDian): SolicitudDian {
    if (!Number.isSafeInteger(numero) || numero < 0) throw new RailDatosError('El consecutivo no es válido.');
    const m = momentoColombia(emitidoAt);
    if (base.clase === 'factura') {
        const r = base.resolucion!;
        if (numero < r.desde || numero > r.hasta) {
            throw new RailDatosError('Se agotó el rango de numeración autorizado por la DIAN. Solicita una nueva resolución y regístrala en Ajustes › Datos fiscales.');
        }
        if (m.fecha < r.vigenteDesde) throw new RailDatosError('La resolución de facturación de la DIAN todavía no está vigente.');
        if (m.fecha > r.vigenteHasta) {
            throw new RailDatosError('La resolución de facturación de la DIAN venció. Solicita una nueva y regístrala en Ajustes › Datos fiscales.');
        }
        if (!/^[0-9a-zA-Z]{8,128}$/.test(String(claves.claveTecnica ?? ''))) {
            throw new RailDatosError('Falta la clave técnica de la resolución de facturación en Ajustes › Datos fiscales.');
        }
        if (base.vencimiento && base.vencimiento < m.fecha) throw new RailDatosError('El vencimiento de la factura es anterior a su fecha de emisión.');
    }
    if (!/^\d{5}$/.test(String(claves.pin ?? ''))) throw new RailDatosError('Falta el PIN del software registrado ante la DIAN en Ajustes › Datos fiscales.');

    const id = numeroLegal(base.prefijo, numero);
    if (!/^[0-9A-Za-z]{1,20}$/.test(id)) throw new RailDatosError('El número del documento solo puede tener letras y números.');
    const tipoAmbiente = TIPO_AMBIENTE[base.entorno];
    const ivaTotal = base.iva.length ? base.totales.iva : '0.00';
    const datos: DatosCufe = {
        numero: id,
        fecha: m.fecha,
        hora: m.hora,
        valorBruto: base.totales.bruto,
        iva: ivaTotal,
        inc: '0.00',
        ica: '0.00',
        total: base.totales.pagar,
        nitEmisor: base.emisor.nit,
        numAdquiriente: base.adquiriente.numero,
        clave: base.clase === 'factura' ? String(claves.claveTecnica) : claves.pin,
        tipoAmbiente,
    };
    const codigo = cufe(datos);
    const credito = base.clase === 'factura' && !!base.vencimiento && base.vencimiento > m.fecha;
    return {
        ...base,
        formaPago: credito ? FORMA_PAGO.credito : FORMA_PAGO.contado,
        numero,
        id,
        fecha: m.fecha,
        hora: m.hora,
        firmadoAt: m.iso,
        tipoAmbiente,
        algoritmo: base.clase === 'factura' ? ALGORITMO.cufe : ALGORITMO.cude,
        cufe: codigo,
        codigoSeguridad: codigoSeguridadSoftware(base.softwareId, claves.pin, id),
        qrUrl: urlQr(codigo, base.entorno),
    };
}

/** Concepto de la nota crédito: anulación si acredita el total de la factura; si no, rebaja [CAJA 13.2.4]. */
export function conceptoNotaCredito(totalNota: number, totalFactura: number): '2' | '3' {
    return Math.abs(aCentavos(totalNota) - aCentavos(totalFactura)) <= 1 ? '2' : '3';
}

/** Municipio y departamento oficiales de la dirección del emisor (tablas 13.4.3 y 13.4.2). */
export function ubicacion(municipio: string): { codigo: string; ciudad: string; departamento: string; codigoDepartamento: string } {
    const ciudad = MUNICIPIOS[municipio];
    const codigoDepartamento = municipio.slice(0, 2);
    const departamento = DEPARTAMENTOS[codigoDepartamento];
    if (!ciudad || !departamento) throw new RailDatosError('El municipio del negocio no es un código válido de la DIAN. Corrígelo en Ajustes › Datos fiscales.');
    return { codigo: municipio, ciudad, departamento, codigoDepartamento };
}

/** Documento de identificación del cliente tal como lo imprime la representación. */
export function documentoAdquiriente(a: AdquirienteDian): string {
    const tipo = TIPOS_DOCUMENTO.find((t) => t.id === a.tipoDocumento)?.nombre ?? a.tipoDocumento;
    return a.consumidorFinal ? 'Consumidor final' : `${tipo} ${a.numero}${a.dv ? `-${a.dv}` : ''}`;
}

export const esCedula = (a: AdquirienteDian) => a.tipoDocumento === DOC_CEDULA;
