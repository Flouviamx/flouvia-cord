export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { createPerson, updatePerson, deletePerson, retrieveAccount } from '../../../../lib/billing';
import { translateStripeError } from '../../../../lib/stripe-catalogs';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [org] = await sql`select stripe_account_id from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });

    const data = await request.json();
    const fields: Record<string, string> = {};

    const mapFields = (prefix: string, obj: any) => {
        if (!obj) return;
        for (const [key, value] of Object.entries(obj)) {
            if (value !== null && value !== undefined && value !== '') {
                fields[`${prefix}[${key}]`] = String(value);
            }
        }
    };

    if (data.address) mapFields('address', data.address);
    if (data.dob) mapFields('dob', data.dob);
    if (data.relationship) mapFields('relationship', data.relationship);

    for (const [key, val] of Object.entries(data)) {
        if (key !== 'address' && key !== 'dob' && key !== 'relationship' && val !== null && val !== undefined && val !== '') {
            fields[key] = String(val);
        }
    }

    try {
        const person = await createPerson(org.stripe_account_id as string, fields);
        
        // Si es el representante, guardamos su id (asumimos por ahora que solo se envía relationship.representative)
        if (data.relationship?.representative) {
            await sql`update orgs set stripe_person_id = ${person.id} where id = ${orgId}`;
        }

        const account = await retrieveAccount(org.stripe_account_id as string);
        await sql`update orgs set stripe_requirements = ${JSON.stringify(account.requirements)} where id = ${orgId}`;

        return new Response(JSON.stringify({ ok: true, personId: person.id, requirements: account.requirements }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }
};

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [org] = await sql`select stripe_account_id from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });

    const data = await request.json();
    const personId = data.id;
    if (!personId) return new Response(JSON.stringify({ error: 'Missing person id' }), { status: 400 });

    const fields: Record<string, string> = {};
    const mapFields = (prefix: string, obj: any) => {
        if (!obj) return;
        for (const [key, value] of Object.entries(obj)) {
            if (value !== null && value !== undefined && value !== '') {
                fields[`${prefix}[${key}]`] = String(value);
            }
        }
    };

    if (data.address) mapFields('address', data.address);
    if (data.dob) mapFields('dob', data.dob);
    if (data.relationship) mapFields('relationship', data.relationship);

    for (const [key, val] of Object.entries(data)) {
        if (key !== 'id' && key !== 'address' && key !== 'dob' && key !== 'relationship' && val !== null && val !== undefined && val !== '') {
            fields[key] = String(val);
        }
    }

    try {
        await updatePerson(org.stripe_account_id as string, personId, fields);
        const account = await retrieveAccount(org.stripe_account_id as string);
        await sql`update orgs set stripe_requirements = ${JSON.stringify(account.requirements)} where id = ${orgId}`;
        return new Response(JSON.stringify({ ok: true, requirements: account.requirements }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
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
        await sql`update orgs set stripe_requirements = ${JSON.stringify(account.requirements)} where id = ${orgId}`;
        return new Response(JSON.stringify({ ok: true, requirements: account.requirements }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) }), { status: 400 });
    }
};
