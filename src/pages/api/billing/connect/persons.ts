export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { createPerson, updatePerson, deletePerson, retrieveAccount } from '../../../../lib/billing';
import { translateStripeError } from '../../../../lib/stripe-catalogs';
import { flattenConnectFields, PERSON_CONNECT_FIELDS, sanitizeStripeRequirements, UnknownConnectFieldError } from '../../../../lib/connect-fields';
import { auditConnect } from '../../../../lib/connect-audit';
import { limitConnectMutation } from '../../../../lib/connect-security';

function personFields(data: unknown, ignoreId = false): Record<string, string> | Response {
    try {
        return flattenConnectFields(data, PERSON_CONNECT_FIELDS, ignoreId ? ['id'] : []);
    } catch (error) {
        const field = error instanceof UnknownConnectFieldError ? error.field : 'payload';
        return new Response(JSON.stringify({ error: `Campo no permitido: ${field}` }), { status: 400 });
    }
}

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'persons-create', orgId, 12);
    if (limited) return limited;
    const [org] = await sql`select stripe_account_id from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });

    const data = await request.json().catch(() => null);
    const mapped = personFields(data);
    if (mapped instanceof Response) return mapped;
    const fields = mapped;

    try {
        const person = await createPerson(org.stripe_account_id as string, fields);
        
        // Si es el representante, guardamos su id (asumimos por ahora que solo se envía relationship.representative)
        if (data.relationship?.representative) {
            await sql`update orgs set stripe_person_id = ${person.id} where id = ${orgId}`;
        }

        const account = await retrieveAccount(org.stripe_account_id as string);
        await sql`update orgs set stripe_requirements = ${JSON.stringify(sanitizeStripeRequirements(account.requirements))} where id = ${orgId}`;
        await auditConnect(orgId, request, 'persona_creada', { entity: 'connect_person', entityId: person.id });

        return new Response(JSON.stringify({ ok: true, personId: person.id, requirements: account.requirements }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'persons-update', orgId, 20);
    if (limited) return limited;
    const [org] = await sql`select stripe_account_id from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });

    const data = await request.json();
    const personId = data.id;
    if (!personId) return new Response(JSON.stringify({ error: 'Missing person id' }), { status: 400 });

    const mapped = personFields(data, true);
    if (mapped instanceof Response) return mapped;
    const fields = mapped;

    try {
        await updatePerson(org.stripe_account_id as string, personId, fields);
        const account = await retrieveAccount(org.stripe_account_id as string);
        await sql`update orgs set stripe_requirements = ${JSON.stringify(sanitizeStripeRequirements(account.requirements))} where id = ${orgId}`;
        await auditConnect(orgId, request, 'persona_actualizada', { entity: 'connect_person', entityId: personId, detail: Object.keys(fields).join(', ') });
        return new Response(JSON.stringify({ ok: true, requirements: account.requirements }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'persons-delete', orgId, 8);
    if (limited) return limited;
    const [org] = await sql`select stripe_account_id, stripe_person_id from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });

    const data = await request.json();
    const personId = data.id;
    if (!personId) return new Response(JSON.stringify({ error: 'Missing person id' }), { status: 400 });

    try {
        await deletePerson(org.stripe_account_id as string, personId);
        if (org.stripe_person_id === personId) {
            await sql`update orgs set stripe_person_id = null where id = ${orgId}`;
        }
        const account = await retrieveAccount(org.stripe_account_id as string);
        await sql`update orgs set stripe_requirements = ${JSON.stringify(sanitizeStripeRequirements(account.requirements))} where id = ${orgId}`;
        await auditConnect(orgId, request, 'persona_eliminada', { entity: 'connect_person', entityId: personId });
        return new Response(JSON.stringify({ ok: true, requirements: account.requirements }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }
};
