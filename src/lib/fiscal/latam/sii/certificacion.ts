// Set de pruebas de la certificación ante el SII, de punta a punta: cargar el
// archivo que el SII le asignó al negocio, armar cada caso (set-pruebas.ts)
// con folios de certificación, firmarlos en UN envío en el orden del set,
// subirlo, consultar su veredicto y entregar las muestras impresas. Los
// libros de ventas y compras que el mismo archivo pide viven en
// libros-set.ts y usan el set aceptado de aquí (setFuenteDeLibros).
//
// No es una emisión normal: los documentos del set no son documentos_fiscales,
// no entran a la cartera ni a la numeración interna de Cord y solo existen en
// el ambiente de certificación (el despliegue con SII_ENTORNO=homologacion;
// los folios, el certificado y la resolución de certificación se guardan por
// entorno). Los folios se toman del CAF de certificación con la misma
// secuencia que la emisión (conSecuencia + consumirFolio): nunca se repiten,
// tampoco entre el set y un documento de la etapa de simulación.
//
// Todo en el carril de la organización (regla 30).

import { sql, withOrgTx } from '../../../db';
import { log } from '../../../log';
import { invalidarTicket } from '../accesos';
import { conSecuencia } from '../comprobantes';
import { RailDatosError, RailNoDisponibleError, RailTransitorioError } from '../errores';
import type { FiscalLineItem, FiscalParty } from '../../index';
import { autenticar, estadoEnvio, hoyChile, type ContextoSii } from './autorizacion';
import { consumirFolio } from './cafs';
import { SERVICIO_TOKEN, type TipoDte } from './constantes';
import type { BorradorSii, EmisorSii, ReceptorSii } from './dte';
import { emitirDocumento } from './emision';
import { armarEnvio } from './envio';
import { faseEnvio, mensajeEnvioRechazado, mensajeUpload, STATUS_REINTENTABLES } from './errores';
import { representacionSii } from './representacion';
import { armarDocumentosDelSet, parsearSetDePruebas, type CasoSet, type LibroDelSet, type SetNoSoportado } from './set-pruebas';
import { bytesLatin1, rutConPuntos, rutValido } from './texto';
import { SiiTransporteError, subirEnvio } from './ws';
import { parsearFragmento } from './xml';

export type EstadoSet = 'cargado' | 'enviando' | 'enviado' | 'incierto' | 'aceptado' | 'reparos' | 'rechazado';

export interface DocumentoGuardado {
    caso: string;
    tipo: TipoDte;
    folio: number;
    fecha: string;
    rutReceptor: string;
    razonSocialReceptor: string;
    total: number;
    borrador: BorradorSii;
    timbre: string;
    dte: string;
}

export interface SetGuardado {
    id: string;
    numeroAtencion: string;
    nombre: string;
    casos: CasoSet[];
    estado: EstadoSet;
    documentos: DocumentoGuardado[] | null;
    trackId: string | null;
    respuesta: { estado?: string; porTipo?: { tipo: string; informados: number; aceptados: number; rechazados: number; reparos: number }[] } | null;
    errorMensaje: string | null;
    createdAt: string;
    enviadoAt: string | null;
}

function fila(r: Record<string, any>): SetGuardado {
    const fecha = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
    return {
        id: String(r.id),
        numeroAtencion: String(r.numero_atencion),
        nombre: String(r.nombre),
        casos: (r.casos ?? []) as CasoSet[],
        estado: r.estado as EstadoSet,
        documentos: (r.documentos ?? null) as DocumentoGuardado[] | null,
        trackId: r.track_id ? String(r.track_id) : null,
        respuesta: (r.respuesta ?? null) as SetGuardado['respuesta'],
        errorMensaje: r.error_mensaje ? String(r.error_mensaje) : null,
        createdAt: fecha(r.created_at) ?? '',
        enviadoAt: fecha(r.enviado_at),
    };
}

/** El set solo existe en certificación: un despliegue de producción no lo envía nunca. */
export function exigirCertificacion(ctx: Pick<ContextoSii, 'entorno'>): void {
    if (ctx.entorno !== 'homologacion') {
        throw new RailNoDisponibleError('El set de pruebas se envía al ambiente de certificación del SII, y esta cuenta opera en producción.');
    }
}

/**
 * Carga el archivo del set: una fila por cada set que Cord arma (básico,
 * factura exenta). Los libros que el archivo pide vuelven leídos para que
 * libros-set.ts los guarde; lo que trae y Cord no arma se devuelve para
 * decirlo en pantalla.
 */
export async function cargarSet(orgId: string, texto: string, creadoPor: string | null): Promise<{ sets: SetGuardado[]; libros: LibroDelSet[]; noSoportados: SetNoSoportado[] }> {
    const archivo = parsearSetDePruebas(texto);
    if (!archivo.sets.length) {
        return { sets: [], libros: archivo.libros, noSoportados: archivo.noSoportados };
    }
    const sets: SetGuardado[] = [];
    for (const s of archivo.sets) {
        const [rows] = await withOrgTx(orgId, sql`
            insert into fiscal_sii_sets (org_id, entorno, numero_atencion, nombre, texto, casos, creado_por)
            values (${orgId}, 'homologacion', ${s.numeroAtencion}, ${s.nombre}, ${String(texto).slice(0, 200_000)}, ${JSON.stringify(s.casos)}::jsonb, ${creadoPor})
            returning *`);
        sets.push(fila(rows[0]));
    }
    return { sets, libros: archivo.libros, noSoportados: archivo.noSoportados };
}

/** El último intento de cada set (el que la pantalla muestra), más reciente primero. */
export async function listarSets(orgId: string): Promise<SetGuardado[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select distinct on (numero_atencion) *
          from fiscal_sii_sets
         where org_id = ${orgId}
         order by numero_atencion, created_at desc`);
    return rows.map(fila).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * El set cuyos documentos informa el libro de ventas y cuyo período usan los
 * dos libros: el último intento ACEPTADO del set básico; sin set básico, el
 * de factura exenta ("si obtuvo ambos set, utilice los documentos del set
 * básico", texto del set de libro de ventas). Los documentos del libro son
 * los "reportados para revisión" (instrucciones del set, III): los de un set
 * aceptado, no los de un intento con reparos.
 */
export async function setFuenteDeLibros(orgId: string): Promise<SetGuardado | null> {
    const [rows] = await withOrgTx(orgId, sql`
        select * from fiscal_sii_sets
         where org_id = ${orgId}
         order by created_at desc`);
    const sets = rows.map(fila);
    const basicos = sets.filter((s) => /^SET BASICO\b/.test(s.nombre));
    const candidatos = basicos.length ? basicos : sets.filter((s) => /\bEXENTA\b/.test(s.nombre));
    return candidatos.find((s) => s.estado === 'aceptado' && s.documentos?.length) ?? null;
}

export async function setPorId(orgId: string, id: string): Promise<SetGuardado | null> {
    const [rows] = await withOrgTx(orgId, sql`select * from fiscal_sii_sets where id = ${id} and org_id = ${orgId} limit 1`);
    return rows[0] ? fila(rows[0]) : null;
}

/** Un set enviado se vuelve a intentar en una fila nueva: con folios nuevos y el mismo texto. */
export async function nuevoIntento(orgId: string, id: string, creadoPor: string | null): Promise<SetGuardado> {
    const [rows] = await withOrgTx(orgId, sql`
        insert into fiscal_sii_sets (org_id, entorno, numero_atencion, nombre, texto, casos, creado_por)
        select org_id, entorno, numero_atencion, nombre, texto, casos, ${creadoPor}
          from fiscal_sii_sets
         where id = ${id} and org_id = ${orgId} and estado in ('enviado', 'incierto', 'aceptado', 'reparos', 'rechazado')
        returning *`);
    if (!rows[0]) throw new RailDatosError('Este set todavía no se envía: no hace falta un intento nuevo.');
    return fila(rows[0]);
}

/** Los clientes elegidos como receptores, con los datos que la factura exige. */
async function receptoresDe(orgId: string, porCaso: Record<string, string>): Promise<Record<string, ReceptorSii>> {
    const ids = [...new Set(Object.values(porCaso).filter((v) => /^[0-9a-f-]{36}$/i.test(String(v))))];
    if (!ids.length) return {};
    const [rows] = await withOrgTx(orgId, sql`
        select id, empresa, contacto, rfc, giro, comuna, direccion_line1, direccion_line2, ciudad, email
          from clientes
         where org_id = ${orgId} and id = any(${ids}::uuid[])`);
    const porId = new Map(rows.map((r) => [String(r.id), r]));
    const out: Record<string, ReceptorSii> = {};
    for (const [caso, id] of Object.entries(porCaso)) {
        const c = porId.get(String(id));
        if (!c) continue;
        const rut = rutValido(c.rfc);
        if (!rut) throw new RailDatosError(`El cliente ${c.empresa || c.contacto || ''} no tiene un RUT válido.`);
        out[caso] = {
            rut,
            razonSocial: String(c.empresa || c.contacto || '').trim(),
            giro: c.giro ? String(c.giro) : null,
            direccion: [c.direccion_line1, c.direccion_line2].filter(Boolean).join(' ') || null,
            comuna: c.comuna ? String(c.comuna) : null,
            ciudad: c.ciudad ? String(c.ciudad) : null,
            correo: c.email ? String(c.email) : null,
        };
    }
    return out;
}

/**
 * Arma, firma y sube el set completo en un solo envío. Toma un folio de
 * certificación por caso (los folios tomados quedan usados aunque el SII
 * rechace el envío: el reintento usa otros, como pide el instructivo).
 */
export async function enviarSet(ctx: ContextoSii, setId: string, porCaso: Record<string, string>, emisorBase: Omit<EmisorSii, 'rut' | 'giro' | 'acteco' | 'comuna'>, ahora = new Date()): Promise<SetGuardado> {
    exigirCertificacion(ctx);
    const set = await setPorId(ctx.orgId, setId);
    if (!set) throw new RailDatosError('Set de pruebas no encontrado.');
    if (set.estado !== 'cargado') throw new RailDatosError('Este set ya se envió. Para volver a enviarlo, crea un intento nuevo (usará folios nuevos).');
    const emisor: EmisorSii = {
        ...emisorBase,
        rut: ctx.rutEmisor, giro: ctx.ajustes.giro, acteco: ctx.ajustes.acteco, comuna: ctx.ajustes.comuna,
    };
    const receptores = await receptoresDe(ctx.orgId, porCaso);
    const fecha = hoyChile();
    // Primero se valida el set completo con folios ficticios: un caso que no
    // se puede armar no debe quemar folios.
    armarDocumentosDelSet({ casos: set.casos, emisor, receptores, fecha, folios: Object.fromEntries(set.casos.map((c, i) => [c.numero, i + 1])) });

    // Marca el set como "enviando" antes de tomar folios: dos clics no lo envían dos veces.
    const [tomado] = await withOrgTx(ctx.orgId, sql`
        update fiscal_sii_sets set estado = 'enviando', updated_at = now()
         where id = ${setId} and org_id = ${ctx.orgId} and estado = 'cargado'
        returning id`);
    if (!tomado[0]) throw new RailDatosError('Este set ya se está enviando.');

    try {
        const folios: Record<string, number> = {};
        const asignados = new Map<string, Awaited<ReturnType<typeof consumirFolio>>>();
        for (const caso of set.casos) {
            const clave = { rail: 'sii' as const, entorno: ctx.entorno, serie: ctx.rutEmisor, tipo: String(caso.tipo) };
            const f = await conSecuencia(ctx.orgId, clave, () => consumirFolio(ctx.orgId, ctx.entorno, caso.tipo, fecha, ctx.rutEmisor), { esperaMaxMs: 12_000, leaseS: 60 });
            folios[caso.numero] = f.folio;
            asignados.set(caso.numero, f);
        }
        const documentos = armarDocumentosDelSet({ casos: set.casos, emisor, receptores, fecha, folios });
        const clave = { certPem: ctx.credencial.certPem, keyPem: ctx.credencial.keyPem };
        const caratula = { rutEmisor: ctx.rutEmisor, rutEnvia: ctx.rutFirmante, resolucion: ctx.resolucion };
        const firmados = documentos.map((d) => ({ d, f: emitirDocumento(d.borrador, asignados.get(d.caso)!, clave, caratula, ahora) }));
        const envio = armarEnvio(firmados.map(({ f }) => ({ tipo: f.tipo, nodo: parsearFragmento(f.dteXml) })), caratula, ahora, clave);
        const guardados: DocumentoGuardado[] = firmados.map(({ d, f }) => ({
            caso: d.caso, tipo: f.tipo, folio: f.folio, fecha: d.borrador.fechaEmision,
            rutReceptor: d.borrador.receptor.rut, razonSocialReceptor: d.borrador.receptor.razonSocial,
            total: d.borrador.total, borrador: d.borrador, timbre: f.timbre, dte: f.dteXml,
        }));
        await withOrgTx(ctx.orgId, sql`
            update fiscal_sii_sets
               set documentos = ${JSON.stringify(guardados)}::jsonb, envio_xml = ${envio}, enviado_at = now(), updated_at = now()
             where id = ${setId} and org_id = ${ctx.orgId}`);

        const subida = await subirAlSii(ctx, envio, `EnvioDTE_${ctx.rutEmisor.replace('-', '')}_SET${set.numeroAtencion}.xml`, 'set de pruebas');
        if (subida.tipo === 'recibido') {
            await withOrgTx(ctx.orgId, sql`
                update fiscal_sii_sets set estado = 'enviado', track_id = ${subida.trackId}, updated_at = now()
                 where id = ${setId} and org_id = ${ctx.orgId}`);
        } else if (subida.tipo === 'rechazado') {
            await withOrgTx(ctx.orgId, sql`
                update fiscal_sii_sets set estado = 'rechazado', error_mensaje = ${mensajeUpload(subida.status)}, respuesta = ${JSON.stringify({ upload: subida.status })}::jsonb, updated_at = now()
                 where id = ${setId} and org_id = ${ctx.orgId}`);
        } else {
            await withOrgTx(ctx.orgId, sql`
                update fiscal_sii_sets set estado = 'incierto', error_mensaje = ${'No supimos si el SII recibió el envío. Revisa en el sitio del SII si figura; si no, crea un intento nuevo (usará folios nuevos).'}, updated_at = now()
                 where id = ${setId} and org_id = ${ctx.orgId}`);
        }
    } catch (error) {
        // Antes de tener folios o el archivo, el set vuelve a quedar listo para enviarse.
        await withOrgTx(ctx.orgId, sql`
            update fiscal_sii_sets set estado = case when documentos is null then 'cargado' else 'incierto' end,
                   error_mensaje = ${error instanceof RailDatosError || error instanceof RailNoDisponibleError || error instanceof RailTransitorioError ? error.message : 'No se pudo enviar el set.'},
                   updated_at = now()
             where id = ${setId} and org_id = ${ctx.orgId} and estado = 'enviando'`);
        throw error;
    }
    return (await setPorId(ctx.orgId, setId))!;
}

/**
 * Sube un archivo de la certificación (el envío del set o un libro: el SII los
 * recibe por el mismo upload, "Envío DTE (documentos y libros)" del menú de
 * certificación de maullin.sii.cl).
 */
export async function subirAlSii(ctx: ContextoSii, envio: string, nombre: string, que: string): Promise<{ tipo: 'recibido'; trackId: string } | { tipo: 'rechazado'; status: number } | { tipo: 'incierto' }> {
    const archivo = bytesLatin1(envio);
    try {
        let token = await autenticar(ctx);
        let r = await subirEnvio(ctx.entorno, token, ctx.rutFirmante, ctx.rutEmisor, nombre, archivo);
        if (r.status === 5 || STATUS_REINTENTABLES.has(r.status)) {
            // El SII no procesó el archivo (token o problema suyo): el MISMO archivo, otra vez.
            if (r.status === 5) {
                await invalidarTicket({ orgId: ctx.orgId, rail: 'sii', entorno: ctx.entorno, servicio: SERVICIO_TOKEN });
                token = await autenticar(ctx, { forzar: true });
            }
            r = await subirEnvio(ctx.entorno, token, ctx.rutFirmante, ctx.rutEmisor, nombre, archivo);
        }
        if (r.status === 0 && r.trackId) return { tipo: 'recibido', trackId: r.trackId };
        if (r.status === 0) return { tipo: 'incierto' };
        log.error(`sii: el SII rechazó el envío (${que})`, { route: 'fiscal/sii-certificacion', orgId: ctx.orgId, status: r.status, detalle: r.detalle });
        return { tipo: 'rechazado', status: r.status };
    } catch (error) {
        if (error instanceof SiiTransporteError) {
            log.error(`sii: el envío (${que}) no tuvo respuesta legible`, { route: 'fiscal/sii-certificacion', orgId: ctx.orgId, err: error });
            return { tipo: 'incierto' };
        }
        throw error;
    }
}

/** Consulta el veredicto del envío del set (QueryEstUp) y lo guarda. */
export async function consultarSet(ctx: ContextoSii, setId: string): Promise<SetGuardado> {
    exigirCertificacion(ctx);
    const set = await setPorId(ctx.orgId, setId);
    if (!set) throw new RailDatosError('Set de pruebas no encontrado.');
    if (!set.trackId) throw new RailDatosError('Este set no tiene un número de envío del SII que consultar.');
    const r = await estadoEnvio(ctx, set.trackId);
    const fase = faseEnvio(r.estado);
    const porTipo = r.porTipo;
    const total = (k: 'informados' | 'aceptados' | 'rechazados' | 'reparos') => porTipo.reduce((s, t) => s + t[k], 0);
    let estado: EstadoSet = set.estado === 'enviando' ? 'enviando' : 'enviado';
    let error: string | null = null;
    if (fase === 'rechazado') {
        estado = 'rechazado';
        error = mensajeEnvioRechazado(r.estado);
    } else if (fase === 'procesado') {
        estado = total('rechazados') > 0 ? 'rechazado' : total('reparos') > 0 ? 'reparos' : 'aceptado';
        if (estado === 'rechazado') error = 'El SII rechazó documentos del set. Revisa el detalle del envío en el sitio del SII, corrige y crea un intento nuevo.';
        if (estado === 'reparos') error = 'El SII aceptó el set con reparos. El set debe quedar sin rechazos ni reparos: revisa el detalle en el sitio del SII y crea un intento nuevo (con folios nuevos).';
    }
    await withOrgTx(ctx.orgId, sql`
        update fiscal_sii_sets
           set estado = ${estado}, error_mensaje = ${error},
               respuesta = ${JSON.stringify({ estado: r.estado, porTipo })}::jsonb, updated_at = now()
         where id = ${setId} and org_id = ${ctx.orgId}`);
    return (await setPorId(ctx.orgId, setId))!;
}

/** Datos con que se imprime un documento del set (muestras impresas). */
export interface MuestraSet {
    numero: string;
    issuer: FiscalParty;
    recipient: FiscalParty;
    lines: FiscalLineItem[];
    subtotal: number;
    taxTotal: number;
    total: number;
    issuedAt: string;
    autoridad: ReturnType<typeof representacionSii>;
}

/**
 * Lo que el PDF necesita para la muestra impresa de un caso del set (manual
 * de muestras impresas: todos los documentos del set, uno por archivo, y la
 * copia cedible de las facturas).
 */
export function muestraDeCaso(set: SetGuardado, caso: string, unidadSii: string, resolucion: { numero: number; fecha: string }): MuestraSet {
    const d = set.documentos?.find((x) => x.caso === caso);
    if (!d) throw new RailDatosError('Ese caso todavía no tiene documento.');
    const b = d.borrador;
    const lines: FiscalLineItem[] = b.lineas.map((l) => ({
        description: l.descripcion && l.descripcion.length > l.nombre.length ? l.descripcion : l.nombre,
        quantity: l.cantidad ? Number(l.cantidad) : 1,
        unitPrice: l.precio ? Number(l.precio) : l.monto,
        taxRate: l.exento ? 0 : 0.19,
        subtotal: l.monto,
        taxAmount: 0,
        total: l.monto,
        ...(l.descuento > 0 ? { discount: l.descuento } : {}),
    }));
    return {
        numero: `${d.tipo}-${d.folio}`,
        issuer: { legalName: b.emisor.razonSocial, taxId: rutConPuntos(b.emisor.rut), address: { countryCode: 'CL' } } as FiscalParty,
        recipient: { legalName: b.receptor.razonSocial, taxId: rutConPuntos(b.receptor.rut), address: { countryCode: 'CL' } } as FiscalParty,
        lines,
        subtotal: b.neto + b.exento,
        taxTotal: b.iva,
        total: b.total,
        issuedAt: `${b.fechaEmision}T12:00:00Z`,
        autoridad: representacionSii({ borrador: b, folio: d.folio, timbre: d.timbre, unidadSii, resolucion, certificacion: true, muestra: true }),
    };
}
