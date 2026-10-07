// /api/fiscal/verifactu-cert — Certificado electrónico de Verifactu (España).
//   POST    multipart { p12:File, password:string } → { ok, caduca, registrando, aviso? }
//           Sube o REEMPLAZA el certificado (uno caducado se sustituye aquí).
//   DELETE                                            → { ok }  (desactiva Verifactu)
//
// Subir un certificado válido es lo único que enciende `orgs.verifactu_modo`.
// Mientras no esté encendido, SpainVerifactuProvider degrada al mismo
// contrato "commercial_only" que CommercialInvoiceProvider (regla 15): la app
// nunca aparenta un registro Verifactu que no se generó.
//
// Desconectar NO es libre (art. 17.2–17.3 de la Orden HAC/1177/2024): un
// sistema que operó en modo VERI*FACTU durante un año natural sigue en ese
// modo hasta el 31 de diciembre, y los registros ya encadenados tienen que
// llegar a la AEAT. Antes, borrar el certificado apagaba el modo y dejaba los
// pendientes varados para siempre (sin certificado no hay envío).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { encryptRequiredSecret, requireEncryption } from '../../../lib/crypto-secret';
import { requireFreshAuth } from '../../../lib/step-up';
import { requireEntitlement } from '../../../lib/org-entitlements';
import { log } from '../../../lib/log';
import { metadata } from '../../../lib/fiscal/parties';
import { parsePkcs12, InvalidCertificateError } from '../../../lib/fiscal/verifactu/cert';
import { logVerifactuEvento } from '../../../lib/fiscal/verifactu/chain';
import { ejercicioAEAT } from '../../../lib/fiscal/verifactu/huella';
import { requireSifIdentity, SifNotConfiguredError, verifactuEnvioConfig } from '../../../lib/fiscal/verifactu/sif';
import { nifEsValido, normalizarNifEs } from '../../../lib/fiscal/verifactu/validacion';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    try { requireEncryption(); } catch { return json({ error: 'El cifrado de secretos no está configurado.' }, 503); }

    const orgId = await getActiveOrgId();
    // Mismo gate que la emisión fiscal (csd.ts): Verifactu es facturación
    // electrónica integrada y no se activa en un plan que no la incluye.
    const subscriptionDenied = await requireEntitlement(orgId, 'cfdi');
    if (subscriptionDenied) return subscriptionDenied;

    // Fallo cerrado ANTES de aceptar nada: sin la identidad del productor del
    // software no se puede generar ni un registro, y encender el modo dejaría
    // a la org sin poder emitir.
    try {
        requireSifIdentity();
    } catch (error) {
        if (error instanceof SifNotConfiguredError) {
            log.error('verifactu-cert: identidad del SIF no configurada', { route: 'api/fiscal/verifactu-cert', orgId, detalle: error.detalle });
            return json({ error: 'Verifactu todavía no está disponible en Cord. Escríbenos a soporte@flouvia.com y te avisamos en cuanto lo esté.' }, 503);
        }
        throw error;
    }

    const [orgRows] = await withOrgTx(orgId, sql`select country_code, rfc, fiscal_metadata from orgs where id = ${orgId}`);
    const org = orgRows[0];
    if (String(org?.country_code || '').toUpperCase() !== 'ES') {
        return json({ error: 'Verifactu es una capacidad de España. Esta cuenta no está configurada con ese país.' }, 409);
    }
    // El NIF del negocio vive en fiscal_metadata.tax_id fuera de México (mismo
    // criterio que partiesFrom); `rfc` solo como respaldo.
    const orgNif = normalizarNifEs(metadata(org?.fiscal_metadata).tax_id || org?.rfc || '');
    if (!nifEsValido(orgNif)) {
        return json({ error: 'Completa primero el NIF de tu negocio en Ajustes › Datos fiscales: Verifactu lo necesita para registrar cada factura.' }, 409);
    }

    let form: FormData;
    try { form = await request.formData(); } catch { return json({ error: 'Envía el certificado como multipart/form-data.' }, 400); }
    const p12 = form.get('p12');
    const password = String(form.get('password') ?? '');
    if (!(p12 instanceof File)) return json({ error: 'Falta el archivo del certificado (.p12/.pfx).' }, 400);
    if (!password) return json({ error: 'Falta la contraseña del certificado.' }, 400);
    // Un certificado de firma electrónica real pesa unos pocos KB.
    if (p12.size > 50_000) return json({ error: 'El archivo parece demasiado grande para ser un certificado .p12/.pfx.' }, 400);

    const bytes = new Uint8Array(await p12.arrayBuffer());
    let parsed;
    try {
        // Valida contraseña, empareja llave y certificado, acota el coste de la
        // derivación de la contraseña y comprueba que el TLS real del runtime
        // lo acepte: un certificado que se sube bien y luego no conecta con la
        // AEAT es peor que uno rechazado aquí.
        parsed = parsePkcs12(bytes, password);
    } catch (error) {
        if (error instanceof InvalidCertificateError) return json({ error: error.message }, 422);
        return json({ error: 'No se pudo procesar el certificado.' }, 422);
    }
    if (parsed.expiresAt.getTime() <= Date.now()) {
        return json({ error: `Este certificado caducó el ${parsed.expiresAt.toLocaleDateString('es-ES')}. Sube uno vigente.` }, 422);
    }

    // Un certificado de OTRO titular no se rechaza: la AEAT admite que remita
    // un apoderado o un colaborador social (una gestoría) en nombre del
    // obligado. Pero se avisa, porque lo habitual es un error de archivo, y la
    // AEAT rechazará los envíos si ese titular no tiene apoderamiento.
    const titularCoincide = parsed.nifs.includes(orgNif);
    const aviso = titularCoincide ? undefined
        : 'El certificado no está a nombre del NIF de tu negocio. Funciona solo si su titular está apoderado ante la AEAT para remitir tus facturas; si no, sube el certificado de tu negocio.';

    const [prevRows] = await withOrgTx(orgId, sql`select verifactu_modo from orgs where id = ${orgId}`);
    const reemplazo = prevRows[0]?.verifactu_modo === 'verifactu';
    const certEnc = encryptRequiredSecret(Buffer.from(bytes).toString('base64'));
    const passEnc = encryptRequiredSecret(password);
    await withOrgTx(orgId, sql`
        update orgs set
            verifactu_cert_enc = ${certEnc},
            verifactu_cert_pass_enc = ${passEnc},
            verifactu_cert_nombre = ${p12.name},
            verifactu_cert_caduca = ${parsed.expiresAt.toISOString().slice(0, 10)},
            verifactu_cert_subido_at = now(),
            verifactu_modo = 'verifactu'
        where id = ${orgId}`);

    await logVerifactuEvento(orgId, reemplazo ? 'cambio_config' : 'arranque', {
        motivo: reemplazo ? 'certificado reemplazado' : 'certificado subido',
        certificado: p12.name,
        titular_coincide: titularCoincide,
    });
    await logAudit(orgId, {
        accion: reemplazo ? 'verifactu_cert.reemplazado' : 'verifactu_cert.cargado', entidad: 'org', entidad_id: orgId,
        detalle: `Certificado Verifactu ${reemplazo ? 'reemplazado' : 'cargado'} (${p12.name}), caduca ${parsed.expiresAt.toISOString().slice(0, 10)}${titularCoincide ? '' : ', titular distinto del NIF de la organización'}`,
        ip: reqIp(request),
    });
    // `registrando`: si las facturas YA se registran ante la AEAT. Con el envío
    // apagado el certificado queda guardado, pero la pantalla no puede decir que
    // las facturas se encadenan (regla 15).
    return json({ ok: true, caduca: parsed.expiresAt.toISOString().slice(0, 10), registrando: verifactuEnvioConfig().habilitado, ...(aviso ? { aviso } : {}) });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    const orgId = await getActiveOrgId();

    // Año natural en Madrid: el modo VERI*FACTU se mantiene hasta el 31 de
    // diciembre del año en que se generó algún registro.
    const anio = ejercicioAEAT(new Date());
    const [rows] = await withOrgTx(orgId, sql`
        select count(*) filter (where envio_estado = 'pendiente')::int as pendientes,
               count(*) filter (where extract(year from (generado_at at time zone 'Europe/Madrid')) = ${anio})::int as este_anio
          from verifactu_registros
         where org_id = ${orgId}`);
    const pendientes = Number(rows[0]?.pendientes || 0);
    const esteAnio = Number(rows[0]?.este_anio || 0);
    if (pendientes > 0) {
        return json({
            error: `Hay ${pendientes} registro${pendientes === 1 ? '' : 's'} de facturación que todavía no llegan a la AEAT, y sin el certificado no se podrían enviar. Puedes reemplazar el certificado, pero no desconectarlo hasta que se envíen.`,
        }, 409);
    }
    if (esteAnio > 0) {
        return json({
            error: `Tu negocio ya registró facturas con Verifactu en ${anio}: la normativa exige seguir en ese modo hasta el 31 de diciembre de ${anio}. Puedes reemplazar el certificado si caduca o cambia; la desconexión estará disponible a partir del 1 de enero de ${anio + 1}.`,
        }, 409);
    }

    await withOrgTx(orgId, sql`
        update orgs set
            verifactu_cert_enc = null,
            verifactu_cert_pass_enc = null,
            verifactu_cert_nombre = null,
            verifactu_cert_caduca = null,
            verifactu_cert_subido_at = null,
            verifactu_modo = 'no_verifactu'
        where id = ${orgId}`);
    await logVerifactuEvento(orgId, 'parada', { motivo: 'certificado eliminado' });
    await logAudit(orgId, {
        accion: 'verifactu_cert.eliminado', entidad: 'org', entidad_id: orgId,
        detalle: 'Certificado Verifactu desconectado', ip: reqIp(request),
    });
    return json({ ok: true });
};
