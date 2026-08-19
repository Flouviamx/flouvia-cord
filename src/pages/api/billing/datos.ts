// GET   /api/billing/datos — datos con los que se emiten los comprobantes de Cord.
// PATCH /api/billing/datos — actualizarlos.
//
// Sustituye "Datos de facturación" del Customer Portal. La etiqueta del
// identificador fiscal la pone el país del negocio, no el código: "RFC" es de
// México, en Madrid es "NIF / CIF" y en Austin "EIN / Tax ID" (regla 24).
export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql, logAudit, reqIp } from '../../../lib/db';
import { stripe } from '../../../lib/billing';
import { billingContext, json, stripeTaxIdType } from '../../../lib/billing-surface';
import { getCountryProfile } from '../../../lib/countries';

const Datos = z.object({
    nombre: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(200).optional(),
    linea1: z.string().trim().max(200).optional(),
    linea2: z.string().trim().max(200).optional(),
    ciudad: z.string().trim().max(120).optional(),
    estado: z.string().trim().max(120).optional(),
    cp: z.string().trim().max(20).optional(),
    taxId: z.string().trim().max(40).optional(),
});

export const GET: APIRoute = async () => {
    const gate = await billingContext();
    if ('denied' in gate) return gate.denied;
    const { orgId, customer } = gate.ctx;

    const [o] = await sql`select country_code from orgs where id = ${orgId}`;
    const profile = getCountryProfile(o?.country_code);

    try {
        const [cus, taxIds] = await Promise.all([
            stripe(`/v1/customers/${customer}`, undefined, 'GET'),
            stripe(`/v1/customers/${customer}/tax_ids`, { limit: '1' }, 'GET').catch(() => null),
        ]);
        const a = cus?.address ?? {};
        return json({
            nombre: cus?.name ?? '',
            email: cus?.email ?? '',
            linea1: a.line1 ?? '', linea2: a.line2 ?? '',
            ciudad: a.city ?? '', estado: a.state ?? '', cp: a.postal_code ?? '',
            pais: cus?.address?.country ?? o?.country_code ?? '',
            taxId: taxIds?.data?.[0]?.value ?? '',
            taxIdLabel: profile.taxIdLabel,
        });
    } catch {
        return json({ error: 'No pudimos cargar tus datos de facturación. Intenta de nuevo.' }, 502);
    }
};

export const PATCH: APIRoute = async ({ request }) => {
    const gate = await billingContext();
    if ('denied' in gate) return gate.denied;
    const { orgId, customer } = gate.ctx;

    let body: unknown = {};
    try { body = await request.json(); } catch { /* sin body */ }
    const parsed = Datos.safeParse(body);
    if (!parsed.success) return json({ error: 'Revisa los datos: hay un campo con formato inválido.' }, 400);
    const d = parsed.data;

    const [o] = await sql`select country_code from orgs where id = ${orgId}`;
    const country = String(o?.country_code || '').toUpperCase();
    const profile = getCountryProfile(country);

    try {
        const params: Record<string, string> = {};
        if (d.nombre !== undefined) params.name = d.nombre;
        if (d.email !== undefined) params.email = d.email;
        if (d.linea1 !== undefined) params['address[line1]'] = d.linea1;
        if (d.linea2 !== undefined) params['address[line2]'] = d.linea2;
        if (d.ciudad !== undefined) params['address[city]'] = d.ciudad;
        if (d.estado !== undefined) params['address[state]'] = d.estado;
        if (d.cp !== undefined) params['address[postal_code]'] = d.cp;
        if (/^[A-Z]{2}$/.test(country)) params['address[country]'] = country;
        if (Object.keys(params).length) await stripe(`/v1/customers/${customer}`, params, 'POST');

        // El identificador fiscal no se actualiza: se reemplaza. Se borra el
        // anterior sólo cuando el nuevo ya quedó, para no dejar la cuenta sin
        // ninguno si el alta falla a medio camino.
        if (d.taxId !== undefined) {
            const current = await stripe(`/v1/customers/${customer}/tax_ids`, { limit: '5' }, 'GET').catch(() => null);
            const existing = current?.data ?? [];
            const value = d.taxId.trim();
            if (value && !existing.some((t: any) => t.value === value)) {
                await stripe(`/v1/customers/${customer}/tax_ids`, {
                    type: stripeTaxIdType(country),
                    value,
                }, 'POST');
            }
            for (const t of existing) {
                if (t.value !== value) await stripe(`/v1/customers/${customer}/tax_ids/${t.id}`, undefined, 'DELETE').catch(() => {});
            }
        }

        await logAudit(orgId, { accion: 'billing.datos_actualizados', entidad: 'org', entidad_id: orgId, detalle: 'datos de facturación', ip: reqIp(request) });
        return json({ ok: true, taxIdLabel: profile.taxIdLabel });
    } catch {
        return json({ error: 'No pudimos guardar tus datos de facturación. Intenta de nuevo.' }, 502);
    }
};
