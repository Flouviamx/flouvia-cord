export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, reqIp, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { stripeUpload, attachPersonDocument, retrieveAccount, updateConnectAccount, isAlreadyVerifiedError } from '../../../../lib/billing';
import { translateStripeError } from '../../../../lib/stripe-catalogs';
import { guardUpload, type AllowedUploadMime } from '../../../../lib/upload-guard';
import { registrarEnvioKyc } from '../../../../lib/kyc-evidencia';
import { currentUserId } from '../../../../lib/context';
import { auditConnect } from '../../../../lib/connect-audit';
import { limitConnectMutation } from '../../../../lib/connect-security';
import { sanitizeStripeRequirements } from '../../../../lib/connect-fields';

// Allowlist CERRADA de documentos a nivel cuenta. El nombre viaja al
// form-encoded del proveedor (`documents[<tipo>][files][0]`), así que aceptar
// texto libre aquí sería dejar al cliente escribir un parámetro arbitrario.
const ACCOUNT_DOCUMENT_TYPES = new Set([
    'company_authorization',
    'company_license',
    'company_memorandum_of_association',
    'company_ministerial_decree',
    'company_registration_verification',
    'company_tax_id_verification',
    'proof_of_address',
    'proof_of_registration',
    'proof_of_ultimate_beneficial_ownership',
    'bank_account_ownership_verification',
]);

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'document', orgId, 12);
    if (limited) return limited;
    const [orgRows] = await withOrgTx(orgId, sql`select stripe_account_id, stripe_business_type from orgs where id = ${orgId}`);
    const org = orgRows[0];
    if (!org?.stripe_account_id) return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });

    const formData = await request.formData();
    const personId = formData.get('personId') as string;
    const isCompanyDoc = formData.get('isCompanyDoc') === 'true';
    const side = formData.get('side') as 'front' | 'back';
    const file = formData.get('file');
    // Documento a nivel CUENTA (`documents.*`), distinto de
    // `company.verification.document`. Es la ruta ALTERNATIVA que el proveedor
    // ofrece en España y Alemania (`requirements.alternatives`): cuando la
    // escritura constitutiva no basta, pide comprobante de registro mercantil o
    // de titularidad real. Sin esto, ese requisito no tenía forma de cumplirse.
    const docType = String(formData.get('docType') || '');

    if (!(file instanceof File)) return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 });
    if (docType && !ACCOUNT_DOCUMENT_TYPES.has(docType)) {
        return new Response(JSON.stringify({ error: 'Tipo de documento no permitido' }), { status: 400 });
    }
    if (!docType) {
        if (!isCompanyDoc && !personId) return new Response(JSON.stringify({ error: 'Missing personId for person doc' }), { status: 400 });
        if (!isCompanyDoc && side !== 'front' && side !== 'back') return new Response(JSON.stringify({ error: 'Invalid side' }), { status: 400 });
    }

    // El destino decide el `purpose`, y NO son intercambiables.
    //
    //   · `individual[verification][document]`  → identity_document
    //   · `person…[verification][document]`     → identity_document
    //   · `company[verification][document]`     → additional_verification
    //
    // El código subía TODO como `identity_document` y luego escribía en
    // `company[verification][document]`, un mismatch que Stripe rechaza: el
    // documento constitutivo de una empresa no se podía adjuntar por ningún
    // camino, así que el requisito `company.verification.document` era un
    // callejón sin salida.
    const destinoEsEmpresa = isCompanyDoc && org.stripe_business_type !== 'individual';
    // `documents.*` es su propio propósito: ni identidad ni verificación
    // adicional. Los tres NO son intercambiables.
    const purpose = docType
        ? 'account_requirement'
        : (destinoEsEmpresa ? 'additional_verification' : 'identity_document');

    // El proveedor sólo acepta JPG o PNG para un documento de IDENTIDAD; el PDF
    // vale para comprobante de domicilio y documentos societarios. `guardUpload`
    // se llamaba sin `allowedMimes`, así que usaba su default —que incluye PDF— y
    // el archivo pasaba la validación de Cord para fallar después en el
    // proveedor. Y como los reenvíos del mismo archivo se auto-rechazan, el
    // usuario quedaba atrapado reintentando algo que nunca iba a funcionar.
    const mimesPermitidos: AllowedUploadMime[] = purpose === 'identity_document'
        ? ['image/jpeg', 'image/png']
        : ['image/jpeg', 'image/png', 'application/pdf'];

    try {
        const guarded = await guardUpload(file, {
            maxBytes: 10 * 1024 * 1024,
            prefix: 'identity',
            allowedMimes: mimesPermitidos,
            // Los pisos de legibilidad y la exigencia de color aplican SÓLO al
            // documento de identidad: un comprobante de domicilio escaneado en
            // blanco y negro es perfectamente válido.
            requireImage: purpose === 'identity_document',
        });
        const uploadedFile = await stripeUpload(
            guarded.bytes,
            guarded.filename,
            guarded.mime,
            purpose,
            org.stripe_account_id as string
        );

        try {
            if (docType) {
                // Array de un elemento: el proveedor acepta varios archivos por
                // documento, pero el asistente sube de uno en uno.
                await updateConnectAccount(org.stripe_account_id as string, {
                    [`documents[${docType}][files][0]`]: uploadedFile.id,
                });
            } else if (isCompanyDoc) {
                // El doc a nivel cuenta también distingue frente/reverso — antes se
                // escribía SIEMPRE en [front] y subir el reverso pisaba el frente.
                const prefix = destinoEsEmpresa ? 'company' : 'individual';
                const docSide = side === 'back' ? 'back' : 'front';
                await updateConnectAccount(org.stripe_account_id as string, {
                    [`${prefix}[verification][document][${docSide}]`]: uploadedFile.id
                });
            } else {
                await attachPersonDocument(org.stripe_account_id as string, personId, uploadedFile.id, side);
            }
        } catch (attachErr: any) {
            if (!isAlreadyVerifiedError(attachErr?.message || '')) throw attachErr;
            // Ya estaba verificado en Stripe — no había nada que actualizar.
        }

        const account = await retrieveAccount(org.stripe_account_id as string);
        const requirements = sanitizeStripeRequirements(account.requirements);
        await withOrgTx(orgId, sql`update orgs set stripe_requirements = ${JSON.stringify(requirements)} where id = ${orgId}`);
        // `entityId` NO lleva el file id. Un `file_…` es un handle recuperable con
        // la llave de la plataforma, o sea un puntero a la foto de la
        // identificación del usuario dentro de una tabla de auditoría que no se
        // borra. Se registra a QUIÉN pertenece el documento y qué lado, que es lo
        // que hace falta para diagnosticar.
        await registrarEnvioKyc({
            orgId,
            stripeAccountId: org.stripe_account_id as string,
            stripePersonId: personId || null,
            alcance: docType ? 'cuenta' : (destinoEsEmpresa ? 'company' : (isCompanyDoc ? 'individual' : 'persona')),
            parte: docType ? `documents.${docType}` : (side || 'front'),
            proposito: purpose,
            sha256: guarded.sha256,
            bytes: guarded.bytes.length,
            mime: guarded.mime,
            ancho: guarded.ancho,
            alto: guarded.alto,
            origen: 'escritorio',
            // En el carril de escritorio sí hay sesión: quien sube ES el actor.
            subidoPor: currentUserId(),
            ip: reqIp(request),
            userAgent: request.headers.get('user-agent'),
        });

        await auditConnect(orgId, request, 'documento_subido', {
            entity: 'connect_document',
            entityId: destinoEsEmpresa ? (org.stripe_account_id as string) : (personId || (org.stripe_account_id as string)),
            detail: docType
                ? `documento_cuenta:${docType}:${purpose}`
                : `${destinoEsEmpresa ? 'empresa' : (isCompanyDoc ? 'persona_fisica' : 'persona')}:${side}:${purpose}`,
        });

        return new Response(JSON.stringify({ ok: true, fileId: uploadedFile.id, requirements }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) || 'Documento inválido' }), { status: 400 });
    }
};
