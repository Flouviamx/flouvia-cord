export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { updateConnectAccount } from '../../../../lib/billing';

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [org] = await sql`select stripe_account_id, stripe_business_type from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) {
        return new Response(JSON.stringify({ error: 'Cuenta no creada' }), { status: 400 });
    }

    const data = await request.json();
    const fields: Record<string, string> = {};

    // Mapeo seguro de campos (ignora nulos o indefinidos)
    const mapFields = (prefix: string, obj: any) => {
        if (!obj) return;
        for (const [key, value] of Object.entries(obj)) {
            if (value !== null && value !== undefined && value !== '') {
                fields[`${prefix}[${key}]`] = String(value);
            }
        }
    };

    if (data.business_profile) {
        mapFields('business_profile', data.business_profile);
    }
    
    if (org.stripe_business_type === 'company' && data.company) {
        if (data.company.address) mapFields('company[address]', data.company.address);
        for (const [key, val] of Object.entries(data.company)) {
            if (key !== 'address' && val !== null && val !== undefined && val !== '') {
                fields[`company[${key}]`] = String(val);
            }
        }
    } else if (org.stripe_business_type === 'individual' && data.individual) {
        if (data.individual.address) mapFields('individual[address]', data.individual.address);
        if (data.individual.dob) mapFields('individual[dob]', data.individual.dob);
        for (const [key, val] of Object.entries(data.individual)) {
            if (key !== 'address' && key !== 'dob' && val !== null && val !== undefined && val !== '') {
                fields[`individual[${key}]`] = String(val);
            }
        }
    }

    if (data.tos_acceptance) {
        fields['tos_acceptance[date]'] = Math.floor(Date.now() / 1000).toString();
        fields['tos_acceptance[ip]'] = reqIp(request) || '127.0.0.1';
        fields['tos_acceptance[service_agreement]'] = 'full'; // En Custom de MX se necesita
    }

    if (Object.keys(fields).length === 0) {
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    try {
        const res = await updateConnectAccount(org.stripe_account_id as string, fields);
        return new Response(JSON.stringify({ ok: true, requirements: res.requirements }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 400 });
    }
};
