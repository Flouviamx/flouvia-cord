// /api/fiscal/verifactu-cert — Certificado electrónico de Verifactu (España).
//   POST    multipart { p12:File, password:string } → { ok, caduca }
//   DELETE                                            → { ok }  (desactiva Verifactu)
//
// Subir un certificado válido es lo único que enciende `orgs.verifactu_modo`.
// Mientras no esté encendido, SpainVerifactuProvider degrada al mismo
// contrato "commercial_only" que CommercialInvoiceProvider (regla 15): la app
// nunca aparenta un registro Verifactu que no se generó.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { encryptRequiredSecret, requireEncryption } from '../../../lib/crypto-secret';
import { requireFreshAuth } from '../../../lib/step-up';
import { parsePkcs12, InvalidCertificateError } from '../../../lib/fiscal/verifactu/cert';
import { logVerifactuEvento } from '../../../lib/fiscal/verifactu/chain';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    try { requireEncryption(); } catch { return json({ error: 'El cifrado de secretos no está configurado.' }, 503); }

    const orgId = await getActiveOrgId();
    const [orgRows] = await withOrgTx(orgId, sql`select country_code, rfc from orgs where id = ${orgId}`);
    const org = orgRows[0];
    if (String(org?.country_code || '').toUpperCase() !== 'ES') {
        return json({ error: 'Verifactu es una capacidad de España. Esta cuenta no está configurada con ese país.' }, 409);
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
        parsed = parsePkcs12(bytes, password);
    } catch (error) {
        if (error instanceof InvalidCertificateError) return json({ error: error.message }, 422);
        return json({ error: 'No se pudo procesar el certificado.' }, 422);
    }
    if (parsed.expiresAt.getTime() <= Date.now()) {
        return json({ error: `Este certificado caducó el ${parsed.expiresAt.toLocaleDateString('es-ES')}. Sube uno vigente.` }, 422);
    }

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

    await logVerifactuEvento(orgId, 'arranque', { motivo: 'certificado subido', certificado: p12.name });
    await logAudit(orgId, {
        accion: 'verifactu_cert.cargado', entidad: 'org', entidad_id: orgId,
        detalle: `Certificado Verifactu cargado (${p12.name}), caduca ${parsed.expiresAt.toISOString().slice(0, 10)}`,
        ip: reqIp(request),
    });
    return json({ ok: true, caduca: parsed.expiresAt.toISOString().slice(0, 10) });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    const orgId = await getActiveOrgId();
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
