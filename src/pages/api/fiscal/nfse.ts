// /api/fiscal/nfse — NFS-e de Padrão Nacional (Brasil).
//   GET                                                 → estado (sin secretos)
//   POST   multipart { p12:File, password }             → sube o reemplaza el certificado ICP-Brasil (A1)
//          multipart { crt:File, key:File, key_password? } (alternativa: certificado + llave)
//   PATCH  { municipio, inscricao_municipal, serie, numero_inicial, op_simples,
//            reg_ap_simples, reg_especial, servico, servico_municipal,
//            aliquota_simples, retencao_iss_id }      → ajustes del riel
//   DELETE                                              → desconecta el certificado del ambiente vigente
//
// El certificado y su llave se cifran con encryptRequiredSecret() y nunca
// vuelven al navegador. Subirlo NO enciende nada por sí solo: el riel está
// listo cuando el despliegue tiene la NFS-e activa, la cuenta tiene un
// certificado vigente a nombre de SU CNPJ/CPF y los ajustes completos
// (latam/nfse/estado.ts). Mientras tanto las facturas siguen como documento
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
import { eliminarCredencial, guardarAjustes, guardarCredencial, leerAjustes } from '../../../lib/fiscal/latam/credenciales';
import { esErrorSeguro } from '../../../lib/fiscal/latam/errores';
import { aplicarCambio, faltantesAjustes, type AjustesNfse } from '../../../lib/fiscal/latam/nfse/ajustes';
import { probarCredencial } from '../../../lib/fiscal/latam/nfse/autorizacao';
import { certificadoCobreDocumento, titularDoCertificado } from '../../../lib/fiscal/latam/nfse/certificado';
import { documentoFederal } from '../../../lib/fiscal/latam/nfse/dps';
import { estadoNfse } from '../../../lib/fiscal/latam/nfse/estado';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function exigirBrasil(orgId: string): Promise<Response | null> {
    // Sin la NFS-e activa en el despliegue nada consume lo que se guardaría
    // aquí (regla 15): la pantalla dice "Próximamente" y el endpoint, lo mismo.
    if (!railConfig('nfse').habilitado) {
        return json({ error: 'La NFS-e todavía no está disponible en Cord. Te avisaremos cuando puedas conectarla.' }, 409);
    }
    const [[org]] = await withOrgTx(orgId, sql`select country_code from orgs where id = ${orgId}`);
    if (String(org?.country_code || '').toUpperCase() !== 'BR') {
        return json({ error: 'La NFS-e es una capacidad de Brasil. Esta cuenta no está configurada con ese país.' }, 409);
    }
    return null;
}

async function documentoDaOrg(orgId: string) {
    const [[org]] = await withOrgTx(orgId, sql`select fiscal_metadata->>'tax_id' as tax_id, rfc from orgs where id = ${orgId}`);
    return documentoFederal(org?.tax_id || org?.rfc);
}

/** Vista pública del estado: lo que la pantalla necesita, nunca un PEM. */
async function vista(orgId: string) {
    const e = await estadoNfse(orgId);
    return {
        habilitado: e.habilitado,
        entorno: e.entorno,
        listo: e.listo,
        faltantes: e.faltantes,
        ajustes: e.ajustes,
        municipio: e.municipio,
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

/** Prueba la conexión con la Sefin (sin efectos). Devuelve un aviso apto para el usuario o null. */
async function probar(orgId: string): Promise<string | null> {
    const config = railConfig('nfse');
    const documento = await documentoDaOrg(orgId);
    const ajustes = await leerAjustes<AjustesNfse>(orgId, 'nfse');
    if (!config.habilitado || !documento) return null;
    try {
        return await probarCredencial(orgId, config.entorno, documento, ajustes.municipio || '0000000');
    } catch (error) {
        if (esErrorSeguro(error)) return error.message;
        log.error('nfse: no se pudo probar la credencial', { route: 'api/fiscal/nfse', orgId, err: error });
        return 'No pudimos comprobar la conexión con el Sistema Nacional NFS-e en este momento. Reintenta en unos minutos.';
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
    // Mismo gate que la emisión fiscal integrada (csd.ts, verifactu-cert.ts, arca.ts).
    const subscriptionDenied = await requireEntitlement(orgId, 'cfdi'); if (subscriptionDenied) return subscriptionDenied;
    const notBr = await exigirBrasil(orgId); if (notBr) return notBr;

    const documento = await documentoDaOrg(orgId);
    if (!documento) return json({ error: 'Completa primero el CNPJ (o CPF) de tu negocio en Ajustes › Datos fiscales.' }, 409);

    let form: FormData;
    try { form = await request.formData(); } catch { return json({ error: 'Envía el certificado como multipart/form-data.' }, 400); }
    const crt = form.get('crt');
    const key = form.get('key');
    const p12 = form.get('p12');
    const bytes = async (f: FormDataEntryValue | null) => (f instanceof File ? new Uint8Array(await f.arrayBuffer()) : null);

    let parsed;
    let titular;
    try {
        parsed = p12 instanceof File
            ? parsearCertificado({ pkcs12: await bytes(p12), pkcs12Password: String(form.get('password') ?? '') })
            : parsearCertificado({ certificado: await bytes(crt), llave: await bytes(key), llavePassword: String(form.get('key_password') ?? '') });
        titular = titularDoCertificado(parsed.certPem);
    } catch (error) {
        if (esErrorSeguro(error)) return json({ error: error.message }, 422);
        log.error('nfse: no se pudo leer el certificado', { route: 'api/fiscal/nfse', orgId, err: error });
        return json({ error: 'No se pudo procesar el certificado.' }, 422);
    }
    if (!certificadoCobreDocumento(titular, documento.numero)) {
        const etiqueta = titular.tipo === 'cpf' ? 'CPF' : 'CNPJ';
        return json({ error: `El certificado está a nombre del ${etiqueta} ${titular.numero}, que no corresponde al de tu negocio (${documento.numero}). Sube el certificado de tu negocio.` }, 422);
    }

    const config = railConfig('nfse');
    const nombre = (p12 instanceof File ? p12.name : crt instanceof File ? crt.name : '') || null;
    await guardarCredencial(orgId, 'nfse', config.entorno, parsed, { identificador: titular.numero, nombreArchivo: nombre, subidoPor: currentUserId() });
    await logAudit(orgId, {
        accion: 'nfse_cert.cargado', entidad: 'org', entidad_id: orgId,
        detalle: `Certificado ICP-Brasil (${config.entorno}) cargado: ${nombre ?? 'sin nombre'}, ${titular.tipo.toUpperCase()} ${titular.numero}, vence ${parsed.caduca.toISOString().slice(0, 10)}`,
        ip: reqIp(request),
    });
    const aviso = await probar(orgId);
    return json({ ok: true, ...(await vista(orgId)), ...(aviso ? { aviso } : {}) });
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const notBr = await exigirBrasil(orgId); if (notBr) return notBr;
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'JSON inválido' }, 400);

    const actuales = await leerAjustes<AjustesNfse>(orgId, 'nfse');
    const cambio = aplicarCambio(actuales, body);
    if (!cambio.ok) return json({ error: cambio.error }, 400);
    const nuevos = cambio.ajustes;
    if (nuevos.retencaoIssId) {
        // El perfil debe ser una retención de ESTA organización.
        const [[perfil]] = await withOrgTx(orgId, sql`
            select 1 as ok from impuestos where id = ${nuevos.retencaoIssId} and org_id = ${orgId} and kind = 'retencion' limit 1`);
        if (!perfil) return json({ error: 'Ese perfil de retención no existe en Ajustes › Impuestos.' }, 400);
    }
    await guardarAjustes(orgId, 'nfse', nuevos as Record<string, unknown>);
    await logAudit(orgId, {
        accion: 'nfse_ajustes.actualizado', entidad: 'org', entidad_id: orgId,
        detalle: `Ajustes de la NFS-e: municipio ${nuevos.municipio ?? '—'}, serie ${nuevos.serie ?? '—'}, Simples ${nuevos.opSimpNac ?? '—'}, servicio ${nuevos.servico ?? '—'}`,
        ip: reqIp(request),
    });
    const aviso = faltantesAjustes(nuevos).length ? null : await probar(orgId);
    return json({ ok: true, ...(await vista(orgId)), ...(aviso ? { aviso } : {}) });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    const orgId = await getActiveOrgId();
    const config = railConfig('nfse');
    // Un intento sin respuesta solo se resuelve consultando a la Sefin con este
    // certificado: sin él, una NFS-e podría quedar generada sin que Cord lo sepa.
    const [[p]] = await withOrgTx(orgId, sql`
        select count(*)::int as n from fiscal_rail_comprobantes
         where org_id = ${orgId} and rail = 'nfse' and entorno = ${config.entorno} and estado in ('pendiente', 'incierto')`);
    if (Number(p?.n || 0) > 0) {
        return json({ error: 'Hay NFS-e esperando la confirmación del Sistema Nacional. Podrás desconectar el certificado cuando se confirmen (normalmente en minutos).' }, 409);
    }
    await eliminarCredencial(orgId, 'nfse', config.entorno);
    await logAudit(orgId, { accion: 'nfse_cert.eliminado', entidad: 'org', entidad_id: orgId, detalle: `Certificado ICP-Brasil (${config.entorno}) desconectado`, ip: reqIp(request) });
    return json({ ok: true, ...(await vista(orgId)) });
};
