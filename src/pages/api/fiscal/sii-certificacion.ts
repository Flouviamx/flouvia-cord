// /api/fiscal/sii-certificacion — Set de pruebas de la certificación ante el SII (Chile).
//   GET                                          → sets cargados y los clientes que pueden ser receptores
//   GET    ?muestra=<set>&caso=<n>[&cedible=1]   → muestra impresa (PDF) de un caso del set
//   GET    ?libro=<id>                           → el libro firmado (XML) tal como se subió
//   POST   JSON { accion: 'cargar', texto }      → carga el archivo del set tal como lo entregó el SII
//          JSON { accion: 'enviar', set_id, receptores: { [caso]: clienteId } }
//                                               → arma, firma y sube el set en un solo envío
//          JSON { accion: 'consultar', set_id } → veredicto del SII sobre el envío
//          JSON { accion: 'reintentar', set_id } → intento nuevo del mismo set (folios nuevos)
//          JSON { accion: 'enviar_libro', libro_id, proveedores?: { [n]: { rut, razon_social } } }
//                                               → arma, firma y sube el libro de ventas o de compras
//          JSON { accion: 'consultar_libro', libro_id } / { accion: 'reintentar_libro', libro_id }
//
// Solo en el ambiente de certificación (latam/sii/certificacion.ts y
// libros-set.ts): el set no crea documentos_fiscales ni toca la numeración de
// producción. Lo que el archivo trae y Cord no arma (guías y su libro,
// exportación, factura de compra) se devuelve en `no_soportados` para decirlo
// en pantalla.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { requireFreshAuth } from '../../../lib/step-up';
import { requireEntitlement } from '../../../lib/org-entitlements';
import { currentUserId } from '../../../lib/context';
import { log } from '../../../lib/log';
import { railConfig } from '../../../lib/fiscal/latam/config';
import { esErrorSeguro } from '../../../lib/fiscal/latam/errores';
import { contextoSii } from '../../../lib/fiscal/latam/sii/autorizacion';
import {
    consultarSet, enviarSet, listarSets, muestraDeCaso, nuevoIntento, setFuenteDeLibros, setPorId, type SetGuardado,
} from '../../../lib/fiscal/latam/sii/certificacion';
import {
    cargarArchivoSet, consultarLibro, enviarLibro, libroPorId, listarLibros, nuevoIntentoLibro, proveedoresDe, xmlDelLibro, type LibroGuardado,
} from '../../../lib/fiscal/latam/sii/libros-set';
import { TIPOS_DTE } from '../../../lib/fiscal/latam/sii/constantes';
import { rutValido } from '../../../lib/fiscal/latam/sii/texto';
import { motivoSinSii } from '../../../lib/fiscal/latam/sii/vista';
import { createInvoicePdf } from '../../../lib/fiscal/invoice-pdf';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

/** Lo que la pantalla ve de un set: nunca el XML firmado ni el texto completo. */
function vistaSet(s: SetGuardado) {
    return {
        id: s.id,
        numero_atencion: s.numeroAtencion,
        nombre: s.nombre,
        estado: s.estado,
        track_id: s.trackId,
        error: s.errorMensaje,
        creado_at: s.createdAt,
        enviado_at: s.enviadoAt,
        por_tipo: s.respuesta?.porTipo ?? null,
        casos: s.casos.map((c) => {
            const d = s.documentos?.find((x) => x.caso === c.numero);
            return {
                numero: c.numero,
                tipo: c.tipo,
                nombre_tipo: TIPOS_DTE[c.tipo].nombre,
                referencia: c.referencia?.caso ?? null,
                razon: c.referencia?.razon ?? null,
                items: c.items.length,
                cedible: TIPOS_DTE[c.tipo].cedible,
                ...(d ? { folio: d.folio, receptor: d.razonSocialReceptor, total: d.total } : {}),
            };
        }),
    };
}

/** Lo que la pantalla ve de un libro: sus documentos y totales, nunca el XML firmado. */
function vistaLibro(l: LibroGuardado) {
    return {
        id: l.id,
        operacion: l.operacion,
        numero_atencion: l.numeroAtencion,
        nombre: l.nombre,
        estado: l.estado,
        track_id: l.trackId,
        error: l.errorMensaje,
        periodo: l.periodo,
        creado_at: l.createdAt,
        enviado_at: l.enviadoAt,
        xml: l.tieneXml,
        respuesta: l.respuesta ? { estado: l.respuesta.estado ?? null, glosa: l.respuesta.glosa ?? null } : null,
        factor: l.factorProporcionalidad,
        filas: l.filas.map((f, i) => ({
            n: i,
            tipo_documento: f.tipoDocumento,
            tpo_doc: f.tpoDoc,
            folio: f.folio,
            observacion: f.observacion,
            exento: f.exento,
            afecto: f.afecto,
            tratamiento: f.tratamiento.tipo,
            modifica: f.modifica,
            rut: l.proveedores[String(i)]?.rut ?? '',
            razon_social: l.proveedores[String(i)]?.razonSocial ?? '',
        })),
        documentos: l.detalles?.length ?? null,
        resumen: l.resumen?.map((t) => ({ tipo: t.tpoDoc, documentos: t.totDoc, total: t.totMntTotal })) ?? null,
    };
}

/** El set aceptado que alimenta los libros (o null si todavía no hay uno). */
function vistaFuente(s: SetGuardado | null) {
    if (!s?.documentos?.length) return null;
    return { set_id: s.id, numero_atencion: s.numeroAtencion, track_id: s.trackId, documentos: s.documentos.length, periodo: s.documentos[0].fecha.slice(0, 7) };
}

/** El set solo vive en certificación: en producción la pantalla ni lo ofrece. */
function sinCertificacion(): Response | null {
    return railConfig('sii').entorno === 'homologacion'
        ? null
        : json({ error: 'El set de pruebas se envía al ambiente de certificación del SII, y esta cuenta opera en producción.' }, 409);
}

export const GET: APIRoute = async ({ url }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const sinSii = await motivoSinSii(orgId); if (sinSii) return json({ error: sinSii }, 409);
    const noCert = sinCertificacion(); if (noCert) return noCert;

    const libroId = url.searchParams.get('libro');
    if (libroId) {
        if (!UUID_RE.test(libroId)) return json({ error: 'Libro no encontrado' }, 404);
        const archivo = await xmlDelLibro(orgId, libroId);
        if (!archivo) return json({ error: 'Este libro todavía no tiene archivo firmado.' }, 404);
        return new Response(new Uint8Array(Buffer.from(archivo.xml, 'latin1')), {
            headers: { 'Content-Type': 'application/xml; charset=ISO-8859-1', 'Content-Disposition': `attachment; filename="${archivo.nombre}"`, 'Cache-Control': 'no-store' },
        });
    }

    const muestra = url.searchParams.get('muestra');
    if (muestra) {
        if (!UUID_RE.test(muestra)) return json({ error: 'Set no encontrado' }, 404);
        const set = await setPorId(orgId, muestra);
        const caso = String(url.searchParams.get('caso') ?? '');
        if (!set?.documentos?.length) return json({ error: 'Este set todavía no tiene documentos.' }, 404);
        const config = railConfig('sii');
        let ctx;
        try { ctx = await contextoSii(orgId, config.entorno, await rutNegocio(orgId)); }
        catch (error) { if (esErrorSeguro(error)) return json({ error: error.message }, 409); throw error; }
        try {
            const m = muestraDeCaso(set, caso, ctx.ajustes.unidadSii, ctx.resolucion);
            const cedible = url.searchParams.get('cedible') === '1' && !!m.autoridad.cedible;
            const pdf = createInvoicePdf({
                invoiceNumber: m.numero, countryCode: 'CL', currency: 'CLP', documentType: 'sii_invoice',
                subtotal: m.subtotal, taxTotal: m.taxTotal, total: m.total, issuedAt: m.issuedAt,
                issuer: m.issuer, recipient: m.recipient, lines: m.lines, autoridad: m.autoridad, copiaCedible: cedible,
                timeZone: 'America/Santiago',
            });
            const nombre = `muestra-set-${set.numeroAtencion}-caso-${caso.replace(/[^0-9-]/g, '')}${cedible ? '-cedible' : ''}.pdf`;
            return new Response(new Uint8Array(pdf), {
                headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nombre}"`, 'Cache-Control': 'no-store' },
            });
        } catch (error) {
            if (esErrorSeguro(error)) return json({ error: error.message }, 404);
            throw error;
        }
    }

    const [sets, libros, fuente, [clientes]] = await Promise.all([
        listarSets(orgId),
        listarLibros(orgId),
        setFuenteDeLibros(orgId),
        withOrgTx(orgId, sql`
            select id, coalesce(nullif(empresa, ''), contacto) as nombre, rfc, giro, comuna, direccion_line1
              from clientes
             where org_id = ${orgId} and rfc is not null and rfc <> ''
             order by coalesce(nullif(empresa, ''), contacto)
             limit 300`),
    ]);
    return json({
        sets: sets.map(vistaSet),
        libros: libros.map(vistaLibro),
        fuente_libros: vistaFuente(fuente),
        clientes: clientes
            .map((c) => ({ id: String(c.id), nombre: String(c.nombre ?? ''), rut: rutValido(c.rfc), completo: !!(c.giro && c.comuna && c.direccion_line1) }))
            .filter((c) => c.rut),
    });
};

async function rutNegocio(orgId: string): Promise<string | null> {
    const [[org]] = await withOrgTx(orgId, sql`select fiscal_metadata->>'tax_id' as tax_id, rfc from orgs where id = ${orgId} limit 1`);
    return org?.tax_id || org?.rfc || null;
}

async function emisorBase(orgId: string, direccionAjustes: string | undefined, ciudad: string | undefined, sucursal: string | undefined, cdgSucursal: number | undefined) {
    const [[org]] = await withOrgTx(orgId, sql`
        select coalesce(nullif(fiscal_metadata->>'legal_name', ''), razon_social, nombre) as razon_social,
               coalesce(nullif(fiscal_metadata->>'address_line1', ''), direccion) as direccion,
               fiscal_metadata->>'city' as ciudad
          from orgs where id = ${orgId} limit 1`);
    const razonSocial = String(org?.razon_social ?? '').trim();
    const direccion = String(direccionAjustes || org?.direccion || '').trim();
    if (!razonSocial || !direccion) return null;
    return { razonSocial, direccion, ciudad: ciudad || org?.ciudad || null, sucursal: sucursal || null, cdgSucursal: cdgSucursal ?? null };
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const subscriptionDenied = await requireEntitlement(orgId, 'cfdi'); if (subscriptionDenied) return subscriptionDenied;
    const sinSii = await motivoSinSii(orgId); if (sinSii) return json({ error: sinSii }, 409);
    const noCert = sinCertificacion(); if (noCert) return noCert;
    let body: Record<string, any>;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const accion = String(body.accion ?? '');

    try {
        if (accion === 'cargar') {
            const texto = String(body.texto ?? '');
            if (!texto.trim()) return json({ error: 'Pega el texto del set de pruebas.' }, 400);
            if (texto.length > 200_000) return json({ error: 'El texto es demasiado largo para ser un set de pruebas.' }, 400);
            const r = await cargarArchivoSet(orgId, texto, currentUserId());
            const cargados = [
                ...r.sets.map((s) => `${s.nombre} (${s.numeroAtencion}, ${s.casos.length} casos)`),
                ...r.libros.map((l) => `${l.nombre} (${l.numeroAtencion}${l.filas.length ? `, ${l.filas.length} documentos` : ''})`),
            ];
            await logAudit(orgId, {
                accion: 'sii_set.cargado', entidad: 'org', entidad_id: orgId,
                detalle: `Set de pruebas del SII cargado: ${cargados.join('; ') || 'ninguno que Cord arme'}`,
                ip: reqIp(request),
            });
            return json({
                ok: true, sets: r.sets.map(vistaSet), libros: r.libros.map(vistaLibro),
                no_soportados: r.noSoportados.map((n) => ({ nombre: n.nombre, numero_atencion: n.numeroAtencion, motivo: n.motivo })),
            });
        }
        if (accion === 'enviar_libro' || accion === 'consultar_libro' || accion === 'reintentar_libro') {
            const libroId = String(body.libro_id ?? '');
            if (!UUID_RE.test(libroId)) return json({ error: 'Libro no encontrado' }, 404);
            if (accion === 'reintentar_libro') {
                const l = await nuevoIntentoLibro(orgId, libroId, currentUserId());
                return json({ ok: true, libro: vistaLibro(l) });
            }
            // Firmar el libro y consultar al SII usan el certificado del negocio.
            const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
            const ctx = await contextoSii(orgId, railConfig('sii').entorno, await rutNegocio(orgId));
            if (accion === 'consultar_libro') {
                const l = await consultarLibro(ctx, libroId);
                return json({ ok: true, libro: vistaLibro(l) });
            }
            const actual = await libroPorId(orgId, libroId);
            if (!actual) return json({ error: 'Libro no encontrado' }, 404);
            const l = await enviarLibro(ctx, libroId, proveedoresDe(actual, body.proveedores));
            await logAudit(orgId, {
                accion: 'sii_libro.enviado', entidad: 'org', entidad_id: orgId,
                detalle: `Libro de ${l.operacion === 'VENTA' ? 'ventas' : 'compras'} del set ${l.numeroAtencion} enviado al SII (certificación): ${l.detalles?.length ?? 0} documentos, período ${l.periodo}${l.trackId ? `, envío ${l.trackId}` : ''}`,
                ip: reqIp(request),
            });
            return json({ ok: true, libro: vistaLibro(l) });
        }
        const setId = String(body.set_id ?? '');
        if (!UUID_RE.test(setId)) return json({ error: 'Set no encontrado' }, 404);
        if (accion === 'reintentar') {
            const s = await nuevoIntento(orgId, setId, currentUserId());
            return json({ ok: true, set: vistaSet(s) });
        }
        // Enviar y consultar hablan con el SII con el certificado del negocio.
        const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
        const config = railConfig('sii');
        const ctx = await contextoSii(orgId, config.entorno, await rutNegocio(orgId));
        if (accion === 'enviar') {
            const receptores: Record<string, string> = {};
            for (const [caso, cliente] of Object.entries(body.receptores ?? {})) {
                if (/^\d+-\d+$/.test(caso) && UUID_RE.test(String(cliente))) receptores[caso] = String(cliente);
            }
            const base = await emisorBase(orgId, ctx.ajustes.direccion, ctx.ajustes.ciudad, ctx.ajustes.sucursal, ctx.ajustes.cdgSucursal);
            if (!base) return json({ error: 'Completa la razón social y la dirección de tu negocio en Ajustes › Datos fiscales.' }, 409);
            const s = await enviarSet(ctx, setId, receptores, base);
            await logAudit(orgId, {
                accion: 'sii_set.enviado', entidad: 'org', entidad_id: orgId,
                detalle: `Set de pruebas ${s.numeroAtencion} enviado al SII (certificación): ${s.documentos?.length ?? 0} documentos${s.trackId ? `, envío ${s.trackId}` : ''}`,
                ip: reqIp(request),
            });
            return json({ ok: true, set: vistaSet(s) });
        }
        if (accion === 'consultar') {
            const s = await consultarSet(ctx, setId);
            return json({ ok: true, set: vistaSet(s) });
        }
        return json({ error: 'Acción desconocida.' }, 400);
    } catch (error) {
        if (esErrorSeguro(error)) return json({ error: error.message }, 422);
        log.error('sii: falló una acción del set de pruebas', { route: 'api/fiscal/sii-certificacion', orgId, accion, err: error });
        return json({ error: 'No pudimos completar la operación con el SII en este momento. Reintenta en unos minutos.' }, 502);
    }
};
