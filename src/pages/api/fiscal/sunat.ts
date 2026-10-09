// /api/fiscal/sunat — Factura electrónica con SUNAT (Perú, SEE - Del contribuyente).
//   GET                                                       → estado (sin secretos)
//   POST   multipart { crt:File, key:File, key_password?,
//                      usuario_sol?, clave_sol? }             → sube o reemplaza el certificado digital
//          multipart { p12:File, password, usuario_sol?, clave_sol? }   (alternativa: PKCS#12)
//   PATCH  { serie, ultimo_numero_factura, ultimo_numero_nota_credito, establecimiento,
//            nombre_comercial, concepto, afectacion_sin_igv, regimen_mype, detracciones,
//            agente_percepcion, excluido_retenciones, agentes_retencion }   → ajustes del riel
//          { usuario_sol, clave_sol }                          → usuario SOL secundario (step-up)
//   DELETE                                                    → desconecta el certificado del ambiente vigente
//
// El certificado, su llave y la clave SOL se cifran con encryptRequiredSecret()
// y nunca vuelven al navegador. Subirlos NO enciende nada por sí solo: el riel
// está listo cuando el despliegue tiene SUNAT activo, la cuenta tiene un
// certificado vigente a nombre de SU RUC, el usuario SOL (en producción) y los
// ajustes completos (latam/sunat/estado.ts). Mientras tanto las facturas
// siguen como documento comercial (regla 15).
export const prerender = false;

import type { APIRoute } from 'astro';
import { X509Certificate } from 'node:crypto';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { requireEncryption } from '../../../lib/crypto-secret';
import { requireFreshAuth } from '../../../lib/step-up';
import { requireEntitlement } from '../../../lib/org-entitlements';
import { currentUserId } from '../../../lib/context';
import { log } from '../../../lib/log';
import { railConfig } from '../../../lib/fiscal/latam/config';
import { parsearCertificado, type CertificadoParseado } from '../../../lib/fiscal/latam/certificado';
import { credencialActiva, eliminarCredencial, guardarAjustes, guardarCredencial, leerAjustes, marcarVerificacion } from '../../../lib/fiscal/latam/credenciales';
import { esErrorSeguro } from '../../../lib/fiscal/latam/errores';
import { contextoSunat, faltantesAjustes, type AjustesSunat } from '../../../lib/fiscal/latam/sunat/autorizacion';
import { rucValido, serieValida } from '../../../lib/fiscal/latam/sunat/comprobante';
import { AFECTACION } from '../../../lib/fiscal/latam/sunat/constantes';
import { emisorSunat, estadoSunat } from '../../../lib/fiscal/latam/sunat/estado';
import { llamar, parsearConsulta, sobreConsulta, SunatFaultError } from '../../../lib/fiscal/latam/sunat/servicio';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function exigirPeru(orgId: string): Promise<Response | null> {
    // Sin SUNAT activo en el despliegue nada consume lo que se guardaría aquí
    // (regla 15): la pantalla dice "Próximamente" y el endpoint, lo mismo.
    if (!railConfig('sunat').habilitado) {
        return json({ error: 'La factura electrónica con SUNAT todavía no está disponible en Cord. Te avisaremos cuando puedas conectarla.' }, 409);
    }
    const [[org]] = await withOrgTx(orgId, sql`select country_code from orgs where id = ${orgId}`);
    if (String(org?.country_code || '').toUpperCase() !== 'PE') {
        return json({ error: 'La factura electrónica con SUNAT es una capacidad de Perú. Esta cuenta no está configurada con ese país.' }, 409);
    }
    return null;
}

/** Vista pública del estado: lo que la pantalla necesita, nunca un PEM ni la clave SOL. */
async function vista(orgId: string) {
    const e = await estadoSunat(orgId);
    return {
        habilitado: e.habilitado,
        entorno: e.entorno,
        listo: e.listo,
        faltantes: e.faltantes,
        ajustes: e.ajustes,
        usuario_sol: e.usuarioSol,
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
 * En producción, el usuario SOL se prueba de verdad con una consulta sin
 * efectos (billConsultService/getStatus de un número que no existe). El
 * servicio beta acepta cualquier usuario, así que ahí no hay nada que probar.
 * Devuelve un aviso apto para el usuario o null.
 */
async function probarConSunat(orgId: string): Promise<string | null> {
    const config = railConfig('sunat');
    if (!config.habilitado || config.entorno !== 'produccion') return null;
    try {
        const ctx = await contextoSunat(orgId, config.entorno, await emisorSunat(orgId));
        const r = await parsearConsulta(await llamar(config.entorno, 'getStatus',
            sobreConsulta('getStatus', ctx.sol, { ruc: ctx.ruc, tipo: '01', serie: ctx.ajustes.serie, numero: 99_999_999 })), 'getStatus');
        log.info('sunat: credencial probada', { route: 'api/fiscal/sunat', orgId, codigo: r.codigo });
        await marcarVerificacion(orgId, 'sunat', config.entorno, null);
        return null;
    } catch (error) {
        if (esErrorSeguro(error)) return error.message;
        const aviso = error instanceof SunatFaultError
            ? `SUNAT no aceptó el usuario SOL${error.codigo !== null ? ` (código ${error.codigo})` : ''}. Revisa que sea un usuario secundario con el perfil de envío de comprobantes y su clave.`
            : 'No pudimos comprobar la conexión con SUNAT en este momento. Reintenta en unos minutos.';
        if (error instanceof SunatFaultError) await marcarVerificacion(orgId, 'sunat', config.entorno, aviso).catch(() => {});
        else log.error('sunat: no se pudo probar la credencial', { route: 'api/fiscal/sunat', orgId, err: error });
        return aviso;
    }
}

/** Usuario SOL del formulario: el usuario sin el RUC delante (lo agrega el envío). */
function leerSol(usuario: unknown, clave: unknown, ruc: string): { usuarioSol: string; claveSol: string } | null | 'invalido' {
    const u = String(usuario ?? '').trim().toUpperCase().replace(new RegExp(`^${ruc}`), '');
    const c = String(clave ?? '');
    if (!u && !c) return null;
    if (!/^[A-Z0-9]{3,20}$/.test(u) || !c || c.length > 100) return 'invalido';
    return { usuarioSol: u, claveSol: c };
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
    const subscriptionDenied = await requireEntitlement(orgId, 'cfdi'); if (subscriptionDenied) return subscriptionDenied;
    const notPe = await exigirPeru(orgId); if (notPe) return notPe;

    const { ruc } = await emisorSunat(orgId);
    if (!ruc) return json({ error: 'Completa primero el RUC de tu negocio en Ajustes › Datos fiscales.' }, 409);

    let form: FormData;
    try { form = await request.formData(); } catch { return json({ error: 'Envía el certificado como multipart/form-data.' }, 400); }
    const crt = form.get('crt');
    const key = form.get('key');
    const p12 = form.get('p12');
    const bytes = async (f: FormDataEntryValue | null) => (f instanceof File ? new Uint8Array(await f.arrayBuffer()) : null);

    let parsed: CertificadoParseado;
    try {
        parsed = p12 instanceof File
            ? parsearCertificado({ pkcs12: await bytes(p12), pkcs12Password: String(form.get('password') ?? '') })
            : parsearCertificado({ certificado: await bytes(crt), llave: await bytes(key), llavePassword: String(form.get('key_password') ?? '') });
    } catch (error) {
        if (esErrorSeguro(error)) return json({ error: error.message }, 422);
        log.error('sunat: no se pudo leer el certificado', { route: 'api/fiscal/sunat', orgId, err: error });
        return json({ error: 'No se pudo procesar el certificado.' }, 422);
    }

    // El certificado debe identificar al titular y el RUC de la empresa
    // (manual del programador §3.1: el RUC va en el sujeto, campo OU).
    let sujeto = '';
    try { sujeto = new X509Certificate(parsed.certPem).subject; } catch { sujeto = ''; }
    if (!sujeto.includes(ruc)) {
        return json({ error: `El certificado no menciona el RUC de tu negocio (${ruc}). Sube el certificado digital emitido para tu RUC.` }, 422);
    }

    const config = railConfig('sunat');
    const sol = leerSol(form.get('usuario_sol'), form.get('clave_sol'), ruc);
    if (sol === 'invalido') return json({ error: 'El usuario SOL debe tener entre 3 y 20 letras o números, con su clave.' }, 400);
    // Sin usuario nuevo se conserva el que ya estaba guardado.
    const previo = sol ?? (await credencialActiva(orgId, 'sunat', config.entorno))?.secretos ?? null;
    const nombre = (p12 instanceof File ? p12.name : crt instanceof File ? crt.name : '') || null;
    await guardarCredencial(orgId, 'sunat', config.entorno, parsed, {
        identificador: ruc, nombreArchivo: nombre, subidoPor: currentUserId(),
        secretos: previo && previo.usuarioSol ? { usuarioSol: String(previo.usuarioSol), claveSol: String(previo.claveSol ?? '') } : null,
    });
    await logAudit(orgId, {
        accion: 'sunat_cert.cargado', entidad: 'org', entidad_id: orgId,
        detalle: `Certificado digital para SUNAT (${config.entorno}) cargado: ${nombre ?? 'sin nombre'}, RUC ${ruc}, vence ${parsed.caduca.toISOString().slice(0, 10)}`,
        ip: reqIp(request),
    });
    const aviso = await probarConSunat(orgId);
    return json({ ok: true, ...(await vista(orgId)), ...(aviso ? { aviso } : {}) });
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const notPe = await exigirPeru(orgId); if (notPe) return notPe;
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    // Usuario SOL: es una credencial, se cambia con step-up como el certificado.
    if (body.usuario_sol !== undefined || body.clave_sol !== undefined) {
        const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
        try { requireEncryption(); } catch { return json({ error: 'El cifrado de secretos no está configurado.' }, 503); }
        const { ruc } = await emisorSunat(orgId);
        if (!ruc) return json({ error: 'Completa primero el RUC de tu negocio en Ajustes › Datos fiscales.' }, 409);
        const sol = leerSol(body.usuario_sol, body.clave_sol, ruc);
        if (!sol || sol === 'invalido') return json({ error: 'Escribe el usuario SOL secundario (3 a 20 letras o números) y su clave.' }, 400);
        const config = railConfig('sunat');
        const actual = await credencialActiva(orgId, 'sunat', config.entorno);
        if (!actual) return json({ error: 'Sube primero el certificado digital: el usuario SOL se guarda junto a él.' }, 409);
        let parsed: CertificadoParseado;
        try { parsed = parsearCertificado({ certificado: actual.certPem, llave: actual.keyPem }); } catch {
            return json({ error: 'El certificado guardado ya no es válido. Súbelo de nuevo junto al usuario SOL.' }, 409);
        }
        await guardarCredencial(orgId, 'sunat', config.entorno, parsed, {
            identificador: actual.identificador, nombreArchivo: actual.nombreArchivo, subidoPor: currentUserId(), secretos: sol,
        });
        await logAudit(orgId, { accion: 'sunat_sol.actualizado', entidad: 'org', entidad_id: orgId, detalle: `Usuario SOL para SUNAT (${config.entorno}) actualizado: ${sol.usuarioSol}`, ip: reqIp(request) });
        const aviso = await probarConSunat(orgId);
        return json({ ok: true, ...(await vista(orgId)), ...(aviso ? { aviso } : {}) });
    }

    const actuales = await leerAjustes<AjustesSunat>(orgId, 'sunat');
    const nuevos: AjustesSunat = { ...actuales };
    if (body.serie !== undefined) {
        const serie = serieValida(body.serie);
        if (!serie) return json({ error: 'La serie debe tener cuatro caracteres y empezar con F (por ejemplo, F001).' }, 400);
        nuevos.serie = serie;
    }
    for (const [campo, clave] of [['ultimo_numero_factura', 'ultimoNumeroFactura'], ['ultimo_numero_nota_credito', 'ultimoNumeroNotaCredito']] as const) {
        if (body[campo] === undefined) continue;
        const n = body[campo] === '' || body[campo] === null ? 0 : Number(body[campo]);
        if (!Number.isInteger(n) || n < 0 || n > 99_999_998) return json({ error: 'El último número emitido debe ser un número entero entre 0 y 99999998.' }, 400);
        if (n) nuevos[clave] = n; else delete nuevos[clave];
    }
    if (body.establecimiento !== undefined) {
        const e = String(body.establecimiento ?? '').trim();
        if (e && !/^\d{4}$/.test(e)) return json({ error: 'El código de establecimiento tiene cuatro dígitos (0000 para el domicilio fiscal).' }, 400);
        if (e) nuevos.establecimiento = e; else delete nuevos.establecimiento;
    }
    if (body.nombre_comercial !== undefined) {
        const n = String(body.nombre_comercial ?? '').trim().slice(0, 200);
        if (n) nuevos.nombreComercial = n; else delete nuevos.nombreComercial;
    }
    if (body.concepto !== undefined) {
        if (body.concepto !== 'bienes' && body.concepto !== 'servicios') return json({ error: 'Indica si vendes bienes o servicios.' }, 400);
        nuevos.concepto = body.concepto;
    }
    if (body.afectacion_sin_igv !== undefined) {
        const a = String(body.afectacion_sin_igv ?? '');
        if (a && a !== AFECTACION.EXONERADO && a !== AFECTACION.INAFECTO) return json({ error: 'Los conceptos sin IGV son exonerados o inafectos.' }, 400);
        if (a) nuevos.afectacionSinIgv = a as AjustesSunat['afectacionSinIgv']; else delete nuevos.afectacionSinIgv;
    }
    for (const [campo, clave] of [['regimen_mype', 'regimenMype'], ['detracciones', 'detracciones'], ['agente_percepcion', 'agentePercepcion'], ['excluido_retenciones', 'excluidoRetenciones']] as const) {
        if (body[campo] === undefined) continue;
        if (body[campo] === true) nuevos[clave] = true; else delete nuevos[clave];
    }
    if (body.agentes_retencion !== undefined) {
        const crudo = Array.isArray(body.agentes_retencion) ? body.agentes_retencion.join(' ') : String(body.agentes_retencion ?? '');
        const rucs = crudo.split(/[\s,;]+/).map((r) => r.trim()).filter(Boolean);
        const invalidos = rucs.filter((r) => !rucValido(r));
        if (invalidos.length) return json({ error: `Estos RUC no son válidos: ${invalidos.slice(0, 5).join(', ')}.` }, 400);
        if (rucs.length > 500) return json({ error: 'La lista admite hasta 500 RUC.' }, 400);
        const unicos = [...new Set(rucs.map((r) => rucValido(r)!))];
        if (unicos.length) nuevos.agentesRetencion = unicos; else delete nuevos.agentesRetencion;
    }
    await guardarAjustes(orgId, 'sunat', nuevos as Record<string, unknown>);
    await logAudit(orgId, {
        accion: 'sunat_ajustes.actualizado', entidad: 'org', entidad_id: orgId,
        detalle: `Ajustes de SUNAT: serie ${nuevos.serie ?? '—'}, ${nuevos.concepto ?? '—'}, sin IGV ${nuevos.afectacionSinIgv ?? '—'}`,
        ip: reqIp(request),
    });
    const aviso = faltantesAjustes(nuevos).length ? null : await probarConSunat(orgId);
    return json({ ok: true, ...(await vista(orgId)), ...(aviso ? { aviso } : {}) });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    const orgId = await getActiveOrgId();
    const config = railConfig('sunat');
    // Un envío sin respuesta solo se resuelve consultando a SUNAT con esta
    // credencial: sin ella, una factura podría quedar aceptada sin que Cord lo sepa.
    const [[p]] = await withOrgTx(orgId, sql`
        select count(*)::int as n from fiscal_rail_comprobantes
         where org_id = ${orgId} and rail = 'sunat' and entorno = ${config.entorno} and estado in ('pendiente', 'incierto')`);
    if (Number(p?.n || 0) > 0) {
        return json({ error: 'Hay facturas esperando la confirmación de SUNAT. Podrás desconectar el certificado cuando se confirmen (normalmente en minutos).' }, 409);
    }
    await eliminarCredencial(orgId, 'sunat', config.entorno);
    await logAudit(orgId, { accion: 'sunat_cert.eliminado', entidad: 'org', entidad_id: orgId, detalle: `Certificado digital para SUNAT (${config.entorno}) desconectado`, ip: reqIp(request) });
    return json({ ok: true, ...(await vista(orgId)) });
};
