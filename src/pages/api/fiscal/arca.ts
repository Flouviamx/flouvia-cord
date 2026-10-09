// /api/fiscal/arca — Factura electrónica con ARCA (Argentina).
//   GET                                                       → estado (sin secretos)
//   POST   multipart { crt:File, key:File, key_password? }    → sube o reemplaza el certificado
//          multipart { p12:File, password }                    (alternativa: PKCS#12)
//   PATCH  { punto_venta, condicion_emisor, concepto,
//            ingresos_brutos?, inicio_actividades? }          → ajustes del riel
//   DELETE                                                    → desconecta el certificado del ambiente vigente
//
// El certificado y su llave se cifran con encryptRequiredSecret() y nunca
// vuelven al navegador. Subirlo NO enciende nada por sí solo: el riel está
// listo cuando el despliegue tiene ARCA activo, la cuenta tiene certificado
// vigente a nombre de SU CUIT y los ajustes completos (latam/arca/estado.ts).
// Mientras tanto las facturas siguen como documento comercial (regla 15).
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
import { eliminarCredencial, guardarAjustes, guardarCredencial, leerAjustes } from '../../../lib/fiscal/latam/credenciales';
import { esErrorSeguro } from '../../../lib/fiscal/latam/errores';
import { autenticar, contextoArca, faltantesAjustes, puntosDeVenta, type AjustesArca } from '../../../lib/fiscal/latam/arca/autorizacion';
import { cuitValido } from '../../../lib/fiscal/latam/arca/comprobante';
import { CONDICIONES_EMISOR } from '../../../lib/fiscal/latam/arca/constantes';
import { estadoArca } from '../../../lib/fiscal/latam/arca/estado';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function exigirArgentina(orgId: string): Promise<Response | null> {
    // Sin ARCA activo en el despliegue nada consume lo que se guardaría aquí
    // (regla 15): la pantalla dice "Próximamente" y el endpoint, lo mismo.
    if (!railConfig('arca').habilitado) {
        return json({ error: 'La factura electrónica con ARCA todavía no está disponible en Cord. Te avisaremos cuando puedas conectarla.' }, 409);
    }
    const [[org]] = await withOrgTx(orgId, sql`select country_code from orgs where id = ${orgId}`);
    if (String(org?.country_code || '').toUpperCase() !== 'AR') {
        return json({ error: 'La factura electrónica con ARCA es una capacidad de Argentina. Esta cuenta no está configurada con ese país.' }, 409);
    }
    return null;
}

/** Vista pública del estado: lo que la pantalla necesita, nunca un PEM. */
async function vista(orgId: string) {
    const e = await estadoArca(orgId);
    return {
        habilitado: e.habilitado,
        entorno: e.entorno,
        listo: e.listo,
        faltantes: e.faltantes,
        ajustes: e.ajustes,
        credencial: e.credencial ? {
            identificador: e.credencial.identificador,
            nombre: e.credencial.nombreArchivo,
            caduca: e.credencial.caduca.slice(0, 10),
            vencida: e.credencial.vencida,
            verificado_at: e.credencial.verificadoAt,
            verificacion_error: e.credencial.verificacionError,
        } : null,
    };
}

/**
 * Con ARCA activo en el despliegue, la credencial se prueba de verdad: un
 * login en el WSAA con el certificado (y, si ARCA informa puntos de venta, que
 * el configurado exista y no esté bloqueado). Devuelve un aviso apto para el
 * usuario o null.
 */
async function probarConArca(orgId: string): Promise<string | null> {
    const config = railConfig('arca');
    if (!config.habilitado) return null;
    const [[org]] = await withOrgTx(orgId, sql`select fiscal_metadata->>'tax_id' as tax_id, rfc from orgs where id = ${orgId}`);
    try {
        const ctx = await contextoArca(orgId, config.entorno, org?.tax_id || org?.rfc);
        await autenticar(ctx, { forzar: false });
        const puntos = await puntosDeVenta(ctx).catch(() => null);
        if (puntos) {
            const pv = puntos.find((p) => p.numero === ctx.ajustes.puntoVenta);
            if (!pv) return `ARCA no tiene el punto de venta ${ctx.ajustes.puntoVenta} habilitado para factura electrónica por web service. Créalo en ARCA (Administración de puntos de venta) o corrige el número.`;
            if (pv.bloqueado || pv.baja) return `El punto de venta ${ctx.ajustes.puntoVenta} está bloqueado o dado de baja en ARCA.`;
        }
        return null;
    } catch (error) {
        if (esErrorSeguro(error)) return error.message;
        log.error('arca: no se pudo probar la credencial', { route: 'api/fiscal/arca', orgId, err: error });
        return 'No pudimos comprobar la conexión con ARCA en este momento. Reintenta en unos minutos.';
    }
}

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    return json(await vista(orgId));
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    try { requireEncryption(); } catch { return json({ error: 'El cifrado de secretos no está configurado.' }, 503); }
    const orgId = await getActiveOrgId();
    // Mismo gate que la emisión fiscal integrada (csd.ts, verifactu-cert.ts).
    const subscriptionDenied = await requireEntitlement(orgId, 'cfdi'); if (subscriptionDenied) return subscriptionDenied;
    const notAr = await exigirArgentina(orgId); if (notAr) return notAr;

    const [[org]] = await withOrgTx(orgId, sql`select fiscal_metadata->>'tax_id' as tax_id, rfc from orgs where id = ${orgId}`);
    const cuitOrg = cuitValido(org?.tax_id || org?.rfc);
    if (!cuitOrg) return json({ error: 'Completa primero la CUIT de tu negocio en Ajustes › Datos fiscales.' }, 409);

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
        log.error('arca: no se pudo leer el certificado', { route: 'api/fiscal/arca', orgId, err: error });
        return json({ error: 'No se pudo procesar el certificado.' }, 422);
    }

    // ARCA identifica al titular en el serialNumber del sujeto: "CUIT 20123456789"
    // (Especificación Técnica del WSAA 1.2.2, requerimientos de los certificados).
    const cuitCert = /CUIT\s*(\d{11})/i.exec(parsed.sujetoSerialNumber || '')?.[1] ?? null;
    if (!cuitCert) {
        return json({ error: 'Este certificado no declara una CUIT. Genera el certificado de ARCA desde la clave fiscal de tu negocio.' }, 422);
    }
    if (cuitCert !== cuitOrg) {
        return json({ error: `El certificado está a nombre de la CUIT ${cuitCert}, no de la de tu negocio (${cuitOrg}). Sube el certificado de tu negocio.` }, 422);
    }

    const config = railConfig('arca');
    const nombre = (p12 instanceof File ? p12.name : crt instanceof File ? crt.name : '') || null;
    await guardarCredencial(orgId, 'arca', config.entorno, parsed, { identificador: cuitCert, nombreArchivo: nombre, subidoPor: currentUserId() });
    await logAudit(orgId, {
        accion: 'arca_cert.cargado', entidad: 'org', entidad_id: orgId,
        detalle: `Certificado de ARCA (${config.entorno}) cargado: ${nombre ?? 'sin nombre'}, CUIT ${cuitCert}, vence ${parsed.caduca.toISOString().slice(0, 10)}`,
        ip: reqIp(request),
    });
    const aviso = await probarConArca(orgId);
    return json({ ok: true, ...(await vista(orgId)), ...(aviso ? { aviso } : {}) });
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const notAr = await exigirArgentina(orgId); if (notAr) return notAr;
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const actuales = await leerAjustes<AjustesArca>(orgId, 'arca');
    const nuevos: AjustesArca = { ...actuales };
    if (body.punto_venta !== undefined) {
        const pv = Number(body.punto_venta);
        if (!Number.isInteger(pv) || pv < 1 || pv > 99998) return json({ error: 'El punto de venta debe ser un número entre 1 y 99998.' }, 400);
        nuevos.puntoVenta = pv;
    }
    if (body.condicion_emisor !== undefined) {
        if (!CONDICIONES_EMISOR.some((c) => c.id === body.condicion_emisor)) return json({ error: 'Condición frente al IVA inválida.' }, 400);
        nuevos.condicionEmisor = body.condicion_emisor as AjustesArca['condicionEmisor'];
    }
    if (body.concepto !== undefined) {
        const c = Number(body.concepto);
        if (![1, 2, 3].includes(c)) return json({ error: 'Indica si vendes productos, servicios o ambos.' }, 400);
        nuevos.concepto = c as AjustesArca['concepto'];
    }
    if (body.ingresos_brutos !== undefined) {
        const iibb = String(body.ingresos_brutos ?? '').trim().slice(0, 40);
        if (iibb) nuevos.ingresosBrutos = iibb; else delete nuevos.ingresosBrutos;
    }
    if (body.inicio_actividades !== undefined) {
        const f = String(body.inicio_actividades ?? '').trim();
        if (f && (!/^\d{4}-\d{2}-\d{2}$/.test(f) || Number.isNaN(Date.parse(`${f}T12:00:00Z`)))) return json({ error: 'La fecha de inicio de actividades no es válida.' }, 400);
        if (f) nuevos.inicioActividades = f; else delete nuevos.inicioActividades;
    }
    await guardarAjustes(orgId, 'arca', nuevos as Record<string, unknown>);
    await logAudit(orgId, {
        accion: 'arca_ajustes.actualizado', entidad: 'org', entidad_id: orgId,
        detalle: `Ajustes de ARCA: punto de venta ${nuevos.puntoVenta ?? '—'}, ${nuevos.condicionEmisor ?? '—'}, concepto ${nuevos.concepto ?? '—'}`,
        ip: reqIp(request),
    });
    const aviso = faltantesAjustes(nuevos).length ? null : await probarConArca(orgId);
    return json({ ok: true, ...(await vista(orgId)), ...(aviso ? { aviso } : {}) });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    const orgId = await getActiveOrgId();
    const config = railConfig('arca');
    // Un intento sin respuesta solo se resuelve consultando a ARCA con este
    // certificado: sin él, una factura podría quedar autorizada sin que Cord
    // lo sepa.
    const [[p]] = await withOrgTx(orgId, sql`
        select count(*)::int as n from fiscal_rail_comprobantes
         where org_id = ${orgId} and rail = 'arca' and entorno = ${config.entorno} and estado in ('pendiente', 'incierto')`);
    if (Number(p?.n || 0) > 0) {
        return json({ error: 'Hay facturas esperando la confirmación de ARCA. Podrás desconectar el certificado cuando se confirmen (normalmente en minutos).' }, 409);
    }
    await eliminarCredencial(orgId, 'arca', config.entorno);
    await logAudit(orgId, { accion: 'arca_cert.eliminado', entidad: 'org', entidad_id: orgId, detalle: `Certificado de ARCA (${config.entorno}) desconectado`, ip: reqIp(request) });
    return json({ ok: true, ...(await vista(orgId)) });
};
