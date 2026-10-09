// Traducción de un documento de Cord a un Documento Tributario Electrónico del
// SII (DTE_v10.xsd, actualización 06/02/2026; formato DTE v2.2).
//
// Decisiones, cada una con su fuente:
//   - Tipo: 33 (factura) si hay al menos un concepto afecto; 34 (factura no
//     afecta o exenta) si todos son exentos ("Si todos los ítems de una
//     factura tienen valor 1 en este indicador la factura no puede ser factura
//     electrónica (código 33), debería ser factura exenta (código 34)",
//     formato DTE, IndExe); 61 para la nota de crédito.
//   - Montos en pesos chilenos, enteros (MontoType: nonNegativeInteger). Un
//     documento en otra moneda no se emite: sería una factura de exportación.
//   - IVA: 19 % sobre el monto neto del documento ("IVA: valor num. = a Monto
//     neto * tasa IVA", formato DTE, campo 112). Cord calcula el IVA por
//     concepto; si su suma no coincide con el 19 % del neto, el documento NO se
//     envía (el SII no lo rechaza, pero manda corregirlo con nota de crédito, y
//     lo que el SII registra debe ser lo que el cliente paga).
//   - Exento: IndExe=1 en la línea (33 y 61); en la 34 no se usa ("No se usa
//     este campo si la factura es exenta en forma global") y el documento solo
//     informa MntExe (manual de muestras impresas, 1.4).
//   - Descuento de documento repartido por concepto (motor de Cord):
//     DescuentoMonto del detalle y MontoItem neto ("(Precio Unitario *
//     Cantidad) – Monto Descuento + Monto Recargo", formato DTE, campo 38;
//     "los descuentos por línea de detalle se deben señalar obligatoriamente en
//     montos", manual de muestras impresas, 1.4).
//   - Retenciones: no van en una factura 33/34. La retención de honorarios del
//     catálogo es de la boleta de honorarios.
//   - Receptor: RUT, razón social, giro, dirección y comuna son obligatorios en
//     la factura (formato DTE, campos 50–61, obligatoriedad "1" en 33 y 34).
//   - Nota de crédito: referencia la factura (TpoDocRef, FolioRef, FchRef,
//     CodRef 1 si la anula completa, 3 si corrige montos) y conserva su
//     receptor (formato DTE, área de referencias).
//
// Lo que no se puede armar bien no se envía: RailDatosError con un mensaje
// para el dueño del negocio. Puro: scripts/sii-check.mjs lo prueba con Node plano.

import type { FiscalLineItem, FiscalTotals } from '../../index';
// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { RailDatosError } from '../errores.ts';
import { LARGOS, MAX_LINEAS, TASA_IVA, TASA_IVA_PCT, TIPOS_DTE, type TipoDte } from './constantes.ts';
import { campo, campoLargo, fechaIso } from './texto.ts';
import { el, opt, type Nodo } from './xml.ts';

export interface EmisorSii {
    rut: string;
    razonSocial: string;
    giro: string;
    acteco: number[];
    direccion: string;
    comuna: string;
    ciudad?: string | null;
    sucursal?: string | null;
    cdgSucursal?: number | null;
}

export interface ReceptorSii {
    rut: string;
    razonSocial: string;
    giro?: string | null;
    direccion?: string | null;
    comuna?: string | null;
    ciudad?: string | null;
    correo?: string | null;
}

export interface LineaSii {
    nombre: string;
    descripcion?: string;
    cantidad?: string;
    precio?: string;
    descuento: number;
    monto: number;
    exento: boolean;
}

export interface ReferenciaSii {
    tipo: TipoDte;
    folio: number;
    /** aaaa-mm-dd */
    fecha: string;
    /** 1 anula el documento, 3 corrige montos. */
    codigo: 1 | 3;
    razon: string;
}

/** Todo lo que el DTE dirá, antes de tener folio. Se persiste dentro de la solicitud. */
export interface BorradorSii {
    tipo: TipoDte;
    /** aaaa-mm-dd en Chile */
    fechaEmision: string;
    emisor: EmisorSii;
    receptor: ReceptorSii;
    lineas: LineaSii[];
    neto: number;
    exento: number;
    iva: number;
    total: number;
    descuento: number;
    formaPago?: 1 | 2;
    vencimiento?: string;
    periodo?: { desde: string; hasta: string };
    referencia?: ReferenciaSii;
}

export interface FacturaOriginal {
    tipo: TipoDte;
    folio: number;
    fechaEmision: string;
    total: number;
    receptor: ReceptorSii;
}

export interface EntradaDte {
    emisor: EmisorSii;
    receptor: Partial<ReceptorSii> & { pais?: string | null };
    /** aaaa-mm-dd: el día de emisión en Chile. */
    fechaEmision: string;
    lineas: FiscalLineItem[];
    totales: FiscalTotals;
    vencimiento?: string | null;
    servicio?: { desde?: string | null; hasta?: string | null };
    /** Nota de crédito: la factura que ajusta, tal como se emitió. */
    notaCreditoDe?: FacturaOriginal | null;
    motivo?: string | null;
}

const entero = (v: unknown) => Math.round(Number(v) || 0);
const esEntero = (v: unknown) => Number.isFinite(Number(v)) && Math.abs(Number(v) - Math.round(Number(v))) < 1e-9;
const pesos = (n: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(n);

/** Decimal sin ceros de relleno, hasta 6 decimales (Dec12_6Type). */
export function decimal6(v: number): string {
    const r = Math.round(v * 1e6) / 1e6;
    return r.toFixed(6).replace(/\.?0+$/, '');
}

function tasaDe(l: FiscalLineItem): 'afecto' | 'exento' {
    const t = Number(l.taxRate) || 0;
    if (t === 0) return 'exento';
    if (Math.abs(t - TASA_IVA) < 1e-9) return 'afecto';
    throw new RailDatosError(`La tasa de ${(t * 100).toLocaleString('es-CL', { maximumFractionDigits: 3 })} % de un concepto no es IVA de Chile. Usa IVA 19 % o Exento.`);
}

function linea(l: FiscalLineItem): LineaSii {
    const exento = tasaDe(l) === 'exento';
    for (const v of [l.subtotal, l.taxAmount, l.discount ?? 0]) {
        if (!esEntero(v)) throw new RailDatosError('Un concepto tiene centavos: en pesos chilenos los montos son enteros. Vuelve a guardar el documento en CLP.');
    }
    const monto = entero(l.subtotal);
    const descuento = entero(l.discount ?? 0);
    if (monto < 0 || descuento < 0 || entero(l.taxAmount) < 0) throw new RailDatosError('Un concepto tiene un importe negativo.');
    if (exento && entero(l.taxAmount) !== 0) throw new RailDatosError('Un concepto exento no puede llevar IVA.');
    const nombreCompleto = String(l.description ?? '').trim();
    const nombre = campo(nombreCompleto, LARGOS.NmbItem);
    if (!nombre) throw new RailDatosError('Cada concepto necesita una descripción.');
    const largo = campoLargo(nombreCompleto, LARGOS.DscItem);
    const cantidad = Number(l.quantity);
    const precio = Number(l.unitPrice);
    // Cantidad y precio solo si reproducen el monto de la línea al peso: si
    // no (precio con IVA incluido, nota de crédito proporcional), basta el
    // monto, que es lo que suma el documento.
    const cuadra = cantidad > 0 && precio > 0 && Math.round(cantidad * precio) === monto + descuento;
    return {
        nombre,
        ...(largo.length > nombre.length || largo.includes('\n') ? { descripcion: largo } : {}),
        ...(cuadra ? { cantidad: decimal6(cantidad), precio: decimal6(precio) } : {}),
        descuento,
        monto,
        exento,
    };
}

export function receptorCompleto(r: Partial<ReceptorSii>, tipo: TipoDte): ReceptorSii {
    const receptor: ReceptorSii = {
        rut: String(r.rut ?? ''),
        razonSocial: campo(r.razonSocial, LARGOS.RznSocRecep),
        giro: campo(r.giro, LARGOS.GiroRecep) || null,
        direccion: campo(r.direccion, LARGOS.DirRecep) || null,
        comuna: campo(r.comuna, LARGOS.CmnaRecep) || null,
        ciudad: campo(r.ciudad, LARGOS.CiudadRecep) || null,
        correo: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r.correo ?? '')) ? campo(r.correo, LARGOS.CorreoRecep) : null,
    };
    if (!receptor.razonSocial) throw new RailDatosError('Falta la razón social del cliente. Complétala en su ficha.');
    if (tipo !== 61) {
        const faltan = [!receptor.giro && 'giro', !receptor.direccion && 'dirección', !receptor.comuna && 'comuna'].filter(Boolean);
        if (faltan.length) throw new RailDatosError(`Para la factura electrónica el SII exige el ${faltan.join(', ')} del cliente. Complétalo en su ficha y vuelve a emitirla.`);
    }
    return receptor;
}

/**
 * Arma el borrador del DTE (sin folio). Lanza RailDatosError con lo que hay
 * que corregir.
 */
export function armarBorrador(e: EntradaDte): BorradorSii {
    const moneda = String(e.totales.currency || '').toUpperCase();
    if (moneda !== 'CLP') {
        throw new RailDatosError(`La factura electrónica chilena se emite en pesos chilenos. Este documento está en ${moneda || 'otra moneda'}: emítelo en CLP (la factura de exportación todavía no está disponible en Cord).`);
    }
    if (Number(e.totales.retencionTotal) > 0 || (e.totales.retenciones ?? []).some((r) => Number(r.monto) > 0)) {
        throw new RailDatosError('Una factura electrónica no lleva retenciones. La retención de honorarios (15,25 %) es propia de la boleta de honorarios, que se emite en el SII: quita la retención del documento.');
    }
    if (!e.lineas.length) throw new RailDatosError('El documento necesita al menos un concepto.');
    if (e.lineas.length > MAX_LINEAS) throw new RailDatosError(`El SII admite hasta ${MAX_LINEAS} conceptos por documento. Divide la factura en dos.`);
    const fecha = fechaIso(e.fechaEmision);
    if (!fecha) throw new RailDatosError('La fecha de emisión no es válida.');

    const original = e.notaCreditoDe ?? null;
    const lineas = e.lineas.map(linea);
    const neto = lineas.filter((l) => !l.exento).reduce((s, l) => s + l.monto, 0);
    const exento = lineas.filter((l) => l.exento).reduce((s, l) => s + l.monto, 0);
    const tipo: TipoDte = original ? 61 : neto > 0 || lineas.some((l) => !l.exento) ? 33 : 34;
    if (tipo === 34 && lineas.some((l) => !l.exento)) throw new RailDatosError('Una factura exenta no lleva conceptos con IVA.');

    // IVA del documento: 19 % del neto. Cord lo calculó concepto por concepto.
    const iva = Math.round(neto * TASA_IVA);
    const ivaCord = entero(e.totales.taxes);
    if (!esEntero(e.totales.taxes) || !esEntero(e.totales.subtotal)) {
        throw new RailDatosError('El documento tiene centavos: en pesos chilenos los montos son enteros. Vuelve a guardarlo en CLP.');
    }
    if (ivaCord !== iva) {
        throw new RailDatosError(`El IVA de este documento ($ ${pesos(ivaCord)}) se calculó concepto por concepto y difiere del 19 % del neto que exige el SII ($ ${pesos(iva)}). Ajusta un precio o agrupa los conceptos y vuelve a emitirlo.`);
    }
    const total = neto + exento + iva;
    if (total !== entero(e.totales.subtotal) + ivaCord || entero(e.totales.subtotal) !== neto + exento) {
        throw new RailDatosError('Los importes del documento no cuadran entre sí. Vuelve a guardarlo antes de emitir.');
    }
    if (!(total > 0)) throw new RailDatosError('El monto del documento debe ser mayor a cero.');
    const descuento = lineas.reduce((s, l) => s + l.descuento, 0);
    if (e.totales.discountTotal !== undefined && e.totales.discountTotal !== null && entero(e.totales.discountTotal) !== descuento) {
        throw new RailDatosError('El descuento del documento no cuadra con el de sus conceptos. Vuelve a guardarlo antes de emitir.');
    }

    let receptor: ReceptorSii;
    let referencia: ReferenciaSii | undefined;
    if (original) {
        // La nota ajusta UN documento: mismo receptor que se informó al emitirlo.
        receptor = original.receptor;
        if (total > original.total) throw new RailDatosError('La nota de crédito no puede superar el total de la factura que ajusta.');
        referencia = {
            tipo: original.tipo,
            folio: original.folio,
            fecha: original.fechaEmision,
            codigo: total === original.total ? 1 : 3,
            razon: campo(e.motivo, LARGOS.RazonRef) || (total === original.total ? 'Anula documento' : 'Corrige montos'),
        };
    } else {
        const pais = String(e.receptor.pais || 'CL').toUpperCase();
        if (pais !== 'CL' && !e.receptor.rut) {
            throw new RailDatosError('Las ventas a clientes del exterior se documentan con factura de exportación, que Cord todavía no emite ante el SII.');
        }
        if (!e.receptor.rut) {
            throw new RailDatosError('La factura electrónica necesita el RUT del cliente. A un consumidor final le corresponde una boleta electrónica, que Cord todavía no emite.');
        }
        receptor = receptorCompleto(e.receptor, tipo);
    }
    if (receptor.rut === e.emisor.rut) throw new RailDatosError('El cliente no puede tener el mismo RUT que tu negocio.');

    const borrador: BorradorSii = {
        tipo, fechaEmision: fecha, emisor: e.emisor, receptor, lineas,
        neto: tipo === 34 ? 0 : neto, exento, iva: tipo === 34 ? 0 : iva, total, descuento,
    };
    if (!TIPOS_DTE[tipo].notaCredito) {
        // FmaPago es obligatoria en 33 y 34 (cambios del 31/05/2017): contado
        // si vence el mismo día, crédito con su vencimiento si no.
        const vence = fechaIso(e.vencimiento);
        if (vence && vence > fecha) {
            borrador.formaPago = 2;
            borrador.vencimiento = vence;
        } else {
            borrador.formaPago = 1;
        }
        const desde = fechaIso(e.servicio?.desde);
        const hasta = fechaIso(e.servicio?.hasta) ?? desde;
        if (desde && hasta) {
            if (hasta < desde) throw new RailDatosError('El período facturado termina antes de empezar.');
            borrador.periodo = { desde, hasta };
        }
    }
    if (referencia) borrador.referencia = referencia;
    return borrador;
}

/** Atributo ID del <Documento>: tipo y folio, único dentro del envío (instructivo, A.3.4). */
export const idDocumento = (tipo: TipoDte, folio: number) => `F${folio}T${tipo}`;

/** Número del documento en Cord: tipo y folio, con C- en certificación (no choca con uno real). */
export function numeroDocumento(tipo: TipoDte, folio: number, certificacion: boolean): string {
    return `${certificacion ? 'C-' : ''}${TIPOS_DTE[tipo].prefijo}-${folio}`;
}

/** <Encabezado> + <Detalle> + <Referencia> del documento (sin timbre). */
export function nodosDocumento(b: BorradorSii, folio: number): Nodo[] {
    const em = b.emisor;
    const re = b.receptor;
    const idDoc = el('IdDoc', null,
        el('TipoDTE', null, String(b.tipo)),
        el('Folio', null, String(folio)),
        el('FchEmis', null, b.fechaEmision),
        opt('FmaPago', b.formaPago),
        opt('PeriodoDesde', b.periodo?.desde),
        opt('PeriodoHasta', b.periodo?.hasta),
        opt('FchVenc', b.vencimiento),
    );
    const emisor = el('Emisor', null,
        el('RUTEmisor', null, em.rut),
        el('RznSoc', null, campo(em.razonSocial, LARGOS.RznSoc)),
        el('GiroEmis', null, campo(em.giro, LARGOS.GiroEmis)),
        ...em.acteco.slice(0, 4).map((a) => el('Acteco', null, String(a))),
        opt('Sucursal', campo(em.sucursal, LARGOS.Sucursal)),
        opt('CdgSIISucur', em.cdgSucursal ?? null),
        el('DirOrigen', null, campo(em.direccion, LARGOS.DirOrigen)),
        el('CmnaOrigen', null, campo(em.comuna, LARGOS.CmnaOrigen)),
        opt('CiudadOrigen', campo(em.ciudad, LARGOS.CiudadOrigen)),
    );
    const receptor = el('Receptor', null,
        el('RUTRecep', null, re.rut),
        el('RznSocRecep', null, re.razonSocial),
        opt('GiroRecep', re.giro),
        opt('CorreoRecep', re.correo),
        opt('DirRecep', re.direccion),
        opt('CmnaRecep', re.comuna),
        opt('CiudadRecep', re.ciudad),
    );
    const totales = b.tipo === 34
        ? el('Totales', null, el('MntExe', null, String(b.exento)), el('MntTotal', null, String(b.total)))
        : el('Totales', null,
            b.neto > 0 || b.iva > 0 ? el('MntNeto', null, String(b.neto)) : null,
            b.exento > 0 ? el('MntExe', null, String(b.exento)) : null,
            b.neto > 0 || b.iva > 0 ? el('TasaIVA', null, String(TASA_IVA_PCT)) : null,
            b.neto > 0 || b.iva > 0 ? el('IVA', null, String(b.iva)) : null,
            el('MntTotal', null, String(b.total)));
    const detalle = b.lineas.map((l, i) => el('Detalle', null,
        el('NroLinDet', null, String(i + 1)),
        l.exento && b.tipo !== 34 ? el('IndExe', null, '1') : null,
        el('NmbItem', null, l.nombre),
        opt('DscItem', l.descripcion),
        opt('QtyItem', l.cantidad),
        opt('PrcItem', l.precio),
        l.descuento > 0 ? el('DescuentoMonto', null, String(l.descuento)) : null,
        el('MontoItem', null, String(l.monto)),
    ));
    const ref = b.referencia
        ? [el('Referencia', null,
            el('NroLinRef', null, '1'),
            el('TpoDocRef', null, String(b.referencia.tipo)),
            el('FolioRef', null, String(b.referencia.folio)),
            el('FchRef', null, b.referencia.fecha),
            el('CodRef', null, String(b.referencia.codigo)),
            el('RazonRef', null, b.referencia.razon))]
        : [];
    return [el('Encabezado', null, idDoc, emisor, receptor, totales), ...detalle, ...ref];
}
