// Traducción de un documento de Cord a la factura (01) o nota de crédito (07)
// electrónica de SUNAT, antes del XML. Todo lo que decide el contenido fiscal
// vive aquí; ubl.ts solo lo serializa.
//
// Reglas y su fuente (las abreviaturas son las de constantes.ts):
//   - Factura: serie de 4 caracteres que empieza con F y correlativo de hasta 8
//     dígitos [RS 123-2022, anexo 1, campo 8]. El adquirente se identifica con
//     RUC (tipo 6) salvo en exportación [anexo 1, campo 11]: a un cliente sin
//     RUC se le emite boleta de venta, que este riel no emite.
//   - Afectación por concepto (catálogo 07): 10 gravado, 20 exonerado, 30
//     inafecto, 40 exportación. Cord guarda la tasa, no el régimen: un 0 % en
//     una venta interna es exonerado o inafecto según lo que el negocio declara
//     en Ajustes; en una venta al exterior es exportación [catálogo 51: 0200/0201].
//   - Valor de venta por ítem = valor unitario × cantidad − descuento que
//     afecta la base [anexo 1, campo 28]. El descuento de documento de Cord
//     llega repartido por concepto (`discount`) y se informa como cargo/
//     descuento del ítem, código 00 del catálogo 53.
//   - Totales: total valor de venta, IGV, subtotal e importe total [anexo 1,
//     campos 33-48] recalculados sobre lo que se envía y cuadrados contra el
//     documento de Cord: lo que SUNAT acepta es lo que el cliente ve impreso.
//   - Forma de pago [RS 193-2020]: contado si se paga en la fecha de emisión;
//     crédito con el monto neto pendiente (sin la retención del IGV que
//     practicará un cliente agente de retención) y su cuota con vencimiento.
//   - Nota de crédito: misma serie de facturas (F…), mismo adquirente y
//     moneda que la factura que modifica, tipo 01 (anulación) si la acredita
//     completa o 09 (disminución en el valor) si acredita una parte.
//
// Lo que no se puede declarar bien NO se arma: RailDatosError con un mensaje
// para el dueño del negocio. Puro (sin red ni base): scripts/sunat-check.mjs
// lo prueba con Node plano.

import type { FiscalLineItem, FiscalTotals } from '../../index';
// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { RailDatosError } from '../errores.ts';
import { validateTaxId } from '../../../../../packages/elements/src/fiscal/tax-id.ts';
import { montoEnLetras } from './letras.ts';
import {
    AFECTACION, DOC_IDENTIDAD, ESTABLECIMIENTO_DOMICILIO_FISCAL, FORMA_PAGO, TASA_IGV_GENERAL, TASA_IGV_MYPE,
    TASA_RETENCION_IGV, TIPO_DOC, TIPO_NOTA_CREDITO, TIPO_OPERACION, UMBRAL_RETENCION_PEN, UNIDAD_POR_DEFECTO,
    UNIDAD_SERVICIO, ZONA_PE, type AfectacionIgv, type TipoDocSunat,
} from './constantes.ts';

/** Qué vende el negocio: decide la unidad y el tipo de operación de una exportación. */
export type ConceptoSunat = 'bienes' | 'servicios';

export interface LineaSunat {
    id: number;
    descripcion: string;
    unidad: string;
    /** Texto decimal, hasta 10 decimales [9-A: n(12,10)]. */
    cantidad: string;
    /** Valor unitario SIN IGV y antes del descuento del ítem. */
    valorUnitario: string;
    /** Precio de venta unitario CON IGV (catálogo 16, código 01). */
    precioUnitario: string;
    /** Valor de venta del ítem (LineExtensionAmount), neto del descuento. */
    valorVenta: string;
    descuento?: { factor: string; monto: string; base: string };
    afectacion: AfectacionIgv;
    /** Tasa en porcentaje, dos decimales ("18.00"). */
    porcentaje: string;
    igv: string;
}

export interface TotalesSunat {
    gravadas: string;
    exoneradas: string;
    inafectas: string;
    exportacion: string;
    igv: string;
    /** Total valor de venta (LegalMonetaryTotal/LineExtensionAmount). */
    valorVenta: string;
    /** Subtotal = valor de venta + tributos (TaxInclusiveAmount). */
    precioVenta: string;
    /** Importe total (PayableAmount). */
    importeTotal: string;
    /** Suma de los descuentos por ítem (informativo: ya está dentro de cada valor de venta). */
    descuentos: string;
}

export type FormaPagoSunat =
    | { tipo: typeof FORMA_PAGO.CONTADO }
    | { tipo: typeof FORMA_PAGO.CREDITO; montoNeto: string; cuotas: { monto: string; vence: string }[] };

export interface ReferenciaSunat {
    tipo: TipoDocSunat;
    serie: string;
    numero: number;
}

/** Lo que se le pide a SUNAT para UN comprobante. Se persiste tal cual en `solicitud`. */
export interface SolicitudSunat {
    version: 1;
    ruc: string;
    razonSocial: string;
    nombreComercial?: string;
    establecimiento: string;
    tipo: TipoDocSunat;
    serie: string;
    /** 0 hasta que `conNumero` lo asigne dentro del lease de la secuencia. */
    numero: number;
    fecha: string;
    hora: string;
    vencimiento?: string;
    moneda: string;
    /** Catálogo 51; solo en la factura. */
    tipoOperacion?: string;
    /** País de uso del servicio exportado (catálogo 51, 0201). */
    paisServicio?: string;
    receptor: { tipoDoc: string; numDoc: string; nombre: string };
    lineas: LineaSunat[];
    totales: TotalesSunat;
    leyendaLetras: string;
    formaPago?: FormaPagoSunat;
    retencion?: { base: string; factor: string; monto: string };
    notaCredito?: { tipoNota: string; motivo: string; referencia: ReferenciaSunat };
}

export interface EntradaComprobante {
    ruc: string;
    razonSocial: string;
    nombreComercial?: string | null;
    establecimiento?: string | null;
    /** Serie de facturas (y de sus notas de crédito), F + 3 alfanuméricos. */
    serie: string;
    concepto: ConceptoSunat;
    /** Cómo se declara un concepto al 0 % en una venta interna. */
    afectacionSinIgv?: typeof AFECTACION.EXONERADO | typeof AFECTACION.INAFECTO | null;
    /** El negocio está en el régimen de IGV reducido para MYPE de restaurantes y hoteles. */
    regimenMype?: boolean;
    /** Instante de emisión: fecha y hora en Lima. */
    fecha: Date;
    receptor: { taxId?: string | null; pais?: string | null; nombre?: string | null };
    lineas: FiscalLineItem[];
    totales: FiscalTotals;
    /** Vencimiento del pago (aaaa-mm-dd) y lo ya cobrado al emitir. */
    pago?: { vencimiento?: string | null; pagado?: number | null };
    /** El cliente es agente de retención del IGV y el negocio no está excluido del régimen. */
    retencionIgv?: { aplica: boolean; tipoCambioPen?: number | null };
    /** Nota de crédito: la solicitud AUTORIZADA de la factura que modifica. */
    notaCreditoDe?: SolicitudSunat | null;
    motivo?: string | null;
}

// ── Fechas ──────────────────────────────────────────────────────────────────

/** Fecha y hora de emisión en Lima. */
export function fechaHoraLima(instante: Date): { fecha: string; hora: string } {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: ZONA_PE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(instante);
    const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '00';
    return { fecha: `${v('year')}-${v('month')}-${v('day')}`, hora: `${v('hour')}:${v('minute')}:${v('second')}` };
}

function fechaValida(iso: string | null | undefined): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
    if (!m) return null;
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === `${m[1]}-${m[2]}-${m[3]}` ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// ── Importes ────────────────────────────────────────────────────────────────

const centavos = (v: number) => {
    const n = Number(v) || 0;
    return Math.round((n + Math.sign(n) * Number.EPSILON) * 100);
};
const importe = (c: number) => (c / 100).toFixed(2);

/** Decimal con hasta `max` decimales, sin ceros de relleno ni notación exponencial. */
export function decimal(valor: number, max = 10): string {
    if (!Number.isFinite(valor)) throw new RailDatosError('Un importe del documento no es un número válido.');
    const txt = valor.toFixed(max).replace(/\.?0+$/, '');
    return txt === '-0' ? '0' : txt;
}

/** ¿Dentro del margen? Cord y SUNAT redondean concepto a concepto: un centavo por concepto. */
export function dentroDelMargen(a: number, b: number, n = 1): boolean {
    return Math.abs(a - b) <= 0.01 * Math.max(1, n) + 1e-9;
}

// ── Partes ──────────────────────────────────────────────────────────────────

/** RUC válido (prefijo y dígito verificador), o null. */
export function rucValido(value: unknown): string | null {
    const v = validateTaxId('PE', String(value ?? '').replace(/\D/g, ''));
    return v.ok && v.kind === 'ruc' ? v.normalized : null;
}

export function serieValida(value: unknown): string | null {
    const s = String(value ?? '').trim().toUpperCase();
    return /^F[A-Z0-9]{3}$/.test(s) ? s : null;
}

/** Texto apto para el XML: sin caracteres de control, espacios colapsados y acotado. */
function texto(value: unknown, max: number): string {
    return String(value ?? '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

/** Tasa de IGV admitida para la fecha y el régimen del negocio. */
export function tasasIgvAdmitidas(fecha: string, regimenMype: boolean): number[] {
    const anio = Number(fecha.slice(0, 4));
    const mype = regimenMype ? TASA_IGV_MYPE[anio] : undefined;
    return mype !== undefined ? [TASA_IGV_GENERAL, mype] : [TASA_IGV_GENERAL];
}

const fmtPct = (tasa: number) => (tasa * 100).toFixed(2);

// ── Armado ──────────────────────────────────────────────────────────────────

interface Clasificacion {
    exportacion: boolean;
    receptor: SolicitudSunat['receptor'];
    paisReceptor: string;
}

function clasificarReceptor(e: EntradaComprobante): Clasificacion {
    const pais = String(e.receptor.pais || 'PE').trim().toUpperCase();
    const nombre = texto(e.receptor.nombre, 1500);
    if (!nombre) throw new RailDatosError('El cliente necesita su nombre o razón social para facturarle.');
    if (pais === 'PE') {
        const ruc = rucValido(e.receptor.taxId);
        if (!ruc) {
            throw new RailDatosError('La factura electrónica exige el RUC del cliente. A un cliente sin RUC (consumidor final con DNI) se le emite una boleta de venta, que Cord todavía no emite ante SUNAT. Agrega el RUC en la ficha del cliente.');
        }
        if (ruc === rucValido(e.ruc)) throw new RailDatosError('El cliente no puede tener el mismo RUC que tu negocio.');
        return { exportacion: false, paisReceptor: pais, receptor: { tipoDoc: DOC_IDENTIDAD.RUC, numDoc: ruc, nombre } };
    }
    // Cliente del exterior: exportación (catálogo 51). Se identifica con su
    // documento tributario del país de residencia (catálogo 06, tipo 0).
    const doc = texto(e.receptor.taxId, 15).replace(/\s/g, '');
    if (!doc) throw new RailDatosError('Una factura de exportación necesita el número de identificación tributaria del cliente en su país. Agrégalo en la ficha del cliente.');
    return { exportacion: true, paisReceptor: pais, receptor: { tipoDoc: DOC_IDENTIDAD.NO_DOMICILIADO, numDoc: doc, nombre } };
}

function descuentoDe(l: FiscalLineItem): number {
    if (l.discount === undefined || l.discount === null) return 0;
    const d = Number(l.discount);
    if (!Number.isFinite(d) || d < 0) throw new RailDatosError('El descuento de un concepto no es válido.');
    return centavos(d);
}

function armarLineas(e: EntradaComprobante, fecha: string, exportacion: boolean): LineaSunat[] {
    if (!e.lineas.length) throw new RailDatosError('El comprobante necesita al menos un concepto.');
    if (e.lineas.length > 9999) throw new RailDatosError('El comprobante tiene demasiados conceptos.');
    // Una nota de crédito acredita los MISMOS conceptos de la factura, en el
    // mismo orden (credit-note.ts): cada uno conserva la afectación con que se
    // declaró, aunque el ajuste del negocio haya cambiado después.
    const originales = e.notaCreditoDe?.lineas ?? null;
    if (originales && originales.length !== e.lineas.length) {
        throw new RailDatosError('La nota de crédito no tiene los mismos conceptos que la factura que modifica.');
    }
    const admitidas = originales
        ? [...new Set(originales.filter((o) => o.afectacion === AFECTACION.GRAVADO).map((o) => Number(o.porcentaje) / 100))]
        : tasasIgvAdmitidas(fecha, !!e.regimenMype);
    const unidad = e.concepto === 'servicios' ? UNIDAD_SERVICIO : UNIDAD_POR_DEFECTO;
    return e.lineas.map((l, i) => {
        const cantidad = Number(l.quantity);
        if (!(cantidad > 0)) throw new RailDatosError('Cada concepto necesita una cantidad mayor a cero.');
        const base = centavos(l.subtotal);
        const igv = centavos(l.taxAmount);
        const descuento = descuentoDe(l);
        if (base < 0 || igv < 0) throw new RailDatosError('Un concepto tiene un importe negativo.');
        const tasa = Number(l.taxRate) || 0;
        let afectacion: AfectacionIgv;
        const previa = originales?.[i]?.afectacion;
        if (previa && (previa === AFECTACION.GRAVADO) !== (tasa > 0)) {
            throw new RailDatosError('La nota de crédito no conserva el IGV de los conceptos de la factura que modifica.');
        }
        if (tasa === 0) {
            if (igv !== 0) throw new RailDatosError('Un concepto sin IGV no puede llevar impuesto.');
            if (previa) afectacion = previa;
            else if (exportacion) afectacion = AFECTACION.EXPORTACION;
            else if (e.afectacionSinIgv === AFECTACION.EXONERADO || e.afectacionSinIgv === AFECTACION.INAFECTO) afectacion = e.afectacionSinIgv;
            else throw new RailDatosError('Indica en Ajustes › Datos fiscales › SUNAT si tus conceptos sin IGV son exonerados o inafectos: SUNAT exige declararlo en cada concepto.');
        } else {
            if (exportacion) {
                throw new RailDatosError('Una venta a un cliente del exterior se factura como exportación, sin IGV. Quita el IGV de los conceptos o, si la operación está gravada en Perú, identifica al cliente con su RUC.');
            }
            if (!admitidas.some((t) => Math.abs(t - tasa) < 1e-6)) {
                throw new RailDatosError(`La tasa del ${(tasa * 100).toLocaleString('es-PE', { maximumFractionDigits: 3 })} % no es una tasa de IGV que tu negocio pueda aplicar. Usa IGV 18 %${admitidas.length > 1 ? ` o ${(admitidas[1] * 100).toLocaleString('es-PE')} % (régimen MYPE de restaurantes y hoteles)` : ''}, Exonerado o Inafecto.`);
            }
            // El IGV del concepto corresponde a su base (un centavo de margen por redondeo).
            if (Math.abs(base * tasa - igv) > 1.000001) {
                throw new RailDatosError('El IGV de un concepto no cuadra con su base por redondeo. Revisa los precios unitarios y vuelve a emitir.');
            }
            afectacion = AFECTACION.GRAVADO;
        }
        const bruto = base + descuento;
        const linea: LineaSunat = {
            id: i + 1,
            descripcion: texto(l.description, 500) || 'Concepto',
            unidad,
            cantidad: decimal(cantidad),
            valorUnitario: decimal(bruto / 100 / cantidad),
            precioUnitario: decimal((base + igv) / 100 / cantidad),
            valorVenta: importe(base),
            afectacion,
            porcentaje: afectacion === AFECTACION.GRAVADO ? fmtPct(tasa) : '0.00',
            igv: importe(igv),
        };
        if (descuento > 0) {
            linea.descuento = { factor: decimal(descuento / bruto, 5), monto: importe(descuento), base: importe(bruto) };
        }
        return linea;
    });
}

/**
 * Una sola tasa de IGV por comprobante: SUNAT rechaza (3462, "La tasa del IGV
 * debe ser la misma en todas las líneas o ítems del documento y debe
 * corresponder con una tasa vigente") uno que mezcle, por ejemplo, 18 % y la
 * tasa MYPE. Respuesta real del servicio beta en scripts/fixtures/sunat/.
 */
function unaSolaTasa(lineas: LineaSunat[]): void {
    const tasas = new Set(lineas.filter((l) => l.afectacion === AFECTACION.GRAVADO).map((l) => l.porcentaje));
    if (tasas.size > 1) {
        throw new RailDatosError('SUNAT exige una sola tasa de IGV por factura. Separa en facturas distintas los conceptos con tasas diferentes.');
    }
}

function totalizar(lineas: LineaSunat[]): TotalesSunat {
    const suma = (f: (l: LineaSunat) => boolean, k: 'valorVenta' | 'igv') => lineas.filter(f).reduce((s, l) => s + centavos(Number(l[k])), 0);
    const gravadas = suma((l) => l.afectacion === AFECTACION.GRAVADO, 'valorVenta');
    const exoneradas = suma((l) => l.afectacion === AFECTACION.EXONERADO, 'valorVenta');
    const inafectas = suma((l) => l.afectacion === AFECTACION.INAFECTO, 'valorVenta');
    const exportacion = suma((l) => l.afectacion === AFECTACION.EXPORTACION, 'valorVenta');
    const igv = suma(() => true, 'igv');
    const valorVenta = gravadas + exoneradas + inafectas + exportacion;
    const descuentos = lineas.reduce((s, l) => s + (l.descuento ? centavos(Number(l.descuento.monto)) : 0), 0);
    return {
        gravadas: importe(gravadas),
        exoneradas: importe(exoneradas),
        inafectas: importe(inafectas),
        exportacion: importe(exportacion),
        igv: importe(igv),
        valorVenta: importe(valorVenta),
        precioVenta: importe(valorVenta + igv),
        importeTotal: importe(valorVenta + igv),
        descuentos: importe(descuentos),
    };
}

function formaDePago(e: EntradaComprobante, fecha: string, total: number, gravada: boolean): { forma: FormaPagoSunat; retencion?: SolicitudSunat['retencion'] } {
    const vence = fechaValida(e.pago?.vencimiento ?? null);
    const pagado = Math.max(0, centavos(Number(e.pago?.pagado) || 0));
    // Contado: se paga en la fecha de emisión (o ya está pagado). Sin
    // vencimiento posterior a la emisión no hay crédito que declarar.
    if (!vence || vence <= fecha || pagado >= total) return { forma: { tipo: FORMA_PAGO.CONTADO } };

    let retencion: SolicitudSunat['retencion'];
    let neto = total - pagado;
    if (e.retencionIgv?.aplica && gravada) {
        // Régimen de retenciones del IGV: 3 % del importe total (con IGV) en
        // operaciones gravadas que superan S/ 700. El umbral se mide en soles;
        // en otra moneda hace falta el tipo de cambio congelado del documento.
        const moneda = String(e.totales.currency || 'PEN').toUpperCase();
        const tc = moneda === 'PEN' ? 1 : Number(e.retencionIgv.tipoCambioPen);
        if (!(tc > 0)) {
            throw new RailDatosError('Este cliente es agente de retención del IGV y la factura no está en soles: para saber si supera S/ 700 hace falta el tipo de cambio a soles del documento. Emítela en soles o con tu moneda contable en soles.');
        }
        if ((total / 100) * tc > UMBRAL_RETENCION_PEN) {
            const monto = Math.round(total * TASA_RETENCION_IGV);
            retencion = { base: importe(total), factor: decimal(TASA_RETENCION_IGV, 5), monto: importe(monto) };
            neto = Math.max(0, neto - monto);
        }
    }
    if (neto <= 0) return { forma: { tipo: FORMA_PAGO.CONTADO } };
    return {
        forma: { tipo: FORMA_PAGO.CREDITO, montoNeto: importe(neto), cuotas: [{ monto: importe(neto), vence }] },
        ...(retencion ? { retencion } : {}),
    };
}

/**
 * Arma la solicitud de UN comprobante. El número queda en 0: lo asigna
 * `conNumero()` dentro del lease de la secuencia.
 */
export function armarSolicitud(e: EntradaComprobante): SolicitudSunat {
    const ruc = rucValido(e.ruc);
    if (!ruc) throw new RailDatosError('El RUC de tu negocio no es válido. Corrígelo en Ajustes › Datos fiscales.');
    const razonSocial = texto(e.razonSocial, 1500);
    if (!razonSocial) throw new RailDatosError('Falta la razón social de tu negocio en Ajustes › Datos fiscales.');
    const serie = serieValida(e.serie);
    if (!serie) throw new RailDatosError('La serie debe tener cuatro caracteres y empezar con F (por ejemplo, F001).');
    const establecimiento = String(e.establecimiento || ESTABLECIMIENTO_DOMICILIO_FISCAL);
    if (!/^\d{4}$/.test(establecimiento)) throw new RailDatosError('El código de establecimiento debe tener cuatro dígitos (0000 para el domicilio fiscal).');
    if (e.concepto !== 'bienes' && e.concepto !== 'servicios') throw new RailDatosError('Indica en los ajustes de SUNAT si vendes bienes o servicios.');
    if (Number(e.totales.retencionTotal) > 0) {
        throw new RailDatosError('Una factura electrónica de SUNAT no descuenta retenciones del total: el IGV lo retiene el cliente agente de retención al pagar. Quita las retenciones del documento.');
    }
    const moneda = String(e.totales.currency || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(moneda)) throw new RailDatosError('El documento no declara su moneda.');

    const { fecha, hora } = fechaHoraLima(e.fecha);
    const original = e.notaCreditoDe ?? null;
    let receptor: SolicitudSunat['receptor'];
    let exportacion: boolean;
    let pais = 'PE';
    if (original) {
        // La nota modifica UNA factura: mismo adquirente y misma moneda.
        receptor = original.receptor;
        exportacion = original.tipoOperacion === undefined ? false : original.tipoOperacion !== '0101';
        if (original.moneda !== moneda) throw new RailDatosError('La nota de crédito debe ir en la misma moneda que la factura.');
        if (original.ruc !== ruc) throw new RailDatosError('La factura original es de otro RUC: su nota de crédito no puede emitirse con este.');
    } else {
        const c = clasificarReceptor(e);
        receptor = c.receptor;
        exportacion = c.exportacion;
        pais = c.paisReceptor;
    }

    const lineas = armarLineas(e, fecha, exportacion);
    unaSolaTasa(lineas);
    const totales = totalizar(lineas);

    // Cuadre contra el documento de Cord.
    const n = lineas.length;
    if (!dentroDelMargen(Number(totales.valorVenta), Number(e.totales.subtotal), n)
        || !dentroDelMargen(Number(totales.igv), Number(e.totales.taxes), n)
        || !dentroDelMargen(Number(totales.importeTotal), Number(e.totales.total), n)) {
        throw new RailDatosError('Los importes del documento no cuadran entre sí. Vuelve a guardarlo antes de emitir.');
    }
    if (e.totales.discountTotal !== undefined && e.totales.discountTotal !== null
        && !dentroDelMargen(Number(totales.descuentos), Number(e.totales.discountTotal), n)) {
        throw new RailDatosError('El descuento del documento no cuadra con el de sus conceptos. Vuelve a guardarlo antes de emitir.');
    }
    if (!(Number(totales.importeTotal) > 0)) throw new RailDatosError('El importe del comprobante debe ser mayor a cero.');

    const solicitud: SolicitudSunat = {
        version: 1,
        ruc,
        razonSocial,
        ...(texto(e.nombreComercial, 1500) ? { nombreComercial: texto(e.nombreComercial, 1500) } : {}),
        establecimiento,
        tipo: original ? TIPO_DOC.NOTA_CREDITO : TIPO_DOC.FACTURA,
        serie,
        numero: 0,
        fecha,
        hora,
        moneda,
        receptor,
        lineas,
        totales,
        leyendaLetras: montoEnLetras(totales.importeTotal, moneda),
    };

    if (original) {
        if (original.tipo !== TIPO_DOC.FACTURA || !original.numero) throw new RailDatosError('La nota de crédito debe modificar una factura autorizada por SUNAT.');
        const motivo = texto(e.motivo, 500);
        const completa = dentroDelMargen(Number(totales.importeTotal), Number(original.totales.importeTotal), n);
        if (Number(totales.importeTotal) - Number(original.totales.importeTotal) > 0.01 * n) {
            throw new RailDatosError('La nota de crédito no puede superar el importe de la factura.');
        }
        solicitud.notaCredito = {
            tipoNota: completa ? TIPO_NOTA_CREDITO.ANULACION : TIPO_NOTA_CREDITO.DISMINUCION_VALOR,
            motivo: motivo || (completa ? 'Anulación de la operación' : 'Disminución en el valor'),
            referencia: { tipo: TIPO_DOC.FACTURA, serie: original.serie, numero: original.numero },
        };
        return solicitud;
    }

    solicitud.tipoOperacion = exportacion
        ? (e.concepto === 'servicios' ? TIPO_OPERACION.EXPORTACION_SERVICIOS : TIPO_OPERACION.EXPORTACION_BIENES)
        : TIPO_OPERACION.VENTA_INTERNA;
    // El país de uso del servicio exportado es obligatorio en 0201 [anexo 1,
    // campo 51]: el del cliente no domiciliado que lo contrata y lo usa.
    if (solicitud.tipoOperacion === TIPO_OPERACION.EXPORTACION_SERVICIOS) solicitud.paisServicio = pais;
    const vence = fechaValida(e.pago?.vencimiento ?? null);
    if (vence && vence >= fecha) solicitud.vencimiento = vence;
    const { forma, retencion } = formaDePago(e, fecha, centavos(Number(totales.importeTotal)), Number(totales.gravadas) > 0);
    solicitud.formaPago = forma;
    if (retencion) solicitud.retencion = retencion;
    return solicitud;
}

/** La misma solicitud con su número correlativo. */
export function conNumero(s: SolicitudSunat, numero: number): SolicitudSunat {
    if (!Number.isInteger(numero) || numero < 1 || numero > 99_999_999) throw new RailDatosError('Número de comprobante fuera de rango.');
    return { ...s, numero };
}

/** Serie y correlativo tal como viajan en cbc:ID y en el nombre del archivo: "F001-42", sin ceros a la izquierda [MAN §1.2]. */
export function idComprobante(s: Pick<SolicitudSunat, 'serie' | 'numero'>): string {
    return `${s.serie}-${s.numero}`;
}

/** Nombre del archivo sin extensión [MAN §1.2]: RUC-TT-SERIE-NUMERO. */
export function nombreArchivo(s: Pick<SolicitudSunat, 'ruc' | 'tipo' | 'serie' | 'numero'>): string {
    return `${s.ruc}-${s.tipo}-${s.serie}-${s.numero}`;
}

/**
 * Número del documento en Cord: lleva el tipo para que factura y nota de
 * crédito (secuencias distintas) nunca choquen en el índice único de
 * `documentos_fiscales`, y la marca H- en el entorno de pruebas.
 */
export function numeroDocumento(s: Pick<SolicitudSunat, 'tipo' | 'serie' | 'numero'>, homologacion: boolean): string {
    return `${homologacion ? 'H-' : ''}${s.tipo === TIPO_DOC.NOTA_CREDITO ? 'NC-' : ''}${s.serie}-${String(s.numero).padStart(8, '0')}`;
}

/** Recalcula los cuadres de lo que se va a enviar. Lista vacía = cuadra. */
export function problemasDeCuadre(s: SolicitudSunat): string[] {
    const out: string[] = [];
    const n = (x: string) => Number(x);
    for (const l of s.lineas) {
        const bruto = n(l.valorUnitario) * n(l.cantidad);
        const neto = bruto - (l.descuento ? n(l.descuento.monto) : 0);
        if (Math.abs(neto - n(l.valorVenta)) > 0.01) out.push(`ítem ${l.id}: valor unitario × cantidad − descuento ≠ valor de venta`);
        if (l.descuento && Math.abs(n(l.descuento.base) - n(l.descuento.monto) - n(l.valorVenta)) > 0.001) out.push(`ítem ${l.id}: base del descuento − descuento ≠ valor de venta`);
        if (Math.abs(n(l.valorVenta) * n(l.porcentaje) / 100 - n(l.igv)) > 0.01) out.push(`ítem ${l.id}: IGV ≠ valor de venta × tasa`);
        if (Math.abs(n(l.precioUnitario) * n(l.cantidad) - n(l.valorVenta) - n(l.igv)) > 0.01) out.push(`ítem ${l.id}: precio unitario × cantidad ≠ valor de venta + IGV`);
        if (l.afectacion !== AFECTACION.GRAVADO && n(l.igv) !== 0) out.push(`ítem ${l.id}: un ítem no gravado lleva IGV`);
    }
    const t = s.totales;
    const k = Math.max(1, s.lineas.length);
    const sum = (f: (l: LineaSunat) => number) => s.lineas.reduce((a, l) => a + f(l), 0);
    if (!dentroDelMargen(sum((l) => n(l.igv)), n(t.igv), k)) out.push('Σ IGV de los ítems ≠ IGV total');
    if (!dentroDelMargen(n(t.gravadas) + n(t.exoneradas) + n(t.inafectas) + n(t.exportacion), n(t.valorVenta))) out.push('total valor de venta ≠ suma por afectación');
    if (!dentroDelMargen(sum((l) => n(l.valorVenta)), n(t.valorVenta), k)) out.push('Σ valor de venta de los ítems ≠ total valor de venta');
    if (!dentroDelMargen(n(t.valorVenta) + n(t.igv), n(t.precioVenta))) out.push('subtotal ≠ valor de venta + IGV');
    if (!dentroDelMargen(n(t.precioVenta), n(t.importeTotal))) out.push('importe total ≠ subtotal');
    if (s.formaPago?.tipo === FORMA_PAGO.CREDITO) {
        const cuotas = s.formaPago.cuotas.reduce((a, c) => a + n(c.monto), 0);
        if (!dentroDelMargen(cuotas, n(s.formaPago.montoNeto))) out.push('Σ cuotas ≠ monto neto pendiente de pago');
        if (n(s.formaPago.montoNeto) > n(t.importeTotal)) out.push('monto neto pendiente > importe total');
        if (s.formaPago.cuotas.some((c) => c.vence <= s.fecha)) out.push('una cuota vence en la fecha de emisión o antes');
    }
    if (s.tipo === TIPO_DOC.FACTURA && !s.formaPago) out.push('la factura no declara la forma de pago');
    return out;
}
