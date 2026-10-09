// /api/fiscal/nfe — NF-e modelo 55 (Brasil, venta de mercancías ante la SEFAZ).
//   GET                                                 → estado (sin secretos)
//   POST   multipart { p12:File, password }             → sube o reemplaza el certificado ICP-Brasil (A1) de la NF-e
//          multipart { crt:File, key:File, key_password? } (alternativa: certificado + llave)
//   PATCH  { serie, numero_inicial, crt, ie, im, cnae, nome_fantasia, logradouro,
//            numero, complemento, bairro, municipio, cep, telefone, nat_op,
//            ind_pres, mod_frete, pis_cst, pis_aliquota, cofins_cst,
//            cofins_aliquota, pis_cofins_sem_icms, p_cred_sn, inf_cpl } → ajustes del riel
//   DELETE                                              → desconecta el certificado PROPIO de la NF-e
//
// El certificado de la NFS-e sirve también aquí cuando es del mismo CNPJ (un
// e-CNPJ A1 firma los dos sistemas): subir uno propio solo hace falta si el
// negocio quiere separarlos. Se cifra con encryptRequiredSecret() y nunca
// vuelve al navegador. Nada de esto enciende la NF-e por sí solo: el riel está
// listo cuando el despliegue la tiene activa, hay certificado vigente del CNPJ
// y los ajustes están completos (latam/nfe/estado.ts). Mientras tanto las
// facturas de productos siguen como documento comercial (regla 15).
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
import { eliminarCredencial, guardarAjustes, guardarCredencial, leerAjustes, resumenCredencial } from '../../../lib/fiscal/latam/credenciales';
import { esErrorSeguro } from '../../../lib/fiscal/latam/errores';
import { certificadoCobreDocumento, titularDoCertificado } from '../../../lib/fiscal/latam/nfse/certificado';
import { documentoFederal } from '../../../lib/fiscal/latam/nfse/dps';
import { municipio } from '../../../lib/fiscal/latam/nfse/municipios';
import { aplicarCambio, faltantesAjustes, type AjustesNfe } from '../../../lib/fiscal/latam/nfe/ajustes';
import { probarCredencial } from '../../../lib/fiscal/latam/nfe/autorizacao';
import { esUf } from '../../../lib/fiscal/latam/nfe/constantes';
import { estadoNfe } from '../../../lib/fiscal/latam/nfe/estado';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function exigirBrasil(orgId: string): Promise<Response | null> {
    // Sin la NF-e activa en el despliegue nada consume lo que se guardaría aquí
    // (regla 15): la pantalla dice "Próximamente" y el endpoint, lo mismo.
    if (!railConfig('nfe').habilitado) {
        return json({ error: 'La NF-e todavía no está disponible en Cord. Te avisaremos cuando puedas conectarla.' }, 409);
    }
    const [[org]] = await withOrgTx(orgId, sql`select country_code from orgs where id = ${orgId}`);
    if (String(org?.country_code || '').toUpperCase() !== 'BR') {
        return json({ error: 'La NF-e es una capacidad de Brasil. Esta cuenta no está configurada con ese país.' }, 409);
    }
    return null;
}

async function documentoDaOrg(orgId: string) {
    const [[org]] = await withOrgTx(orgId, sql`select fiscal_metadata->>'tax_id' as tax_id, rfc from orgs where id = ${orgId}`);
    return documentoFederal(org?.tax_id || org?.rfc);
}

/** Vista pública del estado: lo que la pantalla necesita, nunca un PEM. */
async function vista(orgId: string) {
    const e = await estadoNfe(orgId);
    return {
        habilitado: e.habilitado,
        entorno: e.entorno,
        listo: e.listo,
        faltantes: e.faltantes,
        ajustes: e.ajustes,
        municipio: e.municipio,
        contingencia: e.contingencia,
        origen_credencial: e.origenCredencial,
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

/** Prueba la conexión con la SEFAZ del estado (sin efectos). Devuelve un aviso apto para el usuario o null. */
async function probar(orgId: string): Promise<string | null> {
    const config = railConfig('nfe');
    const documento = await documentoDaOrg(orgId);
    const ajustes = await leerAjustes<AjustesNfe>(orgId, 'nfe');
    const uf = municipio(ajustes.municipio)?.uf;
    if (!config.habilitado || !documento || documento.tipo !== 'CNPJ' || !uf || !esUf(uf)) return null;
    try {
        return await probarCredencial(orgId, config.entorno, uf, documento);
    } catch (error) {
        if (esErrorSeguro(error)) return error.message;
        log.error('nfe: no se pudo probar la credencial', { route: 'api/fiscal/nfe', orgId, err: error });
        return 'No pudimos comprobar la conexión con la SEFAZ en este momento. Reintenta en unos minutos.';
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
    // Mismo gate que la emisión fiscal integrada (csd.ts, nfse.ts, arca.ts).
    const subscriptionDenied = await requireEntitlement(orgId, 'cfdi'); if (subscriptionDenied) return subscriptionDenied;
    const notBr = await exigirBrasil(orgId); if (notBr) return notBr;

    const documento = await documentoDaOrg(orgId);
    if (!documento || documento.tipo !== 'CNPJ') return json({ error: 'La NF-e la emite una empresa: completa primero el CNPJ de tu negocio en Ajustes › Datos fiscales.' }, 409);

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
        log.error('nfe: no se pudo leer el certificado', { route: 'api/fiscal/nfe', orgId, err: error });
        return json({ error: 'No se pudo procesar el certificado.' }, 422);
    }
    if (titular.tipo !== 'cnpj' || !certificadoCobreDocumento(titular, documento.numero)) {
        const etiqueta = titular.tipo === 'cpf' ? 'CPF' : 'CNPJ';
        return json({ error: `El certificado está a nombre del ${etiqueta} ${titular.numero}, que no corresponde al CNPJ de tu negocio (${documento.numero}). Sube el e-CNPJ de tu negocio.` }, 422);
    }

    const config = railConfig('nfe');
    const nombre = (p12 instanceof File ? p12.name : crt instanceof File ? crt.name : '') || null;
    await guardarCredencial(orgId, 'nfe', config.entorno, parsed, { identificador: titular.numero, nombreArchivo: nombre, subidoPor: currentUserId() });
    await logAudit(orgId, {
        accion: 'nfe_cert.cargado', entidad: 'org', entidad_id: orgId,
        detalle: `Certificado ICP-Brasil de la NF-e (${config.entorno}) cargado: ${nombre ?? 'sin nombre'}, CNPJ ${titular.numero}, vence ${parsed.caduca.toISOString().slice(0, 10)}`,
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

    const actuales = await leerAjustes<AjustesNfe>(orgId, 'nfe');
    const cambio = aplicarCambio(actuales, body);
    if (!cambio.ok) return json({ error: cambio.error }, 400);
    const nuevos = cambio.ajustes;
    // Cambiar de serie o de establecimiento con notas sin confirmar dejaría su
    // consulta apuntando a otra numeración: primero se resuelven.
    const cambiaSecuencia = nuevos.serie !== actuales.serie || nuevos.municipio !== actuales.municipio;
    if (cambiaSecuencia) {
        const [[p]] = await withOrgTx(orgId, sql`
            select count(*)::int as n from fiscal_rail_comprobantes
             where org_id = ${orgId} and rail = 'nfe' and estado in ('pendiente', 'incierto')`);
        if (Number(p?.n || 0) > 0) {
            return json({ error: 'Hay NF-e esperando la confirmación de la SEFAZ. Podrás cambiar la serie o el municipio cuando se confirmen (normalmente en minutos).' }, 409);
        }
    }
    await guardarAjustes(orgId, 'nfe', nuevos as Record<string, unknown>);
    await logAudit(orgId, {
        accion: 'nfe_ajustes.actualizado', entidad: 'org', entidad_id: orgId,
        detalle: `Ajustes de la NF-e: serie ${nuevos.serie ?? '—'}, régimen ${nuevos.crt ?? '—'}, IE ${nuevos.ie ?? '—'}, municipio ${nuevos.municipio ?? '—'}`,
        ip: reqIp(request),
    });
    const aviso = faltantesAjustes(nuevos).length ? null : await probar(orgId);
    return json({ ok: true, ...(await vista(orgId)), ...(aviso ? { aviso } : {}) });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    const orgId = await getActiveOrgId();
    const config = railConfig('nfe');
    if (!(await resumenCredencial(orgId, 'nfe', config.entorno))) {
        return json({ error: 'La NF-e no tiene un certificado propio: usa el de la NFS-e. Para quitarlo, desconéctalo en la sección de la NFS-e.' }, 409);
    }
    // Una nota, un evento o una inutilização sin respuesta solo se resuelven
    // consultando a la SEFAZ con este certificado: sin él, una NF-e podría
    // quedar autorizada sin que Cord lo sepa.
    const [[p]] = await withOrgTx(orgId, sql`
        select (select count(*) from fiscal_rail_comprobantes
                 where org_id = ${orgId} and rail = 'nfe' and entorno = ${config.entorno} and estado in ('pendiente', 'incierto'))
             + (select count(*) from nfe_eventos
                 where org_id = ${orgId} and entorno = ${config.entorno} and estado in ('pendiente', 'incierto'))
             + (select count(*) from nfe_inutilizacoes
                 where org_id = ${orgId} and entorno = ${config.entorno} and estado in ('pendiente', 'incierta')) as n`);
    if (Number(p?.n || 0) > 0) {
        return json({ error: 'Hay operaciones de NF-e esperando la confirmación de la SEFAZ. Podrás desconectar el certificado cuando se confirmen (normalmente en minutos).' }, 409);
    }
    await eliminarCredencial(orgId, 'nfe', config.entorno);
    await logAudit(orgId, { accion: 'nfe_cert.eliminado', entidad: 'org', entidad_id: orgId, detalle: `Certificado ICP-Brasil de la NF-e (${config.entorno}) desconectado`, ip: reqIp(request) });
    return json({ ok: true, ...(await vista(orgId)) });
};
