// Construcción y validación de los registros Verifactu ANTES de encadenarlos.
//
// Puro: recibe los datos del documento y devuelve los campos del registro tal
// como se firmarán (huella), se remitirán (XML) y se imprimirán (QR). Una sola
// función produce los tres a partir de los mismos strings, así que no pueden
// discrepar entre sí. Todo lo que el esquema o las validaciones de negocio de
// la AEAT rechazarían se detecta aquí y LANZA `VerifactuDatosError`: la
// emisión falla y la factura sigue en borrador, en vez de encadenar un
// registro que la AEAT va a rechazar para siempre.
//
// Fuentes: SuministroInformacion.xsd (RegistroFacturacionAltaType y
// RegistroFacturacionAnulacionType), "Validaciones y errores" v1.2.2 y las
// FAQ de desarrolladores de la AEAT (§20: la retención de IRPF NO forma parte
// del registro).

import type { FiscalLineItem, FiscalParty, FiscalTotals } from '../index';
import { buildDesglose, resolverDestinatario, type DesgloseLinea, type DestinatarioXml } from './desglose.ts';
import {
    VerifactuDatosError, centimos, exigirNifEs, importeAEAT, nifEsValido, normalizarNifEs,
    paisAEATValido, textoAEAT, validarNumSerie,
} from './validacion.ts';

/** Identificación de una factura ante la AEAT (IDFactura / IDFacturaRectificada / RegistroAnterior). */
export interface IdFacturaAEAT {
    idEmisorFactura: string;
    numSerieFactura: string;
    fechaExpedicionFactura: string;
}

export type Entorno = 'pruebas' | 'produccion';

/**
 * Campos de un registro de ALTA que dependen del documento (no de la cadena ni
 * del productor). Se persisten tal cual en `verifactu_registros.payload`.
 */
export interface AltaConstruida extends IdFacturaAEAT {
    tipoFactura: 'F1' | 'F2' | 'R1' | 'R5';
    cuotaTotal: string;
    importeTotal: string;
    nombreRazonEmisor: string;
    descripcionOperacion: string;
    destinatario: DestinatarioXml | null;
    desglose: DesgloseLinea[];
    /** Rectificativa por diferencias: importes NEGATIVOS respecto a la original. */
    tipoRectificativa?: 'I';
    facturasRectificadas?: IdFacturaAEAT[];
    /** F2/R5 completa sin identificación del destinatario (art. 6.1.d RD 1619/2012). */
    facturaSinIdentifDestinatarioArt61d?: 'S';
    /** Obligatorio con |ImporteTotal| ≥ 100.000.000 € (error 1139). */
    macrodato?: 'S';
    /** Operativa de corrección (anexo de "Validaciones y errores", §6.1). */
    subsanacion?: 'S';
    rechazoPrevio?: 'S' | 'X';
    /** Entorno de la AEAT al que se remite este registro — y el host de su QR. */
    entorno: Entorno;
    /** Divisa del documento y tipo de cambio aplicado cuando no era EUR. */
    divisaDocumento?: { currency: string; aEur: number };
}

export interface ConstruirAltaInput {
    emisor: Pick<FiscalParty, 'legalName' | 'taxId'>;
    receptor: FiscalParty;
    numSerie: string;
    /** dd-mm-aaaa, en hora de Madrid. */
    fechaExpedicion: string;
    lines: FiscalLineItem[];
    totals: FiscalTotals;
    entorno: Entorno;
    /** Presente si el documento es una nota de crédito (rectificativa). */
    rectificativa?: {
        /** IDFactura de la factura rectificada, si se puede identificar. */
        original: IdFacturaAEAT | null;
        /** TipoFactura del registro de la original: una F2 se rectifica con R5. */
        tipoOriginal?: string | null;
    };
    /** Alta de subsanación (corrección de un registro ya generado). */
    correccion?: { rechazoPrevio?: 'S' | 'X' };
}

/**
 * Factor a euros. El registro se declara SIEMPRE en euros: una factura en USD
 * registrada con sus importes en dólares declaraba ante la AEAT una base
 * imponible que no es. Se convierte solo con el tipo de cambio que el propio
 * documento ya congeló hacia una contabilidad en EUR (el mismo con el que se
 * calculó su total contable y el que imprime la factura); sin él, falla
 * cerrado — inventar una tasa es la regla 22 rota.
 */
export function factorEur(totals: FiscalTotals): number {
    const currency = String(totals?.currency || 'EUR').toUpperCase();
    if (currency === 'EUR') return 1;
    const ledger = String(totals?.ledgerCurrency || '').toUpperCase();
    const rate = Number(totals?.exchangeRate);
    if (ledger === 'EUR' && Number.isFinite(rate) && rate > 0) return rate;
    throw new VerifactuDatosError(
        `Verifactu registra los importes en euros y esta factura está en ${currency} sin un tipo de cambio a euros. ` +
        'Configura EUR como moneda contable en Ajustes (así cada factura en otra divisa guarda su tipo de cambio) o emítela en euros.',
    );
}

/**
 * Construye y valida el registro de alta de una factura (F1/F2) o nota de
 * crédito (R1/R5).
 *
 * - ImporteTotal = Σ (base + cuota) del desglose. NO resta la retención de
 *   IRPF: la FAQ de desarrolladores §20 es explícita en que la retención no
 *   forma parte del registro, y "Validaciones" §3.1.3.17 cuadra ImporteTotal
 *   contra el desglose. Antes se usaba `totals.total` (con el IRPF restado) y
 *   el mismo importe erróneo viajaba al QR.
 * - Cliente sin identificador fiscal → F2 + FacturaSinIdentifDestinatarioArt61d.
 * - Nota de crédito → R1 por diferencias (TipoRectificativa "I") con importes
 *   negativos y la factura rectificada identificada; R5 si la original era F2.
 *   Antes iba como R1 sin TipoRectificativa y con importes positivos, y la AEAT
 *   la rechazaba siempre (error 1114).
 */
export function construirAlta(input: ConstruirAltaInput): AltaConstruida {
    const idEmisorFactura = exigirNifEs(input.emisor?.taxId, 'de tu negocio');
    const nombreRazonEmisor = textoAEAT(input.emisor?.legalName, 120);
    if (!nombreRazonEmisor) {
        throw new VerifactuDatosError('Falta la razón social de tu negocio en Ajustes › Datos fiscales.');
    }
    const numSerieFactura = validarNumSerie(input.numSerie);
    if (!/^\d{2}-\d{2}-\d{4}$/.test(input.fechaExpedicion)) {
        throw new VerifactuDatosError('La fecha de expedición de la factura no es válida.');
    }

    const esRectificativa = !!input.rectificativa;
    const aEur = factorEur(input.totals);
    let destinatario = resolverDestinatario(input.receptor, idEmisorFactura);

    let tipoFactura: AltaConstruida['tipoFactura'];
    if (esRectificativa) {
        const originalF2 = input.rectificativa?.tipoOriginal === 'F2' || input.rectificativa?.tipoOriginal === 'R5';
        tipoFactura = originalF2 || !destinatario.xml ? 'R5' : 'R1';
        // R5 no admite Destinatarios (error 1190): rectifica una factura que se
        // registró sin destinatario y conserva esa forma.
        if (tipoFactura === 'R5' && destinatario.xml) destinatario = { ...destinatario, xml: null, clase: 'ninguno' };
    } else {
        tipoFactura = destinatario.xml ? 'F1' : 'F2';
    }

    const { desglose, cuotaTotal, importeTotal } = buildDesglose(input.lines, {
        destinatario,
        fechaExpedicion: input.fechaExpedicion,
        signo: esRectificativa ? -1 : 1,
        aEur,
    });

    // El registro tiene que cuadrar con el documento que ve el cliente: la base
    // más la cuota del desglose debe ser el subtotal más impuestos del
    // documento (sin retenciones). Con conversión de divisa la suma de líneas
    // convertidas puede diferir en céntimos del total convertido, así que solo
    // se exige en euros.
    if (aEur === 1) {
        const esperado = centimos((Number(input.totals.subtotal) || 0) + (Number(input.totals.taxes) || 0))
            * (esRectificativa ? -1 : 1);
        const tolerancia = 0.01 * Math.max(1, input.lines.length);
        if (Math.abs(esperado - importeTotal) > tolerancia + 1e-9) {
            throw new VerifactuDatosError('Los importes de la factura no cuadran con su desglose por tipo de impuesto. Revisa los conceptos antes de emitir.');
        }
    }

    const original = input.rectificativa?.original ?? null;
    const facturasRectificadas = original && nifEsValido(original.idEmisorFactura)
        && /^\d{2}-\d{2}-\d{4}$/.test(original.fechaExpedicionFactura)
        ? [{
            idEmisorFactura: normalizarNifEs(original.idEmisorFactura),
            numSerieFactura: validarNumSerie(original.numSerieFactura),
            fechaExpedicionFactura: original.fechaExpedicionFactura,
        }]
        : undefined;

    const primeraDescripcion = textoAEAT(input.lines.find((l) => textoAEAT(l.description, 500))?.description, 500);
    const descripcionOperacion = esRectificativa
        ? textoAEAT(`Rectificación por diferencias de la factura ${original?.numSerieFactura ?? ''}`.trim(), 500)
        : primeraDescripcion || 'Venta de bienes y/o prestación de servicios';

    const importeTotalStr = importeAEAT(importeTotal);
    return {
        idEmisorFactura,
        numSerieFactura,
        fechaExpedicionFactura: input.fechaExpedicion,
        tipoFactura,
        cuotaTotal: importeAEAT(cuotaTotal),
        importeTotal: importeTotalStr,
        nombreRazonEmisor,
        descripcionOperacion,
        destinatario: destinatario.xml,
        desglose,
        ...(esRectificativa ? { tipoRectificativa: 'I' as const } : {}),
        ...(facturasRectificadas ? { facturasRectificadas } : {}),
        ...(!destinatario.xml ? { facturaSinIdentifDestinatarioArt61d: 'S' as const } : {}),
        ...(Math.abs(importeTotal) >= 1e8 ? { macrodato: 'S' as const } : {}),
        ...(input.correccion ? { subsanacion: 'S' as const } : {}),
        ...(input.correccion?.rechazoPrevio ? { rechazoPrevio: input.correccion.rechazoPrevio } : {}),
        entorno: input.entorno,
        ...(aEur !== 1 ? { divisaDocumento: { currency: String(input.totals.currency).toUpperCase(), aEur } } : {}),
    };
}

// ── Comprobación de esquema de un payload YA encadenado ─────────────────────
// El envío no puede confiar en que todo lo que hay en la cola nació con las
// validaciones de arriba: los registros encadenados antes de este cambio
// (NIF con prefijo "ES", más de 12 líneas de desglose, caracteres de control)
// rompen el ESQUEMA, y un solo registro así hacía que la AEAT rechazara el
// mensaje completo (SoapFault) en cada corrida. Estas comprobaciones replican
// las restricciones estructurales del XSD — no las de negocio, que la AEAT
// resuelve registro a registro sin tumbar el resto del envío.

const FECHA = /^\d{2}-\d{2}-\d{4}$/;
const IMPORTE = /^(\+|-)?\d{1,12}(\.\d{0,2})?$/;
const TIPO = /^\d{1,3}(\.\d{0,2})?$/;
const HUELLA = /^[0-9A-F]{64}$/;
const FECHA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
const XML_OK = /^[\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]*$/u;

function texto(problemas: string[], campo: string, value: unknown, max: number, requerido = true): void {
    const s = value === undefined || value === null ? '' : String(value);
    if (!s) { if (requerido) problemas.push(`${campo} vacío`); return; }
    if (Array.from(s).length > max) problemas.push(`${campo} supera ${max} caracteres`);
    if (!XML_OK.test(s)) problemas.push(`${campo} contiene caracteres inválidos en XML`);
}

function nif9(problemas: string[], campo: string, value: unknown): void {
    if (String(value ?? '').length !== 9) problemas.push(`${campo} no tiene 9 caracteres`);
}

function persona(problemas: string[], campo: string, p: { nombreRazon?: string; nif?: string; idOtro?: { codigoPais?: string; idType?: string; id?: string } } | null | undefined): void {
    if (!p) return;
    texto(problemas, `${campo}.NombreRazon`, p.nombreRazon, 120);
    if (p.nif && p.idOtro) problemas.push(`${campo} con NIF e IDOtro a la vez`);
    if (p.nif) nif9(problemas, `${campo}.NIF`, p.nif);
    else if (p.idOtro) {
        if (p.idOtro.codigoPais && !paisAEATValido(p.idOtro.codigoPais)) problemas.push(`${campo}.CodigoPais fuera del esquema`);
        if (!['02', '03', '04', '05', '06', '07'].includes(String(p.idOtro.idType))) problemas.push(`${campo}.IDType inválido`);
        texto(problemas, `${campo}.ID`, p.idOtro.id, 20);
    } else problemas.push(`${campo} sin NIF ni IDOtro`);
}

function sistema(problemas: string[], s: any): void {
    if (!s || typeof s !== 'object') { problemas.push('SistemaInformatico ausente'); return; }
    persona(problemas, 'SistemaInformatico', s);
    texto(problemas, 'NombreSistemaInformatico', s.nombreSistemaInformatico, 30);
    texto(problemas, 'IdSistemaInformatico', s.idSistemaInformatico, 2);
    texto(problemas, 'Version', s.version, 50);
    texto(problemas, 'NumeroInstalacion', s.numeroInstalacion, 100);
    for (const k of ['tipoUsoPosibleSoloVerifactu', 'tipoUsoPosibleMultiOT', 'indicadorMultiplesOT']) {
        if (!['S', 'N'].includes(String(s[k]))) problemas.push(`${k} inválido`);
    }
}

function cadena(problemas: string[], p: any): void {
    if (!HUELLA.test(String(p.huella ?? ''))) problemas.push('Huella inválida');
    if (p.huellaAnterior && String(p.huellaAnterior).length > 64) problemas.push('Huella anterior inválida');
    if (!FECHA_HORA.test(String(p.fechaHoraHusoGenRegistro ?? ''))) problemas.push('FechaHoraHusoGenRegistro inválida');
}

/** Problemas ESTRUCTURALES de un payload de alta (vacío = cumple el esquema). */
export function problemasEsquemaAlta(p: any): string[] {
    const problemas: string[] = [];
    if (!p || typeof p !== 'object') return ['payload ausente'];
    nif9(problemas, 'IDEmisorFactura', p.idEmisorFactura);
    texto(problemas, 'NumSerieFactura', p.numSerieFactura, 60);
    if (!FECHA.test(String(p.fechaExpedicionFactura ?? ''))) problemas.push('FechaExpedicionFactura inválida');
    texto(problemas, 'NombreRazonEmisor', p.nombreRazonEmisor, 120);
    if (!['F1', 'F2', 'F3', 'R1', 'R2', 'R3', 'R4', 'R5'].includes(String(p.tipoFactura))) problemas.push('TipoFactura inválido');
    if (p.tipoRectificativa && !['S', 'I'].includes(String(p.tipoRectificativa))) problemas.push('TipoRectificativa inválido');
    for (const f of p.facturasRectificadas ?? []) {
        nif9(problemas, 'FacturasRectificadas.IDEmisorFactura', f?.idEmisorFactura);
        texto(problemas, 'FacturasRectificadas.NumSerieFactura', f?.numSerieFactura, 60);
        if (!FECHA.test(String(f?.fechaExpedicionFactura ?? ''))) problemas.push('FacturasRectificadas.FechaExpedicionFactura inválida');
    }
    if (p.subsanacion && !['S', 'N'].includes(String(p.subsanacion))) problemas.push('Subsanacion inválida');
    if (p.rechazoPrevio && !['S', 'N', 'X'].includes(String(p.rechazoPrevio))) problemas.push('RechazoPrevio inválido');
    texto(problemas, 'DescripcionOperacion', p.descripcionOperacion, 500);
    persona(problemas, 'Destinatario', p.destinatario);
    const desglose = Array.isArray(p.desglose) ? p.desglose : [];
    if (desglose.length < 1 || desglose.length > 12) problemas.push('Desglose debe tener entre 1 y 12 líneas');
    for (const d of desglose) {
        if (d?.calificacionOperacion && d?.operacionExenta) problemas.push('Desglose con calificación y exención a la vez');
        if (!d?.calificacionOperacion && !d?.operacionExenta) problemas.push('Desglose sin calificación ni exención');
        if (d?.calificacionOperacion && !['S1', 'S2', 'N1', 'N2'].includes(d.calificacionOperacion)) problemas.push('CalificacionOperacion inválida');
        if (d?.operacionExenta && !['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'].includes(d.operacionExenta)) problemas.push('OperacionExenta inválida');
        if (d?.tipoImpositivo !== undefined && !TIPO.test(String(d.tipoImpositivo))) problemas.push('TipoImpositivo inválido');
        if (!IMPORTE.test(String(d?.baseImponibleOimporteNoSujeto ?? ''))) problemas.push('BaseImponibleOimporteNoSujeto inválida');
        if (d?.cuotaRepercutida !== undefined && !IMPORTE.test(String(d.cuotaRepercutida))) problemas.push('CuotaRepercutida inválida');
    }
    if (!IMPORTE.test(String(p.cuotaTotal ?? ''))) problemas.push('CuotaTotal inválida');
    if (!IMPORTE.test(String(p.importeTotal ?? ''))) problemas.push('ImporteTotal inválido');
    sistema(problemas, p.sistemaInformatico);
    cadena(problemas, p);
    return problemas;
}

/** Problemas ESTRUCTURALES de un payload de anulación. */
export function problemasEsquemaAnulacion(p: any): string[] {
    const problemas: string[] = [];
    if (!p || typeof p !== 'object') return ['payload ausente'];
    nif9(problemas, 'IDEmisorFacturaAnulada', p.idEmisorFacturaAnulada);
    texto(problemas, 'NumSerieFacturaAnulada', p.numSerieFacturaAnulada, 60);
    if (!FECHA.test(String(p.fechaExpedicionFacturaAnulada ?? ''))) problemas.push('FechaExpedicionFacturaAnulada inválida');
    if (p.sinRegistroPrevio && !['S', 'N'].includes(String(p.sinRegistroPrevio))) problemas.push('SinRegistroPrevio inválido');
    if (p.rechazoPrevio && !['S', 'N'].includes(String(p.rechazoPrevio))) problemas.push('RechazoPrevio inválido');
    sistema(problemas, p.sistemaInformatico);
    cadena(problemas, p);
    return problemas;
}
