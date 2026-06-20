// /api/fiscal/csd — Subida REAL del Certificado de Sello Digital (CSD) a Facturapi.
//   POST  multipart { cer:File, key:File, password:string }  → { ok, csd_nombre }
//   DELETE                                                    → { ok }  (desconecta)
// Modelo multi-tenant: crea/usa una organización Facturapi por org de Cord, sube
// su CSD y guarda su llave LIVE para timbrar bajo SU RFC. Requiere permiso
// 'ajustes' + FACTURAPI_USER_KEY (llave de cuenta de Facturapi) en el entorno.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { facturapiConfigured, createOrganization, updateLegal, uploadCertificate, getLiveKey } from '../../../lib/fiscal/facturapi';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    if (!facturapiConfigured()) {
        return json({ error: 'Falta FACTURAPI_USER_KEY en el entorno (llave de cuenta de Facturapi). Agrégala en Vercel para habilitar la subida de CSD por cliente.' }, 503);
    }

    let form: FormData;
    try { form = await request.formData(); } catch { return json({ error: 'Envía el CSD como multipart/form-data.' }, 400); }
    const cer = form.get('cer');
    const key = form.get('key');
    const password = String(form.get('password') ?? '');
    if (!(cer instanceof File) || !(key instanceof File)) return json({ error: 'Faltan los archivos .cer y/o .key.' }, 400);
    if (!password) return json({ error: 'Falta la contraseña de la llave privada.' }, 400);
    // Un CSD real pesa unos pocos KB; rechazamos archivos absurdamente grandes.
    if (cer.size > 50_000 || key.size > 50_000) return json({ error: 'Los archivos parecen demasiado grandes. Sube el .cer y el .key del CSD (no el FIEL ni otros).' }, 400);

    const orgId = await getActiveOrgId();
    const [o] = await sql`select rfc, razon_social, nombre, regimen_fiscal, cp_fiscal, telefono, sitio_web, facturapi_org_id from orgs where id = ${orgId}`;
    const rfc = String(o?.rfc ?? '').trim();
    const razon = String(o?.razon_social ?? o?.nombre ?? '').trim();
    const regimen = String(o?.regimen_fiscal ?? '').trim();
    const cp = String(o?.cp_fiscal ?? '').trim();
    if (!rfc || !razon || !regimen || !cp) {
        return json({ error: 'Completa primero tus Datos fiscales (RFC, razón social, régimen fiscal y CP de expedición) en Ajustes › Datos fiscales.' }, 400);
    }

    // 1. Asegurar la organización en Facturapi (una por org de Cord).
    let fapiOrgId = String(o?.facturapi_org_id ?? '').trim();
    if (!fapiOrgId) {
        const r = await createOrganization(razon);
        if (!r.ok || !r.data?.id) return json({ error: `No se pudo crear la organización en Facturapi: ${r.error}` }, 502);
        fapiOrgId = r.data.id as string;
        await sql`update orgs set facturapi_org_id = ${fapiOrgId} where id = ${orgId}`;
    }

    // 2. Datos legales del emisor (RFC va implícito en el CSD; régimen + CP aquí).
    const legal = await updateLegal(fapiOrgId, {
        legal_name: razon.toUpperCase().slice(0, 254),
        tax_system: regimen,
        zip: cp,
        name: razon,
        phone: (o?.telefono as string) || undefined,
        website: (o?.sitio_web as string) || undefined,
    });
    if (!legal.ok) return json({ error: `No se pudieron guardar los datos fiscales en Facturapi: ${legal.error}` }, 502);

    // 3. Subir el CSD (cer + key + contraseña).
    const up = await uploadCertificate(
        fapiOrgId,
        { name: cer.name, bytes: await cer.arrayBuffer() },
        { name: key.name, bytes: await key.arrayBuffer() },
        password,
    );
    if (!up.ok) return json({ error: `Facturapi rechazó el CSD: ${up.error}` }, 422);

    // 4. Obtener y guardar la llave LIVE de la organización (timbra bajo su RFC).
    const lk = await getLiveKey(fapiOrgId);
    if (lk.ok && lk.data) {
        await sql`update orgs set facturapi_live_key = ${lk.data} where id = ${orgId}`;
    }

    await sql`update orgs set csd_estado = 'cargado', csd_nombre = ${cer.name}, csd_subido_at = now() where id = ${orgId}`;
    await logAudit(orgId, { accion: 'csd.cargado', entidad: 'org', entidad_id: orgId, detalle: `CSD cargado (${cer.name})`, ip: reqIp(request) });
    return json({ ok: true, csd_nombre: cer.name, livekey: lk.ok });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    await sql`update orgs set csd_estado = null, csd_nombre = null, csd_subido_at = null, facturapi_live_key = null where id = ${orgId}`;
    await logAudit(orgId, { accion: 'csd.eliminado', entidad: 'org', entidad_id: orgId, detalle: 'CSD desconectado', ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
