// Libros de ventas y de compras del set de pruebas (instrucciones del set, III
// y IV): se cargan con el archivo del set, se arman con iecv.ts, se firman con
// el certificado del negocio y se suben al SII por el mismo upload que el
// envío de documentos ("Envío DTE (documentos y libros)", menú de
// certificación de maullin.sii.cl); el veredicto se consulta por su número de
// envío como el del set.
//
//   - Libro de ventas: los documentos del set aceptado ("sólo la información
//     de los documentos que son parte de sus SET de prueba y que han sido
//     reportados para revisión"), con el período tributario de esos
//     documentos.
//   - Libro de compras: "sólo la información de los documentos que se le han
//     entregado en el SET de prueba de Libro de Compras", con el mismo período
//     del libro de ventas y el proveedor de cada documento que el negocio
//     agrega con RUT válido. No incluye lo recibido por intercambio: el
//     instructivo lo excluye y, fuera de la certificación, el SII ya no pide
//     el libro (Resolución Exenta SII N° 61 de 2017).
//
// Estado del veredicto: QueryEstUp documenta los estados del envío (RSC, RFR y
// RCT rechazan; SOK, CRT, FOK y PDR siguen en proceso; EPR procesado), no el
// resultado del libro (el SII lo informa en "Consulta Estado Libros
// Electrónicos" y por correo). Un estado que el manual no documenta se guarda y
// se muestra tal cual, sin darle un significado inventado.
//
// Solo en el ambiente de certificación y en el carril de la organización
// (regla 30).

import { sql, withOrgTx } from '../../../db';
import { RailDatosError, RailNoDisponibleError, RailTransitorioError } from '../errores';
import { estadoEnvio, type ContextoSii } from './autorizacion';
import { FOLIO_NOTIFICACION_SET } from './constantes';
import { cargarSet, exigirCertificacion, setFuenteDeLibros, subirAlSii, type SetGuardado } from './certificacion';
import { faseEnvio, mensajeEnvioRechazado, mensajeUpload } from './errores';
import { armarLibro, detalleCompra, detalleVenta, resumenPeriodo, type DetalleLibro, type OperacionLibro, type TotalPeriodo } from './iecv';
import type { FilaCompraSet, LibroDelSet, SetNoSoportado } from './set-pruebas';

export type EstadoLibro = 'cargado' | 'enviando' | 'enviado' | 'incierto' | 'procesado' | 'respondido' | 'rechazado';

export interface ProveedorLibro {
    rut: string;
    razonSocial: string | null;
}

export interface LibroGuardado {
    id: string;
    operacion: OperacionLibro;
    numeroAtencion: string;
    nombre: string;
    folioNotificacion: number;
    filas: FilaCompraSet[];
    factorProporcionalidad: number | null;
    /** Proveedor de cada documento del set de compras, por su posición. */
    proveedores: Record<string, ProveedorLibro>;
    estado: EstadoLibro;
    setId: string | null;
    periodo: string | null;
    detalles: DetalleLibro[] | null;
    resumen: TotalPeriodo[] | null;
    trackId: string | null;
    respuesta: { estado?: string; glosa?: string; upload?: number } | null;
    errorMensaje: string | null;
    tieneXml: boolean;
    createdAt: string;
    enviadoAt: string | null;
}

/** Fila de fiscal_sii_libros; las consultas no traen el XML firmado (libro_xml), solo si existe. */
function fila(r: Record<string, any>): LibroGuardado {
    const fecha = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
    const entrada = (r.entrada ?? {}) as { filas?: FilaCompraSet[]; factorProporcionalidad?: number | null };
    return {
        id: String(r.id),
        operacion: r.operacion as OperacionLibro,
        numeroAtencion: String(r.numero_atencion),
        nombre: String(r.nombre),
        folioNotificacion: Number(r.folio_notificacion),
        filas: entrada.filas ?? [],
        factorProporcionalidad: entrada.factorProporcionalidad ?? null,
        proveedores: (r.proveedores ?? {}) as Record<string, ProveedorLibro>,
        estado: r.estado as EstadoLibro,
        setId: r.set_id ? String(r.set_id) : null,
        periodo: r.periodo ? String(r.periodo) : null,
        detalles: (r.detalles ?? null) as DetalleLibro[] | null,
        resumen: (r.resumen ?? null) as TotalPeriodo[] | null,
        trackId: r.track_id ? String(r.track_id) : null,
        respuesta: (r.respuesta ?? null) as LibroGuardado['respuesta'],
        errorMensaje: r.error_mensaje ? String(r.error_mensaje) : null,
        tieneXml: r.tiene_xml === true || (typeof r.libro_xml === 'string' && r.libro_xml.length > 0),
        createdAt: fecha(r.created_at) ?? '',
        enviadoAt: fecha(r.enviado_at),
    };
}

/**
 * Carga el archivo del set completo: los sets de documentos (certificacion.ts)
 * y los libros que pide. Cada carga crea filas nuevas, como un intento nuevo.
 */
export async function cargarArchivoSet(orgId: string, texto: string, creadoPor: string | null): Promise<{ sets: SetGuardado[]; libros: LibroGuardado[]; noSoportados: SetNoSoportado[] }> {
    const r = await cargarSet(orgId, texto, creadoPor);
    const libros: LibroGuardado[] = [];
    for (const l of r.libros) libros.push(await guardarLibro(orgId, l, creadoPor));
    return { sets: r.sets, libros, noSoportados: r.noSoportados };
}

async function guardarLibro(orgId: string, l: LibroDelSet, creadoPor: string | null): Promise<LibroGuardado> {
    const entrada = { filas: l.filas, factorProporcionalidad: l.factorProporcionalidad };
    const [rows] = await withOrgTx(orgId, sql`
        insert into fiscal_sii_libros (org_id, entorno, operacion, numero_atencion, nombre, folio_notificacion, entrada, creado_por)
        values (${orgId}, 'homologacion', ${l.operacion}, ${l.numeroAtencion}, ${l.nombre}, ${FOLIO_NOTIFICACION_SET[l.operacion]},
                ${JSON.stringify(entrada)}::jsonb, ${creadoPor})
        returning id, operacion, numero_atencion, nombre, folio_notificacion, entrada, proveedores, estado, set_id, periodo, detalles, resumen, track_id, respuesta, error_mensaje, libro_xml is not null as tiene_xml, created_at, enviado_at`);
    return fila(rows[0]);
}

/** El último intento de cada libro, ventas primero. */
export async function listarLibros(orgId: string): Promise<LibroGuardado[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select distinct on (operacion, numero_atencion) id, operacion, numero_atencion, nombre, folio_notificacion, entrada, proveedores, estado, set_id, periodo, detalles, resumen, track_id, respuesta, error_mensaje, libro_xml is not null as tiene_xml, created_at, enviado_at
          from fiscal_sii_libros
         where org_id = ${orgId}
         order by operacion, numero_atencion, created_at desc`);
    return rows.map(fila).sort((a, b) => (a.operacion === b.operacion ? b.createdAt.localeCompare(a.createdAt) : a.operacion === 'VENTA' ? -1 : 1));
}

export async function libroPorId(orgId: string, id: string): Promise<LibroGuardado | null> {
    const [rows] = await withOrgTx(orgId, sql`select id, operacion, numero_atencion, nombre, folio_notificacion, entrada, proveedores, estado, set_id, periodo, detalles, resumen, track_id, respuesta, error_mensaje, libro_xml is not null as tiene_xml, created_at, enviado_at from fiscal_sii_libros where id = ${id} and org_id = ${orgId} limit 1`);
    return rows[0] ? fila(rows[0]) : null;
}

/** El archivo firmado tal como se subió al SII. */
export async function xmlDelLibro(orgId: string, id: string): Promise<{ nombre: string; xml: string } | null> {
    const [rows] = await withOrgTx(orgId, sql`
        select operacion, numero_atencion, libro_xml from fiscal_sii_libros
         where id = ${id} and org_id = ${orgId} and libro_xml is not null limit 1`);
    const r = rows[0];
    if (!r) return null;
    return { nombre: `Libro${r.operacion === 'VENTA' ? 'Ventas' : 'Compras'}_SET${r.numero_atencion}.xml`, xml: String(r.libro_xml) };
}

/** Un libro enviado se vuelve a intentar en una fila nueva, con los mismos documentos y proveedores. */
export async function nuevoIntentoLibro(orgId: string, id: string, creadoPor: string | null): Promise<LibroGuardado> {
    const [rows] = await withOrgTx(orgId, sql`
        insert into fiscal_sii_libros (org_id, entorno, operacion, numero_atencion, nombre, folio_notificacion, entrada, proveedores, creado_por)
        select org_id, entorno, operacion, numero_atencion, nombre, folio_notificacion, entrada, proveedores, ${creadoPor}
          from fiscal_sii_libros
         where id = ${id} and org_id = ${orgId} and estado in ('enviado', 'incierto', 'procesado', 'respondido', 'rechazado')
        returning id, operacion, numero_atencion, nombre, folio_notificacion, entrada, proveedores, estado, set_id, periodo, detalles, resumen, track_id, respuesta, error_mensaje, libro_xml is not null as tiene_xml, created_at, enviado_at`);
    if (!rows[0]) throw new RailDatosError('Este libro todavía no se envía: no hace falta un intento nuevo.');
    return fila(rows[0]);
}

/** Proveedores que llegan del navegador: solo posiciones del set, RUT y razón social recortados. */
export function proveedoresDe(libro: Pick<LibroGuardado, 'filas'>, entrada: unknown): Record<string, ProveedorLibro> {
    const out: Record<string, ProveedorLibro> = {};
    if (!entrada || typeof entrada !== 'object') return out;
    for (const [k, v] of Object.entries(entrada as Record<string, any>)) {
        if (!/^\d{1,3}$/.test(k) || Number(k) >= libro.filas.length || !v || typeof v !== 'object') continue;
        out[k] = { rut: String(v.rut ?? '').trim().slice(0, 14), razonSocial: String(v.razon_social ?? v.razonSocial ?? '').trim().slice(0, 100) || null };
    }
    return out;
}

/** Detalle del libro: los documentos del set aceptado (ventas) o los del set de compras con su proveedor. */
function detallesDe(libro: LibroGuardado, fuente: SetGuardado, proveedores: Record<string, ProveedorLibro>): { detalles: DetalleLibro[]; periodo: string } {
    const documentos = fuente.documentos ?? [];
    const fecha = documentos[0]?.fecha;
    if (!fecha) throw new RailDatosError('El set aceptado no tiene documentos.');
    const periodo = fecha.slice(0, 7);
    if (documentos.some((d) => d.fecha.slice(0, 7) !== periodo)) {
        // Instrucciones del set, III.1: todos los documentos del set en el mismo período.
        throw new RailDatosError('Los documentos del set son de períodos distintos: el libro de un solo período no puede informarlos.');
    }
    if (libro.operacion === 'VENTA') {
        return { detalles: documentos.map((d) => detalleVenta({ tipo: d.tipo, folio: d.folio, borrador: d.borrador })), periodo };
    }
    return {
        detalles: libro.filas.map((f, i) => detalleCompra(f, proveedores[String(i)] ?? { rut: '' }, fecha, libro.factorProporcionalidad)),
        periodo,
    };
}

/**
 * Arma, firma y sube el libro. Antes de tocar nada valida el detalle completo:
 * un proveedor sin RUT válido no deja un libro a medias en el SII.
 */
export async function enviarLibro(ctx: ContextoSii, libroId: string, proveedoresEntrada: Record<string, ProveedorLibro>, ahora = new Date()): Promise<LibroGuardado> {
    exigirCertificacion(ctx);
    const libro = await libroPorId(ctx.orgId, libroId);
    if (!libro) throw new RailDatosError('Libro no encontrado.');
    if (libro.estado !== 'cargado') throw new RailDatosError('Este libro ya se envió. Para volver a enviarlo, crea un intento nuevo.');
    const fuente = await setFuenteDeLibros(ctx.orgId);
    if (!fuente) {
        throw new RailDatosError(libro.operacion === 'VENTA'
            ? 'El libro de ventas informa los documentos del set: envíalo cuando el SII haya aceptado el set básico.'
            : 'El libro de compras usa el período del set: envíalo cuando el SII haya aceptado el set básico.');
    }
    const proveedores = libro.operacion === 'COMPRA' ? { ...libro.proveedores, ...proveedoresEntrada } : {};
    const { detalles, periodo } = detallesDe(libro, fuente, proveedores);
    const resumen = resumenPeriodo(detalles, libro.factorProporcionalidad);

    // Marca el libro antes de firmar: dos clics no lo suben dos veces.
    const [tomado] = await withOrgTx(ctx.orgId, sql`
        update fiscal_sii_libros
           set estado = 'enviando', set_id = ${fuente.id}, periodo = ${periodo}, proveedores = ${JSON.stringify(proveedores)}::jsonb,
               detalles = ${JSON.stringify(detalles)}::jsonb, resumen = ${JSON.stringify(resumen)}::jsonb, error_mensaje = null, updated_at = now()
         where id = ${libroId} and org_id = ${ctx.orgId} and estado = 'cargado'
        returning id`);
    if (!tomado[0]) throw new RailDatosError('Este libro ya se está enviando.');

    let xml: string | null = null;
    try {
        xml = armarLibro({
            rutEmisor: ctx.rutEmisor, rutEnvia: ctx.rutFirmante, periodo, resolucion: ctx.resolucion,
            operacion: libro.operacion, folioNotificacion: libro.folioNotificacion,
        }, detalles, resumen, ahora, { certPem: ctx.credencial.certPem, keyPem: ctx.credencial.keyPem });
        await withOrgTx(ctx.orgId, sql`
            update fiscal_sii_libros set libro_xml = ${xml}, enviado_at = now(), updated_at = now()
             where id = ${libroId} and org_id = ${ctx.orgId}`);
        const nombre = `Libro${libro.operacion === 'VENTA' ? 'Ventas' : 'Compras'}_${ctx.rutEmisor.replace('-', '')}_${periodo}.xml`;
        const subida = await subirAlSii(ctx, xml, nombre, libro.operacion === 'VENTA' ? 'libro de ventas' : 'libro de compras');
        if (subida.tipo === 'recibido') {
            await withOrgTx(ctx.orgId, sql`
                update fiscal_sii_libros set estado = 'enviado', track_id = ${subida.trackId}, updated_at = now()
                 where id = ${libroId} and org_id = ${ctx.orgId}`);
        } else if (subida.tipo === 'rechazado') {
            await withOrgTx(ctx.orgId, sql`
                update fiscal_sii_libros set estado = 'rechazado', error_mensaje = ${mensajeUpload(subida.status)},
                       respuesta = ${JSON.stringify({ upload: subida.status })}::jsonb, updated_at = now()
                 where id = ${libroId} and org_id = ${ctx.orgId}`);
        } else {
            await withOrgTx(ctx.orgId, sql`
                update fiscal_sii_libros set estado = 'incierto',
                       error_mensaje = ${'No supimos si el SII recibió el libro. Revisa en el sitio del SII si figura; si no, crea un intento nuevo.'}, updated_at = now()
                 where id = ${libroId} and org_id = ${ctx.orgId}`);
        }
    } catch (error) {
        // Sin archivo firmado el libro vuelve a quedar listo; con él, el SII pudo haberlo recibido.
        await withOrgTx(ctx.orgId, sql`
            update fiscal_sii_libros set estado = ${xml ? 'incierto' : 'cargado'},
                   error_mensaje = ${error instanceof RailDatosError || error instanceof RailNoDisponibleError || error instanceof RailTransitorioError ? error.message : 'No se pudo enviar el libro.'},
                   updated_at = now()
             where id = ${libroId} and org_id = ${ctx.orgId} and estado = 'enviando'`);
        throw error;
    }
    return (await libroPorId(ctx.orgId, libroId))!;
}

/** Consulta el estado del envío del libro (QueryEstUp) y lo guarda tal como lo dice el SII. */
export async function consultarLibro(ctx: ContextoSii, libroId: string): Promise<LibroGuardado> {
    exigirCertificacion(ctx);
    const libro = await libroPorId(ctx.orgId, libroId);
    if (!libro) throw new RailDatosError('Libro no encontrado.');
    if (!libro.trackId) throw new RailDatosError('Este libro no tiene un número de envío del SII que consultar.');
    const r = await estadoEnvio(ctx, libro.trackId);
    const fase = faseEnvio(r.estado);
    let estado: EstadoLibro = libro.estado === 'enviando' ? 'enviando' : 'enviado';
    let error: string | null = null;
    if (fase === 'rechazado') {
        estado = 'rechazado';
        error = mensajeEnvioRechazado(r.estado);
    } else if (fase === 'procesado') {
        estado = 'procesado';
    } else if (fase === 'desconocido') {
        if (/^-\d+$/.test(r.estado) || /^0\d\d$/.test(r.estado) || !r.estado) {
            // Errores de la consulta (manual de QueryEstUp, 3.5): el libro sigue enviado.
            error = `El SII no pudo responder la consulta${r.estado ? ` (estado ${r.estado})` : ''}. Reintenta en unos minutos.`;
        } else {
            estado = 'respondido';
        }
    }
    await withOrgTx(ctx.orgId, sql`
        update fiscal_sii_libros
           set estado = ${estado}, error_mensaje = ${error},
               respuesta = ${JSON.stringify({ estado: r.estado, glosa: r.glosa.slice(0, 200) })}::jsonb, updated_at = now()
         where id = ${libroId} and org_id = ${ctx.orgId}`);
    return (await libroPorId(ctx.orgId, libroId))!;
}
