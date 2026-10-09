// /api/fiscal/dian — Factura electrónica con la DIAN (Colombia).
//   GET                                                         → estado (sin secretos)
//   POST   multipart { p12:File, password, cadena?:File,
//                      pin?, clave_tecnica? }                      → sube o reemplaza el certificado de firma
//          multipart { crt:File, key:File, key_password?, cadena?:File, pin?, clave_tecnica? }
//   POST   JSON { accion: 'set_pruebas', facturas, notas_credito, notas_debito }
//                                                               → envía el set de pruebas (solo habilitación)
//   POST   JSON { accion: 'estado_set' }                        → cómo va el último set enviado
//   POST   JSON { accion: 'rangos' }                            → rangos de numeración que informa la DIAN (producción)
//   PATCH  { tipo_persona, responsabilidades, tributo, municipio, nombre_comercial, matricula_mercantil,
//            correo, software_id, resolucion: { numero, prefijo, desde, hasta, vigente_desde, vigente_hasta },
//            prefijo_notas, tratamiento_sin_iva, test_set_id, pin, clave_tecnica }
//                                                               → ajustes del riel (y secretos del entorno)
//   DELETE                                                      → desconecta el certificado del ambiente vigente
//
// El certificado, su llave, el PIN del software y la clave técnica se cifran
// con encryptRequiredSecret() y nunca vuelven al navegador. Guardar algo aquí
// NO enciende nada por sí solo: el riel está listo cuando el despliegue tiene
// la DIAN activa y la cuenta completó todo (latam/dian/estado.ts). Mientras
// tanto las facturas siguen como documento comercial (regla 15).
export const prerender = false;

import type { APIRoute } from 'astro';
import forge from 'node-forge';
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
import {
    contextoDian, enviarSetDePruebasOrg, estadoSetDePruebasOrg, guardarClaves, rangosAutorizados, SOFTWARE_ID, type AjustesDian,
} from '../../../lib/fiscal/latam/dian/autorizacion';
import { cadenaDesde, certificadosDeArchivo, certificadosDePkcs12, problemaDeUso } from '../../../lib/fiscal/latam/dian/cadena';
import { faltantesResolucion, nitValido, prefijoNotaValido, type ResolucionDian } from '../../../lib/fiscal/latam/dian/comprobante';
import { RESPONSABILIDADES, TIPO_PERSONA, TRIBUTOS_PARTE } from '../../../lib/fiscal/latam/dian/constantes';
import { cantidadesValidas, type EnvioDePrueba } from '../../../lib/fiscal/latam/dian/habilitacion';
import { MUNICIPIOS } from '../../../lib/fiscal/latam/dian/municipios';
import { estadoDian, identidadDeOrg } from '../../../lib/fiscal/latam/dian/estado';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function exigirColombia(orgId: string): Promise<Response | null> {
    // Sin la DIAN activa en el despliegue nada consume lo que se guardaría aquí
    // (regla 15): la pantalla dice "Próximamente" y el endpoint, lo mismo.
    if (!railConfig('dian').habilitado) {
        return json({ error: 'La factura electrónica con la DIAN todavía no está disponible en Cord. Te avisaremos cuando puedas conectarla.' }, 409);
    }
    const [[org]] = await withOrgTx(orgId, sql`select country_code from orgs where id = ${orgId}`);
    if (String(org?.country_code || '').toUpperCase() !== 'CO') {
        return json({ error: 'La factura electrónica con la DIAN es una capacidad de Colombia. Esta cuenta no está configurada con ese país.' }, 409);
    }
    return null;
}

type SetGuardado = { at: string; envios: EnvioDePrueba[] };

/** Vista del estado: lo que la pantalla necesita, nunca un PEM ni un secreto. */
async function vista(orgId: string) {
    const e = await estadoDian(orgId);
    const set = (e.ajustes as { setPruebas?: SetGuardado }).setPruebas;
    const { setPruebas: _omit, ...ajustes } = e.ajustes as Record<string, unknown>;
    return {
        habilitado: e.habilitado,
        entorno: e.entorno,
        listo: e.listo,
        faltantes: e.faltantes,
        nit: e.nit ? `${e.nit}-${e.dv}` : null,
        ajustes,
        secretos: e.secretos,
        numeracion: e.numeracion,
        set_pruebas: set ? { at: set.at, documentos: set.envios.length } : null,
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
 * ¿El certificado es del NIT del negocio? Las entidades certificadoras
 * colombianas lo ponen en el sujeto (serialNumber u otro atributo) o en los
 * nombres alternativos. Si aparece un NIT distinto se rechaza (la DIAN
 * rechazaría cada documento por la regla ZE03); si no aparece ninguno, no se
 * adivina y la DIAN lo dirá al primer envío.
 */
function nitDelCertificado(pem: string, nit: string): 'coincide' | 'otro' | 'desconocido' {
    const c = forge.pki.certificateFromPem(pem);
    const valores: string[] = c.subject.attributes.map((a) => String(a.value ?? ''));
    const san = c.getExtension('subjectAltName') as { altNames?: { value?: unknown }[] } | null;
    for (const n of san?.altNames ?? []) valores.push(String(n.value ?? ''));
    const numeros = valores.flatMap((v) => v.replace(/[.\s]/g, '').match(/\d{6,15}/g) ?? []);
    if (numeros.some((n) => n === nit || n.startsWith(nit) && n.length === nit.length + 1)) return 'coincide';
    const serial = c.subject.getField({ type: '2.5.4.5' });
    if (serial && /^\d{6,15}(-\d)?$/.test(String(serial.value ?? '').replace(/[.\s]/g, ''))) return 'otro';
    return 'desconocido';
}

const secreto = (v: unknown) => (v === undefined || v === null ? undefined : String(v).trim());

function validarSecretos(pin: string | undefined, clave: string | undefined): string | null {
    if (pin !== undefined && pin !== '' && !/^\d{5}$/.test(pin)) return 'El PIN del software son los 5 dígitos que definiste al registrarlo en la DIAN.';
    if (clave !== undefined && clave !== '' && !/^[0-9a-zA-Z]{8,128}$/.test(clave)) return 'La clave técnica no es válida: cópiala tal como aparece en la DIAN para tu rango de numeración.';
    return null;
}

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    return json(await vista(orgId));
};

async function accion(orgId: string, body: Record<string, unknown>, request: Request): Promise<Response> {
    const config = railConfig('dian');
    let ctx;
    try {
        ctx = await contextoDian(orgId, config.entorno, await identidadDeOrg(orgId));
    } catch (error) {
        if (esErrorSeguro(error)) return json({ error: error.message }, 409);
        throw error;
    }
    try {
        if (body.accion === 'set_pruebas') {
            if (config.entorno !== 'homologacion') return json({ error: 'El set de pruebas solo se envía en el ambiente de habilitación de la DIAN.' }, 409);
            const testSetId = String(ctx.ajustes.testSetId ?? '');
            if (!testSetId) return json({ error: 'Guarda primero el identificador del set de pruebas (TestSetId).' }, 409);
            const cantidades = cantidadesValidas({ facturas: body.facturas as number, notasCredito: body.notas_credito as number, notasDebito: body.notas_debito as number });
            const envios = await enviarSetDePruebasOrg(ctx, cantidades, testSetId);
            const actuales = await leerAjustes<AjustesDian & { setPruebas?: SetGuardado }>(orgId, 'dian');
            await guardarAjustes(orgId, 'dian', { ...actuales, setPruebas: { at: new Date().toISOString(), envios } });
            await logAudit(orgId, {
                accion: 'dian_set_pruebas.enviado', entidad: 'org', entidad_id: orgId,
                detalle: `Set de pruebas de la DIAN: ${cantidades.facturas} facturas, ${cantidades.notasCredito} notas crédito, ${cantidades.notasDebito} notas débito`,
                ip: reqIp(request),
            });
            return json({ ok: true, envios: envios.map((e) => ({ id: e.id, clase: e.clase, recibido: !!e.zipKey && !e.error })) });
        }
        if (body.accion === 'estado_set') {
            const set = (await leerAjustes<{ setPruebas?: SetGuardado }>(orgId, 'dian')).setPruebas;
            if (!set?.envios?.length) return json({ error: 'Todavía no se envió ningún set de pruebas.' }, 409);
            const estados = await estadoSetDePruebasOrg(ctx, set.envios);
            return json({
                ok: true,
                at: set.at,
                documentos: estados.map((e) => ({ id: e.id, clase: e.clase, aceptado: e.aceptado, mensaje: e.mensaje })),
            });
        }
        if (body.accion === 'rangos') {
            if (config.entorno !== 'produccion') return json({ error: 'En habilitación el rango es el del set de pruebas: cópialo del portal de la DIAN.' }, 409);
            const rangos = await rangosAutorizados(ctx);
            // La clave técnica es secreta: se guarda cifrada si el rango coincide con la resolución configurada, nunca se devuelve.
            const propio = rangos.find((r) => r.prefijo === ctx.resolucion.prefijo && r.desde === ctx.resolucion.desde && r.hasta === ctx.resolucion.hasta);
            if (propio?.claveTecnica) await guardarClaves(orgId, config.entorno, { claveTecnica: propio.claveTecnica });
            return json({
                ok: true,
                clave_tecnica_guardada: !!propio?.claveTecnica,
                rangos: rangos.map((r) => ({
                    resolucion: r.resolucion, fecha: r.fechaResolucion, prefijo: r.prefijo, desde: r.desde, hasta: r.hasta,
                    vigente_desde: r.vigenteDesde, vigente_hasta: r.vigenteHasta,
                })),
            });
        }
        return json({ error: 'Acción desconocida.' }, 400);
    } catch (error) {
        if (esErrorSeguro(error)) return json({ error: error.message }, 422);
        log.error('dian: falló una acción de ajustes', { route: 'api/fiscal/dian', orgId, accion: body.accion, err: error });
        return json({ error: 'No pudimos completar la operación con la DIAN en este momento. Reintenta en unos minutos.' }, 502);
    }
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    try { requireEncryption(); } catch { return json({ error: 'El cifrado de secretos no está configurado.' }, 503); }
    const orgId = await getActiveOrgId();
    // Mismo gate que la emisión fiscal integrada (csd.ts, verifactu-cert.ts, arca.ts).
    const subscriptionDenied = await requireEntitlement(orgId, 'cfdi'); if (subscriptionDenied) return subscriptionDenied;
    const notCo = await exigirColombia(orgId); if (notCo) return notCo;

    if ((request.headers.get('content-type') || '').includes('application/json')) {
        let body: Record<string, unknown>;
        try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
        return accion(orgId, body, request);
    }

    const identidad = await identidadDeOrg(orgId);
    const nit = nitValido(identidad.taxId);
    if (!nit) return json({ error: 'Completa primero el NIT de tu negocio (con su dígito de verificación) en Ajustes › Datos fiscales.' }, 409);

    let form: FormData;
    try { form = await request.formData(); } catch { return json({ error: 'Envía el certificado como multipart/form-data.' }, 400); }
    const bytes = async (f: FormDataEntryValue | null) => (f instanceof File ? new Uint8Array(await f.arrayBuffer()) : null);
    const p12 = form.get('p12');
    const crt = form.get('crt');
    const key = form.get('key');
    const cadenaArchivo = form.get('cadena');
    const pin = secreto(form.get('pin'));
    const claveTecnica = secreto(form.get('clave_tecnica'));
    const malSecreto = validarSecretos(pin, claveTecnica);
    if (malSecreto) return json({ error: malSecreto }, 400);

    let parsed;
    let cadena: string[];
    try {
        const p12Bytes = await bytes(p12);
        parsed = p12Bytes
            ? parsearCertificado({ pkcs12: p12Bytes, pkcs12Password: String(form.get('password') ?? '') })
            : parsearCertificado({ certificado: await bytes(crt), llave: await bytes(key), llavePassword: String(form.get('key_password') ?? '') });
        const candidatos = [
            ...(p12Bytes ? certificadosDePkcs12(p12Bytes, String(form.get('password') ?? '')) : []),
            ...(crt instanceof File ? certificadosDeArchivo(new Uint8Array(await crt.arrayBuffer())) : []),
            ...(cadenaArchivo instanceof File ? certificadosDeArchivo(new Uint8Array(await cadenaArchivo.arrayBuffer())) : []),
        ];
        cadena = cadenaDesde(parsed.certPem, candidatos);
    } catch (error) {
        if (esErrorSeguro(error)) return json({ error: error.message }, 422);
        log.error('dian: no se pudo leer el certificado', { route: 'api/fiscal/dian', orgId, err: error });
        return json({ error: 'No se pudo procesar el certificado.' }, 422);
    }
    const uso = problemaDeUso(cadena[0]);
    if (uso) return json({ error: uso }, 422);
    if (nitDelCertificado(cadena[0], nit.nit) === 'otro') {
        return json({ error: `El certificado no está a nombre del NIT de tu negocio (${nit.nit}-${nit.dv}). Sube el certificado de firma de tu empresa.` }, 422);
    }

    const config = railConfig('dian');
    // El PIN y la clave técnica viven con la credencial del entorno: al
    // reemplazar el certificado se conservan los que ya había.
    const previa = await credencialActiva(orgId, 'dian', config.entorno).catch(() => null);
    const secretos: Record<string, string> = { ...(previa?.secretos ?? {}) };
    if (pin) secretos.pin = pin;
    if (claveTecnica) secretos.claveTecnica = claveTecnica;
    const nombre = (p12 instanceof File ? p12.name : crt instanceof File ? crt.name : '') || null;
    await guardarCredencial(orgId, 'dian', config.entorno, { ...parsed, certPem: cadena.join('\n') }, {
        identificador: nit.nit, nombreArchivo: nombre, subidoPor: currentUserId(), secretos,
    });
    await logAudit(orgId, {
        accion: 'dian_cert.cargado', entidad: 'org', entidad_id: orgId,
        detalle: `Certificado de firma para la DIAN (${config.entorno}) cargado: ${nombre ?? 'sin nombre'}, NIT ${nit.nit}, cadena de ${cadena.length}, vence ${parsed.caduca.toISOString().slice(0, 10)}`,
        ip: reqIp(request),
    });
    return json({ ok: true, ...(await vista(orgId)) });
};

function resolucionDe(v: unknown): ResolucionDian | null | 'invalida' {
    if (v === null) return null;
    if (!v || typeof v !== 'object') return 'invalida';
    const r = v as Record<string, unknown>;
    const res: ResolucionDian = {
        numero: String(r.numero ?? '').trim(),
        prefijo: String(r.prefijo ?? '').trim().toUpperCase(),
        desde: Number(r.desde),
        hasta: Number(r.hasta),
        vigenteDesde: String(r.vigente_desde ?? '').trim(),
        vigenteHasta: String(r.vigente_hasta ?? '').trim(),
    };
    return faltantesResolucion(res).length ? 'invalida' : res;
}

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const notCo = await exigirColombia(orgId); if (notCo) return notCo;
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const config = railConfig('dian');

    const actuales = await leerAjustes<AjustesDian>(orgId, 'dian');
    const nuevos: AjustesDian & Record<string, unknown> = { ...actuales };
    const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
    const opcional = (k: keyof AjustesDian, v: unknown, max: number) => {
        const t = texto(v, max);
        if (t) (nuevos as Record<string, unknown>)[k] = t; else delete nuevos[k];
    };

    if (body.tipo_persona !== undefined) {
        if (body.tipo_persona !== TIPO_PERSONA.juridica && body.tipo_persona !== TIPO_PERSONA.natural) return json({ error: 'Indica si tu negocio es persona jurídica o natural.' }, 400);
        nuevos.tipoPersona = body.tipo_persona;
    }
    if (body.responsabilidades !== undefined) {
        const lista = Array.isArray(body.responsabilidades) ? body.responsabilidades.map(String) : [];
        if (!lista.length || lista.some((r) => !RESPONSABILIDADES.some((x) => x.id === r))) return json({ error: 'Elige al menos una responsabilidad fiscal de tu RUT.' }, 400);
        nuevos.responsabilidades = [...new Set(lista)];
    }
    if (body.tributo !== undefined) {
        if (!TRIBUTOS_PARTE.some((t) => t.id === body.tributo)) return json({ error: 'Indica tu responsabilidad frente al IVA.' }, 400);
        nuevos.tributo = String(body.tributo);
    }
    if (body.municipio !== undefined) {
        const m = String(body.municipio ?? '').trim();
        if (!MUNICIPIOS[m]) return json({ error: 'Elige el municipio de tu domicilio fiscal.' }, 400);
        nuevos.municipio = m;
    }
    if (body.nombre_comercial !== undefined) opcional('nombreComercial', body.nombre_comercial, 450);
    if (body.matricula_mercantil !== undefined) opcional('matriculaMercantil', body.matricula_mercantil, 40);
    if (body.correo !== undefined) {
        const c = texto(body.correo, 200);
        if (c && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return json({ error: 'El correo de recepción no es válido.' }, 400);
        opcional('correo', c, 200);
    }
    if (body.software_id !== undefined) {
        const s = texto(body.software_id, 64);
        if (s && !SOFTWARE_ID.test(s)) return json({ error: 'El identificador del software es el código que te asignó la DIAN al registrarlo (formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).' }, 400);
        opcional('softwareId', s.toLowerCase(), 64);
    }
    if (body.resolucion !== undefined) {
        const r = resolucionDe(body.resolucion);
        if (r === 'invalida') return json({ error: 'Revisa la resolución: número, prefijo (hasta 4 letras o números), rango (desde ≤ hasta) y vigencia.' }, 400);
        const numeracion = { ...(nuevos.numeracion ?? {}) };
        if (r) numeracion[config.entorno] = r; else delete numeracion[config.entorno];
        nuevos.numeracion = numeracion;
    }
    if (body.prefijo_notas !== undefined) {
        const p = texto(body.prefijo_notas, 4).toUpperCase();
        if (p && !prefijoNotaValido(p)) return json({ error: 'El prefijo de las notas lleva de 1 a 4 letras o números.' }, 400);
        opcional('prefijoNotas', p, 4);
    }
    if (body.tratamiento_sin_iva !== undefined) {
        if (body.tratamiento_sin_iva === null || body.tratamiento_sin_iva === '') delete nuevos.tratamientoSinIva;
        else if (body.tratamiento_sin_iva === 'exento' || body.tratamiento_sin_iva === 'excluido') nuevos.tratamientoSinIva = body.tratamiento_sin_iva;
        else return json({ error: 'Indica si tus ventas al 0 % son exentas o excluidas de IVA.' }, 400);
    }
    if (body.test_set_id !== undefined) {
        const t = texto(body.test_set_id, 64);
        if (t && !/^[0-9a-fA-F-]{36}$/.test(t)) return json({ error: 'El TestSetId es el código del set de pruebas que muestra el portal de habilitación de la DIAN.' }, 400);
        opcional('testSetId', t.toLowerCase(), 64);
    }

    // Secretos del entorno (PIN y clave técnica): cifrados con la credencial y con step-up.
    const pin = secreto(body.pin);
    const claveTecnica = secreto(body.clave_tecnica);
    if (pin !== undefined || claveTecnica !== undefined) {
        const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
        try { requireEncryption(); } catch { return json({ error: 'El cifrado de secretos no está configurado.' }, 503); }
        const mal = validarSecretos(pin, claveTecnica);
        if (mal) return json({ error: mal }, 400);
        if (!await guardarClaves(orgId, config.entorno, { pin, claveTecnica })) {
            return json({ error: 'Sube primero el certificado de firma: el PIN y la clave técnica se guardan cifrados junto a él.' }, 409);
        }
    }

    await guardarAjustes(orgId, 'dian', nuevos as Record<string, unknown>);
    await logAudit(orgId, {
        accion: 'dian_ajustes.actualizado', entidad: 'org', entidad_id: orgId,
        detalle: `Ajustes de la DIAN: software ${nuevos.softwareId ? 'registrado' : '—'}, resolución ${nuevos.numeracion?.[config.entorno]?.numero ?? '—'}, prefijo de notas ${nuevos.prefijoNotas ?? '—'}${pin !== undefined || claveTecnica !== undefined ? ', secretos actualizados' : ''}`,
        ip: reqIp(request),
    });
    return json({ ok: true, ...(await vista(orgId)) });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    const orgId = await getActiveOrgId();
    const config = railConfig('dian');
    // Un envío sin respuesta solo se resuelve consultando a la DIAN con este
    // certificado: sin él, una factura podría quedar validada sin que Cord lo sepa.
    const [[p]] = await withOrgTx(orgId, sql`
        select count(*)::int as n from fiscal_rail_comprobantes
         where org_id = ${orgId} and rail = 'dian' and entorno = ${config.entorno} and estado in ('pendiente', 'incierto')`);
    if (Number(p?.n || 0) > 0) {
        return json({ error: 'Hay documentos esperando la confirmación de la DIAN. Podrás desconectar el certificado cuando se confirmen (normalmente en minutos).' }, 409);
    }
    await eliminarCredencial(orgId, 'dian', config.entorno);
    await logAudit(orgId, { accion: 'dian_cert.eliminado', entidad: 'org', entidad_id: orgId, detalle: `Certificado de firma para la DIAN (${config.entorno}) desconectado`, ip: reqIp(request) });
    return json({ ok: true, ...(await vista(orgId)) });
};
