// /api/fiscal/sii-folios — Archivos de folios (CAF) del SII (Chile).
//   POST   multipart { caf:File }  → valida y guarda un archivo de folios
//   DELETE ?id=<uuid>              → quita un archivo del que no se usó ningún folio
//
// El CAF trae la llave privada con la que se timbra cada documento: se guarda
// entero y cifrado (encryptRequiredSecret) y nunca vuelve al navegador; la
// pantalla solo ve el rango, la fecha y cuántos folios quedan. Un folio usado
// no vuelve nunca (latam/sii/cafs.ts y el trigger de fiscal_sii_cafs).
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
import { esErrorSeguro } from '../../../lib/fiscal/latam/errores';
import { decodificarArchivo, parsearCaf, TAMANO_MAXIMO_CAF, venceCaf } from '../../../lib/fiscal/latam/sii/caf';
import { guardarCaf, quitarCaf } from '../../../lib/fiscal/latam/sii/cafs';
import { TIPOS_DTE } from '../../../lib/fiscal/latam/sii/constantes';
import { hoyChile } from '../../../lib/fiscal/latam/sii/autorizacion';
import { rutValido } from '../../../lib/fiscal/latam/sii/texto';
import { motivoSinSii, vistaSii } from '../../../lib/fiscal/latam/sii/vista';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    try { requireEncryption(); } catch { return json({ error: 'El cifrado de secretos no está configurado.' }, 503); }
    const orgId = await getActiveOrgId();
    const subscriptionDenied = await requireEntitlement(orgId, 'cfdi'); if (subscriptionDenied) return subscriptionDenied;
    const sinSii = await motivoSinSii(orgId); if (sinSii) return json({ error: sinSii }, 409);

    const [[org]] = await withOrgTx(orgId, sql`select fiscal_metadata->>'tax_id' as tax_id, rfc from orgs where id = ${orgId}`);
    const rut = rutValido(org?.tax_id || org?.rfc);
    if (!rut) return json({ error: 'Completa primero el RUT de tu negocio en Ajustes › Datos fiscales.' }, 409);

    let form: FormData;
    try { form = await request.formData(); } catch { return json({ error: 'Envía el archivo de folios como multipart/form-data.' }, 400); }
    const archivo = form.get('caf');
    if (!(archivo instanceof File)) return json({ error: 'Sube el archivo XML de folios que descargaste del SII.' }, 400);
    if (archivo.size > TAMANO_MAXIMO_CAF) return json({ error: 'El archivo es demasiado grande para ser un archivo de folios del SII.' }, 422);

    const entorno = railConfig('sii').entorno;
    try {
        const xml = decodificarArchivo(new Uint8Array(await archivo.arrayBuffer()));
        const caf = parsearCaf(xml, rut);
        const vence = venceCaf(caf.tipo, caf.fechaAutorizacion);
        if (vence && vence < hoyChile()) {
            return json({ error: `Estos folios vencieron el ${vence}: el SII los autoriza por seis meses. Solicita folios nuevos en el SII.` }, 422);
        }
        await guardarCaf(orgId, entorno, caf, xml, { nombreArchivo: archivo.name || null, subidoPor: currentUserId() });
        await logAudit(orgId, {
            accion: 'sii_caf.cargado', entidad: 'org', entidad_id: orgId,
            detalle: `Folios del SII (${entorno}) cargados: ${TIPOS_DTE[caf.tipo].nombre} ${caf.desde}–${caf.hasta}, autorizados el ${caf.fechaAutorizacion}`,
            ip: reqIp(request),
        });
    } catch (error) {
        if (esErrorSeguro(error)) return json({ error: error.message }, 422);
        log.error('sii: no se pudo guardar el archivo de folios', { route: 'api/fiscal/sii-folios', orgId, err: error });
        return json({ error: 'No se pudo procesar el archivo de folios.' }, 422);
    }
    return json({ ok: true, ...(await vistaSii(orgId)) });
};

export const DELETE: APIRoute = async ({ request, url }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    const orgId = await getActiveOrgId();
    const id = url.searchParams.get('id') || '';
    if (!UUID_RE.test(id)) return json({ error: 'Archivo de folios no encontrado.' }, 404);
    const entorno = railConfig('sii').entorno;
    let quitado = false;
    try {
        quitado = await quitarCaf(orgId, entorno, id);
    } catch (error) {
        log.error('sii: no se pudo quitar el archivo de folios', { route: 'api/fiscal/sii-folios', orgId, err: error });
    }
    if (!quitado) {
        return json({ error: 'Solo se puede quitar un archivo de folios del que no se ha usado ningún folio.' }, 409);
    }
    await logAudit(orgId, { accion: 'sii_caf.eliminado', entidad: 'org', entidad_id: orgId, detalle: `Archivo de folios del SII (${entorno}) quitado sin usar`, ip: reqIp(request) });
    return json({ ok: true, ...(await vistaSii(orgId)) });
};
