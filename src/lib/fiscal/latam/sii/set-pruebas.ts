// Set de pruebas del SII: el archivo de casos que el SII genera para cada
// postulante y los DTE que Cord arma con él.
//
// Fuentes primarias (www.sii.cl/factura_electronica/factura_mercado):
//   - "Instrucciones para la construcción de DTE con los datos del set de
//     pruebas" (inst_set_pruebas.pdf):
//       I.3  un DTE por cada caso; 4.a folio autorizado; 4.b "RUT distintos
//            para las distintas facturas"; 4.c fecha del día; 4.d la glosa del
//            ítem EXACTAMENTE como en el caso, sin líneas adicionales; 4.e la
//            cantidad y el precio del caso — en la nota de crédito por
//            devolución, el precio de la factura original; en la de diferencia
//            de precio, la diferencia en todas las unidades; 4.f las líneas en
//            el orden del caso;
//       I.6  "En la primera línea de referencia de cada DTE del set de prueba
//            debe indicar: el texto SET como Tipo de Documento de Referencia y
//            el texto CASO xxxxx-x en el campo Razón referencia"; las demás
//            referencias, desde la línea 2;
//       II   el envío reportado lleva todos los documentos del set, en el orden
//            entregado; carátula al RUT del SII (60803000-K) con la resolución
//            de certificación; un documento aceptado con reparos se reenvía
//            con OTRO folio.
//   - "Manual de certificación" (2009): ejemplo de DTE válido en
//     certificación con la referencia <TpoDocRef>SET</TpoDocRef>.
//   - Formato DTE v2.2: CodRef 1 anula (la nota de crédito que elimina la
//     factura; la nota de débito que elimina una nota de crédito), 2 corrige
//     texto (solo nota de crédito) y 3 corrige montos; descuento por línea en
//     porcentaje y monto (DescuentoPct + DescuentoMonto) y descuento global
//     (DscRcgGlobal, TpoMov D, TpoValor %).
//
// FolioRef y FchRef de la línea SET son obligatorios en el esquema y el
// instructivo no dice qué llevan: Cord pone el folio y la fecha del propio
// documento (el ejemplo del manual usa "1" y una fecha cualquiera). La línea
// SET no lleva CodRef: no modifica ningún documento.
//
// Lo que Cord arma: los sets de facturas (33), facturas exentas (34), notas de
// crédito (61) y de débito (56) — el "SET BASICO" y el de factura exenta. Lo
// que el mismo archivo trae y Cord NO arma se dice al cargarlo: los libros de
// compras y ventas (IECV), la guía de despacho (52) y su libro, la
// exportación (110/111/112) y la factura de compra (46).
//
// Puro: lo prueban scripts/sii-check.mjs y test/sii-certificacion-db.test.ts.

import { RailDatosError } from '../errores.ts';
import { LARGOS, MAX_LINEAS, TASA_IVA, TIPOS_DTE, TPO_DOC_REF_SET, type TipoDte } from './constantes.ts';
import type { BorradorSii, CodRef, EmisorSii, LineaSii, ReceptorSii, ReferenciaSii } from './dte.ts';
import { decimal6 } from './dte.ts';
import { campo } from './texto.ts';

export interface ItemCaso {
    /** Glosa tal como la escribió el SII (con sus tildes y eñes). */
    nombre: string;
    cantidad: number | null;
    precio: number | null;
    descuentoPct: number | null;
    exento: boolean;
}

export interface CasoSet {
    /** "4352553-1" */
    numero: string;
    tipo: TipoDte;
    items: ItemCaso[];
    descuentoGlobalPct: number | null;
    /** Notas: el caso del documento que modifican y la razón, tal como los dice el set. */
    referencia: { caso: string; razon: string } | null;
}

export interface SetDeCasos {
    /** "SET BASICO" */
    nombre: string;
    numeroAtencion: string;
    casos: CasoSet[];
}

export interface SetNoSoportado {
    nombre: string;
    numeroAtencion: string | null;
    motivo: 'libro' | 'guia' | 'exportacion' | 'compra' | 'otro';
}

export interface ArchivoSet {
    sets: SetDeCasos[];
    noSoportados: SetNoSoportado[];
}

/** Mayúsculas sin tildes ni símbolos raros, espacios simples: para reconocer rótulos del archivo. */
const clave = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\uFFFD/g, '?').replace(/\s+/g, ' ').trim().toUpperCase();

const DOCUMENTOS: Record<string, TipoDte> = {
    'FACTURA ELECTRONICA': 33,
    'FACTURA NO AFECTA O EXENTA ELECTRONICA': 34,
    'FACTURA EXENTA ELECTRONICA': 34,
    'NOTA DE CREDITO ELECTRONICA': 61,
    'NOTA DE DEBITO ELECTRONICA': 56,
};

function motivoNoSoportado(nombreSet: string, documentos: string[]): SetNoSoportado['motivo'] | null {
    const n = clave(nombreSet);
    if (/LIBRO/.test(n)) return 'libro';
    if (/GUIA/.test(n) || documentos.some((d) => /GUIA/.test(d))) return 'guia';
    if (/EXPORTACION/.test(n) || documentos.some((d) => /EXPORTACION/.test(d))) return 'exportacion';
    if (/COMPRA/.test(n) || documentos.some((d) => /FACTURA DE COMPRA/.test(d))) return 'compra';
    if (documentos.some((d) => !(d in DOCUMENTOS))) return 'otro';
    return null;
}

const numero = (v: string): number | null => {
    const t = v.trim().replace(',', '.');
    return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};
const porcentaje = (v: string): number | null => {
    const m = /^(\d+(?:[.,]\d+)?)\s*%$/.exec(v.trim());
    return m ? Number(m[1].replace(',', '.')) : null;
};

/** Línea de instrucción que trae el set y no es un dato del documento. */
const INSTRUCCION = /^(EL|LOS) PRECIOS? UNITARIOS? /;

/**
 * Lee el archivo del set tal como lo entrega el SII (texto con tabuladores).
 * Lanza RailDatosError con lo que no entiende de un set que Cord sí arma: un
 * documento a medias en el set de pruebas sería un rechazo seguro del SII.
 */
export function parsearSetDePruebas(texto: string): ArchivoSet {
    // Un carácter de reemplazo es una tilde o una eñe que se perdió al copiar:
    // la glosa del ítem debe ir EXACTA (instrucciones, I.4.d), así que no se adivina.
    if (String(texto ?? '').includes('\uFFFD')) {
        throw new RailDatosError('El texto del set tiene caracteres ilegibles (una tilde o una eñe que se perdió al copiarlo). Sube el archivo del set tal como lo descargaste del SII.');
    }
    const lineas = String(texto ?? '').replace(/\r\n?/g, '\n').split('\n');
    const bloques: { nombre: string; numeroAtencion: string | null; lineas: string[] }[] = [];
    for (const linea of lineas) {
        const cab = /^\s*(SET\s.+?)\s+-\s+N.MERO DE ATENCI.N:\s*(\d+)\s*$/i.exec(linea);
        if (cab) { bloques.push({ nombre: clave(cab[1]), numeroAtencion: cab[2], lineas: [] }); continue; }
        bloques.at(-1)?.lineas.push(linea);
    }
    if (!bloques.length) {
        throw new RailDatosError('No encontramos ningún set en el texto. Copia el archivo del set de pruebas tal como lo descargaste del SII, con sus líneas "SET … - NUMERO DE ATENCION".');
    }
    const sets: SetDeCasos[] = [];
    const noSoportados: SetNoSoportado[] = [];
    for (const b of bloques) {
        // Casos: "CASO 4352553-1" seguido de "=====".
        const casos: { numero: string; lineas: string[] }[] = [];
        for (const linea of b.lineas) {
            const caso = /^\s*CASO\s+(\d+-\d+)\s*$/i.exec(linea);
            if (caso) { casos.push({ numero: caso[1], lineas: [] }); continue; }
            casos.at(-1)?.lineas.push(linea);
        }
        const documentos = casos.map((c) => clave(c.lineas.find((l) => /^\s*DOCUMENTO\b/i.test(l))?.replace(/^\s*DOCUMENTO\s*/i, '') ?? ''));
        const motivo = !casos.length ? (/LIBRO/.test(b.nombre) ? 'libro' : 'otro') : motivoNoSoportado(b.nombre, documentos);
        if (motivo) { noSoportados.push({ nombre: b.nombre, numeroAtencion: b.numeroAtencion, motivo }); continue; }
        sets.push({ nombre: b.nombre, numeroAtencion: b.numeroAtencion!, casos: casos.map((c, i) => leerCaso(c.numero, documentos[i], c.lineas)) });
    }
    return { sets, noSoportados };
}

function leerCaso(numeroCaso: string, documento: string, lineas: string[]): CasoSet {
    const tipo = DOCUMENTOS[documento];
    const caso: CasoSet = { numero: numeroCaso, tipo, items: [], descuentoGlobalPct: null, referencia: null };
    let columnas: string[] | null = null;
    let referenciaCaso: string | null = null;
    let razon = '';
    const noEntiendo = (l: string) => new RailDatosError(`Cord no sabe armar esta línea del caso ${numeroCaso}: «${l.trim().slice(0, 80)}». Escríbenos a soporte@flouvia.com.`);
    for (const cruda of lineas) {
        const l = cruda.replace(/\s+$/, '');
        const k = clave(l);
        if (!k || /^=+$/.test(k) || /^-+$/.test(k)) { columnas = k ? columnas : null; continue; }
        if (/^DOCUMENTO\b/.test(k)) continue;
        if (/^REFERENCIA\b/.test(k)) {
            referenciaCaso = /CASO\s+(\d+-\d+)/.exec(k)?.[1] ?? null;
            if (!referenciaCaso) throw noEntiendo(l);
            continue;
        }
        if (/^RAZON REFERENCIA\b/.test(k)) { razon = l.replace(/^\s*RAZ.N REFERENCIA\s*/i, '').trim(); continue; }
        if (/^ITEM\b/.test(k) && /CANTIDAD|PRECIO|VALOR/.test(k)) {
            columnas = l.split(/\t+/).map((c) => clave(c)).filter(Boolean).slice(1);
            continue;
        }
        const global = /^DESCUENTO GLOBAL ITEM(?:E)?S AFECTOS\s+(.+)$/.exec(k);
        if (global) {
            const p = porcentaje(global[1]);
            if (p === null) throw noEntiendo(l);
            caso.descuentoGlobalPct = p;
            continue;
        }
        if (INSTRUCCION.test(k)) continue;
        if (!columnas) throw noEntiendo(l);
        const celdas = l.split(/\t+/).map((c) => c.trim());
        const nombre = celdas[0];
        if (!nombre || celdas.length - 1 > columnas.length) throw noEntiendo(l);
        const item: ItemCaso = { nombre, cantidad: null, precio: null, descuentoPct: null, exento: tipo === 34 || /\bEXENT[OA]\b/.test(clave(nombre)) };
        celdas.slice(1).forEach((v, i) => {
            const col = columnas![i];
            if (col === 'CANTIDAD') item.cantidad = numero(v);
            else if (col === 'PRECIO UNITARIO') item.precio = numero(v);
            else if (col === 'DESCUENTO ITEM') item.descuentoPct = porcentaje(v);
            else throw noEntiendo(l);
            if ((col === 'DESCUENTO ITEM' ? item.descuentoPct : col === 'CANTIDAD' ? item.cantidad : item.precio) === null) throw noEntiendo(l);
        });
        caso.items.push(item);
    }
    if (TIPOS_DTE[tipo].nota) {
        if (!referenciaCaso || !razon) throw new RailDatosError(`El caso ${numeroCaso} es una nota y no dice qué documento modifica ni por qué.`);
        caso.referencia = { caso: referenciaCaso, razon };
    } else if (!caso.items.length) {
        throw new RailDatosError(`El caso ${numeroCaso} no trae ítems.`);
    }
    if (caso.items.length > MAX_LINEAS) throw new RailDatosError(`El caso ${numeroCaso} tiene más de ${MAX_LINEAS} ítems.`);
    return caso;
}

// ── Armado de los documentos ─────────────────────────────────────────────────

/** Código de referencia de una nota del set, según su razón y si trae ítems (formato DTE, CodRef). */
export function codRefDeCaso(caso: CasoSet): CodRef {
    const razon = clave(caso.referencia?.razon ?? '');
    if (/\bANULA\b/.test(razon)) return 1;
    if (!caso.items.length && /\bCORRIGE\b/.test(razon)) {
        if (caso.tipo !== 61) throw new RailDatosError(`El caso ${caso.numero}: solo una nota de crédito corrige un texto (CodRef 2).`);
        return 2;
    }
    if (!caso.items.length) throw new RailDatosError(`El caso ${caso.numero} no trae ítems y no anula ni corrige un texto: Cord no sabe armarlo.`);
    return 3;
}

export interface DocumentoSet {
    caso: string;
    folio: number;
    borrador: BorradorSii;
}

const MAX = Number.MAX_SAFE_INTEGER;

function lineaDe(nombre: string, cantidad: number, precio: number, pct: number | null, exento: boolean): LineaSii {
    const bruto = Math.round(cantidad * precio);
    const descuento = pct ? Math.round(bruto * pct / 100) : 0;
    if (!(bruto >= 0) || bruto > MAX || descuento > bruto) throw new RailDatosError(`El ítem «${nombre}» tiene montos que no se pueden emitir.`);
    const glosa = campo(nombre, LARGOS.NmbItem);
    return {
        nombre: glosa,
        cantidad: decimal6(cantidad),
        precio: decimal6(precio),
        ...(pct ? { descuentoPct: pct } : {}),
        descuento,
        monto: bruto - descuento,
        exento,
    };
}

/** Totales del documento con la fórmula del SII (formato DTE, campos 107 a 112). */
function conTotales(b: Omit<BorradorSii, 'neto' | 'exento' | 'iva' | 'total' | 'descuento'>, pctGlobal: number | null): BorradorSii {
    const afecto = b.lineas.filter((l) => !l.exento).reduce((s, l) => s + l.monto, 0);
    const exento = b.lineas.filter((l) => l.exento).reduce((s, l) => s + l.monto, 0);
    const global = pctGlobal && afecto > 0 ? Math.round(afecto * pctGlobal / 100) : 0;
    const neto = b.tipo === 34 ? 0 : afecto - global;
    const iva = b.tipo === 34 ? 0 : Math.round(neto * TASA_IVA);
    return {
        ...b,
        neto, exento, iva,
        total: neto + exento + iva,
        descuento: b.lineas.reduce((s, l) => s + l.descuento, 0),
        ...(global > 0 ? { descuentoGlobal: { pct: pctGlobal!, monto: global, glosa: 'DESCUENTO GLOBAL ITEMES AFECTOS' } } : {}),
    };
}

export interface EntradaSet {
    casos: CasoSet[];
    emisor: EmisorSii;
    /** Receptor de cada factura del set, por número de caso (las notas usan el de su documento). */
    receptores: Record<string, ReceptorSii>;
    /** aaaa-mm-dd: "fecha del día". */
    fecha: string;
    /** Folio asignado a cada caso, del CAF de certificación de su tipo. */
    folios: Record<string, number>;
}

/**
 * Los DTE del set, en el orden del set. Las notas toman del documento que
 * modifican el receptor, los precios (devolución) o los ítems completos
 * (anulación), y van en el mismo envío después de él.
 */
export function armarDocumentosDelSet(e: EntradaSet): DocumentoSet[] {
    const hechos = new Map<string, DocumentoSet>();
    const rutsFacturas = new Set<string>();
    const out: DocumentoSet[] = [];
    for (const caso of e.casos) {
        const folio = e.folios[caso.numero];
        if (!Number.isInteger(folio) || folio < 1) throw new Error(`sii: el caso ${caso.numero} no tiene folio`);
        const setRef: ReferenciaSii = { tipo: TPO_DOC_REF_SET, folio, fecha: e.fecha, razon: `CASO ${caso.numero}` };
        let borrador: BorradorSii;
        if (!TIPOS_DTE[caso.tipo].nota) {
            const receptor = e.receptores[caso.numero];
            if (!receptor?.rut) throw new RailDatosError(`Elige el cliente receptor de la factura del caso ${caso.numero}.`);
            if (receptor.rut === e.emisor.rut) throw new RailDatosError('El receptor no puede ser tu propio negocio.');
            if (rutsFacturas.has(receptor.rut)) throw new RailDatosError('Cada factura del set necesita un cliente con un RUT distinto (instrucciones del set, I.4.b).');
            rutsFacturas.add(receptor.rut);
            if (!receptor.giro || !receptor.direccion || !receptor.comuna) {
                throw new RailDatosError(`El cliente ${receptor.razonSocial} necesita giro, dirección y comuna para la factura del caso ${caso.numero}.`);
            }
            const lineas = caso.items.map((it) => {
                if (it.cantidad === null || it.precio === null) throw new RailDatosError(`El ítem «${it.nombre}» del caso ${caso.numero} no trae cantidad y precio.`);
                return lineaDe(it.nombre, it.cantidad, it.precio, it.descuentoPct, it.exento);
            });
            if (caso.tipo === 33 && lineas.every((l) => l.exento)) throw new RailDatosError(`El caso ${caso.numero} es una factura sin ítems afectos: correspondería una factura exenta.`);
            borrador = conTotales({
                tipo: caso.tipo, fechaEmision: e.fecha, emisor: e.emisor, receptor, lineas, formaPago: 1, referencias: [setRef],
            }, caso.descuentoGlobalPct);
        } else {
            const original = hechos.get(caso.referencia!.caso);
            if (!original) throw new RailDatosError(`El caso ${caso.numero} modifica el caso ${caso.referencia!.caso}, que no está antes en el set.`);
            const ob = original.borrador;
            const codigo = codRefDeCaso(caso);
            if (codigo === 1 && caso.tipo === 56 && ob.tipo !== 61) throw new RailDatosError(`El caso ${caso.numero}: una nota de débito solo anula una nota de crédito.`);
            let lineas: LineaSii[];
            let pctGlobal: number | null = null;
            if (codigo === 1) {
                lineas = ob.lineas.map((l) => ({ ...l }));
                pctGlobal = ob.descuentoGlobal?.pct ?? null;
            } else if (codigo === 2) {
                // "Donde dice… debe decir…": la nota corrige un texto y no mueve montos.
                lineas = [{ nombre: campo(caso.referencia!.razon, LARGOS.NmbItem), descuento: 0, monto: 0, exento: false }];
            } else {
                lineas = caso.items.map((it) => {
                    const de = ob.lineas.find((l) => l.nombre === campo(it.nombre, LARGOS.NmbItem));
                    // Devolución: el precio de la factura original (instrucciones, I.4.e);
                    // diferencia de precio: la que dice el caso, en todas las unidades.
                    const precio = it.precio ?? (de?.precio ? Number(de.precio) : null);
                    const cantidad = it.cantidad ?? (de?.cantidad ? Number(de.cantidad) : null);
                    if (precio === null || cantidad === null) throw new RailDatosError(`El ítem «${it.nombre}» del caso ${caso.numero} no está en el documento que modifica.`);
                    const pct = it.precio === null ? (de?.descuentoPct ?? null) : it.descuentoPct;
                    return lineaDe(it.nombre, cantidad, precio, pct, de ? de.exento : it.exento);
                });
                pctGlobal = ob.descuentoGlobal?.pct ?? null;
            }
            const refDoc: ReferenciaSii = { tipo: ob.tipo, folio: original.folio, fecha: ob.fechaEmision, codigo, razon: caso.referencia!.razon };
            borrador = conTotales({
                tipo: caso.tipo, fechaEmision: e.fecha, emisor: e.emisor, receptor: ob.receptor, lineas, referencias: [setRef, refDoc],
            }, pctGlobal);
            if (caso.tipo === 61 && borrador.total > ob.total) throw new RailDatosError(`La nota de crédito del caso ${caso.numero} supera el total del documento que modifica.`);
        }
        if (!TIPOS_DTE[caso.tipo].nota && !(borrador.total > 0)) throw new RailDatosError(`El caso ${caso.numero} no tiene monto.`);
        const doc = { caso: caso.numero, folio, borrador };
        hechos.set(caso.numero, doc);
        out.push(doc);
    }
    return out;
}

/** Cuántos folios de cada tipo pide el set. */
export function foliosNecesarios(casos: CasoSet[]): Map<TipoDte, number> {
    const m = new Map<TipoDte, number>();
    for (const c of casos) m.set(c.tipo, (m.get(c.tipo) ?? 0) + 1);
    return m;
}
