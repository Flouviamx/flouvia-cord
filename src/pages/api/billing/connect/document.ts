export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { stripeUpload, attachPersonDocument, retrieveAccount, updateConnectAccount, isAlreadyVerifiedError } from '../../../../lib/billing';
import { translateStripeError } from '../../../../lib/stripe-catalogs';
import { guardUpload } from '../../../../lib/upload-guard';
import { auditConnect } from '../../../../lib/connect-audit';
import { limitConnectMutation } from '../../../../lib/connect-security';
import { sanitizeStripeRequirements } from '../../../../lib/connect-fields';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'document', orgId, 12);
    if (limited) return limited;
    const [org] = await sql`select stripe_account_id, stripe_business_type from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });

    const formData = await request.formData();
    const personId = formData.get('personId') as string;
    const isCompanyDoc = formData.get('isCompanyDoc') === 'true';
    const side = formData.get('side') as 'front' | 'back';
    const file = formData.get('file');

    if (!(file instanceof File)) return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 });
    if (!isCompanyDoc && !personId) return new Response(JSON.stringify({ error: 'Missing personId for person doc' }), { status: 400 });
    if (!isCompanyDoc && side !== 'front' && side !== 'back') return new Response(JSON.stringify({ error: 'Invalid side' }), { status: 400 });

    try {
        const guarded = await guardUpload(file, { maxBytes: 10 * 1024 * 1024, prefix: 'identity' });
        const uploadedFile = await stripeUpload(
            guarded.bytes,
            guarded.filename,
            guarded.mime,
            'identity_document',
            org.stripe_account_id as string
        );

        try {
            if (isCompanyDoc) {
                // El doc a nivel cuenta también distingue frente/reverso — antes se
                // escribía SIEMPRE en [front] y subir el reverso pisaba el frente.
                const prefix = org.stripe_business_type === 'individual' ? 'individual' : 'company';
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
        await sql`update orgs set stripe_requirements = ${JSON.stringify(sanitizeStripeRequirements(account.requirements))} where id = ${orgId}`;
        await auditConnect(orgId, request, 'documento_subido', {
            entity: 'connect_document',
            entityId: uploadedFile.id,
            detail: `${isCompanyDoc ? 'empresa' : 'persona'}:${side}`,
        });

        return new Response(JSON.stringify({ ok: true, fileId: uploadedFile.id, requirements: account.requirements }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) || 'Documento inválido' }), { status: 400 });
    }
};
