// /api/fiscal/sii — Factura electrónica con el SII (Chile).
//   GET                                                   → estado (sin secretos)
//   POST   multipart { p12:File, password }               → sube o reemplaza el certificado del firmante
//          multipart { crt:File, key:File, key_password? } (alternativa: certificado y llave sueltos)
//          + rut_firmante? si el certificado no declara el RUT del titular
//   PATCH  { giro, acteco, direccion, comuna, ciudad, sucursal, cdg_sucursal,
//            unidad_sii, resolucion_numero, resolucion_fecha } → datos del emisor
//   DELETE                                                → desconecta el certificado del ambiente vigente
//
// Los folios (CAF) tienen su propia ruta: /api/fiscal/sii-folios.
//
// El certificado y su llave se cifran con encryptRequiredSecret() y nunca
// vuelven al navegador. Subirlo NO enciende nada por sí solo: el riel está
// listo cuando el despliegue tiene el SII activo, la cuenta tiene certificado
// vigente, los datos del emisor completos y folios vigentes
// (latam/sii/estado.ts). Mientras tanto las facturas siguen como documento
// comercial (regla 15).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { requireEncryption } from '../../../lib/crypto-secret';
import { requireFreshAuth } from '../../../lib/step-up';
import { requireEntitlement } from '../../../lib/org-entitlements';
import { currentUserId } from '../../../lib/context';
import { log } from '../../../lib/log';
import { railConfig } from '../../../lib/fiscal/latam/config';
import { parsearCertificado } from '../../../lib/fiscal/latam/certificado';
import { credencialActiva, eliminarCredencial, guardarAjustes, guardarCredencial, leerAjustes } from '../../../lib/fiscal/latam/credenciales';
import { esErrorSeguro } from '../../../lib/fiscal/latam/errores';
import { autenticar, type AjustesSii } from '../../../lib/fiscal/latam/sii/autorizacion';
import { rutDelCertificado } from '../../../lib/fiscal/latam/sii/certificado';
import { LARGOS } from '../../../lib/fiscal/latam/sii/constantes';
import { motivoSinSii, vistaSii } from '../../../lib/fiscal/latam/sii/vista';
import { campo, rutValido } from '../../../lib/fiscal/latam/sii/texto';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

/**
 * Con el SII activo, el certificado se prueba de verdad: semilla firmada →
 * token. Si el SII no lo acepta (no registrado, revocado, firma inválida) se
 * dice ahora y no al emitir. Devuelve un aviso apto para el usuario o null.
 */
async function probarConSii(orgId: string): Promise<string | null> {
    const config = railConfig('sii');
    if (!config.habilitado) return null;
    const credencial = await credencialActiva(orgId, 'sii', config.entorno);
    if (!credencial) return null;
    try {
        await autenticar({ orgId, entorno: config.entorno, credencial }, { forzar: true });
        return null;
    } catch (error) {
        if (esErrorSeguro(error)) return error.message;
        log.error('sii: no se pudo probar el certificado', { route: 'api/fiscal/sii', orgId, err: error });
        return 'No pudimos comprobar el certificado con el SII en este momento. Reintenta en unos minutos.';
    }
}

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    return json(await vistaSii(orgId));
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    try { requireEncryption(); } catch { return json({ error: 'El cifrado de secretos no está configurado.' }, 503); }
    const orgId = await getActiveOrgId();
    const subscriptionDenied = await requireEntitlement(orgId, 'cfdi'); if (subscriptionDenied) return subscriptionDenied;
    const sinSii = await motivoSinSii(orgId); if (sinSii) return json({ error: sinSii }, 409);

    let form: FormData;
    try { form = await request.formData(); } catch { return json({ error: 'Envía el certificado como multipart/form-data.' }, 400); }
    const crt = form.get('crt');
    const key = form.get('key');
    const p12 = form.get('p12');
    const bytes = async (f: FormDataEntryValue | null) => (f instanceof File ? new Uint8Array(await f.arrayBuffer()) : null);

    let parsed;
    try {
        parsed = p12 instanceof File
            ? parsearCertificado({ pkcs12: await bytes(p12), pkcs12Password: String(form.get('password') ?? '') })
            : parsearCertificado({ certificado: await bytes(crt), llave: await bytes(key), llavePassword: String(form.get('key_password') ?? '') });
    } catch (error) {
        if (esErrorSeguro(error)) return json({ error: error.message }, 422);
        log.error('sii: no se pudo leer el certificado', { route: 'api/fiscal/sii', orgId, err: error });
        return json({ error: 'No se pudo procesar el certificado.' }, 422);
    }

    // El certificado es de una PERSONA (el usuario autorizado ante el SII
    // para firmar los documentos del negocio), no de la empresa: su RUT viaja
    // como RutEnvia en cada envío. Las certificadoras chilenas lo declaran en
    // el certificado; si este no lo trae, se pide escrito y nunca se inventa.
    const declarado = rutDelCertificado(parsed.certPem);
    const escritoCrudo = String(form.get('rut_firmante') ?? '').trim();
    const escrito = escritoCrudo ? rutValido(escritoCrudo) : null;
    if (escritoCrudo && !escrito) return json({ error: 'El RUT del firmante no es válido.' }, 422);
    if (declarado && escrito && declarado !== escrito) {
        return json({ error: `El certificado está a nombre del RUT ${declarado}, no del ${escrito}.` }, 422);
    }
    const rutFirmante = declarado ?? escrito;
    if (!rutFirmante) {
        return json({ error: 'Este certificado no declara el RUT de su titular. Escribe el RUT de la persona autorizada ante el SII que firma con él.', requiere_rut: true }, 422);
    }

    const config = railConfig('sii');
    const nombre = (p12 instanceof File ? p12.name : crt instanceof File ? crt.name : '') || null;
    await guardarCredencial(orgId, 'sii', config.entorno, parsed, { identificador: rutFirmante, nombreArchivo: nombre, subidoPor: currentUserId() });
    await logAudit(orgId, {
        accion: 'sii_cert.cargado', entidad: 'org', entidad_id: orgId,
        detalle: `Certificado del SII (${config.entorno}) cargado: ${nombre ?? 'sin nombre'}, firmante ${rutFirmante}, vence ${parsed.caduca.toISOString().slice(0, 10)}`,
        ip: reqIp(request),
    });
    const aviso = await probarConSii(orgId);
    return json({ ok: true, ...(await vistaSii(orgId)), ...(aviso ? { aviso } : {}) });
};

const texto = (v: unknown, largo: number) => campo(v, largo);

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const sinSii = await motivoSinSii(orgId); if (sinSii) return json({ error: sinSii }, 409);
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const entorno = railConfig('sii').entorno;
    const actuales = await leerAjustes<AjustesSii>(orgId, 'sii');
    const nuevos: AjustesSii = { ...actuales };
    const opcional = (clave: keyof AjustesSii, valor: unknown, largo: number) => {
        if (valor === undefined) return;
        const t = texto(valor, largo);
        if (t) (nuevos as Record<string, unknown>)[clave] = t; else delete nuevos[clave];
    };
    opcional('giro', body.giro, LARGOS.GiroEmis);
    opcional('direccion', body.direccion, LARGOS.DirOrigen);
    opcional('comuna', body.comuna, LARGOS.CmnaOrigen);
    opcional('ciudad', body.ciudad, LARGOS.CiudadOrigen);
    opcional('sucursal', body.sucursal, LARGOS.Sucursal);
    opcional('unidadSii', body.unidad_sii, 60);
    if (body.acteco !== undefined) {
        const lista = (Array.isArray(body.acteco) ? body.acteco : String(body.acteco ?? '').split(/[\s,;]+/))
            .map((x) => String(x).trim()).filter(Boolean);
        const codigos = lista.map(Number);
        if (codigos.length > 4 || !codigos.every((c) => Number.isInteger(c) && c > 0 && c < 1_000_000)) {
            return json({ error: 'Escribe de 1 a 4 códigos de actividad económica del SII (6 dígitos cada uno).' }, 400);
        }
        if (codigos.length) nuevos.acteco = [...new Set(codigos)]; else delete nuevos.acteco;
    }
    if (body.cdg_sucursal !== undefined) {
        const raw = String(body.cdg_sucursal ?? '').trim();
        const c = Number(raw);
        if (raw && (!Number.isInteger(c) || c < 1 || c > 999_999_999)) return json({ error: 'El código de sucursal del SII debe ser un número.' }, 400);
        if (raw) nuevos.cdgSucursal = c; else delete nuevos.cdgSucursal;
    }
    if (body.resolucion_numero !== undefined || body.resolucion_fecha !== undefined) {
        const previa = actuales.resoluciones?.[entorno];
        const numeroRaw = body.resolucion_numero !== undefined ? String(body.resolucion_numero ?? '').trim() : String(previa?.numero ?? '');
        const fecha = body.resolucion_fecha !== undefined ? String(body.resolucion_fecha ?? '').trim() : String(previa?.fecha ?? '');
        const resoluciones = { ...(actuales.resoluciones ?? {}) };
        if (!numeroRaw && !fecha) {
            delete resoluciones[entorno];
        } else {
            const numero = Number(numeroRaw);
            if (!numeroRaw || !Number.isInteger(numero) || numero < 0 || numero > 999_999) {
                return json({ error: 'El número de resolución del SII debe ser un número entero (en certificación es 0).' }, 400);
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T12:00:00Z`))) {
                return json({ error: 'La fecha de la resolución del SII no es válida.' }, 400);
            }
            resoluciones[entorno] = { numero, fecha };
        }
        nuevos.resoluciones = resoluciones;
    }
    await guardarAjustes(orgId, 'sii', nuevos as Record<string, unknown>);
    await logAudit(orgId, {
        accion: 'sii_ajustes.actualizado', entidad: 'org', entidad_id: orgId,
        detalle: `Datos del SII: giro ${nuevos.giro ? 'capturado' : '—'}, actividad ${nuevos.acteco?.join(', ') ?? '—'}, comuna ${nuevos.comuna ?? '—'}, resolución ${nuevos.resoluciones?.[entorno]?.numero ?? '—'}`,
        ip: reqIp(request),
    });
    return json({ ok: true, ...(await vistaSii(orgId)) });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    const orgId = await getActiveOrgId();
    const config = railConfig('sii');
    // Un envío sin veredicto solo se resuelve consultando al SII con este
    // certificado: sin él, una factura podría quedar aceptada sin que Cord lo sepa.
    const [[p]] = await withOrgTx(orgId, sql`
        select count(*)::int as n from fiscal_rail_comprobantes
         where org_id = ${orgId} and rail = 'sii' and entorno = ${config.entorno} and estado in ('pendiente', 'incierto')`);
    if (Number(p?.n || 0) > 0) {
        return json({ error: 'Hay facturas esperando el veredicto del SII. Podrás desconectar el certificado cuando se confirmen.' }, 409);
    }
    await eliminarCredencial(orgId, 'sii', config.entorno);
    await logAudit(orgId, { accion: 'sii_cert.eliminado', entidad: 'org', entidad_id: orgId, detalle: `Certificado del SII (${config.entorno}) desconectado`, ip: reqIp(request) });
    return json({ ok: true, ...(await vistaSii(orgId)) });
};
